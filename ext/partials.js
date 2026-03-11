// ext/partials.js — {% include %} and {% render %} support for Droplet
// Usage: require("./ext/partials")(engine, { "snippet": "hello {{ name }}" })

module.exports = function partials(engine, filesystem) {
  const { tokenize, render, rout, evalOutput, evalExpr, stringify, evalCondition } = engine.constructor._internals;
  const MAX_DEPTH = 100;

  // Set or update the filesystem map
  engine._fs = filesystem || {};
  engine.setFileSystem = (fs) => { engine._fs = fs; };

  // Parse "name, key1: val1, key2: val2" or "'name' with varExpr" etc.
  const parseArgs = (args, ctx, shared) => {
    const params = {};
    const setParam = (k, v) => { params[k] = v; if (shared) ctx[k] = v; };
    // Handle 'name' with expr / 'name' for expr as item
    let nameExpr, withExpr, forExpr, forAlias;
    const parts = args.trim();

    // Extract quoted template name
    const qm = parts.match(/^(['"])([^'"]*)\1(.*)$/);
    if (!qm) {
      // Dynamic name (for include only): variable
      const dm = parts.match(/^(\w[\w.-]*)(.*)$/);
      if (dm) { nameExpr = evalExpr(dm[1], ctx); args = dm[2]; }
      else return { name: parts.trim() };
    } else {
      nameExpr = qm[2]; args = qm[3];
    }

    args = args.trim();
    if (args.startsWith(",")) args = args.slice(1).trim();

    // Check for "with expr [as alias][, params]" or "for expr [as alias][, params]"
    // "with" takes a single expression; "for" takes a variable name (not key: value)
    const wm = args.match(/^with\s+(.+?)(?:\s+as\s+(\w+))?\s*(?:,(.*))?$/);
    if (wm) {
      const exprPart = wm[1].trim();
      if (/^\w+\s*:/.test(exprPart)) {
        // "with var: val" — Ruby: with-expression is eval(var), AND var=val is set as param
        const varName = exprPart.match(/^(\w+)/)[1];
        const valPart = exprPart.slice(exprPart.indexOf(':') + 1).trim();
        withExpr = evalExpr(varName, ctx); forAlias = wm[2] || nameExpr;
        // Include (shared): skip param when var is missing; Render: always set param
        if ((!shared || withExpr !== undefined) && valPart) setParam(varName, evalExpr(valPart, ctx));
        if (wm[3]) { for (const pair of wm[3].split(",")) { const kv = pair.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/); if (kv) setParam(kv[1], evalExpr(kv[2].trim(), ctx)); } }
      } else {
        withExpr = evalExpr(exprPart, ctx); forAlias = wm[2] || nameExpr;
        if (wm[3]) { for (const pair of wm[3].split(",")) { const kv = pair.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/); if (kv) setParam(kv[1], evalExpr(kv[2].trim(), ctx)); } }
      }
    } else {
      // "for expr [as alias][, params]" — expr must be a bare variable, not "key: val"
      const fm = args.match(/^for\s+([\w.[\]'"]+|\([^)]+\))(?:\s+as\s+(\w+))?\s*([\s\S]*)$/);
      if (fm && !/^for\s+\w+\s*:/.test(args)) {
        forExpr = evalExpr(fm[1].trim(), ctx); forAlias = fm[2] || nameExpr;
        const rest = fm[3].trim().replace(/^,\s*/, '');
        if (rest) { for (const pair of rest.split(",")) { const kv = pair.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/); if (kv) setParam(kv[1], evalExpr(kv[2].trim(), ctx)); } }
      } else if (/^for\s+\w+\s*:/.test(args)) {
        // "for var: val" — Ruby: for-expression is eval(var), AND var=val is set as param
        const varName = args.match(/^for\s+(\w+)/)[1];
        const valPart = args.slice(args.indexOf(':') + 1).trim();
        forExpr = evalExpr(varName, ctx); forAlias = nameExpr;
        // Parse val and any comma-separated params after it
        const allParams = valPart ? valPart.split(",") : [];
        if (allParams.length > 0) {
          // First item is the value for varName
          const firstVal = allParams[0].trim();
          // Include (shared): skip param when forExpr is null; Render: always set param
          if ((!shared || forExpr != null) && firstVal) setParam(varName, evalExpr(firstVal, ctx));
          for (let pi = 1; pi < allParams.length; pi++) { const kv = allParams[pi].trim().match(/^(\w+)\s*:\s*([\s\S]+)$/); if (kv) setParam(kv[1], evalExpr(kv[2].trim(), ctx)); }
        }
      } else {
        // key: val, key: val params
        for (const pair of args.split(",")) { const kv = pair.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/); if (kv) setParam(kv[1], evalExpr(kv[2].trim(), ctx)); }
      }
    }

    return { name: "" + nameExpr, params, withExpr, forExpr, forAlias };
  };

  // Render a partial template with given scope
  const renderPartial = async (name, scope, engine, depth) => {
    if (depth > MAX_DEPTH) throw new Error("Liquid error: nested too deep");
    const src = engine._fs[name] ?? engine._fs[name + ".liquid"];
    if (src == null) return "";
    const tokens = tokenize(src);
    const prevDepth = engine._renderDepth;
    engine._renderDepth = depth;
    try { return await render(tokens, scope, 0, tokens.length, engine); }
    finally { engine._renderDepth = prevDepth; }
  };

  // {% render 'name' %} — isolated scope
  engine.registerTag("render", async (tag, tokens, ctx, i, len, eng) => {
    const args = tag.slice(7).trim();
    const { name, params, withExpr, forExpr, forAlias } = parseArgs(args, ctx);
    const depth = (eng._renderDepth || 0) + 1;

    if (forExpr != null) {
      // render 'name' for collection [as alias]
      const collection = Array.isArray(forExpr) ? forExpr : forExpr == null ? [] : [forExpr];
      let out = "";
      for (let k = 0; k < collection.length; k++) {
        const scope = { ...(ctx.__env || {}), ...params, [forAlias]: collection[k], __env: ctx.__env, forloop: {
          first: k === 0, last: k === collection.length - 1,
          index: k + 1, index0: k,
          length: collection.length,
          rindex: collection.length - k, rindex0: collection.length - k - 1,
        }};
        const r = await renderPartial(name, scope, eng, depth);
        out += rout(r);
      }
      return out;
    }

    // Isolated scope: static env + explicit params + with binding
    const env = ctx.__env || {};
    const scope = { ...env, ...params };
    if (withExpr != null) scope[forAlias || name] = withExpr;

    // render isolates increment/decrement counters and cycles
    scope.__counters = {};
    scope.__cycles = {};
    scope.__env = env;

    const r = await renderPartial(name, scope, eng, depth);
    return rout(r);
  });

  // {% include 'name' %} — shared scope
  engine.registerTag("include", async (tag, tokens, ctx, i, len, eng) => {
    const args = tag.slice(8).trim();
    const { name, params, withExpr, forExpr, forAlias } = parseArgs(args, ctx, true);
    const depth = (eng._renderDepth || 0) + 1;

    // Apply params to outer ctx (already applied during parsing via shared=true)
    for (const [k, v] of Object.entries(params)) ctx[k] = v;

    if (forExpr != null) {
      const collection = Array.isArray(forExpr) ? forExpr : forExpr == null ? [] : [forExpr];
      let out = "";
      for (let k = 0; k < collection.length; k++) {
        ctx[forAlias] = collection[k];
        const r = await renderPartial(name, ctx, eng, depth);
        const rv = rout(r);
        out += rv;
        if (r?.__ctrl === "break") return { __ctrl: "break", out };
        if (r?.__ctrl === "continue") continue;
      }
      return out;
    }

    if (withExpr !== undefined) {
      // include with array iterates
      if (Array.isArray(withExpr)) {
        let out = "";
        for (let k = 0; k < withExpr.length; k++) {
          ctx[forAlias || name] = withExpr[k];
          const r = await renderPartial(name, ctx, eng, depth);
          const rv = rout(r);
          out += rv;
          if (r?.__ctrl === "break") return { __ctrl: "break", out };
          if (r?.__ctrl === "continue") continue;
        }
        return out;
      }
      ctx[forAlias || name] = withExpr;
    }
    // include auto-binds: if no "with" and no explicit param with same name, bind ctx[name] if it exists
    else if (!params[name] && ctx[name] !== undefined) {
      // auto-bind by name — already in scope
    }

    const r = await renderPartial(name, ctx, eng, depth);
    if (r?.__ctrl) return r;
    return rout(r);
  });
};
