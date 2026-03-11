import { isArr, num, rout, M, EMPTY, BLANK, liquidEq, stringify } from "./utils.js";
import { evalExpr, evalOutput, evalCondition } from "./eval.js";
import { isBlockBlank, tokenize } from "./tokenizer.js";

const handleIf = async (tokens, ctx, i, len, engine) => {
  const tag = tokens[i][1], cond = tag.slice(3).trim();
  const sections = [{ cond, start: i + 1 }];
  let depth = 1, j = i + 1, cd = 0;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const t = tokens[j][1];
      if (t === "comment" || t === "doc" || t === "raw") cd++;
      else if (t === "endcomment" || t === "enddoc" || t === "endraw") cd--;
      else if (!cd) {
        if (/^if\s/.test(t) || /^unless\s/.test(t)) depth++;
        else if (t === "endif" || t === "endunless") { depth--; if (!depth) { sections.at(-1).end = j; break; } }
        else if (depth === 1) {
          if (/^elsif\s/.test(t)) { sections.at(-1).end = j; sections.push({ cond: t.slice(6).trim(), start: j + 1 }); }
          else if (t === "else") { sections.at(-1).end = j; sections.push({ cond: null, start: j + 1 }); }
        }
      }
    }
    j++;
  }
  if (!sections.at(-1).end) sections.at(-1).end = j;
  const blank = sections.every(s => isBlockBlank(tokens, s.start, s.end));
  for (const sec of sections) {
    if (sec.cond === null || evalCondition(sec.cond, ctx)) { const r = await render(tokens, ctx, sec.start, sec.end, engine); return blank && typeof r === "string" && !r.trim() ? "" : r; }
  }
  return "";
};

const render = async (tokens, ctx, start, end, engine) => {
  let out = "", i = start ?? 0; const len = end ?? tokens.length;
  while (i < len) {
    const tok = tokens[i];
    if (tok[0] === "t") { out += tok[1]; i++; }
    else if (tok[0] === "o") { out += stringify(await evalOutput(tok[1], ctx, engine)); i++; }
    else if (tok[0] === "g") {
      const tag = tok[1]; let m;
      if (/^if\s/.test(tag)) {
        let depth = 1, j = i + 1, cd = 0;
        while (j < len) { if (tokens[j][0] === "g") { const t = tokens[j][1]; if (t === "comment" || t === "doc" || t === "raw") cd++; else if (t === "endcomment" || t === "enddoc" || t === "endraw") cd--; else if (!cd) { if (/^if\s/.test(t) || /^unless\s/.test(t)) depth++; else if (t === "endif" || t === "endunless") { depth--; if (!depth) break; } } } j++; }
        const r = await handleIf(tokens, ctx, i, len, engine);
        if (r?.__ctrl) { r.out = out + (r.out ?? ""); return r; }
        out += r; i = j + 1;
      } else if (/^unless\s/.test(tag)) {
        const cond = tag.slice(7).trim();
        // Reuse handleIf logic: build sections with negated first condition
        const sections = [{ cond, negate: true, start: i + 1 }];
        let depth = 1, j = i + 1, cd = 0;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const t = tokens[j][1];
            if (t === "comment" || t === "doc" || t === "raw") cd++;
            else if (t === "endcomment" || t === "enddoc" || t === "endraw") cd--;
            else if (!cd) {
              if (/^if\s/.test(t) || /^unless\s/.test(t)) depth++;
              else if (t === "endif" || t === "endunless") { depth--; if (!depth) { sections.at(-1).end = j; break; } }
              else if (depth === 1) {
                if (/^elsif\s/.test(t)) { sections.at(-1).end = j; sections.push({ cond: t.slice(6).trim(), start: j + 1 }); }
                else if (t === "else") { sections.at(-1).end = j; sections.push({ cond: null, start: j + 1 }); }
              }
            }
          }
          j++;
        }
        if (!sections.at(-1).end) sections.at(-1).end = j;
        const ub = sections.every(s => isBlockBlank(tokens, s.start, s.end));
        let r;
        for (const sec of sections) {
          const match = sec.cond === null || (sec.negate ? !evalCondition(sec.cond, ctx) : evalCondition(sec.cond, ctx));
          if (match) { r = await render(tokens, ctx, sec.start, sec.end, engine); break; }
        }
        if (r != null) { if (r?.__ctrl) { r.out = out + (r.out ?? ""); return r; } if (ub && typeof r === "string" && !r.trim()) r = ""; out += r; }
        i = j + 1;
      } else if (/^case\s/.test(tag)) {
        const r = await handleCase(tokens, ctx, i, len, engine); if (r[0]?.__ctrl) { r[0].out = out + (r[0].out ?? ""); return r[0]; } out += r[0]; i = r[1];
      } else if (/^for\s/.test(tag)) {
        const r = await handleFor(tokens, ctx, i, len, engine); out += r[0]; i = r[1];
      } else if (/^tablerow\s/.test(tag)) {
        const r = await handleTablerow(tokens, ctx, i, len, engine); out += r[0]; i = r[1];
      } else if ((m = tag.match(/^assign\s+([\s\S]+)$/))) {
        const parts = m[1].match(/^(\w[\w.-]*)\s*=\s*([\s\S]+)$/);
        if (parts) { ctx[parts[1]] = await evalOutput(parts[2], ctx, engine, 1); ctx.__assigns ??= new Set(); ctx.__assigns.add(parts[1]); }
        i++;
      } else if ((m = tag.match(/^capture\s+['"]?(\w[\w.-]*)['"]?$/))) {
        const name = m[1]; let depth = 1, j = i + 1;
        while (j < len) { if (tokens[j][0] === "g") { if (tokens[j][1] === "endcapture") { depth--; if (!depth) break; } else if (/^capture\s/.test(tokens[j][1])) depth++; } j++; }
        const r = await render(tokens, ctx, i + 1, j, engine);
        ctx[name] = rout(r);
        if (r?.__ctrl) { r.out = out; return r; }
        i = j + 1;
      } else if (tag === "comment" || tag === "doc") {
        const isComment = tag === "comment";
        const endTag = isComment ? "endcomment" : "enddoc";
        let depth = 1, j = i + 1;
        while (j < len) { if (tokens[j][0] === "g") { const t = tokens[j][1]; if (t === endTag) { depth--; if (!depth) break; } else if (t === (isComment ? "comment" : "doc")) depth++; } j++; }
        i = j + 1;
      } else if (tag === "raw") {
        let j = i + 1;
        while (j < len) { if (tokens[j][0] === "g" && tokens[j][1] === "endraw") break; j++; }
        for (let k = i + 1; k < j; k++) {
          const tk = tokens[k];
          if (tk[0] === "t") out += tk[1];
          else if (tk[0] === "o") out += `{{${tk[3] ? "-" : ""} ${tk[1]} ${tk[2] ? "-" : ""}}}`;
          else if (tk[0] === "g") out += `{%${tk[3] ? "-" : ""} ${tk[1]} ${tk[2] ? "-" : ""}%}`;
        }
        i = j + 1;
      } else if ((m = tag.match(/^increment\s+(\w+)$/))) {
        ctx.__counters ??= {}; ctx.__counters[m[1]] ??= 0;
        out += ctx.__counters[m[1]]++; i++;
      } else if ((m = tag.match(/^decrement\s+(\w+)$/))) {
        ctx.__counters ??= {}; ctx.__counters[m[1]] ??= 0;
        out += --ctx.__counters[m[1]]; i++;
      } else if ((m = tag.match(/^cycle\s*([\s\S]+)$/))) {
        out += handleCycle(m[1], ctx, i); i++;
      } else if ((m = tag.match(/^echo\s+([\s\S]+)$/))) {
        out += stringify(await evalOutput(m[1], ctx, engine)); i++;
      } else if ((m = tag.match(/^liquid\s*([\s\S]*)$/))) {
        out += await handleLiquid(m[1], ctx, engine); i++;
      } else if (tag === "ifchanged") {
        let depth = 1, j = i + 1;
        while (j < len) { if (tokens[j][0] === "g") { if (tokens[j][1] === "endifchanged") { depth--; if (!depth) break; } else if (tokens[j][1] === "ifchanged") depth++; } j++; }
        const r = await render(tokens, ctx, i + 1, j, engine);
        const val = rout(r);
        if (val !== ctx.__lastIfchanged) { out += val; ctx.__lastIfchanged = val; }
        if (r?.__ctrl) { r.out = out; return r; }
        i = j + 1;
      } else if (tag === "break" || tag === "continue") {
        return { __ctrl: tag, out };
      } else if (engine._tags) {
        const tw = tag.split(/\s/)[0];
        const handler = engine._tags[tw];
        if (handler) {
          const r = await handler(tag, tokens, ctx, i, len, engine);
          if (r?.__ctrl) { r.out = out + (r.out ?? ""); return r; }
          if (isArr(r)) { out += r[0]; i = r[1]; }
          else { out += r ?? ""; i++; }
        } else { i++; }
      } else { i++; }
    } else { i++; }
  }
  return out;
};

const handleCase = async (tokens, ctx, i, len, engine) => {
  const val = evalExpr(tokens[i][1].slice(5).trim(), ctx);
  let depth = 1, j = i + 1; const sects = [];
  while (j < len) {
    if (tokens[j][0] === "g") {
      const t = tokens[j][1];
      if (/^case\s/.test(t)) depth++;
      else if (t === "endcase") { depth--; if (!depth) break; }
      else if (depth === 1 && /^when\s/.test(t)) {
        if (sects.length) sects.at(-1).end = j;
        sects.push({ type: "w", vals: t.slice(5).split(/\s*,\s*|\s+or\s+/).map(v => { v = v.trim(); return v === "empty" ? EMPTY : v === "blank" ? BLANK : evalExpr(v, ctx); }), start: j + 1 });
      } else if (depth === 1 && /^else/.test(t)) { if (sects.length) sects.at(-1).end = j; sects.push({ type: "e", start: j + 1 }); }
    }
    j++;
  }
  if (sects.length && !sects.at(-1).end) sects.at(-1).end = j;
  const cb = isBlockBlank(tokens, i + 1, j);
  let matched = false, out2 = "", lastElse = -1;
  for (let k = sects.length - 1; k >= 0; k--) if (sects[k].type === "e") { lastElse = k; break; }
  const rs = async s => { const r = await render(tokens, ctx, s.start, s.end, engine); if (r?.__ctrl) return r; out2 += rout(r); };
  for (let k = 0; k < sects.length; k++) {
    const s = sects[k], hit = s.type === "w" ? s.vals.some(wv => liquidEq(wv, val)) : k !== lastElse;
    if (hit) { if (s.type === "w") matched = true; const c = await rs(s); if (c) return [c, j + 1]; }
  }
  if (!matched && lastElse >= 0) { const c = await rs(sects[lastElse]); if (c) return [c, j + 1]; }
  return [cb && !out2.trim() ? "" : out2, j + 1];
};

const handleFor = async (tokens, ctx, i, len, engine) => {
  const m = tokens[i][1].match(/^for\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!m) return ["", i + 1];
  const varName = m[1], expr = m[2].trim();
  let depth = 1, idepth = 0, j = i + 1, elseIdx = -1;
  while (j < len) {
    if (tokens[j][0] === "g") {
      const t = tokens[j][1];
      if (/^for\s/.test(t) || /^tablerow\s/.test(t)) depth++;
      else if (t === "endfor" || t === "endtablerow") { depth--; if (!depth) break; }
      else if (/^if\s/.test(t) || /^unless\s/.test(t) || /^case\s/.test(t)) idepth++;
      else if (t === "endif" || t === "endunless" || t === "endcase") idepth--;
      else if (depth === 1 && idepth === 0 && t === "else") elseIdx = j;
    }
    j++;
  }
  let collection;
  let limit, offset = 0, reversed = false, offsetContinue = false;
  // Extract source expr and modifiers (handle commas, spaces around colons)
  let srcExpr = expr.replace(/,/g, " ");
  const lm = srcExpr.match(/\blimit:\s*(\S+)/); if (lm) { limit = num(evalExpr(lm[1], ctx)); srcExpr = srcExpr.replace(lm[0], ""); }
  if (/\boffset:\s*continue\b/.test(srcExpr)) { offsetContinue = true; srcExpr = srcExpr.replace(/\boffset:\s*continue\b/, ""); }
  const om = srcExpr.match(/\boffset:\s*(\S+)/); if (om) { offset = +evalExpr(om[1], ctx); offsetContinue = false; srcExpr = srcExpr.replace(om[0], ""); }
  if (/\breversed\b/.test(srcExpr)) { reversed = true; srcExpr = srcExpr.replace(/\breversed\b/, ""); }
  srcExpr = srcExpr.trim();
  collection = evalExpr(srcExpr, ctx);
  const isStr = typeof collection === "string";
  if (isArr(collection)) { collection = collection.slice(); }
  else if (isStr) { collection = collection ? [collection] : []; }
  else if (collection && typeof collection === "object") collection = Object.entries(collection);
  else { if (elseIdx >= 0) return [await render(tokens, ctx, elseIdx + 1, j, engine), j + 1]; return ["", j + 1]; }
  if (!isStr) {
    if (offsetContinue) {
      ctx.__foroffsets ??= {};
      offset = ctx.__foroffsets[varName + ":" + srcExpr] ?? 0;
    }
    // Ruby Liquid: slice first, then reverse
    if (limit != null && limit < 0) collection = [];
    else {
      if (offset < 0) {
        if (limit != null) { limit = M.max(0, limit + offset); }
        offset = 0;
      }
      if (offset) collection = collection.slice(offset);
      if (limit != null) collection = collection.slice(0, limit);
    }
    ctx.__foroffsets ??= {};
    ctx.__foroffsets[varName + ":" + srcExpr] = offset + collection.length;
    if (reversed) collection = collection.slice().reverse();
  }
  if (!collection.length) {
    if (elseIdx >= 0) { const r = await render(tokens, ctx, elseIdx + 1, j, engine); return [rout(r), j + 1]; }
    return ["", j + 1];
  }
  const bodyEnd = elseIdx >= 0 ? elseIdx : j; let out = ""; const prevForloop = ctx.forloop; const prevVar = varName in ctx ? ctx[varName] : undefined; const hadVar = varName in ctx;
  const blank = isBlockBlank(tokens, i + 1, bodyEnd);
  const fl = { name: varName + "-" + srcExpr, length: collection.length, parentloop: prevForloop };
  for (let k = 0; k < collection.length; k++) {
    ctx[varName] = collection[k];
    fl.first = k === 0; fl.last = k === collection.length - 1; fl.index = k + 1; fl.index0 = k; fl.rindex = collection.length - k; fl.rindex0 = collection.length - k - 1;
    ctx.forloop = fl;
    const r = await render(tokens, ctx, i + 1, bodyEnd, engine);
    if (typeof r === "object") { out += r.out ?? ""; if (r.__ctrl === "break") break; if (r.__ctrl === "continue") continue; }
    else out += r;
  }
  // Post-loop: bump forloop indices so captured references see end-of-loop state
  fl.index = collection.length + 1; fl.index0 = collection.length; fl.rindex = 0; fl.rindex0 = -1; fl.first = false; fl.last = false;
  ctx.forloop = prevForloop;
  if (hadVar) ctx[varName] = prevVar; else delete ctx[varName];
  return [blank && !out.trim() ? "" : out, j + 1];
};

const handleTablerow = async (tokens, ctx, i, len, engine) => {
  const m = tokens[i][1].match(/^tablerow\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!m) return ["", i + 1];
  const varName = m[1], expr = m[2].trim();
  let depth = 1, j = i + 1;
  while (j < len) { if (tokens[j][0] === "g") { if (/^for\s/.test(tokens[j][1]) || /^tablerow\s/.test(tokens[j][1])) depth++; else if (tokens[j][1] === "endtablerow" || tokens[j][1] === "endfor") { depth--; if (!depth) break; } } j++; }
  let collection, limit, offset = 0;
  let srcExpr = expr.replace(/,/g, " ");
  const lm = srcExpr.match(/\blimit:\s*(\S+)/); if (lm) { limit = num(evalExpr(lm[1], ctx)); srcExpr = srcExpr.replace(lm[0], ""); }
  const om = srcExpr.match(/\boffset:\s*(\S+)/); if (om) { offset = +evalExpr(om[1], ctx); srcExpr = srcExpr.replace(om[0], ""); }
  const cm = srcExpr.match(/\bcols:\s*(\S+)/); const cols = cm ? (+evalExpr(cm[1], ctx) || 0) : -1; if (cm) srcExpr = srcExpr.replace(cm[0], "");
  srcExpr = srcExpr.replace(/\b\w+:\s*\S+/g, "").trim();
  const rawSrc = evalExpr(srcExpr, ctx);
  const isStr = typeof rawSrc === "string";
  if (rawSrc == null || rawSrc === false) return ["", j + 1];
  if (isArr(rawSrc)) collection = rawSrc.slice();
  else if (isStr) collection = rawSrc ? [rawSrc] : [];
  else collection = typeof rawSrc === "object" ? Object.values(rawSrc) : [];
  if (!isStr) {
    if (limit != null && limit < 0) collection = [];
    else {
      if (offset < 0) { offset = offset + collection.length; if (offset < 0) collection = []; else collection = collection.slice(offset); }
      else if (offset) collection = collection.slice(offset);
      if (limit != null && !isNaN(limit)) collection = collection.slice(0, M.max(0, limit));
    }
  }
  let out = ""; const prev = ctx.tablerowloop; const prevVar = varName in ctx ? ctx[varName] : undefined; const hadVar = varName in ctx;
  if (!collection.length) { ctx.tablerowloop = prev; return ['<tr class="row1">\n</tr>\n', j + 1]; }
  for (let k = 0; k < collection.length; k++) {
    ctx[varName] = collection[k];
    const col = cols > 0 ? (k % cols) : k;
    const row = cols > 0 ? M.floor(k / cols) + 1 : 1;
    ctx.tablerowloop = { first: k === 0, last: k === collection.length - 1, index: k + 1, index0: k, length: collection.length, rindex: collection.length - k, rindex0: collection.length - k - 1, col: col + 1, col0: col, row, col_first: col === 0, col_last: cols > 0 ? col === cols - 1 : cols < 0 && k === collection.length - 1 };
    if (col === 0) out += `<tr class="row${row}">` + (k === 0 ? "\n" : "");
    const r = await render(tokens, ctx, i + 1, j, engine);
    const cellVal = rout(r);
    out += `<td class="col${col + 1}">${cellVal}</td>`;
    if (r?.__ctrl === "break") { out += "</tr>\n"; break; }
    if (r?.__ctrl === "continue") { if ((cols > 0 && col === cols - 1) || k === collection.length - 1) out += "</tr>\n"; continue; }
    if ((cols > 0 && col === cols - 1) || k === collection.length - 1) out += "</tr>\n";
  }
  ctx.tablerowloop = prev;
  if (hadVar) ctx[varName] = prevVar; else delete ctx[varName];
  return [out, j + 1];
};

const handleCycle = (args, ctx, pos) => {
  ctx.__cycles ??= {};
  let parts, group, colonIdx = -1, cq = 0;
  for (let ci = 0; ci < args.length; ci++) { const cc = args[ci]; if ((cc === '"' || cc === "'") && !cq) cq = cc; else if (cc === cq) cq = 0; if (!cq && cc === ":") { colonIdx = ci; break; } }
  if (colonIdx >= 0) { const gn = args.slice(0, colonIdx).trim(); if (/^[\w.[\]'"]+$/.test(gn)) { group = evalExpr(gn, ctx) || gn; parts = args.slice(colonIdx + 1); } else { parts = args; group = args; } }
  else { parts = args; group = args; }
  if (!colonIdx || colonIdx < 0) { let hasVar = 0, vq = 0; for (const vc of parts) { if ((vc === '"' || vc === "'") && !vq) vq = vc; else if (vc === vq) vq = 0; else if (!vq && /[a-zA-Z_]/.test(vc)) { hasVar = 1; break; } } if (hasVar) group = "\0" + pos; }
  let vals = parts.split(",").map(v => evalExpr(v.trim(), ctx));
  while (vals.length > 1 && vals.at(-1) == null) vals.pop();
  ctx.__cycles[group] ??= 0;
  const idx = ctx.__cycles[group] % vals.length;
  ctx.__cycles[group]++;
  return vals[idx] ?? "";
};

const handleLiquid = async (body, ctx, engine) => {
  const src = body.split("\n").map(l => l.trim()).filter(Boolean).map(l => `{% ${l} %}`).join("");
  const toks = tokenize(src);
  const r = await render(toks, ctx, 0, toks.length, engine);
  return rout(r);
};

export { render };
