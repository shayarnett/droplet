import { isArr, str, EMPTY, BLANK, truthy, isEmpty, isBlank, liquidEq, stringify } from "./utils.js";
import { BUILTIN_FILTERS } from "./filters.js";

// Resolve a dotted/bracketed path like "user.name", "a[0]", "a['key']", "a[var]"
// against a context object. Supports nested variable lookups inside brackets.
const resolve = (path, ctx) => {
  path = path.replace(/\s*\.\s*/g, ".").replace(/\s*\[\s*/g, "[").replace(/\s*\]\s*/g, "]").trim();

  // Handle double-bracket edge case: [[' or [["
  if (path[0] === "[" && path[1] === "[" && (path[2] === "'" || path[2] === '"')) {
    path = path.slice(1);
  }

  // Parse path into segments
  const segments = [];
  let pos = 0;

  while (pos < path.length) {
    if (path[pos] === "[") {
      pos++;
      while (pos < path.length && path[pos] === " ") pos++;

      if (path[pos] === "'" || path[pos] === '"') {
        // Quoted bracket access: a['key'] or a["key"]
        const quote = path[pos];
        pos++;
        let key = "";
        while (pos < path.length && path[pos] !== quote) { key += path[pos]; pos++; }
        pos++; // closing quote
        while (pos < path.length && path[pos] === " ") pos++;
        if (path[pos] === "]") pos++;
        segments.push({ type: "blit", val: key });
      } else {
        // Unquoted bracket: could be index, float literal, or variable expression
        let key = "";
        let depth = 1;
        while (pos < path.length) {
          if (path[pos] === "[") depth++;
          if (path[pos] === "]") { depth--; if (!depth) break; }
          key += path[pos];
          pos++;
        }
        pos++; // closing bracket

        if (/^-?\d+$/.test(key)) segments.push({ type: "idx", val: +key });
        else if (/^-?\d+\.\d+$/.test(key)) segments.push({ type: "blit", val: key });
        else segments.push({ type: "var", val: key });
      }
    } else if (path[pos] === ".") {
      pos++;
    } else {
      // Dot-separated key
      let key = "";
      while (pos < path.length && path[pos] !== "." && path[pos] !== "[") { key += path[pos]; pos++; }
      if (key) segments.push({ type: "lit", val: key });
    }
  }

  // Walk segments against the context
  let value = ctx;
  for (const seg of segments) {
    if (value == null) return undefined;

    if (seg.type === "var") {
      // Dynamic key: resolve the variable expression, then use as key
      const key = resolve(seg.val, ctx);
      value = value?.[key];

    } else if (seg.type === "idx") {
      // Numeric index: strings return undefined, arrays support negative indices
      if (typeof value === "string") value = undefined;
      else if (isArr(value) && seg.val < 0) value = value[value.length + seg.val];
      else value = value?.[seg.val];

    } else if (seg.type === "blit") {
      // Bracket literal (quoted string or float): strings return undefined
      if (typeof value === "string") value = undefined;
      else value = value?.[seg.val];

    } else {
      // Dot literal: handle special properties (first, last, size) on arrays/objects/strings
      if (isArr(value)) {
        if (seg.val === "first") value = value[0];
        else if (seg.val === "last") value = value[value.length - 1];
        else if (seg.val === "size") value = value.length;
        else value = value?.[seg.val];

      } else if (value && typeof value === "object") {
        if (seg.val === "first" && !(seg.val in value)) {
          const keys = Object.keys(value);
          value = keys.length ? [keys[0], value[keys[0]]] : undefined;
        }
        else if (seg.val === "last" && !(seg.val in value)) { value = undefined; }
        else if (seg.val === "size" && !(seg.val in value)) value = Object.keys(value).length;
        else value = value?.[seg.val];

      } else if (typeof value === "string") {
        if (seg.val === "size") value = value.length;
        else if (seg.val === "first") value = value[0];
        else if (seg.val === "last") value = value[value.length - 1];
        else value = undefined;
      } else {
        value = value?.[seg.val];
      }
    }
  }
  return value;
};

// Parse a Liquid literal value: true, false, nil, integers, floats, quoted strings.
// Returns undefined if the string isn't a recognizable literal.
const parseLiteral = (str) => {
  str = str.trim();
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "nil" || str === "null") return null;
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) {
    const n = new Number(parseFloat(str));
    n.__f = 1; // tag as float for decimal preservation
    return n;
  }
  if ((str[0] === '"' || str[0] === "'") && str.length >= 2) {
    const quote = str[0];
    let i = 1;
    while (i < str.length && str[i] !== quote) i++;
    if (i < str.length) return str.slice(1, i);
  }
  return undefined;
};

// Evaluate an expression: tries literal, then variable lookup, then lax fallbacks.
// Handles range literals like (1..5).
const evalExpr = (expr, ctx) => {
  expr = expr.trim();
  if (!expr) return null;

  // Range literal: (from..to)
  const rangeMatch = expr.match(/^\((.+?)\.\.\.?(.+?)\)$/);
  if (rangeMatch) {
    const from = parseInt(evalExpr(rangeMatch[1].trim(), ctx)) || 0;
    const to = parseInt(evalExpr(rangeMatch[2].trim(), ctx)) || 0;
    const range = [];
    if (from <= to) for (let n = from; n <= to; n++) range.push(n);
    range.__range = true;
    range.first = range[0];
    range.last = range[range.length - 1];
    range.toString = () => `${from}..${to}`;
    return range;
  }

  // Try as literal
  let literal = parseLiteral(expr);
  if (literal !== undefined) return literal;
  if (expr === "nil" || expr === "null") return null;

  // Check increment/decrement counters (unless overridden by assign)
  if (ctx.__counters && expr in ctx.__counters && !ctx.__assigns?.has(expr)) {
    return ctx.__counters[expr];
  }

  // Try as variable path
  const resolved = resolve(expr, ctx);
  if (resolved !== undefined) return resolved;

  // Lax mode: try first token if full string doesn't resolve
  const firstToken = expr.match(/^('[^']*'|"[^"]*"|\S+)/);
  if (firstToken && firstToken[0] !== expr) {
    literal = parseLiteral(firstToken[0]);
    if (literal !== undefined) return literal;
    if (firstToken[0] === "nil" || firstToken[0] === "null") return null;
    return resolve(firstToken[0], ctx);
  }

  // Lax mode: try leading number
  const numMatch = expr.match(/^-?\d+(\.\d+)?/);
  if (numMatch && numMatch[0] !== expr) {
    literal = parseLiteral(numMatch[0]);
    if (literal !== undefined) return literal;
  }

  return undefined;
};

// Apply a single filter to a value. Parses filter name and arguments,
// looks up in engine custom filters first, then builtins.
const evalFilter = async (value, filterStr, ctx, engine) => {
  const match = filterStr.match(/^\s*(\w+)[^:]*(?::\s*(.*))?/);
  if (!match) return value;

  const filterName = match[1];
  const filterFn = engine._filters[filterName] ?? BUILTIN_FILTERS[filterName];
  if (!filterFn) return value;

  let args = [];
  if (match[2]) {
    // Parse comma-separated arguments, respecting quotes
    let raw = match[2];
    let currentArg = "";
    let inQuote = 0;
    let skipToComma = 0;

    for (const ch of raw) {
      if (skipToComma && ch !== ",") continue;
      skipToComma = 0;
      if ((ch === '"' || ch === "'") && !inQuote) inQuote = ch;
      else if (ch === inQuote) { inQuote = 0; skipToComma = 1; }
      else if (ch === "," && !inQuote) { args.push(currentArg); currentArg = ""; continue; }
      currentArg += ch;
    }
    if (currentArg) args.push(currentArg);

    // Separate positional and named arguments
    const positional = [];
    const named = {};
    for (const arg of args) {
      const kvMatch = arg.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/);
      if (kvMatch) {
        named[kvMatch[1]] = evalExpr(kvMatch[2].trim(), ctx);
      } else {
        const val = evalExpr(arg.trim(), ctx);
        positional.push(val === undefined ? null : val);
      }
    }

    args = positional;
    if (Object.keys(named).length) args.push(named);
  }

  // Custom filters are called with engine.options as `this`
  return engine._filters[filterName]
    ? await filterFn.call(engine.options, value, ...args)
    : filterFn(value, ...args);
};

// Split an expression on unquoted pipe characters into [expression, filter1, filter2, ...]
const splitPipes = (expr) => {
  const parts = [];
  let lastSplit = 0;
  let quote = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if ((ch === "'" || ch === '"') && !quote) quote = ch;
    else if (ch === quote) { quote = 0; if (expr[i + 1] === ch) i++; }
    if (!quote && ch === "|") {
      parts.push(expr.slice(lastSplit, i));
      lastSplit = i + 1;
    }
  }
  parts.push(expr.slice(lastSplit));
  return parts;
};

// Evaluate a full output expression: {{ expr | filter1 | filter2 }}
// If raw=true, returns the raw value instead of coercing undefined to "".
const evalOutput = async (expr, ctx, engine, raw) => {
  const parts = splitPipes(expr);
  let value = evalExpr(parts[0], ctx);
  for (let i = 1; i < parts.length; i++) {
    value = await evalFilter(value, parts[i], ctx, engine);
  }
  return raw ? value : value ?? "";
};

// Find the first top-level " and " or " or " in an expression,
// respecting quotes and parentheses. Returns [left, op, right] or null.
const splitFirstLogical = (expr) => {
  let quote = 0;
  let parenDepth = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if ((ch === "'" || ch === '"') && !quote) quote = ch;
    else if (ch === quote) quote = 0;
    if (quote) continue;
    if (ch === "(") parenDepth++;
    if (ch === ")") parenDepth--;
    if (parenDepth) continue;
    if (expr.substr(i, 4) === " or ") return [expr.slice(0, i), "or", expr.slice(i + 4)];
    if (expr.substr(i, 5) === " and ") return [expr.slice(0, i), "and", expr.slice(i + 5)];
  }
  return null;
};

// Evaluate a Liquid boolean condition (used by if/unless/elsif/when).
// Handles and/or, comparison operators, contains, and the empty/blank keywords.
const evalCondition = (expr, ctx) => {
  expr = expr.trim();

  // Strip balanced outer parentheses
  while (expr[0] === "(" && expr.at(-1) === ")") {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === "(") depth++;
      if (expr[i] === ")") depth--;
      if (depth === 0) { balanced = false; break; }
    }
    if (balanced) expr = expr.slice(1, -1).trim();
    else break;
  }

  // Split on and/or (left-to-right, Ruby-compatible short-circuit)
  const logical = splitFirstLogical(expr);
  if (logical) {
    const left = evalCondition(logical[0], ctx);
    return logical[1] === "and"
      ? left && evalCondition(logical[2], ctx)
      : left || evalCondition(logical[2], ctx);
  }

  // Try each comparison operator (order matters: <= before <, etc.)
  const operators = ["==", "!=", "<>", "<=", ">=", "<", ">", " contains "];
  for (const op of operators) {
    // Find the operator outside of quotes
    let opIdx = -1;
    let quote = 0;
    for (let k = 0; k < expr.length; k++) {
      const ch = expr[k];
      if ((ch === "'" || ch === '"') && !quote) quote = ch;
      else if (ch === quote) quote = 0;
      if (!quote && expr.substr(k, op.length) === op) { opIdx = k; break; }
    }

    if (opIdx >= 0) {
      const leftRaw = expr.slice(0, opIdx).trim();
      const rightRaw = expr.slice(opIdx + op.length).trim();

      // Resolve empty/blank keywords as sentinel objects
      const left = leftRaw === "empty" ? EMPTY : leftRaw === "blank" ? BLANK : evalExpr(leftRaw, ctx);
      const right = rightRaw === "empty" ? EMPTY : rightRaw === "blank" ? BLANK : evalExpr(rightRaw, ctx);

      switch (op.trim()) {
        case "==": return liquidEq(left, right);
        case "!=": case "<>": return !liquidEq(left, right);
        case "<": {
          const lv = left?.__f ? +left : left, rv = right?.__f ? +right : right;
          return lv != null && rv != null && typeof lv === typeof rv && lv < rv;
        }
        case ">": {
          const lv = left?.__f ? +left : left, rv = right?.__f ? +right : right;
          return lv != null && rv != null && typeof lv === typeof rv && lv > rv;
        }
        case "<=": {
          const lv = left?.__f ? +left : left, rv = right?.__f ? +right : right;
          return lv != null && rv != null && typeof lv === typeof rv && lv <= rv;
        }
        case ">=": {
          const lv = left?.__f ? +left : left, rv = right?.__f ? +right : right;
          return lv != null && rv != null && typeof lv === typeof rv && lv >= rv;
        }
        case "contains":
          if (right == null) return false;
          if (typeof left === "string") return left.includes(str(right));
          if (isArr(left)) {
            if (isArr(right)) return left.some(item => isArr(item) && item.length === right.length && item.every((v, k) => v === right[k]));
            return left.includes(right);
          }
          return false;
      }
    }
  }

  // Bare "empty" or "blank" keyword is truthy
  if (expr === "empty" || expr === "blank") return true;

  // Fall back to truthiness of expression value
  return truthy(evalExpr(expr, ctx));
};

export { resolve, parseLiteral, evalExpr, evalFilter, splitPipes, evalOutput, evalCondition, splitFirstLogical, BUILTIN_FILTERS };
