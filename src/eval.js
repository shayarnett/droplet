import { isArr, str, EMPTY, BLANK, truthy, isEmpty, isBlank, liquidEq, stringify } from "./utils.js";
import { BUILTIN_FILTERS } from "./filters.js";

const resolve = (path, ctx) => {
  path = path.replace(/\s*\.\s*/g, ".").replace(/\s*\[\s*/g, "[").replace(/\s*\]\s*/g, "]").trim();
  if (path[0] === "[" && path[1] === "[" && (path[2] === "'" || path[2] === '"')) path = path.slice(1);
  const segs = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "[") {
      i++;
      while (i < path.length && path[i] === " ") i++;
      if (path[i] === "'" || path[i] === '"') {
        const q = path[i]; i++;
        let key = "";
        while (i < path.length && path[i] !== q) { key += path[i]; i++; }
        i++; // closing quote
        while (i < path.length && path[i] === " ") i++;
        if (path[i] === "]") i++;
        segs.push({ type: "blit", val: key });
      } else {
        let key = "", depth = 1;
        while (i < path.length) { if (path[i] === "[") depth++; if (path[i] === "]") { depth--; if (!depth) break; } key += path[i]; i++; }
        i++; // closing bracket
        if (/^-?\d+$/.test(key)) segs.push({ type: "idx", val: +key });
        else if (/^-?\d+\.\d+$/.test(key)) segs.push({ type: "blit", val: key });
        else segs.push({ type: "var", val: key });
      }
    } else if (path[i] === ".") {
      i++;
    } else {
      let key = "";
      while (i < path.length && path[i] !== "." && path[i] !== "[") { key += path[i]; i++; }
      if (key) segs.push({ type: "lit", val: key });
    }
  }
  let v = ctx;
  for (const seg of segs) {
    if (v == null) return undefined;
    if (seg.type === "var") {
      const key = resolve(seg.val, ctx);
      v = v?.[key];
    } else if (seg.type === "idx") {
      if (typeof v === "string") v = undefined;
      else if (isArr(v) && seg.val < 0) v = v[v.length + seg.val];
      else v = v?.[seg.val];
    } else if (seg.type === "blit") {
      if (typeof v === "string") v = undefined;
      else v = v?.[seg.val];
    } else {
      if (isArr(v)) {
        if (seg.val === "first") v = v[0];
        else if (seg.val === "last") v = v[v.length - 1];
        else if (seg.val === "size") v = v.length;
        else v = v?.[seg.val];
      } else if (v && typeof v === "object") {
        if (seg.val === "first" && !(seg.val in v)) { const k = Object.keys(v); v = k.length ? [k[0], v[k[0]]] : undefined; }
        else if (seg.val === "last" && !(seg.val in v)) { v = undefined; }
        else if (seg.val === "size" && !(seg.val in v)) v = Object.keys(v).length;
        else v = v?.[seg.val];
      } else if (typeof v === "string") {
        if (seg.val === "size") v = v.length;
        else if (seg.val === "first") v = v[0];
        else if (seg.val === "last") v = v[v.length - 1];
        else v = undefined;
      }
      else { v = v?.[seg.val]; }
    }
  }
  return v;
};

const parseLiteral = s => {
  s = s.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "nil" || s === "null") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) { const n = new Number(parseFloat(s)); n.__f = 1; return n; }
  if ((s[0] === '"' || s[0] === "'") && s.length >= 2) { const q = s[0]; let i = 1; while (i < s.length && s[i] !== q) i++; if (i < s.length) return s.slice(1, i); }
  return undefined;
};

const evalExpr = (s, ctx) => {
  s = s.trim();
  if (!s) return null;
  const rangeMatch = s.match(/^\((.+?)\.\.\.?(.+?)\)$/);
  if (rangeMatch) {
    const from = parseInt(evalExpr(rangeMatch[1].trim(), ctx)) || 0;
    const to = parseInt(evalExpr(rangeMatch[2].trim(), ctx)) || 0;
    const a = []; if (from <= to) for (let n = from; n <= to; n++) a.push(n);
    a.__range = true; a.first = a[0]; a.last = a[a.length - 1];
    a.toString = () => `${from}..${to}`;
    return a;
  }
  let lit = parseLiteral(s);
  if (lit !== undefined) return lit;
  if (s === "nil" || s === "null") return null;
  // Check increment/decrement counters
  if (ctx.__counters && s in ctx.__counters && !ctx.__assigns?.has(s)) return ctx.__counters[s];
  const v = resolve(s, ctx);
  if (v !== undefined) return v;
  // Lax: try first token if full string doesn't resolve
  const ft = s.match(/^('[^']*'|"[^"]*"|\S+)/);
  if (ft && ft[0] !== s) { lit = parseLiteral(ft[0]); if (lit !== undefined) return lit; if (ft[0] === "nil" || ft[0] === "null") return null; return resolve(ft[0], ctx); }
  const nm = s.match(/^-?\d+(\.\d+)?/);
  if (nm && nm[0] !== s) { lit = parseLiteral(nm[0]); if (lit !== undefined) return lit; }
  return undefined;
};

const evalFilter = async (val, filterStr, ctx, engine) => {
  const m = filterStr.match(/^\s*(\w+)[^:]*(?::\s*(.*))?/);
  if (!m) return val;
  const name = m[1];
  const fn = engine._filters[name] ?? BUILTIN_FILTERS[name];
  if (!fn) return val;
  let args = [];
  if (m[2]) {
    let raw = m[2], arg = "", inQ = 0, skip = 0;
    for (const c of raw) {
      if (skip && c !== ",") continue;
      skip = 0;
      if ((c === '"' || c === "'") && !inQ) inQ = c;
      else if (c === inQ) { inQ = 0; skip = 1; }
      else if (c === "," && !inQ) { args.push(arg); arg = ""; continue; }
      arg += c;
    }
    if (arg) args.push(arg);
    const positional = [], named = {};
    for (const a of args) {
      const kv = a.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/);
      if (kv) named[kv[1]] = evalExpr(kv[2].trim(), ctx);
      else { const v = evalExpr(a.trim(), ctx); positional.push(v === undefined ? null : v); }
    }
    args = positional;
    if (Object.keys(named).length) args.push(named);
  }
  return engine._filters[name] ? await fn.call(engine.options, val, ...args) : fn(val, ...args);
};

const splitPipes = s => {
  const parts = []; let last = 0, q = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === "'" || c === '"') && !q) q = c;
    else if (c === q) { q = 0; if (s[i + 1] === c) i++; }
    if (!q && c === "|") { parts.push(s.slice(last, i)); last = i + 1; }
  }
  parts.push(s.slice(last));
  return parts;
};

const evalOutput = async (expr, ctx, engine, raw) => {
  const parts = splitPipes(expr);
  let val = evalExpr(parts[0], ctx);
  for (let i = 1; i < parts.length; i++) val = await evalFilter(val, parts[i], ctx, engine);
  return raw ? val : val ?? "";
};

const splitFirstLogical = s => {
  let q = 0, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === "'" || c === '"') && !q) q = c;
    else if (c === q) q = 0;
    if (q) continue;
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth) continue;
    if (s.substr(i, 4) === " or ") return [s.slice(0, i), "or", s.slice(i + 4)];
    if (s.substr(i, 5) === " and ") return [s.slice(0, i), "and", s.slice(i + 5)];
  }
  return null;
};

const evalCondition = (expr, ctx) => {
  expr = expr.trim();
  while (expr[0] === "(" && expr.at(-1) === ")") { let d = 0, ok = true; for (let pi = 0; pi < expr.length - 1; pi++) { if (expr[pi] === "(") d++; if (expr[pi] === ")") d--; if (d === 0) { ok = false; break; } } if (ok) expr = expr.slice(1, -1).trim(); else break; }
  const lrParts = splitFirstLogical(expr);
  if (lrParts) { const l = evalCondition(lrParts[0], ctx); return lrParts[1] === "and" ? l && evalCondition(lrParts[2], ctx) : l || evalCondition(lrParts[2], ctx); }
  const ops = ["==", "!=", "<>", "<=", ">=", "<", ">", " contains "];
  for (const op of ops) {
    let idx = -1, q = 0;
    for (let k = 0; k < expr.length; k++) {
      const c = expr[k]; if ((c === "'" || c === '"') && !q) q = c; else if (c === q) q = 0;
      if (!q && expr.substr(k, op.length) === op) { idx = k; break; }
    }
    if (idx >= 0) {
      const lRaw = expr.slice(0, idx).trim(), rRaw = expr.slice(idx + op.length).trim();
      const l = lRaw === "empty" ? EMPTY : lRaw === "blank" ? BLANK : evalExpr(lRaw, ctx);
      const r = rRaw === "empty" ? EMPTY : rRaw === "blank" ? BLANK : evalExpr(rRaw, ctx);
      switch (op.trim()) {
        case "==": return liquidEq(l, r);
        case "!=": case "<>": return !liquidEq(l, r);
        case "<": { const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r; return lv != null && rv != null && typeof lv === typeof rv && lv < rv; }
        case ">": { const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r; return lv != null && rv != null && typeof lv === typeof rv && lv > rv; }
        case "<=": { const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r; return lv != null && rv != null && typeof lv === typeof rv && lv <= rv; }
        case ">=": { const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r; return lv != null && rv != null && typeof lv === typeof rv && lv >= rv; }
        case "contains":
          if (r == null) return false;
          if (typeof l === "string") return l.includes(str(r));
          if (isArr(l)) return l.includes(r);
          return false;
      }
    }
  }
  if (expr === "empty" || expr === "blank") return true;
  return truthy(evalExpr(expr, ctx));
};

export { resolve, parseLiteral, evalExpr, evalFilter, splitPipes, evalOutput, evalCondition, splitFirstLogical, BUILTIN_FILTERS };
