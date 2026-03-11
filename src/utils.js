const isArr = Array.isArray, M = Math;
const arr = v => isArr(v) ? v : v == null ? [] : [v];
const str = v => v == null ? "" : v?.__f ? (v % 1 === 0 ? (+v).toFixed(1) : ("" + +v).replace(/^(-?\d)e/, "$1.0e")) : typeof v === "object" && !isArr(v) ? stringify(v) : "" + v;
const num = v => { if (v == null) return 0; if (v?.__f) return v.valueOf(); const n = typeof v === "string" ? parseFloat(v) : +v; return isNaN(n) ? 0 : n; };
const rout = r => typeof r === "string" ? r : r.out ?? "";
const EMPTY = { __liquid: "empty", toString: () => "" };
const BLANK = { __liquid: "blank", toString: () => "" };

const truthy = v => v !== false && v != null && v !== BLANK;

const isEmpty = v => v === "" || (isArr(v) && !v.length) || (v != null && typeof v === "object" && !isArr(v) && !v.__liquid && !Object.keys(v).length);
const isBlank = v => v == null || isEmpty(v) || v === false || (typeof v === "string" && !v.trim());

const liquidEq = (l, r) => {
  if (r === EMPTY || r?.__liquid === "empty") return isEmpty(l);
  if (l === EMPTY || l?.__liquid === "empty") return isEmpty(r);
  if (r === BLANK || r?.__liquid === "blank") return isBlank(l);
  if (l === BLANK || l?.__liquid === "blank") return isBlank(r);
  const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r;
  return lv === rv || (lv == null && rv == null);
};

const rubyVal = v => {
  if (v == null) return '""';
  if (v?.__f) return v % 1 === 0 ? (+v).toFixed(1) : "" + +v;
  if (isArr(v)) return "[" + v.map(rubyVal).join(", ") + "]";
  if (typeof v === "object") return stringify(v);
  if (typeof v === "string") return `"${v}"`;
  return "" + v;
};
const stringify = v => {
  if (v == null) return "";
  if (v?.__f) return v % 1 === 0 ? (+v).toFixed(1) : ("" + +v).replace(/^(-?\d)e/, "$1.0e");
  if (v?.__liquid) return "";
  if (isArr(v)) return v.__range ? `${v.first}..${v.last}` : v.flat(Infinity).map(x => typeof x === "object" && x !== null ? stringify(x) : x ?? "").join("");
  if (typeof v === "object") return "{" + Object.entries(v).map(([k, val]) => `"${k}"=>${rubyVal(val)}`).join(", ") + "}";
  return "" + v;
};

export { isArr, arr, str, num, rout, M, EMPTY, BLANK, truthy, isEmpty, isBlank, liquidEq, rubyVal, stringify };
