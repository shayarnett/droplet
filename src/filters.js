import { isArr, arr, str, num, M, truthy, stringify } from "./utils.js";

// Process backslash escapes in replacement strings (for replace/replace_first/replace_last)
const unescapeReplacement = (replacement) => {
  if (typeof replacement !== "string") return replacement;
  let result = "";
  let i = 0;
  while (i < replacement.length) {
    if (replacement[i] === "\\" && i + 1 < replacement.length) {
      result += replacement[i + 1];
      i += 2;
    } else {
      result += replacement[i];
      i++;
    }
  }
  return result;
};

// Check if either operand is float-tagged or contains a decimal point
const isFloat = (a, b) =>
  a?.__f || b?.__f || ("" + a).includes(".") || ("" + b).includes(".");

// Deep-flatten an array (used by sum)
const deepFlatten = (input) => {
  const result = [];
  for (const item of arr(input)) {
    if (isArr(item)) result.push(...deepFlatten(item));
    else result.push(item);
  }
  return result;
};

const BUILTIN_FILTERS = {
  abs: (value) => M.abs(num(value)),

  append: (value, suffix) => str(value) + str(suffix),

  at_least: (value, minimum) => M.max(num(value), num(minimum)),

  at_most: (value, maximum) => M.min(num(value), num(maximum)),

  capitalize: (value) => {
    const s = str(value);
    return (s[0]?.toUpperCase() ?? "") + s.slice(1);
  },

  ceil: (value) => M.ceil(num(value)),

  compact: (value, property) =>
    property
      ? arr(value).filter(item => item?.[property] != null)
      : arr(value).filter(item => item != null),

  concat: (value, other) => arr(value).concat(arr(other)),

  date: (value, format) => {
    if (!format) return value;

    let date, tz;

    // Parse the input value into a Date
    if (value === "now" || value === "today" || value === "Now" || value === "Today") {
      date = new Date();
    } else if (typeof value === "number" || /^-?\d+$/.test("" + value)) {
      date = new Date(+value * 1000);
    } else {
      const sv = "" + value;
      const dateOnlyMatch = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        date = new Date(+dateOnlyMatch[1], +dateOnlyMatch[2] - 1, +dateOnlyMatch[3]);
      } else {
        const tzOffsetMatch = sv.match(/([+-]\d{2}:?\d{2})\s*$/);
        if (tzOffsetMatch) tz = tzOffsetMatch[1].replace(":", "");
        const tzNameMatch = sv.match(/\s([A-Z]{2,5})\s*$/);
        if (tzNameMatch) tz = tzNameMatch[1];
        date = new Date(sv);
      }
    }

    if (isNaN(date)) return value;

    // Helpers
    const pad = (n) => n < 10 ? "0" + n : "" + n;
    const pad3 = (n) => n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n;

    const MONTHS = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const month = date.getMonth();
    const dayOfWeek = date.getDay();
    const year = date.getFullYear();
    const hour12 = date.getHours() % 12 || 12;
    const dayOfMonth = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    // Day of year (1-based)
    const julianDay = M.floor((date - new Date(year, 0, 0)) / 864e5);

    // Timezone offset
    const tzOffset = date.getTimezoneOffset();
    const offsetHours = pad(M.abs(M.trunc(tzOffset / 60)));
    const offsetMinutes = pad(M.abs(tzOffset % 60));
    const offsetSign = tzOffset <= 0 ? "+" : "-";
    const tzString = tz || offsetSign + offsetHours + offsetMinutes;

    // ISO week number and year
    const thursday = new Date(date);
    thursday.setDate(dayOfMonth - ((dayOfWeek + 6) % 7) + 3);
    const jan4 = new Date(thursday.getFullYear(), 0, 4);
    const isoWeek = 1 + M.round(((thursday - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);

    // Sunday-start week (%U) and Monday-start week (%W)
    const yearDay = julianDay - 1;
    const weekSunday = M.floor((yearDay + 7 - dayOfWeek) / 7);
    const weekMonday = M.floor((yearDay + 7 - ((dayOfWeek + 6) % 7)) / 7);

    // strftime format map
    const map = {
      "%Y": year, "%m": pad(month + 1), "%d": pad(dayOfMonth),
      "%H": pad(hour), "%M": pad(minute), "%S": pad(second),
      "%y": pad(year % 100), "%B": MONTHS[month], "%b": MONTHS[month].slice(0, 3),
      "%A": DAYS[dayOfWeek], "%a": DAYS[dayOfWeek].slice(0, 3),
      "%e": (dayOfMonth < 10 ? " " : "") + dayOfMonth,
      "%l": (hour12 < 10 ? " " : "") + hour12,
      "%I": pad(hour12),
      "%p": hour < 12 ? "AM" : "PM", "%P": hour < 12 ? "am" : "pm",
      "%j": pad3(julianDay), "%C": M.floor(year / 100),
      "%h": MONTHS[month].slice(0, 3),
      "%w": dayOfWeek, "%u": dayOfWeek || 7,
      "%%": "%", "%s": M.floor(date.getTime() / 1000),
      "%Z": tz || (date.toTimeString().match(/\((.+)\)/) ?? ["", ""])[1],
      "%k": (hour < 10 ? " " : "") + hour, "%N": "" + date.getMilliseconds(),
      "%z": tzString, "%n": "\n", "%t": "\t",
      "%U": pad(weekSunday), "%W": pad(weekMonday), "%V": pad(isoWeek),
      "%G": thursday.getFullYear(), "%g": pad(thursday.getFullYear() % 100),
      "%c": DAYS[dayOfWeek].slice(0, 3) + " " + MONTHS[month].slice(0, 3) + " " +
            (dayOfMonth < 10 ? " " : "") + dayOfMonth + " " +
            pad(hour) + ":" + pad(minute) + ":" + pad(second) + " " + year,
      "%X": pad(hour) + ":" + pad(minute) + ":" + pad(second),
      "%F": year + "-" + pad(month + 1) + "-" + pad(dayOfMonth),
      "%R": pad(hour) + ":" + pad(minute),
      "%T": pad(hour) + ":" + pad(minute) + ":" + pad(second),
      "%r": pad(hour12) + ":" + pad(minute) + ":" + pad(second) + " " + (hour < 12 ? "AM" : "PM")
    };
    map["%x"] = map["%D"] = pad(month + 1) + "/" + pad(dayOfMonth) + "/" + pad(year % 100);
    map["%T"] = map["%X"];

    return format.replace(/%[-_0^#:]?[YmdHMSyBbAaelIpPjsCchwuNkZznGgVUWDFRTrxXct%]/g, (match) => {
      const modifier = match.length === 3 ? match[1] : null;
      const base = modifier ? "%" + match[2] : match;
      if (modifier === "-") return map[base] != null ? ("" + map[base]).replace(/^[0 ]/, "") : match;
      if (modifier === "_") { const s = "" + (map[base] ?? ""); return s.replace(/^0/, " "); }
      if (modifier === "0") return map[base] != null ? ("" + map[base]).replace(/^ /, "0") : match;
      if (modifier === "^" || modifier === "#") return map[base] != null ? ("" + map[base]).toUpperCase() : match;
      if (match === "%:z") return tzString.slice(0, 3) + ":" + tzString.slice(3);
      return map[match] != null ? "" + map[match] : match;
    });
  },

  default: (value, fallback, opts) => {
    const empty = value === "" || value == null ||
      (isArr(value) && !value.length) ||
      (typeof value === "object" && value !== null && !isArr(value) && !Object.keys(value).length);
    if (opts?.allow_false) return empty ? (fallback ?? "") : value;
    return (value === false || empty) ? (fallback ?? "") : value;
  },

  divided_by: (value, divisor) => {
    const hasFloat = value?.__f || divisor?.__f || ("" + value).includes(".") || ("" + divisor).includes(".");
    const nDivisor = num(divisor);
    const nValue = num(value);
    if (!nDivisor) return Infinity;
    if (!hasFloat) return M.trunc(nValue / nDivisor);
    const result = nValue / nDivisor;
    return result % 1 === 0 ? result.toFixed(1) : result;
  },

  downcase: (value) => str(value).toLowerCase(),

  escape: (value) => value == null ? value :
    str(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;").replace(/'/g, "&#39;"),

  h: (value) => BUILTIN_FILTERS.escape(value),

  escape_once: (value) => BUILTIN_FILTERS.escape(
    str(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  ),

  find: (value, key, ...rest) => {
    const items = arr(value);
    return rest.length && rest[0] != null
      ? items.find(item => item?.[key] == rest[0])
      : items.find(item => item?.[key]);
  },

  find_index: (value, key, ...rest) => {
    const items = arr(value);
    const idx = rest.length && rest[0] != null
      ? items.findIndex(item => item?.[key] == rest[0])
      : items.findIndex(item => item?.[key]);
    return idx < 0 ? null : idx;
  },

  first: (value) => {
    if (typeof value === "string") return value[0];
    if (value && typeof value === "object" && !isArr(value)) {
      const keys = Object.keys(value);
      return keys.length ? [keys[0], value[keys[0]]] : undefined;
    }
    return isArr(value) ? value[0] : undefined;
  },

  flatten: (value) => arr(value).flat(Infinity),

  floor: (value) => M.floor(num(value)),

  has: (value, key, val) => {
    const items = arr(value);
    const keySegments = key.split(".");
    return items.some(item => {
      let obj = item;
      for (const seg of keySegments) obj = obj?.[seg];
      return val !== undefined ? obj === val : truthy(obj);
    });
  },

  join: (value, separator) =>
    arr(value)
      .map(item => typeof item === "object" && item !== null && !isArr(item) ? stringify(item) : item)
      .join(separator === undefined ? " " : str(separator ?? "")),

  last: (value) => {
    if (typeof value === "string") return value[value.length - 1];
    if (isArr(value)) return value[value.length - 1];
    return undefined;
  },

  lstrip: (value) => str(value).replace(/^\s+/, ""),

  map: (value, property) =>
    arr(value).flat().map(item => item && typeof item === "object" ? item[property] : undefined),

  minus: (value, subtrahend) => {
    const result = num(value) - num(subtrahend);
    return isFloat(value, subtrahend) && result % 1 === 0 ? result.toFixed(1) : result;
  },

  modulo: (value, divisor) => {
    const nValue = num(value);
    const nDivisor = num(divisor);
    const result = nValue % nDivisor;
    const hasFloat = value?.__f || divisor?.__f ||
      (("" + value).includes(".") && !("" + value).includes("e")) ||
      (("" + divisor).includes(".") && !("" + divisor).includes("e"));
    return hasFloat && result % 1 === 0 ? result.toFixed(1) : result;
  },

  newline_to_br: (value) =>
    str(value).replace(/\r?\n/g, "<br />\n").replace(/\r/g, "<br />\r"),

  plus: (value, addend) => {
    const result = num(value) + num(addend);
    return isFloat(value, addend) && result % 1 === 0 ? result.toFixed(1) : result;
  },

  prepend: (value, prefix) => str(prefix) + str(value),

  reject: (value, key, ...rest) => {
    const hasValue = rest.length > 0 && rest[0] != null;
    return arr(value).filter(item =>
      item != null && (hasValue ? item?.[key] != rest[0] : !item?.[key])
    );
  },

  remove: (value, target) => str(value).split(str(target)).join(""),

  remove_first: (value, target) => {
    const s = str(value);
    target = str(target);
    const idx = s.indexOf(target);
    return idx < 0 ? s : s.slice(0, idx) + s.slice(idx + target.length);
  },

  remove_last: (value, target) => {
    const s = str(value);
    target = str(target);
    const idx = s.lastIndexOf(target);
    return idx < 0 ? s : s.slice(0, idx) + s.slice(idx + target.length);
  },

  replace: (value, search, replacement) => {
    const s = str(value);
    let r = unescapeReplacement(replacement ?? "");
    search = search == null ? "" : "" + search;
    if (search === "") return s ? r + s.split("").join(r) + r : r;
    return s.split(search).join(r);
  },

  replace_first: (value, search, replacement) => {
    const s = str(value);
    let r = unescapeReplacement(replacement ?? "");
    const idx = s.indexOf(search);
    return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + search.length);
  },

  replace_last: (value, search, replacement) => {
    const s = str(value);
    let r = unescapeReplacement(replacement ?? "");
    const idx = s.lastIndexOf(search);
    return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + search.length);
  },

  reverse: (value) => arr(value).slice().reverse(),

  round: (value, precision) => {
    const factor = 10 ** (num(precision) || 0);
    return M.round(num(value) * factor) / factor;
  },

  rstrip: (value) => str(value).replace(/\s+$/, ""),

  size: (value) => {
    if (value == null) return 0;
    if (typeof value === "string" || isArr(value)) return value.length;
    if (typeof value === "number") return Number.isInteger(value) ? 8 : 0;
    if (typeof value === "object") return Object.keys(value).length;
    return 0;
  },

  slice: (value, start, length) => {
    if (isArr(value)) {
      start = +start;
      length = length != null ? +length : 1;
      if (length < 0) return [];
      if (start < 0) { if (-start > value.length) return []; start = value.length + start; }
      return value.slice(start, start + length);
    }
    const s = str(value);
    start = +start;
    length = length != null ? +length : 1;
    if (length < 0) return "";
    if (start < 0) { if (-start > s.length) return ""; start = s.length + start; }
    return s.slice(start, start + length);
  },

  sort: (value, key) =>
    arr(value).slice().sort((a, b) => {
      const x = key ? a?.[key] : a;
      const y = key ? b?.[key] : b;
      return x > y ? 1 : x < y ? -1 : 0;
    }),

  sort_natural: (value, key) =>
    arr(value).slice().sort((a, b) => {
      const x = key ? a?.[key] : a;
      const y = key ? b?.[key] : b;
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return str(x).toLowerCase().localeCompare(str(y).toLowerCase());
    }),

  split: (value, delimiter) => {
    if (value == null || value === false || value === true) return [];
    const s = str(value);
    if (!s) return [];
    if (delimiter === " ") {
      const trimmed = s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "").split(/[ \t\n\r\f]+/);
      return trimmed[0] === "" ? [] : trimmed;
    }
    const parts = s.split(delimiter == null ? "" : str(delimiter));
    while (parts.length > 1 && parts.at(-1) === "") parts.pop();
    return parts;
  },

  strip: (value) => str(value).trim(),

  strip_html: (value) =>
    str(value)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]*>/g, ""),

  strip_newlines: (value) => str(value).replace(/\r?\n|\r/g, ""),

  sum: (value, key) => {
    const toNum = (item) => {
      const raw = key ? item?.[key] : item;
      if (raw == null || typeof raw === "boolean" || typeof raw === "object") return 0;
      const n = +raw;
      return isNaN(n) ? 0 : n;
    };
    if (!isArr(value)) return toNum(value);
    return deepFlatten(value).reduce((sum, item) => sum + toNum(item), 0);
  },

  times: (value, multiplier) => {
    const hasFloat = value?.__f || multiplier?.__f || ("" + value).includes(".") || ("" + multiplier).includes(".");
    let result = num(value) * num(multiplier);
    if (hasFloat) {
      result = +result.toPrecision(12);
      return result % 1 === 0 ? result.toFixed(1) : result;
    }
    return result;
  },

  truncate: (value, length, ellipsis) => {
    value = str(value);
    length = length != null ? num(length) : 50;
    ellipsis = ellipsis ?? "...";
    return value.length <= length ? value : value.slice(0, M.max(0, length - ellipsis.length)) + ellipsis;
  },

  truncatewords: (value, wordCount, ellipsis) => {
    value = str(value);
    const trimmed = value.replace(/^[ \t\n\r\f\v]+/, "");
    const words = trimmed.split(/[ \t\n\r\f\v]+/);
    wordCount = wordCount != null ? num(wordCount) : 15;
    ellipsis = ellipsis ?? "...";
    return words.length <= wordCount ? words.join(" ") : words.slice(0, wordCount).join(" ") + ellipsis;
  },

  uniq: (value, key) => {
    const items = arr(value);
    if (!key) return [...new Set(items)];
    const seen = new Set();
    return items.filter(item => {
      const val = item?.[key];
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  },

  upcase: (value) => str(value).toUpperCase(),

  url_decode: (value) => {
    const s = str(value);
    let result = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === "+") {
        result += " ";
        i++;
      } else if (s[i] === "%" && /^%[0-9A-Fa-f]{2}/.test(s.slice(i))) {
        result += decodeURIComponent(s.slice(i, i + 3));
        i += 3;
      } else if (s[i] === "%") {
        result += s.slice(i, i + 2);
        i += 2;
      } else {
        result += s[i];
        i++;
      }
    }
    return result;
  },

  url_encode: (value) => value == null ? null : encodeURIComponent(str(value)).replace(/%20/g, "+"),

  where: (value, key, ...rest) => {
    if (!key && key !== 0) return arr(value);
    const hasTarget = rest.length > 0;
    const looseEq = (a, b) => {
      if (typeof a !== "object" && typeof b !== "object") return a == b;
      if (a === b) return true;
      if (isArr(a) && isArr(b)) return a.length === b.length && a.every((v, i) => v == b[i]);
      return false;
    };
    return arr(value).filter(item =>
      item != null && (hasTarget ? looseEq(item?.[key], rest[0]) : item?.[key])
    );
  },

  base64_encode: (value) => {
    const s = str(value);
    try { return btoa(unescape(encodeURIComponent(s))); }
    catch (e) { return btoa(s); }
  },

  base64_decode: (value) => {
    const s = str(value);
    try { return decodeURIComponent(escape(atob(s))); }
    catch (e) {
      try { return atob(s); }
      catch (e2) { return s; }
    }
  },

  base64_url_safe_encode: (value) =>
    BUILTIN_FILTERS.base64_encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),

  base64_url_safe_decode: (value) => {
    let s = str(value).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return BUILTIN_FILTERS.base64_decode(s);
  },

  json: (value) => JSON.stringify(value ?? null),

  image_url: (value, ...args) => {
    const url = str(value && typeof value === "object" ? value.url || value.src || value : value);
    const opts = args.find(arg => arg && typeof arg === "object" && !isArr(arg));
    if (!opts) return url;
    const query = Object.entries(opts).map(([k, v]) => k + "=" + (v ?? "")).join("&");
    return query ? url + "?" + query : url;
  },

  product_img_url: (value, ...args) => {
    const url = str(value && typeof value === "object" ? value.url || value.src || value : value);
    const opts = args.find(arg => arg && typeof arg === "object" && !isArr(arg));
    if (opts) {
      const query = Object.entries(opts).map(([k, v]) => k + "=" + (v ?? "")).join("&");
      return query ? url + "?" + query : url;
    }
    const positional = args.filter(arg => typeof arg !== "object");
    return url + "?arg1=" + (positional[0] ?? "") + "&arg2=" + (positional[1] ?? "");
  }
};

export { BUILTIN_FILTERS };
