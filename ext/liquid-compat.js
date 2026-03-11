// ext/liquid-compat.js — LiquidJS API compatibility shim for Droplet
// Usage: const { Liquid } = require("./ext/liquid-compat");
//        const engine = new Liquid({ globals: { site: "My Site" } });
//        const html = await engine.parseAndRender("{{ site }}", { page: "Home" });

const Droplet = require("../droplet");
const partials = require("./partials");

class Liquid {
  constructor(options = {}) {
    this._droplet = new Droplet(options);
    this._globals = options.globals || {};
    this._cache = new Map();
    this._cacheEnabled = !!options.cache;
    this._strictFilters = !!options.strictFilters;
    this._strictVariables = !!options.strictVariables;
    this._fs = {};

    // Set up filesystem from options
    if (options.templates) {
      Object.assign(this._fs, options.templates);
    }
    partials(this._droplet, this._fs);

    // Wire up custom fs adapter if provided
    if (options.fs) {
      this._customFs = options.fs;
    }
  }

  // --- Core render methods ---

  parse(template) {
    const { tokenize } = Droplet._internals;
    const tokens = tokenize(template);
    // Return an opaque parsed template object
    return { _tokens: tokens, _src: template };
  }

  async render(tpl, context = {}) {
    const { render, rout } = Droplet._internals;
    const ctx = { ...this._globals, ...context, __env: context };
    const r = await render(tpl._tokens, ctx, 0, tpl._tokens.length, this._droplet);
    return rout(r);
  }

  renderSync(tpl, context = {}) {
    // Best-effort sync: works for templates without async tags
    throw new Error(
      "Droplet is async-only. Use render() instead of renderSync(). " +
      "Migration: replace engine.renderSync(tpl, ctx) with await engine.render(tpl, ctx)"
    );
  }

  async parseAndRender(template, context = {}) {
    const ctx = { ...this._globals, ...context };
    if (this._cacheEnabled) {
      let tpl = this._cache.get(template);
      if (!tpl) { tpl = this.parse(template); this._cache.set(template, tpl); }
      return this.render(tpl, ctx);
    }
    return this._droplet.parseAndRender(template, ctx);
  }

  parseAndRenderSync(template, context = {}) {
    throw new Error(
      "Droplet is async-only. Use parseAndRender() instead of parseAndRenderSync(). " +
      "Migration: replace engine.parseAndRenderSync(tmpl, ctx) with await engine.parseAndRender(tmpl, ctx)"
    );
  }

  async renderFile(filepath, context = {}) {
    const src = await this._resolveFile(filepath);
    if (src == null) throw new Error(`ENOENT: Failed to lookup "${filepath}"`);
    return this.parseAndRender(src, context);
  }

  renderFileSync(filepath, context = {}) {
    throw new Error(
      "Droplet is async-only. Use renderFile() instead of renderFileSync(). " +
      "Migration: replace engine.renderFileSync(path, ctx) with await engine.renderFile(path, ctx)"
    );
  }

  async parseFile(filepath) {
    const src = await this._resolveFile(filepath);
    if (src == null) throw new Error(`ENOENT: Failed to lookup "${filepath}"`);
    return this.parse(src);
  }

  parseFileSync(filepath) {
    throw new Error(
      "Droplet is async-only. Use parseFile() instead of parseFileSync()."
    );
  }

  // --- Filter & Tag registration ---

  registerFilter(name, fn) {
    this._droplet.registerFilter(name, fn);
  }

  registerTag(name, tagImpl) {
    // LiquidJS tags: { parse(tagToken, remainTokens), *render(ctx, emitter) }
    // Droplet tags: async (tagContent, tokens, ctx, i, len, engine) => result
    if (typeof tagImpl === "function" && tagImpl.prototype && tagImpl.prototype.render) {
      // Class-based tag (extends Tag)
      this._wrapTag(name, tagImpl);
    } else if (tagImpl && typeof tagImpl === "object" && tagImpl.render) {
      // Object-based tag { parse, render }
      this._wrapTag(name, tagImpl);
    } else if (typeof tagImpl === "function") {
      // Already a Droplet-style handler — pass through
      this._droplet.registerTag(name, tagImpl);
    } else {
      throw new Error(`Invalid tag definition for "${name}"`);
    }
  }

  _wrapTag(name, impl) {
    // Simplified adapter: LiquidJS tags get the raw tag content as args
    // Complex tags with block content won't fully work — log a migration hint
    const isClass = typeof impl === "function";
    this._droplet.registerTag(name, async (tag, tokens, ctx, i, len, engine) => {
      const args = tag.slice(name.length).trim();
      const instance = isClass ? new impl() : Object.create(impl);
      // Minimal tagToken shim
      const tagToken = { args, raw: tag, name };
      if (instance.parse) instance.parse(tagToken, []);
      if (instance.render) {
        const gen = instance.render(ctx);
        // Handle generator or async
        if (gen && typeof gen.next === "function") {
          let step = gen.next();
          while (!step.done) {
            const val = step.value instanceof Promise ? await step.value : step.value;
            step = gen.next(val);
          }
          return step.value ?? "";
        }
        return (await gen) ?? "";
      }
      return "";
    });
  }

  // --- Plugin system ---

  plugin(fn) {
    fn.call(this, this);
  }

  // --- Express integration ---

  express() {
    const self = this;
    return function (filepath, context, callback) {
      const fs = require("fs");
      fs.readFile(filepath, "utf8", (err, src) => {
        if (err) return callback(err);
        self.parseAndRender(src, context).then(
          html => callback(null, html),
          err => callback(err)
        );
      });
    };
  }

  // --- Filesystem helpers ---

  async _resolveFile(filepath) {
    // Check in-memory templates first
    const ext = this._droplet.options?.extname || "";
    if (this._fs[filepath] != null) return this._fs[filepath];
    if (ext && this._fs[filepath + ext] != null) return this._fs[filepath + ext];

    // Try custom fs adapter
    if (this._customFs) {
      try {
        const resolved = this._customFs.resolve
          ? this._customFs.resolve("", filepath, ext)
          : filepath;
        if (this._customFs.exists && !(await this._customFs.exists(resolved))) return null;
        return await this._customFs.readFile(resolved);
      } catch(e) { return null; }
    }

    return null;
  }

  // --- Template management ---

  setTemplate(name, source) {
    this._fs[name] = source;
    this._droplet._fs[name] = source;
  }

  setTemplates(map) {
    Object.assign(this._fs, map);
    Object.assign(this._droplet._fs, map);
  }
}

module.exports = { Liquid };
