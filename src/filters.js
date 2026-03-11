import { isArr, arr, str, num, M, truthy, stringify } from "./utils.js";

const BUILTIN_FILTERS = {
  abs: v => M.abs(num(v)),
  append: (v, a) => str(v) + str(a),
  at_least: (v, a) => M.max(num(v), num(a)),
  at_most: (v, a) => M.min(num(v), num(a)),
  capitalize: v => { const s = str(v); return (s[0]?.toUpperCase() ?? "") + s.slice(1) },
  ceil: v => M.ceil(num(v)),
  compact: (v, k) => k ? arr(v).filter(x => x?.[k] != null) : arr(v).filter(x => x != null),
  concat: (v, a) => arr(v).concat(arr(a)),
  date: (v, fmt) => {
    if (!fmt) return v;
    let d, tz;
    if (v === "now" || v === "today" || v === "Now" || v === "Today") d = new Date();
    else if (typeof v === "number" || /^-?\d+$/.test("" + v)) d = new Date(+v * 1000);
    else {
      const sv = "" + v;
      const dm = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dm) d = new Date(+dm[1], +dm[2] - 1, +dm[3]);
      else {
        const tzm = sv.match(/([+-]\d{2}:?\d{2})\s*$/);
        if (tzm) tz = tzm[1].replace(":", "");
        const tzn = sv.match(/\s([A-Z]{2,5})\s*$/);
        if (tzn) tz = tzn[1];
        d = new Date(sv);
      }
    }
    if (isNaN(d)) return v;
    const pad = n => n < 10 ? "0" + n : "" + n;
    const pad3 = n => n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n;
    const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const D = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const mn = d.getMonth(), dw = d.getDay(), yr = d.getFullYear(), h12 = d.getHours() % 12 || 12;
    const day = d.getDate(), hr = d.getHours(), min = d.getMinutes(), sec = d.getSeconds();
    const jday = M.floor((d - new Date(yr, 0, 0)) / 864e5);
    const off = d.getTimezoneOffset(), offH = pad(M.abs(M.trunc(off / 60))), offM = pad(M.abs(off % 60));
    const offSign = off <= 0 ? "+" : "-", tzStr = tz || offSign + offH + offM;
    // ISO week/year
    const thu = new Date(d); thu.setDate(day - ((dw + 6) % 7) + 3);
    const jan4 = new Date(thu.getFullYear(), 0, 4);
    const isoWeek = 1 + M.round(((thu - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    // Sunday-start week (%U) and Monday-start week (%W)
    const yday = jday - 1;
    const wU = M.floor((yday + 7 - dw) / 7);
    const wW = M.floor((yday + 7 - ((dw + 6) % 7)) / 7);
    const map = {
      "%Y": yr, "%m": pad(mn + 1), "%d": pad(day),
      "%H": pad(hr), "%M": pad(min), "%S": pad(sec),
      "%y": pad(yr % 100), "%B": MN[mn], "%b": MN[mn].slice(0, 3),
      "%A": D[dw], "%a": D[dw].slice(0, 3),
      "%e": (day < 10 ? " " : "") + day, "%l": (h12 < 10 ? " " : "") + h12, "%I": pad(h12),
      "%p": hr < 12 ? "AM" : "PM", "%P": hr < 12 ? "am" : "pm",
      "%j": pad3(jday), "%C": M.floor(yr / 100), "%h": MN[mn].slice(0, 3),
      "%w": dw, "%u": dw || 7,
      "%%": "%", "%s": M.floor(d.getTime() / 1000),
      "%Z": tz || (d.toTimeString().match(/\((.+)\)/) ?? ["", ""])[1],
      "%k": (hr < 10 ? " " : "") + hr, "%N": "" + d.getMilliseconds(),
      "%z": tzStr, "%n": "\n", "%t": "\t",
      "%U": pad(wU), "%W": pad(wW), "%V": pad(isoWeek),
      "%G": thu.getFullYear(), "%g": pad(thu.getFullYear() % 100),
      "%c": D[dw].slice(0, 3) + " " + MN[mn].slice(0, 3) + " " + (day < 10 ? " " : "") + day + " " + pad(hr) + ":" + pad(min) + ":" + pad(sec) + " " + yr,
      "%X": pad(hr) + ":" + pad(min) + ":" + pad(sec),
      "%F": yr + "-" + pad(mn + 1) + "-" + pad(day),
      "%R": pad(hr) + ":" + pad(min),
      "%T": pad(hr) + ":" + pad(min) + ":" + pad(sec),
      "%r": pad(h12) + ":" + pad(min) + ":" + pad(sec) + " " + (hr < 12 ? "AM" : "PM")
    }; map["%x"] = map["%D"] = pad(mn + 1) + "/" + pad(day) + "/" + pad(yr % 100); map["%T"] = map["%X"];
    return fmt.replace(/%[-_0^#:]?[YmdHMSyBbAaelIpPjsCchwuNkZznGgVUWDFRTrxXct%]/g, m => {
      const mod = m.length === 3 ? m[1] : null, base = mod ? "%" + m[2] : m;
      if (mod === "-") return map[base] != null ? ("" + map[base]).replace(/^[0 ]/, "") : m;
      if (mod === "_") { const s = "" + (map[base] ?? ""); return s.replace(/^0/, " "); }
      if (mod === "0") return map[base] != null ? ("" + map[base]).replace(/^ /, "0") : m;
      if (mod === "^" || mod === "#") return map[base] != null ? ("" + map[base]).toUpperCase() : m;
      if (m === "%:z") return tzStr.slice(0, 3) + ":" + tzStr.slice(3);
      return map[m] != null ? "" + map[m] : m;
    })
  },
  default: (v, a, opts) => { const e = v === "" || v == null || (isArr(v) && !v.length) || (typeof v === "object" && v !== null && !isArr(v) && !Object.keys(v).length); const af = opts?.allow_false; if (af) return e ? (a ?? "") : v; return (v === false || e) ? (a ?? "") : v; },
  divided_by: (v, a) => { const isf = v?.__f || a?.__f || (""+v).includes(".") || (""+a).includes("."); const na = num(a), nv = num(v); if (!na) return Infinity; if (!isf) return M.trunc(nv / na); const r = nv / na; return r % 1 === 0 ? r.toFixed(1) : r },
  downcase: v => str(v).toLowerCase(),
  escape: v => v == null ? v : str(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"), h: v => BUILTIN_FILTERS.escape(v),
  escape_once: v => BUILTIN_FILTERS.escape(str(v).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")),
  find: (v, k, ...r) => { const a = arr(v); return r.length && r[0] != null ? a.find(x => x?.[k] == r[0]) : a.find(x => x?.[k]) },
  find_index: (v, k, ...r) => { const a = arr(v); const idx = r.length && r[0] != null ? a.findIndex(x => x?.[k] == r[0]) : a.findIndex(x => x?.[k]); return idx < 0 ? null : idx },
  first: v => { if (typeof v === "string") return v[0]; if (v && typeof v === "object" && !isArr(v)) { const k = Object.keys(v); return k.length ? [k[0], v[k[0]]] : undefined; } return isArr(v) ? v[0] : undefined; },
  flatten: v => arr(v).flat(Infinity),
  floor: v => M.floor(num(v)),
  has: (v, k, val) => { const a = arr(v); const ks = k.split("."); return a.some(x => { let o = x; for (const s of ks) o = o?.[s]; return val !== undefined ? o === val : truthy(o); }); },
  join: (v, a) => arr(v).map(x => typeof x === "object" && x !== null && !isArr(x) ? stringify(x) : x).join(a === undefined ? " " : str(a ?? "")),
  last: v => { if (typeof v === "string") return v[v.length - 1]; if (isArr(v)) return v[v.length - 1]; return undefined; },
  lstrip: v => str(v).replace(/^\s+/, ""),
  map: (v, a) => arr(v).flat().map(x => x && typeof x === "object" ? x[a] : undefined),
  minus: (v, a) => { const r = num(v) - num(a); return (v?.__f || a?.__f || (""+v).includes(".") || (""+a).includes(".")) && r % 1 === 0 ? r.toFixed(1) : r },
  modulo: (v, a) => { const nv = num(v), na = num(a), r = nv % na; const isf = v?.__f || a?.__f || ((""+v).includes(".") && !(""+v).includes("e")) || ((""+a).includes(".") && !(""+a).includes("e")); return isf && r % 1 === 0 ? r.toFixed(1) : r },
  newline_to_br: v => str(v).replace(/\r?\n/g, "<br />\n").replace(/\r/g, "<br />\r"),
  plus: (v, a) => { const r = num(v) + num(a); return (v?.__f || a?.__f || (""+v).includes(".") || (""+a).includes(".")) && r % 1 === 0 ? r.toFixed(1) : r },
  prepend: (v, a) => str(a) + str(v),
  reject: (v, k, ...rest) => { const h = rest.length > 0 && rest[0] != null; return arr(v).filter(x => x != null && (h ? x?.[k] != rest[0] : !x?.[k])); },
  remove: (v, a) => str(v).split(str(a)).join(""),
  remove_first: (v, a) => { const s = str(v); a = str(a); const i = s.indexOf(a); return i < 0 ? s : s.slice(0, i) + s.slice(i + a.length) },
  remove_last: (v, a) => { const s = str(v); a = str(a); const i = s.lastIndexOf(a); return i < 0 ? s : s.slice(0, i) + s.slice(i + a.length) },
  replace: (v, a, b) => { const s = str(v); let r = b ?? ""; if (typeof r === "string") { let o = "", i = 0; while (i < r.length) { if (r[i] === "\\" && i + 1 < r.length) { o += r[i + 1]; i += 2; } else { o += r[i]; i++; } } r = o; } a = a == null ? "" : "" + a; if (a === "") return s ? r + s.split("").join(r) + r : r; return s.split(a).join(r); },
  replace_first: (v, a, b) => { const s = str(v); let r = b ?? ""; if (typeof r === "string") { let o = "", i = 0; while (i < r.length) { if (r[i] === "\\" && i + 1 < r.length) { o += r[i + 1]; i += 2; } else { o += r[i]; i++; } } r = o; } const idx = s.indexOf(a); return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + a.length) },
  replace_last: (v, a, b) => { const s = str(v); let r = b ?? ""; if (typeof r === "string") { let o = "", i = 0; while (i < r.length) { if (r[i] === "\\" && i + 1 < r.length) { o += r[i + 1]; i += 2; } else { o += r[i]; i++; } } r = o; } const idx = s.lastIndexOf(a); return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + a.length) },
  reverse: v => arr(v).slice().reverse(),
  round: (v, a) => { const p = 10 ** (num(a) || 0); return M.round(num(v) * p) / p },
  rstrip: v => str(v).replace(/\s+$/, ""),
  size: v => v == null ? 0 : (typeof v === "string" || isArr(v)) ? v.length : typeof v === "number" ? (Number.isInteger(v) ? 8 : 0) : typeof v === "object" ? Object.keys(v).length : 0,
  slice: (v, a, b) => {
    if (isArr(v)) { a = +a; b = b != null ? +b : 1; if (b < 0) return []; if (a < 0) { if (-a > v.length) return []; a = v.length + a; } return v.slice(a, a + b) }
    const s = str(v); a = +a; b = b != null ? +b : 1; if (b < 0) return ""; if (a < 0) { if (-a > s.length) return ""; a = s.length + a; } return s.slice(a, a + b)
  },
  sort: (v, k) => arr(v).slice().sort((a, b) => { const x = k ? a?.[k] : a, y = k ? b?.[k] : b; return x > y ? 1 : x < y ? -1 : 0 }),
  sort_natural: (v, k) => arr(v).slice().sort((a, b) => { const x = k ? a?.[k] : a, y = k ? b?.[k] : b; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return str(x).toLowerCase().localeCompare(str(y).toLowerCase()); }),
  split: (v, a) => { if (v == null || v === false || v === true) return []; const s = str(v); if (!s) return []; if (a === " ") { const r = s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "").split(/[ \t\n\r\f]+/); return r[0] === "" ? [] : r; } const r = s.split(a == null ? "" : str(a)); while (r.length > 1 && r.at(-1) === "") r.pop(); return r },
  strip: v => str(v).trim(),
  strip_html: v => str(v).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, ""),
  strip_newlines: v => str(v).replace(/\r?\n|\r/g, ""),
  sum: (v, k) => { const flat = a => { const r = []; for (const x of arr(a)) isArr(x) ? r.push(...flat(x)) : r.push(x); return r; }; const toN = x => { const raw = k ? x?.[k] : x; if (raw == null || typeof raw === "boolean" || typeof raw === "object") return 0; const n = +raw; return isNaN(n) ? 0 : n; }; if (!isArr(v)) return toN(v); return flat(v).reduce((s, x) => s + toN(x), 0) },
  times: (v, a) => { const isf = v?.__f || a?.__f || (""+v).includes(".") || (""+a).includes("."); let r = num(v) * num(a); if (isf) { r = +r.toPrecision(12); return r % 1 === 0 ? r.toFixed(1) : r; } return r },
  truncate: (v, a, b) => { v = str(v); a = a != null ? num(a) : 50; b = b ?? "..."; return v.length <= a ? v : v.slice(0, M.max(0, a - b.length)) + b },
  truncatewords: (v, a, b) => { v = str(v); const s = v.replace(/^[ \t\n\r\f\v]+/, ""); const w = s.split(/[ \t\n\r\f\v]+/); a = a != null ? num(a) : 15; b = b ?? "..."; return w.length <= a ? w.join(" ") : w.slice(0, a).join(" ") + b },
  uniq: (v, k) => { const a = arr(v); if (!k) return [...new Set(a)]; const seen = new Set(); return a.filter(x => { const val = x?.[k]; if (seen.has(val)) return false; seen.add(val); return true; }) },
  upcase: v => str(v).toUpperCase(),
  url_decode: v => { const s = str(v); let o = "", i = 0; while (i < s.length) { if (s[i] === "+" ) { o += " "; i++; } else if (s[i] === "%" && /^%[0-9A-Fa-f]{2}/.test(s.slice(i))) { o += decodeURIComponent(s.slice(i, i + 3)); i += 3; } else if (s[i] === "%") { o += s.slice(i, i + 2); i += 2; } else { o += s[i]; i++; } } return o; },
  url_encode: v => v == null ? null : encodeURIComponent(str(v)).replace(/%20/g, "+"),
  where: (v, k, ...rest) => { if (!k && k !== 0) return arr(v); const h = rest.length > 0; const eq = (a, b) => { if (typeof a !== "object" && typeof b !== "object") return a == b; if (a === b) return true; if (isArr(a) && isArr(b)) return a.length === b.length && a.every((v, i) => v == b[i]); return false; }; return arr(v).filter(x => x != null && (h ? eq(x?.[k], rest[0]) : x?.[k])) },
  base64_encode: v => { const s = str(v); try { return btoa(unescape(encodeURIComponent(s))); } catch(e) { return btoa(s); } },
  base64_decode: v => { const s = str(v); try { return decodeURIComponent(escape(atob(s))); } catch(e) { try { return atob(s); } catch(e2) { return s; } } },
  base64_url_safe_encode: v => BUILTIN_FILTERS.base64_encode(v).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  base64_url_safe_decode: v => { let s = str(v).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return BUILTIN_FILTERS.base64_decode(s) },
  json: v => JSON.stringify(v ?? null),
  image_url: (v, ...a) => { const u = str(v && typeof v === "object" ? v.url || v.src || v : v); const o = a.find(x => x && typeof x === "object" && !isArr(x)); if (!o) return u; const q = Object.entries(o).map(([k, v]) => k + "=" + (v ?? "")).join("&"); return q ? u + "?" + q : u; },
  product_img_url: (v, ...a) => { const u = str(v && typeof v === "object" ? v.url || v.src || v : v); const o = a.find(x => x && typeof x === "object" && !isArr(x)); if (o) { const q = Object.entries(o).map(([k, v]) => k + "=" + (v ?? "")).join("&"); return q ? u + "?" + q : u; } const p = a.filter(x => typeof x !== "object"); return u + "?arg1=" + (p[0] ?? "") + "&arg2=" + (p[1] ?? ""); }
};

export { BUILTIN_FILTERS };
