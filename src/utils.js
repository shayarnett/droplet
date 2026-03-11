const isArr = Array.isArray;
const M = Math;

// Coerce to array: wraps non-arrays, nullish becomes []
const arr = (value) => isArr(value) ? value : value == null ? [] : [value];

// Coerce to string with Liquid semantics:
// - null/undefined → ""
// - float-tagged numbers → decimal representation (e.g. 1.0, not 1)
// - objects → Ruby-style stringify
const str = (value) => {
  if (value == null) return "";
  if (value?.__f) {
    return value % 1 === 0
      ? (+value).toFixed(1)
      : ("" + +value).replace(/^(-?\d)e/, "$1.0e");
  }
  if (typeof value === "object" && !isArr(value)) return stringify(value);
  return "" + value;
};

// Coerce to number: null→0, float-tagged→unwrap, string→parseFloat, NaN→0
const num = (value) => {
  if (value == null) return 0;
  if (value?.__f) return value.valueOf();
  const n = typeof value === "string" ? parseFloat(value) : +value;
  return isNaN(n) ? 0 : n;
};

// Extract the output string from a render result (which may be a string or {out, __ctrl} object)
const rout = (result) => typeof result === "string" ? result : result.out ?? "";

// Sentinel objects for Liquid's `empty` and `blank` keywords
const EMPTY = { __liquid: "empty", toString: () => "" };
const BLANK = { __liquid: "blank", toString: () => "" };

// Liquid truthiness: only false and nil are falsy (plus the BLANK sentinel)
const truthy = (value) => value !== false && value != null && value !== BLANK;

// Liquid `empty` check: "", [], or {} with no keys (but not __liquid sentinels)
const isEmpty = (value) =>
  value === "" ||
  (isArr(value) && !value.length) ||
  (value != null && typeof value === "object" && !isArr(value) && !value.__liquid && !Object.keys(value).length);

// Liquid `blank` check: empty OR nil/false/whitespace-only string
const isBlank = (value) =>
  value == null || isEmpty(value) || value === false || (typeof value === "string" && !value.trim());

// Deep equality for arrays (Liquid compares arrays by value)
const arrEq = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (isArr(a[i]) && isArr(b[i])) { if (!arrEq(a[i], b[i])) return false; }
    else if (a[i] !== b[i] && !(a[i] == null && b[i] == null)) return false;
  }
  return true;
};

// Liquid equality: handles empty/blank sentinels and float-tagged numbers
const liquidEq = (left, right) => {
  if (right === EMPTY || right?.__liquid === "empty") return isEmpty(left);
  if (left === EMPTY || left?.__liquid === "empty") return isEmpty(right);
  if (right === BLANK || right?.__liquid === "blank") return isBlank(left);
  if (left === BLANK || left?.__liquid === "blank") return isBlank(right);
  const lv = left?.__f ? +left : left;
  const rv = right?.__f ? +right : right;
  if (isArr(lv) && isArr(rv)) return arrEq(lv, rv);
  return lv === rv || (lv == null && rv == null);
};

// Format a value as Ruby would display it in inspect/to_s (used in hash stringify)
const rubyVal = (value) => {
  if (value == null) return '""';
  if (value?.__f) return value % 1 === 0 ? (+value).toFixed(1) : "" + +value;
  if (isArr(value)) return "[" + value.map(rubyVal).join(", ") + "]";
  if (typeof value === "object") return stringify(value);
  if (typeof value === "string") return `"${value}"`;
  return "" + value;
};

// Convert a Liquid value to its output string representation.
// Mutually recursive with rubyVal for hash formatting.
const stringify = (value) => {
  if (value == null) return "";
  if (value?.__f) {
    return value % 1 === 0
      ? (+value).toFixed(1)
      : ("" + +value).replace(/^(-?\d)e/, "$1.0e");
  }
  if (value?.__liquid) return "";
  if (isArr(value)) {
    if (value.__range) return `${value.first}..${value.last}`;
    return value.flat(Infinity).map(item =>
      typeof item === "object" && item !== null ? stringify(item) : item ?? ""
    ).join("");
  }
  if (typeof value === "object") {
    return "{" + Object.entries(value).map(([key, val]) => `"${key}"=>${rubyVal(val)}`).join(", ") + "}";
  }
  return "" + value;
};

export { isArr, arr, str, num, rout, M, EMPTY, BLANK, truthy, isEmpty, isBlank, liquidEq, rubyVal, stringify };
