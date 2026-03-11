// src/utils.js
var isArr = Array.isArray;
var M = Math;
var arr = (v) => isArr(v) ? v : v == null ? [] : [v];
var str = (v) => v == null ? "" : v?.__f ? v % 1 === 0 ? (+v).toFixed(1) : ("" + +v).replace(/^(-?\d)e/, "$1.0e") : typeof v === "object" && !isArr(v) ? stringify(v) : "" + v;
var num = (v) => {
  if (v == null)
    return 0;
  if (v?.__f)
    return v.valueOf();
  const n = typeof v === "string" ? parseFloat(v) : +v;
  return isNaN(n) ? 0 : n;
};
var rout = (r) => typeof r === "string" ? r : r.out ?? "";
var EMPTY = { __liquid: "empty", toString: () => "" };
var BLANK = { __liquid: "blank", toString: () => "" };
var truthy = (v) => v !== false && v != null && v !== BLANK;
var isEmpty = (v) => v === "" || isArr(v) && !v.length || v != null && typeof v === "object" && !isArr(v) && !v.__liquid && !Object.keys(v).length;
var isBlank = (v) => v == null || isEmpty(v) || v === false || typeof v === "string" && !v.trim();
var liquidEq = (l, r) => {
  if (r === EMPTY || r?.__liquid === "empty")
    return isEmpty(l);
  if (l === EMPTY || l?.__liquid === "empty")
    return isEmpty(r);
  if (r === BLANK || r?.__liquid === "blank")
    return isBlank(l);
  if (l === BLANK || l?.__liquid === "blank")
    return isBlank(r);
  const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r;
  return lv === rv || lv == null && rv == null;
};
var rubyVal = (v) => {
  if (v == null)
    return '""';
  if (v?.__f)
    return v % 1 === 0 ? (+v).toFixed(1) : "" + +v;
  if (isArr(v))
    return "[" + v.map(rubyVal).join(", ") + "]";
  if (typeof v === "object")
    return stringify(v);
  if (typeof v === "string")
    return `"${v}"`;
  return "" + v;
};
var stringify = (v) => {
  if (v == null)
    return "";
  if (v?.__f)
    return v % 1 === 0 ? (+v).toFixed(1) : ("" + +v).replace(/^(-?\d)e/, "$1.0e");
  if (v?.__liquid)
    return "";
  if (isArr(v))
    return v.__range ? `${v.first}..${v.last}` : v.flat(Infinity).map((x) => typeof x === "object" && x !== null ? stringify(x) : x ?? "").join("");
  if (typeof v === "object")
    return "{" + Object.entries(v).map(([k, val]) => `"${k}"=>${rubyVal(val)}`).join(", ") + "}";
  return "" + v;
};

// src/filters.js
var BUILTIN_FILTERS = {
  abs: (v) => M.abs(num(v)),
  append: (v, a) => str(v) + str(a),
  at_least: (v, a) => M.max(num(v), num(a)),
  at_most: (v, a) => M.min(num(v), num(a)),
  capitalize: (v) => {
    const s = str(v);
    return (s[0]?.toUpperCase() ?? "") + s.slice(1);
  },
  ceil: (v) => M.ceil(num(v)),
  compact: (v, k) => k ? arr(v).filter((x) => x?.[k] != null) : arr(v).filter((x) => x != null),
  concat: (v, a) => arr(v).concat(arr(a)),
  date: (v, fmt) => {
    if (!fmt)
      return v;
    let d, tz;
    if (v === "now" || v === "today" || v === "Now" || v === "Today")
      d = new Date;
    else if (typeof v === "number" || /^-?\d+$/.test("" + v))
      d = new Date(+v * 1000);
    else {
      const sv = "" + v;
      const dm = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dm)
        d = new Date(+dm[1], +dm[2] - 1, +dm[3]);
      else {
        const tzm = sv.match(/([+-]\d{2}:?\d{2})\s*$/);
        if (tzm)
          tz = tzm[1].replace(":", "");
        const tzn = sv.match(/\s([A-Z]{2,5})\s*$/);
        if (tzn)
          tz = tzn[1];
        d = new Date(sv);
      }
    }
    if (isNaN(d))
      return v;
    const pad = (n) => n < 10 ? "0" + n : "" + n;
    const pad3 = (n) => n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n;
    const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const D = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const mn = d.getMonth(), dw = d.getDay(), yr = d.getFullYear(), h12 = d.getHours() % 12 || 12;
    const day = d.getDate(), hr = d.getHours(), min = d.getMinutes(), sec = d.getSeconds();
    const jday = M.floor((d - new Date(yr, 0, 0)) / 86400000);
    const off = d.getTimezoneOffset(), offH = pad(M.abs(M.trunc(off / 60))), offM = pad(M.abs(off % 60));
    const offSign = off <= 0 ? "+" : "-", tzStr = tz || offSign + offH + offM;
    const thu = new Date(d);
    thu.setDate(day - (dw + 6) % 7 + 3);
    const jan4 = new Date(thu.getFullYear(), 0, 4);
    const isoWeek = 1 + M.round(((thu - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7);
    const yday = jday - 1;
    const wU = M.floor((yday + 7 - dw) / 7);
    const wW = M.floor((yday + 7 - (dw + 6) % 7) / 7);
    const map = {
      "%Y": yr,
      "%m": pad(mn + 1),
      "%d": pad(day),
      "%H": pad(hr),
      "%M": pad(min),
      "%S": pad(sec),
      "%y": pad(yr % 100),
      "%B": MN[mn],
      "%b": MN[mn].slice(0, 3),
      "%A": D[dw],
      "%a": D[dw].slice(0, 3),
      "%e": (day < 10 ? " " : "") + day,
      "%l": (h12 < 10 ? " " : "") + h12,
      "%I": pad(h12),
      "%p": hr < 12 ? "AM" : "PM",
      "%P": hr < 12 ? "am" : "pm",
      "%j": pad3(jday),
      "%C": M.floor(yr / 100),
      "%h": MN[mn].slice(0, 3),
      "%w": dw,
      "%u": dw || 7,
      "%%": "%",
      "%s": M.floor(d.getTime() / 1000),
      "%Z": tz || (d.toTimeString().match(/\((.+)\)/) ?? ["", ""])[1],
      "%k": (hr < 10 ? " " : "") + hr,
      "%N": "" + d.getMilliseconds(),
      "%z": tzStr,
      "%n": `
`,
      "%t": "\t",
      "%U": pad(wU),
      "%W": pad(wW),
      "%V": pad(isoWeek),
      "%G": thu.getFullYear(),
      "%g": pad(thu.getFullYear() % 100),
      "%c": D[dw].slice(0, 3) + " " + MN[mn].slice(0, 3) + " " + (day < 10 ? " " : "") + day + " " + pad(hr) + ":" + pad(min) + ":" + pad(sec) + " " + yr,
      "%X": pad(hr) + ":" + pad(min) + ":" + pad(sec),
      "%F": yr + "-" + pad(mn + 1) + "-" + pad(day),
      "%R": pad(hr) + ":" + pad(min),
      "%T": pad(hr) + ":" + pad(min) + ":" + pad(sec),
      "%r": pad(h12) + ":" + pad(min) + ":" + pad(sec) + " " + (hr < 12 ? "AM" : "PM")
    };
    map["%x"] = map["%D"] = pad(mn + 1) + "/" + pad(day) + "/" + pad(yr % 100);
    map["%T"] = map["%X"];
    return fmt.replace(/%[-_0^#:]?[YmdHMSyBbAaelIpPjsCchwuNkZznGgVUWDFRTrxXct%]/g, (m) => {
      const mod = m.length === 3 ? m[1] : null, base = mod ? "%" + m[2] : m;
      if (mod === "-")
        return map[base] != null ? ("" + map[base]).replace(/^[0 ]/, "") : m;
      if (mod === "_") {
        const s = "" + (map[base] ?? "");
        return s.replace(/^0/, " ");
      }
      if (mod === "0")
        return map[base] != null ? ("" + map[base]).replace(/^ /, "0") : m;
      if (mod === "^" || mod === "#")
        return map[base] != null ? ("" + map[base]).toUpperCase() : m;
      if (m === "%:z")
        return tzStr.slice(0, 3) + ":" + tzStr.slice(3);
      return map[m] != null ? "" + map[m] : m;
    });
  },
  default: (v, a, opts) => {
    const e = v === "" || v == null || isArr(v) && !v.length || typeof v === "object" && v !== null && !isArr(v) && !Object.keys(v).length;
    const af = opts?.allow_false;
    if (af)
      return e ? a ?? "" : v;
    return v === false || e ? a ?? "" : v;
  },
  divided_by: (v, a) => {
    const isf = v?.__f || a?.__f || ("" + v).includes(".") || ("" + a).includes(".");
    const na = num(a), nv = num(v);
    if (!na)
      return Infinity;
    if (!isf)
      return M.trunc(nv / na);
    const r = nv / na;
    return r % 1 === 0 ? r.toFixed(1) : r;
  },
  downcase: (v) => str(v).toLowerCase(),
  escape: (v) => v == null ? v : str(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
  h: (v) => BUILTIN_FILTERS.escape(v),
  escape_once: (v) => BUILTIN_FILTERS.escape(str(v).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")),
  find: (v, k, ...r) => {
    const a = arr(v);
    return r.length && r[0] != null ? a.find((x) => x?.[k] == r[0]) : a.find((x) => x?.[k]);
  },
  find_index: (v, k, ...r) => {
    const a = arr(v);
    const idx = r.length && r[0] != null ? a.findIndex((x) => x?.[k] == r[0]) : a.findIndex((x) => x?.[k]);
    return idx < 0 ? null : idx;
  },
  first: (v) => {
    if (typeof v === "string")
      return v[0];
    if (v && typeof v === "object" && !isArr(v)) {
      const k = Object.keys(v);
      return k.length ? [k[0], v[k[0]]] : undefined;
    }
    return isArr(v) ? v[0] : undefined;
  },
  flatten: (v) => arr(v).flat(Infinity),
  floor: (v) => M.floor(num(v)),
  has: (v, k, val) => {
    const a = arr(v);
    const ks = k.split(".");
    return a.some((x) => {
      let o = x;
      for (const s of ks)
        o = o?.[s];
      return val !== undefined ? o === val : truthy(o);
    });
  },
  join: (v, a) => arr(v).map((x) => typeof x === "object" && x !== null && !isArr(x) ? stringify(x) : x).join(a === undefined ? " " : str(a ?? "")),
  last: (v) => {
    if (typeof v === "string")
      return v[v.length - 1];
    if (isArr(v))
      return v[v.length - 1];
    return;
  },
  lstrip: (v) => str(v).replace(/^\s+/, ""),
  map: (v, a) => arr(v).flat().map((x) => x && typeof x === "object" ? x[a] : undefined),
  minus: (v, a) => {
    const r = num(v) - num(a);
    return (v?.__f || a?.__f || ("" + v).includes(".") || ("" + a).includes(".")) && r % 1 === 0 ? r.toFixed(1) : r;
  },
  modulo: (v, a) => {
    const nv = num(v), na = num(a), r = nv % na;
    const isf = v?.__f || a?.__f || ("" + v).includes(".") && !("" + v).includes("e") || ("" + a).includes(".") && !("" + a).includes("e");
    return isf && r % 1 === 0 ? r.toFixed(1) : r;
  },
  newline_to_br: (v) => str(v).replace(/\r?\n/g, `<br />
`).replace(/\r/g, "<br />\r"),
  plus: (v, a) => {
    const r = num(v) + num(a);
    return (v?.__f || a?.__f || ("" + v).includes(".") || ("" + a).includes(".")) && r % 1 === 0 ? r.toFixed(1) : r;
  },
  prepend: (v, a) => str(a) + str(v),
  reject: (v, k, ...rest) => {
    const h = rest.length > 0 && rest[0] != null;
    return arr(v).filter((x) => x != null && (h ? x?.[k] != rest[0] : !x?.[k]));
  },
  remove: (v, a) => str(v).split(str(a)).join(""),
  remove_first: (v, a) => {
    const s = str(v);
    a = str(a);
    const i = s.indexOf(a);
    return i < 0 ? s : s.slice(0, i) + s.slice(i + a.length);
  },
  remove_last: (v, a) => {
    const s = str(v);
    a = str(a);
    const i = s.lastIndexOf(a);
    return i < 0 ? s : s.slice(0, i) + s.slice(i + a.length);
  },
  replace: (v, a, b) => {
    const s = str(v);
    let r = b ?? "";
    if (typeof r === "string") {
      let o = "", i = 0;
      while (i < r.length) {
        if (r[i] === "\\" && i + 1 < r.length) {
          o += r[i + 1];
          i += 2;
        } else {
          o += r[i];
          i++;
        }
      }
      r = o;
    }
    a = a == null ? "" : "" + a;
    if (a === "")
      return s ? r + s.split("").join(r) + r : r;
    return s.split(a).join(r);
  },
  replace_first: (v, a, b) => {
    const s = str(v);
    let r = b ?? "";
    if (typeof r === "string") {
      let o = "", i = 0;
      while (i < r.length) {
        if (r[i] === "\\" && i + 1 < r.length) {
          o += r[i + 1];
          i += 2;
        } else {
          o += r[i];
          i++;
        }
      }
      r = o;
    }
    const idx = s.indexOf(a);
    return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + a.length);
  },
  replace_last: (v, a, b) => {
    const s = str(v);
    let r = b ?? "";
    if (typeof r === "string") {
      let o = "", i = 0;
      while (i < r.length) {
        if (r[i] === "\\" && i + 1 < r.length) {
          o += r[i + 1];
          i += 2;
        } else {
          o += r[i];
          i++;
        }
      }
      r = o;
    }
    const idx = s.lastIndexOf(a);
    return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + a.length);
  },
  reverse: (v) => arr(v).slice().reverse(),
  round: (v, a) => {
    const p = 10 ** (num(a) || 0);
    return M.round(num(v) * p) / p;
  },
  rstrip: (v) => str(v).replace(/\s+$/, ""),
  size: (v) => v == null ? 0 : typeof v === "string" || isArr(v) ? v.length : typeof v === "number" ? Number.isInteger(v) ? 8 : 0 : typeof v === "object" ? Object.keys(v).length : 0,
  slice: (v, a, b) => {
    if (isArr(v)) {
      a = +a;
      b = b != null ? +b : 1;
      if (b < 0)
        return [];
      if (a < 0) {
        if (-a > v.length)
          return [];
        a = v.length + a;
      }
      return v.slice(a, a + b);
    }
    const s = str(v);
    a = +a;
    b = b != null ? +b : 1;
    if (b < 0)
      return "";
    if (a < 0) {
      if (-a > s.length)
        return "";
      a = s.length + a;
    }
    return s.slice(a, a + b);
  },
  sort: (v, k) => arr(v).slice().sort((a, b) => {
    const x = k ? a?.[k] : a, y = k ? b?.[k] : b;
    return x > y ? 1 : x < y ? -1 : 0;
  }),
  sort_natural: (v, k) => arr(v).slice().sort((a, b) => {
    const x = k ? a?.[k] : a, y = k ? b?.[k] : b;
    if (x == null && y == null)
      return 0;
    if (x == null)
      return 1;
    if (y == null)
      return -1;
    return str(x).toLowerCase().localeCompare(str(y).toLowerCase());
  }),
  split: (v, a) => {
    if (v == null || v === false || v === true)
      return [];
    const s = str(v);
    if (!s)
      return [];
    if (a === " ") {
      const r2 = s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "").split(/[ \t\n\r\f]+/);
      return r2[0] === "" ? [] : r2;
    }
    const r = s.split(a == null ? "" : str(a));
    while (r.length > 1 && r.at(-1) === "")
      r.pop();
    return r;
  },
  strip: (v) => str(v).trim(),
  strip_html: (v) => str(v).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, ""),
  strip_newlines: (v) => str(v).replace(/\r?\n|\r/g, ""),
  sum: (v, k) => {
    const flat = (a) => {
      const r = [];
      for (const x of arr(a))
        isArr(x) ? r.push(...flat(x)) : r.push(x);
      return r;
    };
    const toN = (x) => {
      const raw = k ? x?.[k] : x;
      if (raw == null || typeof raw === "boolean" || typeof raw === "object")
        return 0;
      const n = +raw;
      return isNaN(n) ? 0 : n;
    };
    if (!isArr(v))
      return toN(v);
    return flat(v).reduce((s, x) => s + toN(x), 0);
  },
  times: (v, a) => {
    const isf = v?.__f || a?.__f || ("" + v).includes(".") || ("" + a).includes(".");
    let r = num(v) * num(a);
    if (isf) {
      r = +r.toPrecision(12);
      return r % 1 === 0 ? r.toFixed(1) : r;
    }
    return r;
  },
  truncate: (v, a, b) => {
    v = str(v);
    a = a != null ? num(a) : 50;
    b = b ?? "...";
    return v.length <= a ? v : v.slice(0, M.max(0, a - b.length)) + b;
  },
  truncatewords: (v, a, b) => {
    v = str(v);
    const s = v.replace(/^[ \t\n\r\f\v]+/, "");
    const w = s.split(/[ \t\n\r\f\v]+/);
    a = a != null ? num(a) : 15;
    b = b ?? "...";
    return w.length <= a ? w.join(" ") : w.slice(0, a).join(" ") + b;
  },
  uniq: (v, k) => {
    const a = arr(v);
    if (!k)
      return [...new Set(a)];
    const seen = new Set;
    return a.filter((x) => {
      const val = x?.[k];
      if (seen.has(val))
        return false;
      seen.add(val);
      return true;
    });
  },
  upcase: (v) => str(v).toUpperCase(),
  url_decode: (v) => {
    const s = str(v);
    let o = "", i = 0;
    while (i < s.length) {
      if (s[i] === "+") {
        o += " ";
        i++;
      } else if (s[i] === "%" && /^%[0-9A-Fa-f]{2}/.test(s.slice(i))) {
        o += decodeURIComponent(s.slice(i, i + 3));
        i += 3;
      } else if (s[i] === "%") {
        o += s.slice(i, i + 2);
        i += 2;
      } else {
        o += s[i];
        i++;
      }
    }
    return o;
  },
  url_encode: (v) => v == null ? null : encodeURIComponent(str(v)).replace(/%20/g, "+"),
  where: (v, k, ...rest) => {
    if (!k && k !== 0)
      return arr(v);
    const h = rest.length > 0;
    const eq = (a, b) => {
      if (typeof a !== "object" && typeof b !== "object")
        return a == b;
      if (a === b)
        return true;
      if (isArr(a) && isArr(b))
        return a.length === b.length && a.every((v2, i) => v2 == b[i]);
      return false;
    };
    return arr(v).filter((x) => x != null && (h ? eq(x?.[k], rest[0]) : x?.[k]));
  },
  base64_encode: (v) => {
    const s = str(v);
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      return btoa(s);
    }
  },
  base64_decode: (v) => {
    const s = str(v);
    try {
      return decodeURIComponent(escape(atob(s)));
    } catch (e) {
      try {
        return atob(s);
      } catch (e2) {
        return s;
      }
    }
  },
  base64_url_safe_encode: (v) => BUILTIN_FILTERS.base64_encode(v).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  base64_url_safe_decode: (v) => {
    let s = str(v).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4)
      s += "=";
    return BUILTIN_FILTERS.base64_decode(s);
  },
  json: (v) => JSON.stringify(v ?? null),
  image_url: (v, ...a) => {
    const u = str(v && typeof v === "object" ? v.url || v.src || v : v);
    const o = a.find((x) => x && typeof x === "object" && !isArr(x));
    if (!o)
      return u;
    const q = Object.entries(o).map(([k, v2]) => k + "=" + (v2 ?? "")).join("&");
    return q ? u + "?" + q : u;
  },
  product_img_url: (v, ...a) => {
    const u = str(v && typeof v === "object" ? v.url || v.src || v : v);
    const o = a.find((x) => x && typeof x === "object" && !isArr(x));
    if (o) {
      const q = Object.entries(o).map(([k, v2]) => k + "=" + (v2 ?? "")).join("&");
      return q ? u + "?" + q : u;
    }
    const p = a.filter((x) => typeof x !== "object");
    return u + "?arg1=" + (p[0] ?? "") + "&arg2=" + (p[1] ?? "");
  }
};

// src/eval.js
var resolve = (path, ctx) => {
  path = path.replace(/\s*\.\s*/g, ".").replace(/\s*\[\s*/g, "[").replace(/\s*\]\s*/g, "]").trim();
  if (path[0] === "[" && path[1] === "[" && (path[2] === "'" || path[2] === '"'))
    path = path.slice(1);
  const segs = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "[") {
      i++;
      while (i < path.length && path[i] === " ")
        i++;
      if (path[i] === "'" || path[i] === '"') {
        const q = path[i];
        i++;
        let key = "";
        while (i < path.length && path[i] !== q) {
          key += path[i];
          i++;
        }
        i++;
        while (i < path.length && path[i] === " ")
          i++;
        if (path[i] === "]")
          i++;
        segs.push({ type: "blit", val: key });
      } else {
        let key = "", depth = 1;
        while (i < path.length) {
          if (path[i] === "[")
            depth++;
          if (path[i] === "]") {
            depth--;
            if (!depth)
              break;
          }
          key += path[i];
          i++;
        }
        i++;
        if (/^-?\d+$/.test(key))
          segs.push({ type: "idx", val: +key });
        else if (/^-?\d+\.\d+$/.test(key))
          segs.push({ type: "blit", val: key });
        else
          segs.push({ type: "var", val: key });
      }
    } else if (path[i] === ".") {
      i++;
    } else {
      let key = "";
      while (i < path.length && path[i] !== "." && path[i] !== "[") {
        key += path[i];
        i++;
      }
      if (key)
        segs.push({ type: "lit", val: key });
    }
  }
  let v = ctx;
  for (const seg of segs) {
    if (v == null)
      return;
    if (seg.type === "var") {
      const key = resolve(seg.val, ctx);
      v = v?.[key];
    } else if (seg.type === "idx") {
      if (typeof v === "string")
        v = undefined;
      else if (isArr(v) && seg.val < 0)
        v = v[v.length + seg.val];
      else
        v = v?.[seg.val];
    } else if (seg.type === "blit") {
      if (typeof v === "string")
        v = undefined;
      else
        v = v?.[seg.val];
    } else {
      if (isArr(v)) {
        if (seg.val === "first")
          v = v[0];
        else if (seg.val === "last")
          v = v[v.length - 1];
        else if (seg.val === "size")
          v = v.length;
        else
          v = v?.[seg.val];
      } else if (v && typeof v === "object") {
        if (seg.val === "first" && !(seg.val in v)) {
          const k = Object.keys(v);
          v = k.length ? [k[0], v[k[0]]] : undefined;
        } else if (seg.val === "last" && !(seg.val in v)) {
          v = undefined;
        } else if (seg.val === "size" && !(seg.val in v))
          v = Object.keys(v).length;
        else
          v = v?.[seg.val];
      } else if (typeof v === "string") {
        if (seg.val === "size")
          v = v.length;
        else if (seg.val === "first")
          v = v[0];
        else if (seg.val === "last")
          v = v[v.length - 1];
        else
          v = undefined;
      } else {
        v = v?.[seg.val];
      }
    }
  }
  return v;
};
var parseLiteral = (s) => {
  s = s.trim();
  if (s === "true")
    return true;
  if (s === "false")
    return false;
  if (s === "nil" || s === "null")
    return null;
  if (/^-?\d+$/.test(s))
    return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) {
    const n = new Number(parseFloat(s));
    n.__f = 1;
    return n;
  }
  if ((s[0] === '"' || s[0] === "'") && s.length >= 2) {
    const q = s[0];
    let i = 1;
    while (i < s.length && s[i] !== q)
      i++;
    if (i < s.length)
      return s.slice(1, i);
  }
  return;
};
var evalExpr = (s, ctx) => {
  s = s.trim();
  if (!s)
    return null;
  const rangeMatch = s.match(/^\((.+?)\.\.\.?(.+?)\)$/);
  if (rangeMatch) {
    const from = parseInt(evalExpr(rangeMatch[1].trim(), ctx)) || 0;
    const to = parseInt(evalExpr(rangeMatch[2].trim(), ctx)) || 0;
    const a = [];
    if (from <= to)
      for (let n = from;n <= to; n++)
        a.push(n);
    a.__range = true;
    a.first = a[0];
    a.last = a[a.length - 1];
    a.toString = () => `${from}..${to}`;
    return a;
  }
  let lit = parseLiteral(s);
  if (lit !== undefined)
    return lit;
  if (s === "nil" || s === "null")
    return null;
  if (ctx.__counters && s in ctx.__counters && !ctx.__assigns?.has(s))
    return ctx.__counters[s];
  const v = resolve(s, ctx);
  if (v !== undefined)
    return v;
  const ft = s.match(/^('[^']*'|"[^"]*"|\S+)/);
  if (ft && ft[0] !== s) {
    lit = parseLiteral(ft[0]);
    if (lit !== undefined)
      return lit;
    if (ft[0] === "nil" || ft[0] === "null")
      return null;
    return resolve(ft[0], ctx);
  }
  const nm = s.match(/^-?\d+(\.\d+)?/);
  if (nm && nm[0] !== s) {
    lit = parseLiteral(nm[0]);
    if (lit !== undefined)
      return lit;
  }
  return;
};
var evalFilter = async (val, filterStr, ctx, engine) => {
  const m = filterStr.match(/^\s*(\w+)[^:]*(?::\s*(.*))?/);
  if (!m)
    return val;
  const name = m[1];
  const fn = engine._filters[name] ?? BUILTIN_FILTERS[name];
  if (!fn)
    return val;
  let args = [];
  if (m[2]) {
    let raw = m[2], arg = "", inQ = 0, skip = 0;
    for (const c of raw) {
      if (skip && c !== ",")
        continue;
      skip = 0;
      if ((c === '"' || c === "'") && !inQ)
        inQ = c;
      else if (c === inQ) {
        inQ = 0;
        skip = 1;
      } else if (c === "," && !inQ) {
        args.push(arg);
        arg = "";
        continue;
      }
      arg += c;
    }
    if (arg)
      args.push(arg);
    const positional = [], named = {};
    for (const a of args) {
      const kv = a.trim().match(/^(\w+)\s*:\s*([\s\S]+)$/);
      if (kv)
        named[kv[1]] = evalExpr(kv[2].trim(), ctx);
      else {
        const v = evalExpr(a.trim(), ctx);
        positional.push(v === undefined ? null : v);
      }
    }
    args = positional;
    if (Object.keys(named).length)
      args.push(named);
  }
  return engine._filters[name] ? await fn.call(engine.options, val, ...args) : fn(val, ...args);
};
var splitPipes = (s) => {
  const parts = [];
  let last = 0, q = 0;
  for (let i = 0;i < s.length; i++) {
    const c = s[i];
    if ((c === "'" || c === '"') && !q)
      q = c;
    else if (c === q) {
      q = 0;
      if (s[i + 1] === c)
        i++;
    }
    if (!q && c === "|") {
      parts.push(s.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(s.slice(last));
  return parts;
};
var evalOutput = async (expr, ctx, engine, raw) => {
  const parts = splitPipes(expr);
  let val = evalExpr(parts[0], ctx);
  for (let i = 1;i < parts.length; i++)
    val = await evalFilter(val, parts[i], ctx, engine);
  return raw ? val : val ?? "";
};
var splitFirstLogical = (s) => {
  let q = 0, depth = 0;
  for (let i = 0;i < s.length; i++) {
    const c = s[i];
    if ((c === "'" || c === '"') && !q)
      q = c;
    else if (c === q)
      q = 0;
    if (q)
      continue;
    if (c === "(")
      depth++;
    if (c === ")")
      depth--;
    if (depth)
      continue;
    if (s.substr(i, 4) === " or ")
      return [s.slice(0, i), "or", s.slice(i + 4)];
    if (s.substr(i, 5) === " and ")
      return [s.slice(0, i), "and", s.slice(i + 5)];
  }
  return null;
};
var evalCondition = (expr, ctx) => {
  expr = expr.trim();
  while (expr[0] === "(" && expr.at(-1) === ")") {
    let d = 0, ok = true;
    for (let pi = 0;pi < expr.length - 1; pi++) {
      if (expr[pi] === "(")
        d++;
      if (expr[pi] === ")")
        d--;
      if (d === 0) {
        ok = false;
        break;
      }
    }
    if (ok)
      expr = expr.slice(1, -1).trim();
    else
      break;
  }
  const lrParts = splitFirstLogical(expr);
  if (lrParts) {
    const l = evalCondition(lrParts[0], ctx);
    return lrParts[1] === "and" ? l && evalCondition(lrParts[2], ctx) : l || evalCondition(lrParts[2], ctx);
  }
  const ops = ["==", "!=", "<>", "<=", ">=", "<", ">", " contains "];
  for (const op of ops) {
    let idx = -1, q = 0;
    for (let k = 0;k < expr.length; k++) {
      const c = expr[k];
      if ((c === "'" || c === '"') && !q)
        q = c;
      else if (c === q)
        q = 0;
      if (!q && expr.substr(k, op.length) === op) {
        idx = k;
        break;
      }
    }
    if (idx >= 0) {
      const lRaw = expr.slice(0, idx).trim(), rRaw = expr.slice(idx + op.length).trim();
      const l = lRaw === "empty" ? EMPTY : lRaw === "blank" ? BLANK : evalExpr(lRaw, ctx);
      const r = rRaw === "empty" ? EMPTY : rRaw === "blank" ? BLANK : evalExpr(rRaw, ctx);
      switch (op.trim()) {
        case "==":
          return liquidEq(l, r);
        case "!=":
        case "<>":
          return !liquidEq(l, r);
        case "<": {
          const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r;
          return lv != null && rv != null && typeof lv === typeof rv && lv < rv;
        }
        case ">": {
          const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r;
          return lv != null && rv != null && typeof lv === typeof rv && lv > rv;
        }
        case "<=": {
          const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r;
          return lv != null && rv != null && typeof lv === typeof rv && lv <= rv;
        }
        case ">=": {
          const lv = l?.__f ? +l : l, rv = r?.__f ? +r : r;
          return lv != null && rv != null && typeof lv === typeof rv && lv >= rv;
        }
        case "contains":
          if (r == null)
            return false;
          if (typeof l === "string")
            return l.includes(str(r));
          if (isArr(l))
            return l.includes(r);
          return false;
      }
    }
  }
  if (expr === "empty" || expr === "blank")
    return true;
  return truthy(evalExpr(expr, ctx));
};

// src/tokenizer.js
var BB = { if: "endif,endunless", unless: "endif,endunless", for: "endfor,endtablerow", tablerow: "endfor,endtablerow", case: "endcase", capture: "endcapture", comment: "endcomment", doc: "enddoc" };
var isBlockBlank = (tokens, start, end) => {
  for (let i = start;i < end; ) {
    const tok = tokens[i];
    if (tok[0] === "o")
      return false;
    if (tok[0] === "t") {
      if (tok[1].trim())
        return false;
      i++;
      continue;
    }
    const t = tok[1], tw = t.split(/\s/)[0];
    if (/^(cycle|echo|increment|decrement)$/.test(tw) || t === "raw")
      return false;
    const ends = BB[tw];
    if (ends) {
      const endSet = ends.split(",");
      let depth = 1, j = i + 1;
      while (j < end) {
        if (tokens[j][0] === "g") {
          const tt = tokens[j][1].split(/\s/)[0];
          if (tt === tw)
            depth++;
          else if (endSet.includes(tt)) {
            if (!--depth)
              break;
          }
        }
        j++;
      }
      if (tw !== "comment" && tw !== "doc" && tw !== "capture" && !isBlockBlank(tokens, i + 1, j))
        return false;
      i = j + 1;
      continue;
    }
    i++;
  }
  return true;
};
var tokenize = (src) => {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const oIdx = src.indexOf("{", i);
    if (oIdx < 0) {
      tokens.push(["t", src.slice(i)]);
      break;
    }
    if (oIdx > i)
      tokens.push(["t", src.slice(i, oIdx)]);
    let wsCtrl = false;
    if (src[oIdx + 1] === "{") {
      const strip1 = src[oIdx + 2] === "-";
      const cIdx = src.indexOf("}}", oIdx + 2);
      if (cIdx < 0) {
        tokens.push(["t", "{"]);
        i = oIdx + 1;
        continue;
      }
      const strip2 = src[cIdx - 1] === "-";
      const inner = src.slice(oIdx + 2 + (strip1 ? 1 : 0), cIdx - (strip2 ? 1 : 0));
      if (strip1 && tokens.length) {
        const lt = tokens.at(-1);
        if (lt[0] === "t")
          lt[1] = lt[1].replace(/\s+$/, "");
      }
      tokens.push(["o", inner.trim(), strip2, strip1]);
      i = cIdx + 2;
    } else if (src[oIdx + 1] === "%") {
      const strip1 = src[oIdx + 2] === "-";
      const cIdx = src.indexOf("%}", oIdx + 2);
      if (cIdx < 0) {
        tokens.push(["t", "{"]);
        i = oIdx + 1;
        continue;
      }
      const strip2 = src[cIdx - 1] === "-";
      const inner = src.slice(oIdx + 2 + (strip1 ? 1 : 0), cIdx - (strip2 ? 1 : 0));
      if (strip1 && tokens.length) {
        const lt = tokens.at(-1);
        if (lt[0] === "t")
          lt[1] = lt[1].replace(/\s+$/, "");
      }
      const tagName = inner.trim();
      tokens.push(["g", tagName, strip2, strip1]);
      i = cIdx + 2;
      if (tagName === "raw") {
        const endPattern = /\{%-?\s*endraw\s*-?%\}/;
        const rm = src.slice(i).match(endPattern);
        if (rm) {
          const rawContent = src.slice(i, i + rm.index);
          if (rawContent)
            tokens.push(["t", rawContent]);
          const es1 = rm[0][2] === "-", es2 = rm[0][rm[0].length - 3] === "-";
          tokens.push(["g", "endraw", es2]);
          i += rm.index + rm[0].length;
          if (es2) {
            let ej = i;
            while (ej < src.length && ` 	
\r`.includes(src[ej]))
              ej++;
            if (ej > i)
              i = ej;
          }
        }
        continue;
      }
    } else {
      tokens.push(["t", "{"]);
      i = oIdx + 1;
    }
    if (tokens.at(-1)?.[2])
      wsCtrl = true;
    if (wsCtrl && i < src.length) {
      let j = i;
      while (j < src.length && ` 	
\r`.includes(src[j]))
        j++;
      if (j > i)
        i = j;
    }
  }
  return tokens;
};

// src/render.js
var handleIf = async (tokens, ctx, i, len, engine) => {
  const tag = tokens[i][1], cond = tag.slice(3).trim();
  const sections = [{ cond, start: i + 1 }];
  let depth = 1, j = i + 1, cd = 0;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const t = tokens[j][1];
      if (t === "comment" || t === "doc" || t === "raw")
        cd++;
      else if (t === "endcomment" || t === "enddoc" || t === "endraw")
        cd--;
      else if (!cd) {
        if (/^if\s/.test(t) || /^unless\s/.test(t))
          depth++;
        else if (t === "endif" || t === "endunless") {
          depth--;
          if (!depth) {
            sections.at(-1).end = j;
            break;
          }
        } else if (depth === 1) {
          if (/^elsif\s/.test(t)) {
            sections.at(-1).end = j;
            sections.push({ cond: t.slice(6).trim(), start: j + 1 });
          } else if (t === "else") {
            sections.at(-1).end = j;
            sections.push({ cond: null, start: j + 1 });
          }
        }
      }
    }
    j++;
  }
  if (!sections.at(-1).end)
    sections.at(-1).end = j;
  const blank = sections.every((s) => isBlockBlank(tokens, s.start, s.end));
  for (const sec of sections) {
    if (sec.cond === null || evalCondition(sec.cond, ctx)) {
      const r = await render(tokens, ctx, sec.start, sec.end, engine);
      return blank && typeof r === "string" && !r.trim() ? "" : r;
    }
  }
  return "";
};
var render = async (tokens, ctx, start, end, engine) => {
  let out = "", i = start ?? 0;
  const len = end ?? tokens.length;
  while (i < len) {
    const tok = tokens[i];
    if (tok[0] === "t") {
      out += tok[1];
      i++;
    } else if (tok[0] === "o") {
      out += stringify(await evalOutput(tok[1], ctx, engine));
      i++;
    } else if (tok[0] === "g") {
      const tag = tok[1];
      let m;
      if (/^if\s/.test(tag)) {
        let depth = 1, j = i + 1, cd = 0;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const t = tokens[j][1];
            if (t === "comment" || t === "doc" || t === "raw")
              cd++;
            else if (t === "endcomment" || t === "enddoc" || t === "endraw")
              cd--;
            else if (!cd) {
              if (/^if\s/.test(t) || /^unless\s/.test(t))
                depth++;
              else if (t === "endif" || t === "endunless") {
                depth--;
                if (!depth)
                  break;
              }
            }
          }
          j++;
        }
        const r = await handleIf(tokens, ctx, i, len, engine);
        if (r?.__ctrl) {
          r.out = out + (r.out ?? "");
          return r;
        }
        out += r;
        i = j + 1;
      } else if (/^unless\s/.test(tag)) {
        const cond = tag.slice(7).trim();
        const sections = [{ cond, negate: true, start: i + 1 }];
        let depth = 1, j = i + 1, cd = 0;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const t = tokens[j][1];
            if (t === "comment" || t === "doc" || t === "raw")
              cd++;
            else if (t === "endcomment" || t === "enddoc" || t === "endraw")
              cd--;
            else if (!cd) {
              if (/^if\s/.test(t) || /^unless\s/.test(t))
                depth++;
              else if (t === "endif" || t === "endunless") {
                depth--;
                if (!depth) {
                  sections.at(-1).end = j;
                  break;
                }
              } else if (depth === 1) {
                if (/^elsif\s/.test(t)) {
                  sections.at(-1).end = j;
                  sections.push({ cond: t.slice(6).trim(), start: j + 1 });
                } else if (t === "else") {
                  sections.at(-1).end = j;
                  sections.push({ cond: null, start: j + 1 });
                }
              }
            }
          }
          j++;
        }
        if (!sections.at(-1).end)
          sections.at(-1).end = j;
        const ub = sections.every((s) => isBlockBlank(tokens, s.start, s.end));
        let r;
        for (const sec of sections) {
          const match = sec.cond === null || (sec.negate ? !evalCondition(sec.cond, ctx) : evalCondition(sec.cond, ctx));
          if (match) {
            r = await render(tokens, ctx, sec.start, sec.end, engine);
            break;
          }
        }
        if (r != null) {
          if (r?.__ctrl) {
            r.out = out + (r.out ?? "");
            return r;
          }
          if (ub && typeof r === "string" && !r.trim())
            r = "";
          out += r;
        }
        i = j + 1;
      } else if (/^case\s/.test(tag)) {
        const r = await handleCase(tokens, ctx, i, len, engine);
        if (r[0]?.__ctrl) {
          r[0].out = out + (r[0].out ?? "");
          return r[0];
        }
        out += r[0];
        i = r[1];
      } else if (/^for\s/.test(tag)) {
        const r = await handleFor(tokens, ctx, i, len, engine);
        out += r[0];
        i = r[1];
      } else if (/^tablerow\s/.test(tag)) {
        const r = await handleTablerow(tokens, ctx, i, len, engine);
        out += r[0];
        i = r[1];
      } else if (m = tag.match(/^assign\s+([\s\S]+)$/)) {
        const parts = m[1].match(/^(\w[\w.-]*)\s*=\s*([\s\S]+)$/);
        if (parts) {
          ctx[parts[1]] = await evalOutput(parts[2], ctx, engine, 1);
          ctx.__assigns ??= new Set;
          ctx.__assigns.add(parts[1]);
        }
        i++;
      } else if (m = tag.match(/^capture\s+['"]?(\w[\w.-]*)['"]?$/)) {
        const name = m[1];
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            if (tokens[j][1] === "endcapture") {
              depth--;
              if (!depth)
                break;
            } else if (/^capture\s/.test(tokens[j][1]))
              depth++;
          }
          j++;
        }
        const r = await render(tokens, ctx, i + 1, j, engine);
        ctx[name] = rout(r);
        if (r?.__ctrl) {
          r.out = out;
          return r;
        }
        i = j + 1;
      } else if (tag === "comment" || tag === "doc") {
        const isComment = tag === "comment";
        const endTag = isComment ? "endcomment" : "enddoc";
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const t = tokens[j][1];
            if (t === endTag) {
              depth--;
              if (!depth)
                break;
            } else if (t === (isComment ? "comment" : "doc"))
              depth++;
          }
          j++;
        }
        i = j + 1;
      } else if (tag === "raw") {
        let j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g" && tokens[j][1] === "endraw")
            break;
          j++;
        }
        for (let k = i + 1;k < j; k++) {
          const tk = tokens[k];
          if (tk[0] === "t")
            out += tk[1];
          else if (tk[0] === "o")
            out += `{{${tk[3] ? "-" : ""} ${tk[1]} ${tk[2] ? "-" : ""}}}`;
          else if (tk[0] === "g")
            out += `{%${tk[3] ? "-" : ""} ${tk[1]} ${tk[2] ? "-" : ""}%}`;
        }
        i = j + 1;
      } else if (m = tag.match(/^increment\s+(\w+)$/)) {
        ctx.__counters ??= {};
        ctx.__counters[m[1]] ??= 0;
        out += ctx.__counters[m[1]]++;
        i++;
      } else if (m = tag.match(/^decrement\s+(\w+)$/)) {
        ctx.__counters ??= {};
        ctx.__counters[m[1]] ??= 0;
        out += --ctx.__counters[m[1]];
        i++;
      } else if (m = tag.match(/^cycle\s*([\s\S]+)$/)) {
        out += handleCycle(m[1], ctx, i);
        i++;
      } else if (m = tag.match(/^echo\s+([\s\S]+)$/)) {
        out += stringify(await evalOutput(m[1], ctx, engine));
        i++;
      } else if (m = tag.match(/^liquid\s*([\s\S]*)$/)) {
        out += await handleLiquid(m[1], ctx, engine);
        i++;
      } else if (tag === "ifchanged") {
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            if (tokens[j][1] === "endifchanged") {
              depth--;
              if (!depth)
                break;
            } else if (tokens[j][1] === "ifchanged")
              depth++;
          }
          j++;
        }
        const r = await render(tokens, ctx, i + 1, j, engine);
        const val = rout(r);
        if (val !== ctx.__lastIfchanged) {
          out += val;
          ctx.__lastIfchanged = val;
        }
        if (r?.__ctrl) {
          r.out = out;
          return r;
        }
        i = j + 1;
      } else if (tag === "break" || tag === "continue") {
        return { __ctrl: tag, out };
      } else if (engine._tags) {
        const tw = tag.split(/\s/)[0];
        const handler = engine._tags[tw];
        if (handler) {
          const r = await handler(tag, tokens, ctx, i, len, engine);
          if (r?.__ctrl) {
            r.out = out + (r.out ?? "");
            return r;
          }
          if (isArr(r)) {
            out += r[0];
            i = r[1];
          } else {
            out += r ?? "";
            i++;
          }
        } else {
          i++;
        }
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return out;
};
var handleCase = async (tokens, ctx, i, len, engine) => {
  const val = evalExpr(tokens[i][1].slice(5).trim(), ctx);
  let depth = 1, j = i + 1;
  const sects = [];
  while (j < len) {
    if (tokens[j][0] === "g") {
      const t = tokens[j][1];
      if (/^case\s/.test(t))
        depth++;
      else if (t === "endcase") {
        depth--;
        if (!depth)
          break;
      } else if (depth === 1 && /^when\s/.test(t)) {
        if (sects.length)
          sects.at(-1).end = j;
        sects.push({ type: "w", vals: t.slice(5).split(/\s*,\s*|\s+or\s+/).map((v) => {
          v = v.trim();
          return v === "empty" ? EMPTY : v === "blank" ? BLANK : evalExpr(v, ctx);
        }), start: j + 1 });
      } else if (depth === 1 && /^else/.test(t)) {
        if (sects.length)
          sects.at(-1).end = j;
        sects.push({ type: "e", start: j + 1 });
      }
    }
    j++;
  }
  if (sects.length && !sects.at(-1).end)
    sects.at(-1).end = j;
  const cb = isBlockBlank(tokens, i + 1, j);
  let matched = false, out2 = "", lastElse = -1;
  for (let k = sects.length - 1;k >= 0; k--)
    if (sects[k].type === "e") {
      lastElse = k;
      break;
    }
  const rs = async (s) => {
    const r = await render(tokens, ctx, s.start, s.end, engine);
    if (r?.__ctrl)
      return r;
    out2 += rout(r);
  };
  for (let k = 0;k < sects.length; k++) {
    const s = sects[k], hit = s.type === "w" ? s.vals.some((wv) => liquidEq(wv, val)) : k !== lastElse;
    if (hit) {
      if (s.type === "w")
        matched = true;
      const c = await rs(s);
      if (c)
        return [c, j + 1];
    }
  }
  if (!matched && lastElse >= 0) {
    const c = await rs(sects[lastElse]);
    if (c)
      return [c, j + 1];
  }
  return [cb && !out2.trim() ? "" : out2, j + 1];
};
var handleFor = async (tokens, ctx, i, len, engine) => {
  const m = tokens[i][1].match(/^for\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!m)
    return ["", i + 1];
  const varName = m[1], expr = m[2].trim();
  let depth = 1, idepth = 0, j = i + 1, elseIdx = -1;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const t = tokens[j][1];
      if (/^for\s/.test(t) || /^tablerow\s/.test(t))
        depth++;
      else if (t === "endfor" || t === "endtablerow") {
        depth--;
        if (!depth)
          break;
      } else if (/^if\s/.test(t) || /^unless\s/.test(t) || /^case\s/.test(t))
        idepth++;
      else if (t === "endif" || t === "endunless" || t === "endcase")
        idepth--;
      else if (depth === 1 && idepth === 0 && t === "else")
        elseIdx = j;
    }
    j++;
  }
  let collection;
  let limit, offset = 0, reversed = false, offsetContinue = false;
  let srcExpr = expr.replace(/,/g, " ");
  const lm = srcExpr.match(/\blimit:\s*(\S+)/);
  if (lm) {
    limit = num(evalExpr(lm[1], ctx));
    srcExpr = srcExpr.replace(lm[0], "");
  }
  if (/\boffset:\s*continue\b/.test(srcExpr)) {
    offsetContinue = true;
    srcExpr = srcExpr.replace(/\boffset:\s*continue\b/, "");
  }
  const om = srcExpr.match(/\boffset:\s*(\S+)/);
  if (om) {
    offset = +evalExpr(om[1], ctx);
    offsetContinue = false;
    srcExpr = srcExpr.replace(om[0], "");
  }
  if (/\breversed\b/.test(srcExpr)) {
    reversed = true;
    srcExpr = srcExpr.replace(/\breversed\b/, "");
  }
  srcExpr = srcExpr.trim();
  collection = evalExpr(srcExpr, ctx);
  const isStr = typeof collection === "string";
  if (isArr(collection)) {
    collection = collection.slice();
  } else if (isStr) {
    collection = collection ? [collection] : [];
  } else if (collection && typeof collection === "object")
    collection = Object.entries(collection);
  else {
    if (elseIdx >= 0)
      return [await render(tokens, ctx, elseIdx + 1, j, engine), j + 1];
    return ["", j + 1];
  }
  if (!isStr) {
    if (offsetContinue) {
      ctx.__foroffsets ??= {};
      offset = ctx.__foroffsets[varName + ":" + srcExpr] ?? 0;
    }
    if (limit != null && limit < 0)
      collection = [];
    else {
      if (offset < 0) {
        if (limit != null) {
          limit = M.max(0, limit + offset);
        }
        offset = 0;
      }
      if (offset)
        collection = collection.slice(offset);
      if (limit != null)
        collection = collection.slice(0, limit);
    }
    ctx.__foroffsets ??= {};
    ctx.__foroffsets[varName + ":" + srcExpr] = offset + collection.length;
    if (reversed)
      collection = collection.slice().reverse();
  }
  if (!collection.length) {
    if (elseIdx >= 0) {
      const r = await render(tokens, ctx, elseIdx + 1, j, engine);
      return [rout(r), j + 1];
    }
    return ["", j + 1];
  }
  const bodyEnd = elseIdx >= 0 ? elseIdx : j;
  let out = "";
  const prevForloop = ctx.forloop;
  const prevVar = varName in ctx ? ctx[varName] : undefined;
  const hadVar = varName in ctx;
  const blank = isBlockBlank(tokens, i + 1, bodyEnd);
  const fl = { name: varName + "-" + srcExpr, length: collection.length, parentloop: prevForloop };
  for (let k = 0;k < collection.length; k++) {
    ctx[varName] = collection[k];
    fl.first = k === 0;
    fl.last = k === collection.length - 1;
    fl.index = k + 1;
    fl.index0 = k;
    fl.rindex = collection.length - k;
    fl.rindex0 = collection.length - k - 1;
    ctx.forloop = fl;
    const r = await render(tokens, ctx, i + 1, bodyEnd, engine);
    if (typeof r === "object") {
      out += r.out ?? "";
      if (r.__ctrl === "break")
        break;
      if (r.__ctrl === "continue")
        continue;
    } else
      out += r;
  }
  fl.index = collection.length + 1;
  fl.index0 = collection.length;
  fl.rindex = 0;
  fl.rindex0 = -1;
  fl.first = false;
  fl.last = false;
  ctx.forloop = prevForloop;
  if (hadVar)
    ctx[varName] = prevVar;
  else
    delete ctx[varName];
  return [blank && !out.trim() ? "" : out, j + 1];
};
var handleTablerow = async (tokens, ctx, i, len, engine) => {
  const m = tokens[i][1].match(/^tablerow\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!m)
    return ["", i + 1];
  const varName = m[1], expr = m[2].trim();
  let depth = 1, j = i + 1;
  while (j < len) {
    if (tokens[j][0] === "g") {
      if (/^for\s/.test(tokens[j][1]) || /^tablerow\s/.test(tokens[j][1]))
        depth++;
      else if (tokens[j][1] === "endtablerow" || tokens[j][1] === "endfor") {
        depth--;
        if (!depth)
          break;
      }
    }
    j++;
  }
  let collection, limit, offset = 0;
  let srcExpr = expr.replace(/,/g, " ");
  const lm = srcExpr.match(/\blimit:\s*(\S+)/);
  if (lm) {
    limit = num(evalExpr(lm[1], ctx));
    srcExpr = srcExpr.replace(lm[0], "");
  }
  const om = srcExpr.match(/\boffset:\s*(\S+)/);
  if (om) {
    offset = +evalExpr(om[1], ctx);
    srcExpr = srcExpr.replace(om[0], "");
  }
  const cm = srcExpr.match(/\bcols:\s*(\S+)/);
  const cols = cm ? +evalExpr(cm[1], ctx) || 0 : -1;
  if (cm)
    srcExpr = srcExpr.replace(cm[0], "");
  srcExpr = srcExpr.replace(/\b\w+:\s*\S+/g, "").trim();
  const rawSrc = evalExpr(srcExpr, ctx);
  const isStr = typeof rawSrc === "string";
  if (rawSrc == null || rawSrc === false)
    return ["", j + 1];
  if (isArr(rawSrc))
    collection = rawSrc.slice();
  else if (isStr)
    collection = rawSrc ? [rawSrc] : [];
  else
    collection = typeof rawSrc === "object" ? Object.values(rawSrc) : [];
  if (!isStr) {
    if (limit != null && limit < 0)
      collection = [];
    else {
      if (offset < 0) {
        offset = offset + collection.length;
        if (offset < 0)
          collection = [];
        else
          collection = collection.slice(offset);
      } else if (offset)
        collection = collection.slice(offset);
      if (limit != null && !isNaN(limit))
        collection = collection.slice(0, M.max(0, limit));
    }
  }
  let out = "";
  const prev = ctx.tablerowloop;
  const prevVar = varName in ctx ? ctx[varName] : undefined;
  const hadVar = varName in ctx;
  if (!collection.length) {
    ctx.tablerowloop = prev;
    return [`<tr class="row1">
</tr>
`, j + 1];
  }
  for (let k = 0;k < collection.length; k++) {
    ctx[varName] = collection[k];
    const col = cols > 0 ? k % cols : k;
    const row = cols > 0 ? M.floor(k / cols) + 1 : 1;
    ctx.tablerowloop = { first: k === 0, last: k === collection.length - 1, index: k + 1, index0: k, length: collection.length, rindex: collection.length - k, rindex0: collection.length - k - 1, col: col + 1, col0: col, row, col_first: col === 0, col_last: cols > 0 ? col === cols - 1 : cols < 0 && k === collection.length - 1 };
    if (col === 0)
      out += `<tr class="row${row}">` + (k === 0 ? `
` : "");
    const r = await render(tokens, ctx, i + 1, j, engine);
    const cellVal = rout(r);
    out += `<td class="col${col + 1}">${cellVal}</td>`;
    if (r?.__ctrl === "break") {
      out += `</tr>
`;
      break;
    }
    if (r?.__ctrl === "continue") {
      if (cols > 0 && col === cols - 1 || k === collection.length - 1)
        out += `</tr>
`;
      continue;
    }
    if (cols > 0 && col === cols - 1 || k === collection.length - 1)
      out += `</tr>
`;
  }
  ctx.tablerowloop = prev;
  if (hadVar)
    ctx[varName] = prevVar;
  else
    delete ctx[varName];
  return [out, j + 1];
};
var handleCycle = (args, ctx, pos) => {
  ctx.__cycles ??= {};
  let parts, group, colonIdx = -1, cq = 0;
  for (let ci = 0;ci < args.length; ci++) {
    const cc = args[ci];
    if ((cc === '"' || cc === "'") && !cq)
      cq = cc;
    else if (cc === cq)
      cq = 0;
    if (!cq && cc === ":") {
      colonIdx = ci;
      break;
    }
  }
  if (colonIdx >= 0) {
    const gn = args.slice(0, colonIdx).trim();
    if (/^[\w.[\]'"]+$/.test(gn)) {
      group = evalExpr(gn, ctx) || gn;
      parts = args.slice(colonIdx + 1);
    } else {
      parts = args;
      group = args;
    }
  } else {
    parts = args;
    group = args;
  }
  if (!colonIdx || colonIdx < 0) {
    let hasVar = 0, vq = 0;
    for (const vc of parts) {
      if ((vc === '"' || vc === "'") && !vq)
        vq = vc;
      else if (vc === vq)
        vq = 0;
      else if (!vq && /[a-zA-Z_]/.test(vc)) {
        hasVar = 1;
        break;
      }
    }
    if (hasVar)
      group = "\x00" + pos;
  }
  let vals = parts.split(",").map((v) => evalExpr(v.trim(), ctx));
  while (vals.length > 1 && vals.at(-1) == null)
    vals.pop();
  ctx.__cycles[group] ??= 0;
  const idx = ctx.__cycles[group] % vals.length;
  ctx.__cycles[group]++;
  return vals[idx] ?? "";
};
var handleLiquid = async (body, ctx, engine) => {
  const src = body.split(`
`).map((l) => l.trim()).filter(Boolean).map((l) => `{% ${l} %}`).join("");
  const toks = tokenize(src);
  const r = await render(toks, ctx, 0, toks.length, engine);
  return rout(r);
};

// src/index.js
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
Droplet._internals = { tokenize, render, rout, evalOutput, evalExpr, stringify, evalCondition };
module.exports = Droplet;
