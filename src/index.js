import { rout, stringify, LiquidError } from "./utils.js";
import { BUILTIN_FILTERS, evalOutput, evalExpr, evalCondition } from "./eval.js";
import { tokenize } from "./tokenizer.js";
import { render } from "./render.js";

class Droplet {
  constructor(options = {}) {
    this.options = options;
    this._filters = {};
  }
  registerFilter(name, fn) {
    this._filters[name] = fn;
  }
  registerTag(name, fn) {
    this._tags ??= {};
    this._tags[name] = fn;
  }
  async parseAndRender(template, data = {}) {
    const ctx = { ...data };
    ctx.__env = data;
    const tokens = tokenize(template);
    const r = await render(tokens, ctx, 0, tokens.length, this);
    return rout(r);
  }
}

Droplet.filters = BUILTIN_FILTERS;
Droplet.LiquidError = LiquidError;
Droplet._internals = { tokenize, render, rout, evalOutput, evalExpr, stringify, evalCondition };

module.exports = Droplet;
