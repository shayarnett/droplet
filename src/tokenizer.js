const BB = { "if": "endif,endunless", "unless": "endif,endunless", "for": "endfor,endtablerow", "tablerow": "endfor,endtablerow", "case": "endcase", "capture": "endcapture", "comment": "endcomment", "doc": "enddoc" };
const isBlockBlank = (tokens, start, end) => {
  for (let i = start; i < end; ) {
    const tok = tokens[i];
    if (tok[0] === "o") return false;
    if (tok[0] === "t") { if (tok[1].trim()) return false; i++; continue; }
    const t = tok[1], tw = t.split(/\s/)[0];
    if (/^(cycle|echo|increment|decrement)$/.test(tw) || t === "raw") return false;
    const ends = BB[tw];
    if (ends) {
      const endSet = ends.split(","); let depth = 1, j = i + 1;
      while (j < end) { if (tokens[j][0] === "g") { const tt = tokens[j][1].split(/\s/)[0]; if (tt === tw) depth++; else if (endSet.includes(tt)) { if (!--depth) break; } } j++; }
      if (tw !== "comment" && tw !== "doc" && tw !== "capture" && !isBlockBlank(tokens, i + 1, j)) return false;
      i = j + 1; continue;
    }
    i++;
  }
  return true;
};

const tokenize = src => {
  const tokens = []; let i = 0;
  while (i < src.length) {
    const oIdx = src.indexOf("{", i);
    if (oIdx < 0) { tokens.push(["t", src.slice(i)]); break; }
    if (oIdx > i) tokens.push(["t", src.slice(i, oIdx)]);
    let wsCtrl = false;
    if (src[oIdx + 1] === "{") {
      const strip1 = src[oIdx + 2] === "-";
      const cIdx = src.indexOf("}}", oIdx + 2);
      if (cIdx < 0) { tokens.push(["t", "{"]); i = oIdx + 1; continue; }
      const strip2 = src[cIdx - 1] === "-";
      const inner = src.slice(oIdx + 2 + (strip1 ? 1 : 0), cIdx - (strip2 ? 1 : 0));
      if (strip1 && tokens.length) { const lt = tokens.at(-1); if (lt[0] === "t") lt[1] = lt[1].replace(/\s+$/, ""); }
      tokens.push(["o", inner.trim(), strip2, strip1]); i = cIdx + 2;
    } else if (src[oIdx + 1] === "%") {
      const strip1 = src[oIdx + 2] === "-";
      const cIdx = src.indexOf("%}", oIdx + 2);
      if (cIdx < 0) { tokens.push(["t", "{"]); i = oIdx + 1; continue; }
      const strip2 = src[cIdx - 1] === "-";
      const inner = src.slice(oIdx + 2 + (strip1 ? 1 : 0), cIdx - (strip2 ? 1 : 0));
      if (strip1 && tokens.length) { const lt = tokens.at(-1); if (lt[0] === "t") lt[1] = lt[1].replace(/\s+$/, ""); }
      const tagName = inner.trim();
      tokens.push(["g", tagName, strip2, strip1]); i = cIdx + 2;
      if (tagName === "raw") {
        // Scan for literal {% endraw %} or {%- endraw -%} etc.
        const endPattern = /\{%-?\s*endraw\s*-?%\}/;
        const rm = src.slice(i).match(endPattern);
        if (rm) {
          const rawContent = src.slice(i, i + rm.index);
          if (rawContent) tokens.push(["t", rawContent]);
          // Parse the endraw tag for whitespace control
          const es1 = rm[0][2] === "-", es2 = rm[0][rm[0].length - 3] === "-";
          tokens.push(["g", "endraw", es2]);
          i += rm.index + rm[0].length;
          if (es2) { let ej = i; while (ej < src.length && " \t\n\r".includes(src[ej])) ej++; if (ej > i) i = ej; }
        }
        continue;
      }
    } else { tokens.push(["t", "{"]); i = oIdx + 1; }
    if (tokens.at(-1)?.[2]) wsCtrl = true;
    if (wsCtrl && i < src.length) {
      let j = i;
      while (j < src.length && " \t\n\r".includes(src[j])) j++;
      if (j > i) i = j;
    }
  }
  return tokens;
};

export { BB, isBlockBlank, tokenize };
