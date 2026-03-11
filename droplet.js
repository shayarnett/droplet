// src/utils.js
var isArr = Array.isArray;
var M = Math;
var arr = (value) => isArr(value) ? value : value == null ? [] : [value];
var str = (value) => {
  if (value == null)
    return "";
  if (value?.__f) {
    return value % 1 === 0 ? (+value).toFixed(1) : ("" + +value).replace(/^(-?\d)e/, "$1.0e");
  }
  if (typeof value === "object" && !isArr(value))
    return stringify(value);
  return "" + value;
};
var num = (value) => {
  if (value == null)
    return 0;
  if (value?.__f)
    return value.valueOf();
  const n = typeof value === "string" ? parseFloat(value) : +value;
  return isNaN(n) ? 0 : n;
};
var rout = (result) => typeof result === "string" ? result : result.out ?? "";
var EMPTY = { __liquid: "empty", toString: () => "" };
var BLANK = { __liquid: "blank", toString: () => "" };
var truthy = (value) => value !== false && value != null && value !== BLANK;
var isEmpty = (value) => value === "" || isArr(value) && !value.length || value != null && typeof value === "object" && !isArr(value) && !value.__liquid && !Object.keys(value).length;
var isBlank = (value) => value == null || isEmpty(value) || value === false || typeof value === "string" && !value.trim();
var arrEq = (a, b) => {
  if (a.length !== b.length)
    return false;
  for (let i = 0;i < a.length; i++) {
    if (isArr(a[i]) && isArr(b[i])) {
      if (!arrEq(a[i], b[i]))
        return false;
    } else if (a[i] !== b[i] && !(a[i] == null && b[i] == null))
      return false;
  }
  return true;
};
var liquidEq = (left, right) => {
  if (right === EMPTY || right?.__liquid === "empty")
    return isEmpty(left);
  if (left === EMPTY || left?.__liquid === "empty")
    return isEmpty(right);
  if (right === BLANK || right?.__liquid === "blank")
    return isBlank(left);
  if (left === BLANK || left?.__liquid === "blank")
    return isBlank(right);
  const lv = left?.__f ? +left : left;
  const rv = right?.__f ? +right : right;
  if (isArr(lv) && isArr(rv))
    return arrEq(lv, rv);
  return lv === rv || lv == null && rv == null;
};
var rubyVal = (value) => {
  if (value == null)
    return '""';
  if (value?.__f)
    return value % 1 === 0 ? (+value).toFixed(1) : "" + +value;
  if (isArr(value))
    return "[" + value.map(rubyVal).join(", ") + "]";
  if (typeof value === "object")
    return stringify(value);
  if (typeof value === "string")
    return `"${value}"`;
  return "" + value;
};
var stringify = (value) => {
  if (value == null)
    return "";
  if (value?.__f) {
    return value % 1 === 0 ? (+value).toFixed(1) : ("" + +value).replace(/^(-?\d)e/, "$1.0e");
  }
  if (value?.__liquid)
    return "";
  if (isArr(value)) {
    if (value.__range)
      return `${value.first}..${value.last}`;
    return value.flat(Infinity).map((item) => typeof item === "object" && item !== null ? stringify(item) : item ?? "").join("");
  }
  if (typeof value === "object") {
    return "{" + Object.entries(value).map(([key, val]) => `"${key}"=>${rubyVal(val)}`).join(", ") + "}";
  }
  return "" + value;
};

// src/filters.js
var unescapeReplacement = (replacement) => {
  if (typeof replacement !== "string")
    return replacement;
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
var isFloat = (a, b) => a?.__f || b?.__f || ("" + a).includes(".") || ("" + b).includes(".");
var deepFlatten = (input) => {
  const result = [];
  for (const item of arr(input)) {
    if (isArr(item))
      result.push(...deepFlatten(item));
    else
      result.push(item);
  }
  return result;
};
var BUILTIN_FILTERS = {
  abs: (value) => M.abs(num(value)),
  append: (value, suffix) => str(value) + str(suffix),
  at_least: (value, minimum) => M.max(num(value), num(minimum)),
  at_most: (value, maximum) => M.min(num(value), num(maximum)),
  capitalize: (value) => {
    const s = str(value);
    return (s[0]?.toUpperCase() ?? "") + s.slice(1);
  },
  ceil: (value) => M.ceil(num(value)),
  compact: (value, property) => property ? arr(value).filter((item) => item?.[property] != null) : arr(value).filter((item) => item != null),
  concat: (value, other) => arr(value).concat(arr(other)),
  date: (value, format) => {
    if (!format)
      return value;
    let date, tz;
    if (value === "now" || value === "today" || value === "Now" || value === "Today") {
      date = new Date;
    } else if (typeof value === "number" || /^-?\d+$/.test("" + value)) {
      date = new Date(+value * 1000);
    } else {
      const sv = "" + value;
      const dateOnlyMatch = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        date = new Date(+dateOnlyMatch[1], +dateOnlyMatch[2] - 1, +dateOnlyMatch[3]);
      } else {
        const tzOffsetMatch = sv.match(/([+-]\d{2}:?\d{2})\s*$/);
        if (tzOffsetMatch)
          tz = tzOffsetMatch[1].replace(":", "");
        const tzNameMatch = sv.match(/\s([A-Z]{2,5})\s*$/);
        if (tzNameMatch)
          tz = tzNameMatch[1];
        date = new Date(sv);
      }
    }
    if (isNaN(date))
      return value;
    const pad = (n) => n < 10 ? "0" + n : "" + n;
    const pad3 = (n) => n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n;
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const month = date.getMonth();
    const dayOfWeek = date.getDay();
    const year = date.getFullYear();
    const hour12 = date.getHours() % 12 || 12;
    const dayOfMonth = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    const julianDay = M.floor((date - new Date(year, 0, 0)) / 86400000);
    const tzOffset = date.getTimezoneOffset();
    const offsetHours = pad(M.abs(M.trunc(tzOffset / 60)));
    const offsetMinutes = pad(M.abs(tzOffset % 60));
    const offsetSign = tzOffset <= 0 ? "+" : "-";
    const tzString = tz || offsetSign + offsetHours + offsetMinutes;
    const thursday = new Date(date);
    thursday.setDate(dayOfMonth - (dayOfWeek + 6) % 7 + 3);
    const jan4 = new Date(thursday.getFullYear(), 0, 4);
    const isoWeek = 1 + M.round(((thursday - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7);
    const yearDay = julianDay - 1;
    const weekSunday = M.floor((yearDay + 7 - dayOfWeek) / 7);
    const weekMonday = M.floor((yearDay + 7 - (dayOfWeek + 6) % 7) / 7);
    const map = {
      "%Y": year,
      "%m": pad(month + 1),
      "%d": pad(dayOfMonth),
      "%H": pad(hour),
      "%M": pad(minute),
      "%S": pad(second),
      "%y": pad(year % 100),
      "%B": MONTHS[month],
      "%b": MONTHS[month].slice(0, 3),
      "%A": DAYS[dayOfWeek],
      "%a": DAYS[dayOfWeek].slice(0, 3),
      "%e": (dayOfMonth < 10 ? " " : "") + dayOfMonth,
      "%l": (hour12 < 10 ? " " : "") + hour12,
      "%I": pad(hour12),
      "%p": hour < 12 ? "AM" : "PM",
      "%P": hour < 12 ? "am" : "pm",
      "%j": pad3(julianDay),
      "%C": M.floor(year / 100),
      "%h": MONTHS[month].slice(0, 3),
      "%w": dayOfWeek,
      "%u": dayOfWeek || 7,
      "%%": "%",
      "%s": M.floor(date.getTime() / 1000),
      "%Z": tz || (date.toTimeString().match(/\((.+)\)/) ?? ["", ""])[1],
      "%k": (hour < 10 ? " " : "") + hour,
      "%N": "" + date.getMilliseconds(),
      "%z": tzString,
      "%n": `
`,
      "%t": "\t",
      "%U": pad(weekSunday),
      "%W": pad(weekMonday),
      "%V": pad(isoWeek),
      "%G": thursday.getFullYear(),
      "%g": pad(thursday.getFullYear() % 100),
      "%c": DAYS[dayOfWeek].slice(0, 3) + " " + MONTHS[month].slice(0, 3) + " " + (dayOfMonth < 10 ? " " : "") + dayOfMonth + " " + pad(hour) + ":" + pad(minute) + ":" + pad(second) + " " + year,
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
      if (modifier === "-")
        return map[base] != null ? ("" + map[base]).replace(/^[0 ]/, "") : match;
      if (modifier === "_") {
        const s = "" + (map[base] ?? "");
        return s.replace(/^0/, " ");
      }
      if (modifier === "0")
        return map[base] != null ? ("" + map[base]).replace(/^ /, "0") : match;
      if (modifier === "^" || modifier === "#")
        return map[base] != null ? ("" + map[base]).toUpperCase() : match;
      if (match === "%:z")
        return tzString.slice(0, 3) + ":" + tzString.slice(3);
      return map[match] != null ? "" + map[match] : match;
    });
  },
  default: (value, fallback, opts) => {
    const empty = value === "" || value == null || isArr(value) && !value.length || typeof value === "object" && value !== null && !isArr(value) && !Object.keys(value).length;
    if (opts?.allow_false)
      return empty ? fallback ?? "" : value;
    return value === false || empty ? fallback ?? "" : value;
  },
  divided_by: (value, divisor) => {
    const hasFloat = value?.__f || divisor?.__f || ("" + value).includes(".") || ("" + divisor).includes(".");
    const nDivisor = num(divisor);
    const nValue = num(value);
    if (!nDivisor)
      return nValue / nDivisor;
    if (!hasFloat)
      return M.trunc(nValue / nDivisor);
    const result = nValue / nDivisor;
    return result % 1 === 0 ? result.toFixed(1) : result;
  },
  downcase: (value) => str(value).toLowerCase(),
  escape: (value) => value == null ? value : str(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
  h: (value) => BUILTIN_FILTERS.escape(value),
  escape_once: (value) => BUILTIN_FILTERS.escape(str(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")),
  find: (value, key, ...rest) => {
    const items = arr(value);
    return rest.length && rest[0] != null ? items.find((item) => item?.[key] == rest[0]) : items.find((item) => item?.[key]);
  },
  find_index: (value, key, ...rest) => {
    const items = arr(value);
    const idx = rest.length && rest[0] != null ? items.findIndex((item) => item?.[key] == rest[0]) : items.findIndex((item) => item?.[key]);
    return idx < 0 ? null : idx;
  },
  first: (value) => {
    if (typeof value === "string")
      return value[0];
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
    return items.some((item) => {
      let obj = item;
      for (const seg of keySegments)
        obj = obj?.[seg];
      return val !== undefined ? obj === val : truthy(obj);
    });
  },
  join: (value, separator) => arr(value).map((item) => typeof item === "object" && item !== null && !isArr(item) ? stringify(item) : item).join(separator === undefined ? " " : str(separator ?? "")),
  last: (value) => {
    if (typeof value === "string")
      return value[value.length - 1];
    if (isArr(value))
      return value[value.length - 1];
    return;
  },
  lstrip: (value) => str(value).replace(/^\s+/, ""),
  map: (value, property) => arr(value).flat().map((item) => item && typeof item === "object" ? item[property] : undefined),
  minus: (value, subtrahend) => {
    const result = num(value) - num(subtrahend);
    return isFloat(value, subtrahend) && result % 1 === 0 ? result.toFixed(1) : result;
  },
  modulo: (value, divisor) => {
    const nValue = num(value);
    const nDivisor = num(divisor);
    const result = nValue % nDivisor;
    const hasFloat = value?.__f || divisor?.__f || ("" + value).includes(".") && !("" + value).includes("e") || ("" + divisor).includes(".") && !("" + divisor).includes("e");
    return hasFloat && result % 1 === 0 ? result.toFixed(1) : result;
  },
  newline_to_br: (value) => str(value).replace(/\r?\n/g, `<br />
`).replace(/\r/g, "<br />\r"),
  plus: (value, addend) => {
    const result = num(value) + num(addend);
    return isFloat(value, addend) && result % 1 === 0 ? result.toFixed(1) : result;
  },
  prepend: (value, prefix) => str(prefix) + str(value),
  reject: (value, key, ...rest) => {
    const hasValue = rest.length > 0 && rest[0] != null;
    return arr(value).filter((item) => item != null && (hasValue ? item?.[key] != rest[0] : !item?.[key]));
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
    if (search === "")
      return s ? r + s.split("").join(r) + r : r;
    return s.split(search).join(r);
  },
  replace_first: (value, search, replacement) => {
    const s = str(value);
    let r = unescapeReplacement(replacement ?? "");
    search = search == null ? "" : "" + search;
    const idx = s.indexOf(search);
    return idx < 0 ? s : s.slice(0, idx) + r + s.slice(idx + search.length);
  },
  replace_last: (value, search, replacement) => {
    const s = str(value);
    let r = unescapeReplacement(replacement ?? "");
    search = search == null ? "" : "" + search;
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
    if (value == null)
      return 0;
    if (typeof value === "string" || isArr(value))
      return value.length;
    if (typeof value === "number")
      return Number.isInteger(value) ? 8 : 0;
    if (typeof value === "object")
      return Object.keys(value).length;
    return 0;
  },
  slice: (value, start, length) => {
    if (isArr(value)) {
      start = +start;
      length = length != null ? +length : 1;
      if (length < 0)
        return [];
      if (start < 0) {
        if (-start > value.length)
          return [];
        start = value.length + start;
      }
      return value.slice(start, start + length);
    }
    const s = str(value);
    start = +start;
    length = length != null ? +length : 1;
    if (length < 0)
      return "";
    if (start < 0) {
      if (-start > s.length)
        return "";
      start = s.length + start;
    }
    return s.slice(start, start + length);
  },
  sort: (value, key) => arr(value).slice().sort((a, b) => {
    const x = key ? a?.[key] : a;
    const y = key ? b?.[key] : b;
    return x > y ? 1 : x < y ? -1 : 0;
  }),
  sort_natural: (value, key) => arr(value).slice().sort((a, b) => {
    const x = key ? a?.[key] : a;
    const y = key ? b?.[key] : b;
    if (x == null && y == null)
      return 0;
    if (x == null)
      return 1;
    if (y == null)
      return -1;
    return str(x).toLowerCase().localeCompare(str(y).toLowerCase());
  }),
  split: (value, delimiter) => {
    if (value == null || value === false || value === true)
      return [];
    const s = str(value);
    if (!s)
      return [];
    if (delimiter === " ") {
      const trimmed = s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "").split(/[ \t\n\r\f]+/);
      return trimmed[0] === "" ? [] : trimmed;
    }
    const parts = s.split(delimiter == null ? "" : str(delimiter));
    while (parts.length > 1 && parts.at(-1) === "")
      parts.pop();
    return parts;
  },
  strip: (value) => str(value).trim(),
  strip_html: (value) => str(value).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, ""),
  strip_newlines: (value) => str(value).replace(/\r?\n|\r/g, ""),
  sum: (value, key) => {
    const toNum = (item) => {
      const raw = key ? item?.[key] : item;
      if (raw == null || typeof raw === "boolean" || typeof raw === "object")
        return 0;
      const n = +raw;
      return isNaN(n) ? 0 : n;
    };
    if (!isArr(value))
      return toNum(value);
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
    wordCount = wordCount != null ? M.max(1, num(wordCount)) : 15;
    ellipsis = ellipsis ?? "...";
    return words.length <= wordCount ? words.join(" ") : words.slice(0, wordCount).join(" ") + ellipsis;
  },
  uniq: (value, key) => {
    const items = arr(value);
    if (!key)
      return [...new Set(items)];
    const seen = new Set;
    return items.filter((item) => {
      const val = item?.[key];
      if (seen.has(val))
        return false;
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
    if (key == null)
      return [];
    const hasTarget = rest.length > 0;
    const looseEq = (a, b) => {
      if (typeof a !== "object" && typeof b !== "object")
        return a == b;
      if (a === b)
        return true;
      if (isArr(a) && isArr(b))
        return a.length === b.length && a.every((v, i) => v == b[i]);
      return false;
    };
    return arr(value).filter((item) => item != null && (hasTarget ? looseEq(item?.[key], rest[0]) : item?.[key]));
  },
  base64_encode: (value) => {
    const s = str(value);
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      return btoa(s);
    }
  },
  base64_decode: (value) => {
    const s = str(value);
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
  base64_url_safe_encode: (value) => BUILTIN_FILTERS.base64_encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  base64_url_safe_decode: (value) => {
    let s = str(value).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4)
      s += "=";
    return BUILTIN_FILTERS.base64_decode(s);
  },
  json: (value) => JSON.stringify(value ?? null),
  image_url: (value, ...args) => {
    const url = str(value && typeof value === "object" ? value.url || value.src || value : value);
    const opts = args.find((arg) => arg && typeof arg === "object" && !isArr(arg));
    if (!opts)
      return url;
    const query = Object.entries(opts).map(([k, v]) => k + "=" + (v ?? "")).join("&");
    return query ? url + "?" + query : url;
  },
  product_img_url: (value, ...args) => {
    const url = str(value && typeof value === "object" ? value.url || value.src || value : value);
    const opts = args.find((arg) => arg && typeof arg === "object" && !isArr(arg));
    if (opts) {
      const query = Object.entries(opts).map(([k, v]) => k + "=" + (v ?? "")).join("&");
      return query ? url + "?" + query : url;
    }
    const positional = args.filter((arg) => typeof arg !== "object");
    return url + "?arg1=" + (positional[0] ?? "") + "&arg2=" + (positional[1] ?? "");
  }
};

// src/eval.js
var resolve = (path, ctx) => {
  path = path.replace(/\s*\.\s*/g, ".").replace(/\s*\[\s*/g, "[").replace(/\s*\]\s*/g, "]").trim();
  if (path[0] === "[" && path[1] === "[" && (path[2] === "'" || path[2] === '"')) {
    path = path.slice(1);
  }
  const segments = [];
  let pos = 0;
  while (pos < path.length) {
    if (path[pos] === "[") {
      pos++;
      while (pos < path.length && path[pos] === " ")
        pos++;
      if (path[pos] === "'" || path[pos] === '"') {
        const quote = path[pos];
        pos++;
        let key = "";
        while (pos < path.length && path[pos] !== quote) {
          key += path[pos];
          pos++;
        }
        pos++;
        while (pos < path.length && path[pos] === " ")
          pos++;
        if (path[pos] === "]")
          pos++;
        segments.push({ type: "blit", val: key });
      } else {
        let key = "";
        let depth = 1;
        while (pos < path.length) {
          if (path[pos] === "[")
            depth++;
          if (path[pos] === "]") {
            depth--;
            if (!depth)
              break;
          }
          key += path[pos];
          pos++;
        }
        pos++;
        if (/^-?\d+$/.test(key))
          segments.push({ type: "idx", val: +key });
        else if (/^-?\d+\.\d+$/.test(key))
          segments.push({ type: "blit", val: key });
        else
          segments.push({ type: "var", val: key });
      }
    } else if (path[pos] === ".") {
      pos++;
    } else {
      let key = "";
      while (pos < path.length && path[pos] !== "." && path[pos] !== "[") {
        key += path[pos];
        pos++;
      }
      if (key)
        segments.push({ type: "lit", val: key });
    }
  }
  let value = ctx;
  for (const seg of segments) {
    if (value == null)
      return;
    if (seg.type === "var") {
      const key = resolve(seg.val, ctx);
      value = value?.[key];
    } else if (seg.type === "idx") {
      if (typeof value === "string")
        value = undefined;
      else if (isArr(value) && seg.val < 0)
        value = value[value.length + seg.val];
      else
        value = value?.[seg.val];
    } else if (seg.type === "blit") {
      if (typeof value === "string")
        value = undefined;
      else
        value = value?.[seg.val];
    } else {
      if (isArr(value)) {
        if (seg.val === "first")
          value = value[0];
        else if (seg.val === "last")
          value = value[value.length - 1];
        else if (seg.val === "size")
          value = value.length;
        else
          value = value?.[seg.val];
      } else if (value && typeof value === "object") {
        if (seg.val === "first" && !(seg.val in value)) {
          const keys = Object.keys(value);
          value = keys.length ? [keys[0], value[keys[0]]] : undefined;
        } else if (seg.val === "last" && !(seg.val in value)) {
          value = undefined;
        } else if (seg.val === "size" && !(seg.val in value))
          value = Object.keys(value).length;
        else
          value = value?.[seg.val];
      } else if (typeof value === "string") {
        if (seg.val === "size")
          value = value.length;
        else if (seg.val === "first")
          value = value[0];
        else if (seg.val === "last")
          value = value[value.length - 1];
        else
          value = undefined;
      } else {
        value = value?.[seg.val];
      }
    }
  }
  return value;
};
var parseLiteral = (str2) => {
  str2 = str2.trim();
  if (str2 === "true")
    return true;
  if (str2 === "false")
    return false;
  if (str2 === "nil" || str2 === "null")
    return null;
  if (/^-?\d+$/.test(str2))
    return parseInt(str2, 10);
  if (/^-?\d+\.\d+$/.test(str2)) {
    const n = new Number(parseFloat(str2));
    n.__f = 1;
    return n;
  }
  if ((str2[0] === '"' || str2[0] === "'") && str2.length >= 2) {
    const quote = str2[0];
    let i = 1;
    while (i < str2.length && str2[i] !== quote)
      i++;
    if (i < str2.length)
      return str2.slice(1, i);
  }
  return;
};
var evalExpr = (expr, ctx) => {
  expr = expr.trim();
  if (!expr)
    return null;
  const rangeMatch = expr.match(/^\((.+?)\.\.\.?(.+?)\)$/);
  if (rangeMatch) {
    const from = parseInt(evalExpr(rangeMatch[1].trim(), ctx)) || 0;
    const to = parseInt(evalExpr(rangeMatch[2].trim(), ctx)) || 0;
    const range = [];
    if (from <= to)
      for (let n = from;n <= to; n++)
        range.push(n);
    range.__range = true;
    range.first = range[0];
    range.last = range[range.length - 1];
    range.toString = () => `${from}..${to}`;
    return range;
  }
  let literal = parseLiteral(expr);
  if (literal !== undefined)
    return literal;
  if (expr === "nil" || expr === "null")
    return null;
  if (ctx.__counters && expr in ctx.__counters && !ctx.__assigns?.has(expr)) {
    return ctx.__counters[expr];
  }
  const resolved = resolve(expr, ctx);
  if (resolved !== undefined)
    return resolved;
  const firstToken = expr.match(/^('[^']*'|"[^"]*"|\S+)/);
  if (firstToken && firstToken[0] !== expr) {
    literal = parseLiteral(firstToken[0]);
    if (literal !== undefined)
      return literal;
    if (firstToken[0] === "nil" || firstToken[0] === "null")
      return null;
    return resolve(firstToken[0], ctx);
  }
  const numMatch = expr.match(/^-?\d+(\.\d+)?/);
  if (numMatch && numMatch[0] !== expr) {
    literal = parseLiteral(numMatch[0]);
    if (literal !== undefined)
      return literal;
  }
  return;
};
var evalFilter = async (value, filterStr, ctx, engine) => {
  const match = filterStr.match(/^\s*(\w+)[^:]*(?::\s*(.*))?/);
  if (!match)
    return value;
  const filterName = match[1];
  const filterFn = engine._filters[filterName] ?? BUILTIN_FILTERS[filterName];
  if (!filterFn)
    return value;
  let args = [];
  if (match[2]) {
    let raw = match[2];
    let currentArg = "";
    let inQuote = 0;
    let skipToComma = 0;
    for (const ch of raw) {
      if (skipToComma && ch !== ",")
        continue;
      skipToComma = 0;
      if ((ch === '"' || ch === "'") && !inQuote)
        inQuote = ch;
      else if (ch === inQuote) {
        inQuote = 0;
        skipToComma = 1;
      } else if (ch === "," && !inQuote) {
        args.push(currentArg);
        currentArg = "";
        continue;
      }
      currentArg += ch;
    }
    if (currentArg)
      args.push(currentArg);
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
    if (Object.keys(named).length)
      args.push(named);
  }
  return engine._filters[filterName] ? await filterFn.call(engine.options, value, ...args) : filterFn(value, ...args);
};
var splitPipes = (expr) => {
  const parts = [];
  let lastSplit = 0;
  let quote = 0;
  for (let i = 0;i < expr.length; i++) {
    const ch = expr[i];
    if ((ch === "'" || ch === '"') && !quote)
      quote = ch;
    else if (ch === quote) {
      quote = 0;
      if (expr[i + 1] === ch)
        i++;
    }
    if (!quote && ch === "|") {
      parts.push(expr.slice(lastSplit, i));
      lastSplit = i + 1;
    }
  }
  parts.push(expr.slice(lastSplit));
  return parts;
};
var evalOutput = async (expr, ctx, engine, raw) => {
  const parts = splitPipes(expr);
  let value = evalExpr(parts[0], ctx);
  for (let i = 1;i < parts.length; i++) {
    value = await evalFilter(value, parts[i], ctx, engine);
  }
  return raw ? value : value ?? "";
};
var splitFirstLogical = (expr) => {
  let quote = 0;
  let parenDepth = 0;
  for (let i = 0;i < expr.length; i++) {
    const ch = expr[i];
    if ((ch === "'" || ch === '"') && !quote)
      quote = ch;
    else if (ch === quote)
      quote = 0;
    if (quote)
      continue;
    if (ch === "(")
      parenDepth++;
    if (ch === ")")
      parenDepth--;
    if (parenDepth)
      continue;
    if (expr.substr(i, 4) === " or ")
      return [expr.slice(0, i), "or", expr.slice(i + 4)];
    if (expr.substr(i, 5) === " and ")
      return [expr.slice(0, i), "and", expr.slice(i + 5)];
  }
  return null;
};
var evalCondition = (expr, ctx) => {
  expr = expr.trim();
  while (expr[0] === "(" && expr.at(-1) === ")") {
    let depth = 0;
    let balanced = true;
    for (let i = 0;i < expr.length - 1; i++) {
      if (expr[i] === "(")
        depth++;
      if (expr[i] === ")")
        depth--;
      if (depth === 0) {
        balanced = false;
        break;
      }
    }
    if (balanced)
      expr = expr.slice(1, -1).trim();
    else
      break;
  }
  const logical = splitFirstLogical(expr);
  if (logical) {
    const left = evalCondition(logical[0], ctx);
    return logical[1] === "and" ? left && evalCondition(logical[2], ctx) : left || evalCondition(logical[2], ctx);
  }
  const operators = ["==", "!=", "<>", "<=", ">=", "<", ">", " contains "];
  for (const op of operators) {
    let opIdx = -1;
    let quote = 0;
    for (let k = 0;k < expr.length; k++) {
      const ch = expr[k];
      if ((ch === "'" || ch === '"') && !quote)
        quote = ch;
      else if (ch === quote)
        quote = 0;
      if (!quote && expr.substr(k, op.length) === op) {
        opIdx = k;
        break;
      }
    }
    if (opIdx >= 0) {
      const leftRaw = expr.slice(0, opIdx).trim();
      const rightRaw = expr.slice(opIdx + op.length).trim();
      const left = leftRaw === "empty" ? EMPTY : leftRaw === "blank" ? BLANK : evalExpr(leftRaw, ctx);
      const right = rightRaw === "empty" ? EMPTY : rightRaw === "blank" ? BLANK : evalExpr(rightRaw, ctx);
      switch (op.trim()) {
        case "==":
          return liquidEq(left, right);
        case "!=":
        case "<>":
          return !liquidEq(left, right);
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
          if (right == null)
            return false;
          if (typeof left === "string")
            return left.includes(str(right));
          if (isArr(left)) {
            if (isArr(right))
              return left.some((item) => isArr(item) && item.length === right.length && item.every((v, k) => v === right[k]));
            return left.includes(right);
          }
          return false;
      }
    }
  }
  if (expr === "empty" || expr === "blank")
    return true;
  return truthy(evalExpr(expr, ctx));
};

// src/tokenizer.js
var BLOCK_END_TAGS = {
  if: "endif,endunless",
  unless: "endif,endunless",
  for: "endfor,endtablerow",
  tablerow: "endfor,endtablerow",
  case: "endcase",
  capture: "endcapture",
  comment: "endcomment",
  doc: "enddoc"
};
var isBlockBlank = (tokens, start, end) => {
  for (let i = start;i < end; ) {
    const token = tokens[i];
    if (token[0] === "o")
      return false;
    if (token[0] === "t") {
      if (token[1].trim())
        return false;
      i++;
      continue;
    }
    const tagContent = token[1];
    const tagWord = tagContent.split(/\s/)[0];
    if (/^(cycle|echo|increment|decrement)$/.test(tagWord) || tagContent === "raw")
      return false;
    const endTags = BLOCK_END_TAGS[tagWord];
    if (endTags) {
      const endTagSet = endTags.split(",");
      let depth = 1;
      let j = i + 1;
      while (j < end) {
        if (tokens[j][0] === "g") {
          const innerTagWord = tokens[j][1].split(/\s/)[0];
          if (innerTagWord === tagWord)
            depth++;
          else if (endTagSet.includes(innerTagWord)) {
            if (!--depth)
              break;
          }
        }
        j++;
      }
      if (tagWord !== "comment" && tagWord !== "doc" && tagWord !== "capture" && !isBlockBlank(tokens, i + 1, j)) {
        return false;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return true;
};
var lstripLastToken = (tokens) => {
  const lastToken = tokens.at(-1);
  if (lastToken[0] === "t") {
    lastToken[1] = lastToken[1].replace(/\s+$/, "");
  }
};
var skipWhitespace = (src, pos) => {
  while (pos < src.length && ` 	
\r`.includes(src[pos]))
    pos++;
  return pos;
};
var tokenize = (src) => {
  const tokens = [];
  let pos = 0;
  while (pos < src.length) {
    const openBrace = src.indexOf("{", pos);
    if (openBrace < 0) {
      tokens.push(["t", src.slice(pos)]);
      break;
    }
    if (openBrace > pos) {
      tokens.push(["t", src.slice(openBrace > pos ? pos : pos, openBrace)]);
    }
    let trailingStripWs = false;
    if (src[openBrace + 1] === "{") {
      const leadingStrip = src[openBrace + 2] === "-";
      const closeIdx = src.indexOf("}}", openBrace + 2);
      if (closeIdx < 0) {
        tokens.push(["t", "{"]);
        pos = openBrace + 1;
        continue;
      }
      const trailingStrip = src[closeIdx - 1] === "-";
      const innerStart = openBrace + 2 + (leadingStrip ? 1 : 0);
      const innerEnd = closeIdx - (trailingStrip ? 1 : 0);
      const inner = src.slice(innerStart, innerEnd);
      if (leadingStrip && tokens.length)
        lstripLastToken(tokens);
      tokens.push(["o", inner.trim(), trailingStrip, leadingStrip]);
      pos = closeIdx + 2;
    } else if (src[openBrace + 1] === "%") {
      const leadingStrip = src[openBrace + 2] === "-";
      const closeIdx = src.indexOf("%}", openBrace + 2);
      if (closeIdx < 0) {
        tokens.push(["t", "{"]);
        pos = openBrace + 1;
        continue;
      }
      const trailingStrip = src[closeIdx - 1] === "-";
      const innerStart = openBrace + 2 + (leadingStrip ? 1 : 0);
      const innerEnd = closeIdx - (trailingStrip ? 1 : 0);
      const tagName = src.slice(innerStart, innerEnd).trim();
      if (leadingStrip && tokens.length)
        lstripLastToken(tokens);
      tokens.push(["g", tagName, trailingStrip, leadingStrip]);
      pos = closeIdx + 2;
      if (tagName === "raw") {
        const endrawPattern = /\{%-?\s*endraw\s*-?%\}/;
        const match = src.slice(pos).match(endrawPattern);
        if (match) {
          const rawContent = src.slice(pos, pos + match.index);
          if (rawContent)
            tokens.push(["t", rawContent]);
          const endrawTag = match[0];
          const endrawTrailingStrip = endrawTag[endrawTag.length - 3] === "-";
          tokens.push(["g", "endraw", endrawTrailingStrip]);
          pos += match.index + endrawTag.length;
          if (endrawTrailingStrip) {
            pos = skipWhitespace(src, pos);
          }
        }
        continue;
      }
    } else {
      tokens.push(["t", "{"]);
      pos = openBrace + 1;
    }
    if (tokens.at(-1)?.[2])
      trailingStripWs = true;
    if (trailingStripWs && pos < src.length) {
      pos = skipWhitespace(src, pos);
    }
  }
  return tokens;
};

// src/render.js
var findEndIf = (tokens, i, len) => {
  let depth = 1;
  let j = i + 1;
  let commentDepth = 0;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (tagContent === "comment" || tagContent === "doc" || tagContent === "raw")
        commentDepth++;
      else if (tagContent === "endcomment" || tagContent === "enddoc" || tagContent === "endraw")
        commentDepth--;
      else if (!commentDepth) {
        if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent))
          depth++;
        else if (tagContent === "endif" || tagContent === "endunless") {
          depth--;
          if (!depth)
            break;
        }
      }
    }
    j++;
  }
  return j;
};
var handleIf = async (tokens, ctx, i, len, engine) => {
  const tag = tokens[i][1];
  const condition = tag.slice(3).trim();
  const sections = [{ cond: condition, start: i + 1 }];
  let depth = 1;
  let j = i + 1;
  let commentDepth = 0;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (tagContent === "comment" || tagContent === "doc" || tagContent === "raw")
        commentDepth++;
      else if (tagContent === "endcomment" || tagContent === "enddoc" || tagContent === "endraw")
        commentDepth--;
      else if (!commentDepth) {
        if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent))
          depth++;
        else if (/^case\s/.test(tagContent))
          depth++;
        else if (tagContent === "endcase")
          depth--;
        else if (tagContent === "endif" || tagContent === "endunless") {
          depth--;
          if (!depth) {
            sections.at(-1).end = j;
            break;
          }
        } else if (depth === 1) {
          if (/^elsif\s/.test(tagContent)) {
            sections.at(-1).end = j;
            sections.push({ cond: tagContent.slice(6).trim(), start: j + 1 });
          } else if (tagContent === "else") {
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
  const allBlank = sections.every((sec) => isBlockBlank(tokens, sec.start, sec.end));
  for (const sec of sections) {
    if (sec.cond === null || evalCondition(sec.cond, ctx)) {
      const result = await render(tokens, ctx, sec.start, sec.end, engine);
      return allBlank && typeof result === "string" && !result.trim() ? "" : result;
    }
  }
  return "";
};
var handleCase = async (tokens, ctx, i, len, engine) => {
  const caseValue = evalExpr(tokens[i][1].slice(5).trim(), ctx);
  let depth = 1;
  let j = i + 1;
  const sections = [];
  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (/^case\s/.test(tagContent))
        depth++;
      else if (tagContent === "endcase") {
        depth--;
        if (!depth)
          break;
      } else if (depth === 1 && /^when\s/.test(tagContent)) {
        if (sections.length)
          sections.at(-1).end = j;
        const whenValues = tagContent.slice(5).split(/\s*,\s*|\s+or\s+/).map((v) => {
          v = v.trim();
          return v === "empty" ? EMPTY : v === "blank" ? BLANK : evalExpr(v, ctx);
        });
        sections.push({ type: "w", vals: whenValues, start: j + 1 });
      } else if (depth === 1 && /^else/.test(tagContent)) {
        if (sections.length)
          sections.at(-1).end = j;
        sections.push({ type: "e", start: j + 1 });
      }
    }
    j++;
  }
  if (sections.length && !sections.at(-1).end)
    sections.at(-1).end = j;
  const caseBlank = isBlockBlank(tokens, i + 1, j);
  let matched = false;
  let output = "";
  let lastElseIdx = -1;
  for (let k = sections.length - 1;k >= 0; k--) {
    if (sections[k].type === "e") {
      lastElseIdx = k;
      break;
    }
  }
  const renderSection = async (sec) => {
    const result = await render(tokens, ctx, sec.start, sec.end, engine);
    if (result?.__ctrl)
      return result;
    output += rout(result);
  };
  for (let k = 0;k < sections.length; k++) {
    const sec = sections[k];
    const isMatch = sec.type === "w" ? sec.vals.some((whenVal) => liquidEq(whenVal, caseValue)) : k !== lastElseIdx;
    if (isMatch) {
      if (sec.type === "w")
        matched = true;
      const ctrl = await renderSection(sec);
      if (ctrl)
        return [ctrl, j + 1];
    }
  }
  if (!matched && lastElseIdx >= 0) {
    const ctrl = await renderSection(sections[lastElseIdx]);
    if (ctrl)
      return [ctrl, j + 1];
  }
  return [caseBlank && !output.trim() ? "" : output, j + 1];
};
var handleFor = async (tokens, ctx, i, len, engine) => {
  const match = tokens[i][1].match(/^for\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!match)
    return ["", i + 1];
  const varName = match[1];
  const rawExpr = match[2].trim();
  let depth = 1;
  let innerIfDepth = 0;
  let j = i + 1;
  let elseIdx = -1;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (/^for\s/.test(tagContent) || /^tablerow\s/.test(tagContent))
        depth++;
      else if (tagContent === "endfor" || tagContent === "endtablerow") {
        depth--;
        if (!depth)
          break;
      } else if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent) || /^case\s/.test(tagContent))
        innerIfDepth++;
      else if (tagContent === "endif" || tagContent === "endunless" || tagContent === "endcase")
        innerIfDepth--;
      else if (depth === 1 && innerIfDepth === 0 && tagContent === "else")
        elseIdx = j;
    }
    j++;
  }
  let collection;
  let limit;
  let offset = 0;
  let reversed = false;
  let offsetContinue = false;
  let srcExpr = rawExpr.replace(/,/g, " ");
  const limitMatch = srcExpr.match(/\blimit:\s*(\S+)/);
  if (limitMatch) {
    limit = num(evalExpr(limitMatch[1], ctx));
    srcExpr = srcExpr.replace(limitMatch[0], "");
  }
  if (/\boffset:\s*continue\b/.test(srcExpr)) {
    offsetContinue = true;
    srcExpr = srcExpr.replace(/\boffset:\s*continue\b/, "");
  }
  const offsetMatch = srcExpr.match(/\boffset:\s*(\S+)/);
  if (offsetMatch) {
    offset = +evalExpr(offsetMatch[1], ctx);
    offsetContinue = false;
    srcExpr = srcExpr.replace(offsetMatch[0], "");
  }
  if (/\breversed\b/.test(srcExpr)) {
    reversed = true;
    srcExpr = srcExpr.replace(/\breversed\b/, "");
  }
  srcExpr = srcExpr.trim();
  collection = evalExpr(srcExpr, ctx);
  const isString = typeof collection === "string";
  if (isArr(collection)) {
    collection = collection.slice();
  } else if (isString) {
    collection = collection ? [collection] : [];
  } else if (collection && typeof collection === "object")
    collection = Object.entries(collection);
  else {
    if (elseIdx >= 0)
      return [await render(tokens, ctx, elseIdx + 1, j, engine), j + 1];
    return ["", j + 1];
  }
  if (!isString) {
    if (offsetContinue) {
      ctx.__foroffsets ??= {};
      offset = ctx.__foroffsets[varName + ":" + srcExpr] ?? 0;
    }
    if (limit != null && limit < 0) {
      collection = [];
    } else {
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
      const result = await render(tokens, ctx, elseIdx + 1, j, engine);
      return [rout(result), j + 1];
    }
    return ["", j + 1];
  }
  const bodyEnd = elseIdx >= 0 ? elseIdx : j;
  let output = "";
  const prevForloop = ctx.forloop;
  const prevVar = varName in ctx ? ctx[varName] : undefined;
  const hadVar = varName in ctx;
  const blank = isBlockBlank(tokens, i + 1, bodyEnd);
  const forloop = { name: varName + "-" + srcExpr, length: collection.length, parentloop: prevForloop };
  for (let k = 0;k < collection.length; k++) {
    ctx[varName] = collection[k];
    forloop.first = k === 0;
    forloop.last = k === collection.length - 1;
    forloop.index = k + 1;
    forloop.index0 = k;
    forloop.rindex = collection.length - k;
    forloop.rindex0 = collection.length - k - 1;
    ctx.forloop = forloop;
    const result = await render(tokens, ctx, i + 1, bodyEnd, engine);
    if (typeof result === "object") {
      output += result.out ?? "";
      if (result.__ctrl === "break")
        break;
      if (result.__ctrl === "continue")
        continue;
    } else {
      output += result;
    }
  }
  forloop.index = collection.length + 1;
  forloop.index0 = collection.length;
  forloop.rindex = 0;
  forloop.rindex0 = -1;
  forloop.first = false;
  forloop.last = false;
  ctx.forloop = prevForloop;
  if (hadVar)
    ctx[varName] = prevVar;
  else
    delete ctx[varName];
  return [blank && !output.trim() ? "" : output, j + 1];
};
var handleTablerow = async (tokens, ctx, i, len, engine) => {
  const match = tokens[i][1].match(/^tablerow\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!match)
    return ["", i + 1];
  const varName = match[1];
  const rawExpr = match[2].trim();
  let depth = 1;
  let j = i + 1;
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
  let collection;
  let limit;
  let offset = 0;
  let srcExpr = rawExpr.replace(/,/g, " ");
  const limitMatch = srcExpr.match(/\blimit:\s*(\S+)/);
  if (limitMatch) {
    limit = num(evalExpr(limitMatch[1], ctx));
    srcExpr = srcExpr.replace(limitMatch[0], "");
  }
  const offsetMatch = srcExpr.match(/\boffset:\s*(\S+)/);
  if (offsetMatch) {
    offset = +evalExpr(offsetMatch[1], ctx);
    srcExpr = srcExpr.replace(offsetMatch[0], "");
  }
  const colsMatch = srcExpr.match(/\bcols:\s*(\S+)/);
  const cols = colsMatch ? +evalExpr(colsMatch[1], ctx) || 0 : -1;
  if (colsMatch)
    srcExpr = srcExpr.replace(colsMatch[0], "");
  srcExpr = srcExpr.replace(/\b\w+:\s*\S+/g, "").trim();
  const rawCollection = evalExpr(srcExpr, ctx);
  const isString = typeof rawCollection === "string";
  if (rawCollection == null || rawCollection === false)
    return ["", j + 1];
  if (isArr(rawCollection))
    collection = rawCollection.slice();
  else if (isString)
    collection = rawCollection ? [rawCollection] : [];
  else
    collection = typeof rawCollection === "object" ? Object.values(rawCollection) : [];
  if (!isString) {
    if (limit != null && limit < 0) {
      collection = [];
    } else {
      if (offset < 0) {
        offset = offset + collection.length;
        if (offset < 0)
          collection = [];
        else
          collection = collection.slice(offset);
      } else if (offset) {
        collection = collection.slice(offset);
      }
      if (limit != null && !isNaN(limit))
        collection = collection.slice(0, M.max(0, limit));
    }
  }
  let output = "";
  const prevTablerowloop = ctx.tablerowloop;
  const prevVar = varName in ctx ? ctx[varName] : undefined;
  const hadVar = varName in ctx;
  if (!collection.length) {
    ctx.tablerowloop = prevTablerowloop;
    return [`<tr class="row1">
</tr>
`, j + 1];
  }
  for (let k = 0;k < collection.length; k++) {
    ctx[varName] = collection[k];
    const col = cols > 0 ? k % cols : k;
    const row = cols > 0 ? M.floor(k / cols) + 1 : 1;
    ctx.tablerowloop = {
      first: k === 0,
      last: k === collection.length - 1,
      index: k + 1,
      index0: k,
      length: collection.length,
      rindex: collection.length - k,
      rindex0: collection.length - k - 1,
      col: col + 1,
      col0: col,
      row,
      col_first: col === 0,
      col_last: cols > 0 ? col === cols - 1 : cols < 0 && k === collection.length - 1
    };
    if (col === 0)
      output += `<tr class="row${row}">` + (k === 0 ? `
` : "");
    const result = await render(tokens, ctx, i + 1, j, engine);
    const cellValue = rout(result);
    output += `<td class="col${col + 1}">${cellValue}</td>`;
    if (result?.__ctrl === "break") {
      output += `</tr>
`;
      break;
    }
    if (result?.__ctrl === "continue") {
      if (cols > 0 && col === cols - 1 || k === collection.length - 1)
        output += `</tr>
`;
      continue;
    }
    if (cols > 0 && col === cols - 1 || k === collection.length - 1)
      output += `</tr>
`;
  }
  ctx.tablerowloop = prevTablerowloop;
  if (hadVar)
    ctx[varName] = prevVar;
  else
    delete ctx[varName];
  return [output, j + 1];
};
var handleCycle = (args, ctx, tokenPos) => {
  ctx.__cycles ??= {};
  let valuesStr;
  let group;
  let colonIdx = -1;
  let quote = 0;
  for (let i = 0;i < args.length; i++) {
    const ch = args[i];
    if ((ch === '"' || ch === "'") && !quote)
      quote = ch;
    else if (ch === quote)
      quote = 0;
    if (!quote && ch === ":") {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx >= 0) {
    const groupName = args.slice(0, colonIdx).trim();
    if (/^[\w.[\]'"]+$/.test(groupName)) {
      group = evalExpr(groupName, ctx) || groupName;
      valuesStr = args.slice(colonIdx + 1);
    } else {
      valuesStr = args;
      group = args;
    }
  } else {
    valuesStr = args;
    group = args;
  }
  if (!colonIdx || colonIdx < 0) {
    let hasVariable = 0;
    let vq = 0;
    for (const ch of valuesStr) {
      if ((ch === '"' || ch === "'") && !vq)
        vq = ch;
      else if (ch === vq)
        vq = 0;
      else if (!vq && /[a-zA-Z_]/.test(ch)) {
        hasVariable = 1;
        break;
      }
    }
    if (hasVariable)
      group = "\x00" + tokenPos;
  }
  let values = valuesStr.split(",").map((v) => evalExpr(v.trim(), ctx));
  while (values.length > 1 && values.at(-1) == null)
    values.pop();
  ctx.__cycles[group] ??= 0;
  const idx = ctx.__cycles[group] % values.length;
  ctx.__cycles[group]++;
  return values[idx] ?? "";
};
var handleLiquid = async (body, ctx, engine) => {
  const wrappedSrc = body.split(`
`).map((line) => line.trim()).filter(Boolean).map((line) => `{% ${line} %}`).join("");
  const liquidTokens = tokenize(wrappedSrc);
  return await render(liquidTokens, ctx, 0, liquidTokens.length, engine);
};
var render = async (tokens, ctx, start, end, engine) => {
  let output = "";
  let i = start ?? 0;
  const len = end ?? tokens.length;
  while (i < len) {
    const token = tokens[i];
    if (token[0] === "t") {
      output += token[1];
      i++;
    } else if (token[0] === "o") {
      output += stringify(await evalOutput(token[1], ctx, engine));
      i++;
    } else if (token[0] === "g") {
      const tag = token[1];
      let m;
      if (/^if\s/.test(tag)) {
        const endIdx = findEndIf(tokens, i, len);
        const result = await handleIf(tokens, ctx, i, len, engine);
        if (result?.__ctrl) {
          result.out = output + (result.out ?? "");
          return result;
        }
        output += result;
        i = endIdx + 1;
      } else if (/^unless\s/.test(tag)) {
        const condition = tag.slice(7).trim();
        const sections = [{ cond: condition, negate: true, start: i + 1 }];
        let depth = 1, j = i + 1, commentDepth = 0;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const tagContent = tokens[j][1];
            if (tagContent === "comment" || tagContent === "doc" || tagContent === "raw")
              commentDepth++;
            else if (tagContent === "endcomment" || tagContent === "enddoc" || tagContent === "endraw")
              commentDepth--;
            else if (!commentDepth) {
              if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent))
                depth++;
              else if (tagContent === "endif" || tagContent === "endunless") {
                depth--;
                if (!depth) {
                  sections.at(-1).end = j;
                  break;
                }
              } else if (depth === 1) {
                if (/^elsif\s/.test(tagContent)) {
                  sections.at(-1).end = j;
                  sections.push({ cond: tagContent.slice(6).trim(), start: j + 1 });
                } else if (tagContent === "else") {
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
        const allBlank = sections.every((sec) => isBlockBlank(tokens, sec.start, sec.end));
        let result;
        for (const sec of sections) {
          const matches = sec.cond === null || (sec.negate ? !evalCondition(sec.cond, ctx) : evalCondition(sec.cond, ctx));
          if (matches) {
            result = await render(tokens, ctx, sec.start, sec.end, engine);
            break;
          }
        }
        if (result != null) {
          if (result?.__ctrl) {
            result.out = output + (result.out ?? "");
            return result;
          }
          if (allBlank && typeof result === "string" && !result.trim())
            result = "";
          output += result;
        }
        i = j + 1;
      } else if (/^case\s/.test(tag)) {
        const result = await handleCase(tokens, ctx, i, len, engine);
        if (result[0]?.__ctrl) {
          result[0].out = output + (result[0].out ?? "");
          return result[0];
        }
        output += result[0];
        i = result[1];
      } else if (/^for\s/.test(tag)) {
        const result = await handleFor(tokens, ctx, i, len, engine);
        output += result[0];
        i = result[1];
      } else if (/^tablerow\s/.test(tag)) {
        const result = await handleTablerow(tokens, ctx, i, len, engine);
        output += result[0];
        i = result[1];
      } else if (m = tag.match(/^assign\s+([\s\S]+)$/)) {
        const parts = m[1].match(/^(\w[\w.-]*)\s*=\s*([\s\S]+)$/);
        if (parts) {
          ctx[parts[1]] = await evalOutput(parts[2], ctx, engine, 1);
          ctx.__assigns ??= new Set;
          ctx.__assigns.add(parts[1]);
        }
        i++;
      } else if (m = tag.match(/^capture\s+['"]?(\w[\w.-]*)['"]?$/)) {
        const captureName = m[1];
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
        const result = await render(tokens, ctx, i + 1, j, engine);
        ctx[captureName] = rout(result);
        if (result?.__ctrl) {
          result.out = output;
          return result;
        }
        i = j + 1;
      } else if (tag === "comment" || tag === "doc") {
        const isComment = tag === "comment";
        const endTag = isComment ? "endcomment" : "enddoc";
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const tagContent = tokens[j][1];
            if (tagContent === endTag) {
              depth--;
              if (!depth)
                break;
            } else if (tagContent === (isComment ? "comment" : "doc"))
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
          const rawToken = tokens[k];
          if (rawToken[0] === "t")
            output += rawToken[1];
          else if (rawToken[0] === "o")
            output += `{{${rawToken[3] ? "-" : ""} ${rawToken[1]} ${rawToken[2] ? "-" : ""}}}`;
          else if (rawToken[0] === "g")
            output += `{%${rawToken[3] ? "-" : ""} ${rawToken[1]} ${rawToken[2] ? "-" : ""}%}`;
        }
        i = j + 1;
      } else if (m = tag.match(/^increment\s+(\w+)$/)) {
        ctx.__counters ??= {};
        ctx.__counters[m[1]] ??= 0;
        output += ctx.__counters[m[1]]++;
        i++;
      } else if (m = tag.match(/^decrement\s+(\w+)$/)) {
        ctx.__counters ??= {};
        ctx.__counters[m[1]] ??= 0;
        output += --ctx.__counters[m[1]];
        i++;
      } else if (m = tag.match(/^cycle\s*([\s\S]+)$/)) {
        output += handleCycle(m[1], ctx, i);
        i++;
      } else if (m = tag.match(/^echo\s+([\s\S]+)$/)) {
        output += stringify(await evalOutput(m[1], ctx, engine));
        i++;
      } else if (m = tag.match(/^liquid\s*([\s\S]*)$/)) {
        const liquidResult = await handleLiquid(m[1], ctx, engine);
        if (liquidResult?.__ctrl) {
          liquidResult.out = output + (liquidResult.out ?? "");
          return liquidResult;
        }
        output += typeof liquidResult === "string" ? liquidResult : rout(liquidResult);
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
        const result = await render(tokens, ctx, i + 1, j, engine);
        const renderedValue = rout(result);
        if (renderedValue !== ctx.__lastIfchanged) {
          output += renderedValue;
          ctx.__lastIfchanged = renderedValue;
        }
        if (result?.__ctrl) {
          result.out = output;
          return result;
        }
        i = j + 1;
      } else if (tag === "break" || tag === "continue") {
        return { __ctrl: tag, out: output };
      } else if (engine._tags) {
        const tagWord = tag.split(/\s/)[0];
        const handler = engine._tags[tagWord];
        if (handler) {
          const result = await handler(tag, tokens, ctx, i, len, engine);
          if (result?.__ctrl) {
            result.out = output + (result.out ?? "");
            return result;
          }
          if (isArr(result)) {
            output += result[0];
            i = result[1];
          } else {
            output += result ?? "";
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
  return output;
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
