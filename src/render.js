import { isArr, num, rout, M, EMPTY, BLANK, liquidEq, stringify } from "./utils.js";
import { evalExpr, evalOutput, evalCondition } from "./eval.js";
import { isBlockBlank, tokenize } from "./tokenizer.js";

// Find the matching endif/endunless for an if/unless starting at position i.
// Respects nesting and skips over comment/doc/raw blocks.
const findEndIf = (tokens, i, len) => {
  let depth = 1;
  let j = i + 1;
  let commentDepth = 0;

  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (tagContent === "comment" || tagContent === "doc" || tagContent === "raw") commentDepth++;
      else if (tagContent === "endcomment" || tagContent === "enddoc" || tagContent === "endraw") commentDepth--;
      else if (!commentDepth) {
        if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent)) depth++;
        else if (tagContent === "endif" || tagContent === "endunless") {
          depth--;
          if (!depth) break;
        }
      }
    }
    j++;
  }
  return j;
};

// Handle {% if %} tag: collects if/elsif/else sections, evaluates conditions,
// renders the first matching section. Suppresses whitespace if all sections are blank.
const handleIf = async (tokens, ctx, i, len, engine) => {
  const tag = tokens[i][1];
  const condition = tag.slice(3).trim();

  // Collect sections: [{cond, start, end}, ...]
  const sections = [{ cond: condition, start: i + 1 }];
  let depth = 1;
  let j = i + 1;
  let commentDepth = 0;

  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (tagContent === "comment" || tagContent === "doc" || tagContent === "raw") commentDepth++;
      else if (tagContent === "endcomment" || tagContent === "enddoc" || tagContent === "endraw") commentDepth--;
      else if (!commentDepth) {
        if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent)) depth++;
        else if (/^case\s/.test(tagContent)) depth++;
        else if (tagContent === "endcase") depth--;
        else if (tagContent === "endif" || tagContent === "endunless") {
          depth--;
          if (!depth) { sections.at(-1).end = j; break; }
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
  if (!sections.at(-1).end) sections.at(-1).end = j;

  // Whitespace suppression: if all branches are blank, suppress whitespace output
  const allBlank = sections.every(sec => isBlockBlank(tokens, sec.start, sec.end));

  for (const sec of sections) {
    if (sec.cond === null || evalCondition(sec.cond, ctx)) {
      const result = await render(tokens, ctx, sec.start, sec.end, engine);
      return allBlank && typeof result === "string" && !result.trim() ? "" : result;
    }
  }
  return "";
};

// Handle {% case %} tag: collects when/else sections, matches values with liquidEq.
const handleCase = async (tokens, ctx, i, len, engine) => {
  const caseValue = evalExpr(tokens[i][1].slice(5).trim(), ctx);
  let depth = 1;
  let j = i + 1;
  const sections = [];

  // Collect when/else sections
  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (/^case\s/.test(tagContent)) depth++;
      else if (tagContent === "endcase") { depth--; if (!depth) break; }
      else if (depth === 1 && /^when\s/.test(tagContent)) {
        if (sections.length) sections.at(-1).end = j;
        const whenValues = tagContent.slice(5).split(/\s*,\s*|\s+or\s+/).map(v => {
          v = v.trim();
          return v === "empty" ? EMPTY : v === "blank" ? BLANK : evalExpr(v, ctx);
        });
        sections.push({ type: "w", vals: whenValues, start: j + 1 });
      } else if (depth === 1 && /^else/.test(tagContent)) {
        if (sections.length) sections.at(-1).end = j;
        sections.push({ type: "e", start: j + 1 });
      }
    }
    j++;
  }
  if (sections.length && !sections.at(-1).end) sections.at(-1).end = j;

  const caseBlank = isBlockBlank(tokens, i + 1, j);
  let matched = false;
  let output = "";

  // Find the last else section (Ruby: only the last else runs as fallback)
  let lastElseIdx = -1;
  for (let k = sections.length - 1; k >= 0; k--) {
    if (sections[k].type === "e") { lastElseIdx = k; break; }
  }

  const renderSection = async (sec) => {
    const result = await render(tokens, ctx, sec.start, sec.end, engine);
    if (result?.__ctrl) return result;
    output += rout(result);
  };

  // Run matching when sections (Ruby: all matching whens run, not just first)
  for (let k = 0; k < sections.length; k++) {
    const sec = sections[k];
    const isMatch = sec.type === "w"
      ? sec.vals.some(whenVal => liquidEq(whenVal, caseValue))
      : k !== lastElseIdx; // non-last else sections always run (Ruby quirk)

    if (isMatch) {
      if (sec.type === "w") matched = true;
      const ctrl = await renderSection(sec);
      if (ctrl) return [ctrl, j + 1];
    }
  }

  // Run fallback else if no when matched
  if (!matched && lastElseIdx >= 0) {
    const ctrl = await renderSection(sections[lastElseIdx]);
    if (ctrl) return [ctrl, j + 1];
  }

  return [caseBlank && !output.trim() ? "" : output, j + 1];
};

// Handle {% for %} tag: iterates a collection with forloop variable,
// supports limit/offset/reversed modifiers and else clause.
const handleFor = async (tokens, ctx, i, len, engine) => {
  const match = tokens[i][1].match(/^for\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!match) return ["", i + 1];

  const varName = match[1];
  const rawExpr = match[2].trim();

  // Find endfor and optional else
  let depth = 1;
  let innerIfDepth = 0;
  let j = i + 1;
  let elseIdx = -1;

  while (j < len) {
    if (tokens[j][0] === "g") {
      const tagContent = tokens[j][1];
      if (/^for\s/.test(tagContent) || /^tablerow\s/.test(tagContent)) depth++;
      else if (tagContent === "endfor" || tagContent === "endtablerow") { depth--; if (!depth) break; }
      else if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent) || /^case\s/.test(tagContent)) innerIfDepth++;
      else if (tagContent === "endif" || tagContent === "endunless" || tagContent === "endcase") innerIfDepth--;
      else if (depth === 1 && innerIfDepth === 0 && tagContent === "else") elseIdx = j;
    }
    j++;
  }

  // Parse modifiers: limit, offset, reversed
  let collection;
  let limit;
  let offset = 0;
  let reversed = false;
  let offsetContinue = false;

  let srcExpr = rawExpr.replace(/,/g, " ");
  const limitMatch = srcExpr.match(/\blimit:\s*(\S+)/);
  if (limitMatch) { limit = num(evalExpr(limitMatch[1], ctx)); srcExpr = srcExpr.replace(limitMatch[0], ""); }

  if (/\boffset:\s*continue\b/.test(srcExpr)) { offsetContinue = true; srcExpr = srcExpr.replace(/\boffset:\s*continue\b/, ""); }

  const offsetMatch = srcExpr.match(/\boffset:\s*(\S+)/);
  if (offsetMatch) { offset = +evalExpr(offsetMatch[1], ctx); offsetContinue = false; srcExpr = srcExpr.replace(offsetMatch[0], ""); }

  if (/\breversed\b/.test(srcExpr)) { reversed = true; srcExpr = srcExpr.replace(/\breversed\b/, ""); }
  srcExpr = srcExpr.trim();

  // Evaluate the collection expression
  collection = evalExpr(srcExpr, ctx);
  const isString = typeof collection === "string";

  if (isArr(collection)) { collection = collection.slice(); }
  else if (isString) { collection = collection ? [collection] : []; }
  else if (collection && typeof collection === "object") collection = Object.entries(collection);
  else {
    if (elseIdx >= 0) return [await render(tokens, ctx, elseIdx + 1, j, engine), j + 1];
    return ["", j + 1];
  }

  // Apply offset/limit/reversed (Ruby: slice first, then reverse)
  if (!isString) {
    if (offsetContinue) {
      ctx.__foroffsets ??= {};
      offset = ctx.__foroffsets[varName + ":" + srcExpr] ?? 0;
    }

    if (limit != null && limit < 0) {
      collection = [];
    } else {
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

  // Empty collection: render else clause or nothing
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

  // Build forloop object
  const forloop = { name: varName + "-" + srcExpr, length: collection.length, parentloop: prevForloop };

  for (let k = 0; k < collection.length; k++) {
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
      if (result.__ctrl === "break") break;
      if (result.__ctrl === "continue") continue;
    } else {
      output += result;
    }
  }

  // Post-loop: bump forloop indices so captured references see end-of-loop state
  forloop.index = collection.length + 1;
  forloop.index0 = collection.length;
  forloop.rindex = 0;
  forloop.rindex0 = -1;
  forloop.first = false;
  forloop.last = false;

  ctx.forloop = prevForloop;
  if (hadVar) ctx[varName] = prevVar; else delete ctx[varName];
  return [blank && !output.trim() ? "" : output, j + 1];
};

// Handle {% tablerow %} tag: like for, but wraps output in HTML table rows/cells.
const handleTablerow = async (tokens, ctx, i, len, engine) => {
  const match = tokens[i][1].match(/^tablerow\s+(\w+)\s+in\s+([\s\S]+)$/);
  if (!match) return ["", i + 1];

  const varName = match[1];
  const rawExpr = match[2].trim();

  // Find endtablerow
  let depth = 1;
  let j = i + 1;
  while (j < len) {
    if (tokens[j][0] === "g") {
      if (/^for\s/.test(tokens[j][1]) || /^tablerow\s/.test(tokens[j][1])) depth++;
      else if (tokens[j][1] === "endtablerow" || tokens[j][1] === "endfor") { depth--; if (!depth) break; }
    }
    j++;
  }

  // Parse modifiers
  let collection;
  let limit;
  let offset = 0;

  let srcExpr = rawExpr.replace(/,/g, " ");
  const limitMatch = srcExpr.match(/\blimit:\s*(\S+)/);
  if (limitMatch) { limit = num(evalExpr(limitMatch[1], ctx)); srcExpr = srcExpr.replace(limitMatch[0], ""); }

  const offsetMatch = srcExpr.match(/\boffset:\s*(\S+)/);
  if (offsetMatch) { offset = +evalExpr(offsetMatch[1], ctx); srcExpr = srcExpr.replace(offsetMatch[0], ""); }

  const colsMatch = srcExpr.match(/\bcols:\s*(\S+)/);
  const cols = colsMatch ? (+evalExpr(colsMatch[1], ctx) || 0) : -1;
  if (colsMatch) srcExpr = srcExpr.replace(colsMatch[0], "");

  srcExpr = srcExpr.replace(/\b\w+:\s*\S+/g, "").trim();

  // Evaluate collection
  const rawCollection = evalExpr(srcExpr, ctx);
  const isString = typeof rawCollection === "string";
  if (rawCollection == null || rawCollection === false) return ["", j + 1];

  if (isArr(rawCollection)) collection = rawCollection.slice();
  else if (isString) collection = rawCollection ? [rawCollection] : [];
  else collection = typeof rawCollection === "object" ? Object.values(rawCollection) : [];

  // Apply offset/limit
  if (!isString) {
    if (limit != null && limit < 0) {
      collection = [];
    } else {
      if (offset < 0) {
        offset = offset + collection.length;
        if (offset < 0) collection = [];
        else collection = collection.slice(offset);
      } else if (offset) {
        collection = collection.slice(offset);
      }
      if (limit != null && !isNaN(limit)) collection = collection.slice(0, M.max(0, limit));
    }
  }

  let output = "";
  const prevTablerowloop = ctx.tablerowloop;
  const prevVar = varName in ctx ? ctx[varName] : undefined;
  const hadVar = varName in ctx;

  if (!collection.length) {
    ctx.tablerowloop = prevTablerowloop;
    return ['<tr class="row1">\n</tr>\n', j + 1];
  }

  for (let k = 0; k < collection.length; k++) {
    ctx[varName] = collection[k];
    const col = cols > 0 ? (k % cols) : k;
    const row = cols > 0 ? M.floor(k / cols) + 1 : 1;

    ctx.tablerowloop = {
      first: k === 0, last: k === collection.length - 1,
      index: k + 1, index0: k, length: collection.length,
      rindex: collection.length - k, rindex0: collection.length - k - 1,
      col: col + 1, col0: col, row,
      col_first: col === 0,
      col_last: cols > 0 ? col === cols - 1 : cols < 0 && k === collection.length - 1
    };

    if (col === 0) output += `<tr class="row${row}">` + (k === 0 ? "\n" : "");

    const result = await render(tokens, ctx, i + 1, j, engine);
    const cellValue = rout(result);
    output += `<td class="col${col + 1}">${cellValue}</td>`;

    if (result?.__ctrl === "break") { output += "</tr>\n"; break; }
    if (result?.__ctrl === "continue") {
      if ((cols > 0 && col === cols - 1) || k === collection.length - 1) output += "</tr>\n";
      continue;
    }
    if ((cols > 0 && col === cols - 1) || k === collection.length - 1) output += "</tr>\n";
  }

  ctx.tablerowloop = prevTablerowloop;
  if (hadVar) ctx[varName] = prevVar; else delete ctx[varName];
  return [output, j + 1];
};

// Handle {% cycle %} tag: cycles through values, optionally keyed by a group name.
// Unnamed cycles with variable arguments use position-based keys to avoid collisions.
const handleCycle = (args, ctx, tokenPos) => {
  ctx.__cycles ??= {};

  let valuesStr;
  let group;
  let colonIdx = -1;
  let quote = 0;

  // Find the first unquoted colon (separates group name from values)
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if ((ch === '"' || ch === "'") && !quote) quote = ch;
    else if (ch === quote) quote = 0;
    if (!quote && ch === ":") { colonIdx = i; break; }
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

  // For unnamed cycles with variable references, use token position as key
  // to avoid different cycle calls sharing state
  if (!colonIdx || colonIdx < 0) {
    let hasVariable = 0;
    let vq = 0;
    for (const ch of valuesStr) {
      if ((ch === '"' || ch === "'") && !vq) vq = ch;
      else if (ch === vq) vq = 0;
      else if (!vq && /[a-zA-Z_]/.test(ch)) { hasVariable = 1; break; }
    }
    if (hasVariable) group = "\0" + tokenPos;
  }

  let values = valuesStr.split(",").map(v => evalExpr(v.trim(), ctx));
  while (values.length > 1 && values.at(-1) == null) values.pop();

  ctx.__cycles[group] ??= 0;
  const idx = ctx.__cycles[group] % values.length;
  ctx.__cycles[group]++;
  return values[idx] ?? "";
};

// Handle {% liquid %} tag: wraps each line in {% %} and re-tokenizes/renders.
const handleLiquid = async (body, ctx, engine) => {
  const wrappedSrc = body.split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `{% ${line} %}`)
    .join("");
  const liquidTokens = tokenize(wrappedSrc);
  return await render(liquidTokens, ctx, 0, liquidTokens.length, engine);
};

// Main render loop: walks tokens and dispatches to tag handlers.
// Returns a string for normal output, or an object {__ctrl, out} for break/continue.
const render = async (tokens, ctx, start, end, engine) => {
  let output = "";
  let i = start ?? 0;
  const len = end ?? tokens.length;

  while (i < len) {
    const token = tokens[i];

    // Text token: append directly
    if (token[0] === "t") {
      output += token[1];
      i++;

    // Output token {{ }}: evaluate and stringify
    } else if (token[0] === "o") {
      output += stringify(await evalOutput(token[1], ctx, engine));
      i++;

    // Tag token {% %}
    } else if (token[0] === "g") {
      const tag = token[1];
      let m;

      // --- if ---
      if (/^if\s/.test(tag)) {
        const endIdx = findEndIf(tokens, i, len);
        const result = await handleIf(tokens, ctx, i, len, engine);
        if (result?.__ctrl) { result.out = output + (result.out ?? ""); return result; }
        output += result;
        i = endIdx + 1;

      // --- unless ---
      } else if (/^unless\s/.test(tag)) {
        const condition = tag.slice(7).trim();
        const sections = [{ cond: condition, negate: true, start: i + 1 }];
        let depth = 1, j = i + 1, commentDepth = 0;

        while (j < len) {
          if (tokens[j][0] === "g") {
            const tagContent = tokens[j][1];
            if (tagContent === "comment" || tagContent === "doc" || tagContent === "raw") commentDepth++;
            else if (tagContent === "endcomment" || tagContent === "enddoc" || tagContent === "endraw") commentDepth--;
            else if (!commentDepth) {
              if (/^if\s/.test(tagContent) || /^unless\s/.test(tagContent)) depth++;
              else if (tagContent === "endif" || tagContent === "endunless") {
                depth--;
                if (!depth) { sections.at(-1).end = j; break; }
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
        if (!sections.at(-1).end) sections.at(-1).end = j;

        const allBlank = sections.every(sec => isBlockBlank(tokens, sec.start, sec.end));
        let result;
        for (const sec of sections) {
          const matches = sec.cond === null || (sec.negate ? !evalCondition(sec.cond, ctx) : evalCondition(sec.cond, ctx));
          if (matches) { result = await render(tokens, ctx, sec.start, sec.end, engine); break; }
        }
        if (result != null) {
          if (result?.__ctrl) { result.out = output + (result.out ?? ""); return result; }
          if (allBlank && typeof result === "string" && !result.trim()) result = "";
          output += result;
        }
        i = j + 1;

      // --- case ---
      } else if (/^case\s/.test(tag)) {
        const result = await handleCase(tokens, ctx, i, len, engine);
        if (result[0]?.__ctrl) { result[0].out = output + (result[0].out ?? ""); return result[0]; }
        output += result[0];
        i = result[1];

      // --- for ---
      } else if (/^for\s/.test(tag)) {
        const result = await handleFor(tokens, ctx, i, len, engine);
        output += result[0];
        i = result[1];

      // --- tablerow ---
      } else if (/^tablerow\s/.test(tag)) {
        const result = await handleTablerow(tokens, ctx, i, len, engine);
        output += result[0];
        i = result[1];

      // --- assign ---
      } else if ((m = tag.match(/^assign\s+([\s\S]+)$/))) {
        const parts = m[1].match(/^(\w[\w.-]*)\s*=\s*([\s\S]+)$/);
        if (parts) {
          ctx[parts[1]] = await evalOutput(parts[2], ctx, engine, 1);
          ctx.__assigns ??= new Set();
          ctx.__assigns.add(parts[1]);
        }
        i++;

      // --- capture ---
      } else if ((m = tag.match(/^capture\s+['"]?(\w[\w.-]*)['"]?$/))) {
        const captureName = m[1];
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            if (tokens[j][1] === "endcapture") { depth--; if (!depth) break; }
            else if (/^capture\s/.test(tokens[j][1])) depth++;
          }
          j++;
        }
        const result = await render(tokens, ctx, i + 1, j, engine);
        ctx[captureName] = rout(result);
        if (result?.__ctrl) { result.out = output; return result; }
        i = j + 1;

      // --- comment / doc ---
      } else if (tag === "comment" || tag === "doc") {
        const isComment = tag === "comment";
        const endTag = isComment ? "endcomment" : "enddoc";
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            const tagContent = tokens[j][1];
            if (tagContent === endTag) { depth--; if (!depth) break; }
            else if (tagContent === (isComment ? "comment" : "doc")) depth++;
          }
          j++;
        }
        i = j + 1;

      // --- raw ---
      } else if (tag === "raw") {
        let j = i + 1;
        while (j < len) { if (tokens[j][0] === "g" && tokens[j][1] === "endraw") break; j++; }
        for (let k = i + 1; k < j; k++) {
          const rawToken = tokens[k];
          if (rawToken[0] === "t") output += rawToken[1];
          else if (rawToken[0] === "o") output += `{{${rawToken[3] ? "-" : ""} ${rawToken[1]} ${rawToken[2] ? "-" : ""}}}`;
          else if (rawToken[0] === "g") output += `{%${rawToken[3] ? "-" : ""} ${rawToken[1]} ${rawToken[2] ? "-" : ""}%}`;
        }
        i = j + 1;

      // --- increment ---
      } else if ((m = tag.match(/^increment\s+(\w+)$/))) {
        ctx.__counters ??= {};
        ctx.__counters[m[1]] ??= 0;
        output += ctx.__counters[m[1]]++;
        i++;

      // --- decrement ---
      } else if ((m = tag.match(/^decrement\s+(\w+)$/))) {
        ctx.__counters ??= {};
        ctx.__counters[m[1]] ??= 0;
        output += --ctx.__counters[m[1]];
        i++;

      // --- cycle ---
      } else if ((m = tag.match(/^cycle\s*([\s\S]+)$/))) {
        output += handleCycle(m[1], ctx, i);
        i++;

      // --- echo ---
      } else if ((m = tag.match(/^echo\s+([\s\S]+)$/))) {
        output += stringify(await evalOutput(m[1], ctx, engine));
        i++;

      // --- liquid ---
      } else if ((m = tag.match(/^liquid\s*([\s\S]*)$/))) {
        const liquidResult = await handleLiquid(m[1], ctx, engine);
        if (liquidResult?.__ctrl) { liquidResult.out = output + (liquidResult.out ?? ""); return liquidResult; }
        output += typeof liquidResult === "string" ? liquidResult : rout(liquidResult);
        i++;

      // --- ifchanged ---
      } else if (tag === "ifchanged") {
        let depth = 1, j = i + 1;
        while (j < len) {
          if (tokens[j][0] === "g") {
            if (tokens[j][1] === "endifchanged") { depth--; if (!depth) break; }
            else if (tokens[j][1] === "ifchanged") depth++;
          }
          j++;
        }
        const result = await render(tokens, ctx, i + 1, j, engine);
        const renderedValue = rout(result);
        if (renderedValue !== ctx.__lastIfchanged) {
          output += renderedValue;
          ctx.__lastIfchanged = renderedValue;
        }
        if (result?.__ctrl) { result.out = output; return result; }
        i = j + 1;

      // --- break / continue ---
      } else if (tag === "break" || tag === "continue") {
        return { __ctrl: tag, out: output };

      // --- custom tags (extensions) ---
      } else if (engine._tags) {
        const tagWord = tag.split(/\s/)[0];
        const handler = engine._tags[tagWord];
        if (handler) {
          const result = await handler(tag, tokens, ctx, i, len, engine);
          if (result?.__ctrl) { result.out = output + (result.out ?? ""); return result; }
          if (isArr(result)) { output += result[0]; i = result[1]; }
          else { output += result ?? ""; i++; }
        } else { i++; }
      } else { i++; }

    } else { i++; }
  }

  return output;
};

export { render };
