// Maps block-opening tags to their closing tags (comma-separated when multiple apply)
const BLOCK_END_TAGS = {
  "if": "endif,endunless",
  "unless": "endif,endunless",
  "for": "endfor,endtablerow",
  "tablerow": "endfor,endtablerow",
  "case": "endcase",
  "capture": "endcapture",
  "comment": "endcomment",
  "doc": "enddoc"
};

// Returns true if a token range contains only whitespace and non-output tags.
// Used for whitespace suppression: if an entire if/for/case block is "blank",
// its whitespace-only output is collapsed to "".
const isBlockBlank = (tokens, start, end) => {
  for (let i = start; i < end; ) {
    const token = tokens[i];

    // Output tags ({{ }}) are never blank
    if (token[0] === "o") return false;

    // Text tokens: blank only if all whitespace
    if (token[0] === "t") {
      if (token[1].trim()) return false;
      i++;
      continue;
    }

    // Tag tokens ({% %})
    const tagContent = token[1];
    const tagWord = tagContent.split(/\s/)[0];

    // These tags produce visible output, so not blank
    if (/^(cycle|echo|increment|decrement)$/.test(tagWord) || tagContent === "raw") return false;

    // For block tags, find the matching end tag and recurse into the body
    const endTags = BLOCK_END_TAGS[tagWord];
    if (endTags) {
      const endTagSet = endTags.split(",");
      let depth = 1;
      let j = i + 1;
      while (j < end) {
        if (tokens[j][0] === "g") {
          const innerTagWord = tokens[j][1].split(/\s/)[0];
          if (innerTagWord === tagWord) depth++;
          else if (endTagSet.includes(innerTagWord)) {
            if (!--depth) break;
          }
        }
        j++;
      }
      // comment/doc/capture bodies are always blank; others must be checked recursively
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

// Strips trailing whitespace from the last text token (for {%- / {{- lstrip)
const lstripLastToken = (tokens) => {
  const lastToken = tokens.at(-1);
  if (lastToken[0] === "t") {
    lastToken[1] = lastToken[1].replace(/\s+$/, "");
  }
};

// Advances position past any leading whitespace (for -%} / -}} rstrip)
const skipWhitespace = (src, pos) => {
  while (pos < src.length && " \t\n\r".includes(src[pos])) pos++;
  return pos;
};

const tokenize = (src) => {
  const tokens = [];
  let pos = 0;

  while (pos < src.length) {
    const openBrace = src.indexOf("{", pos);

    // No more braces — rest is plain text
    if (openBrace < 0) {
      tokens.push(["t", src.slice(pos)]);
      break;
    }

    // Text before the brace
    if (openBrace > pos) {
      tokens.push(["t", src.slice(openBrace > pos ? pos : pos, openBrace)]);
    }

    let trailingStripWs = false;

    if (src[openBrace + 1] === "{") {
      // ---- Output tag: {{ ... }} ----
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

      if (leadingStrip && tokens.length) lstripLastToken(tokens);

      tokens.push(["o", inner.trim(), trailingStrip, leadingStrip]);
      pos = closeIdx + 2;

    } else if (src[openBrace + 1] === "%") {
      // ---- Logic tag: {% ... %} ----
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

      if (leadingStrip && tokens.length) lstripLastToken(tokens);

      tokens.push(["g", tagName, trailingStrip, leadingStrip]);
      pos = closeIdx + 2;

      // Special handling for {% raw %}: scan for literal {% endraw %}
      if (tagName === "raw") {
        const endrawPattern = /\{%-?\s*endraw\s*-?%\}/;
        const match = src.slice(pos).match(endrawPattern);
        if (match) {
          const rawContent = src.slice(pos, pos + match.index);
          if (rawContent) tokens.push(["t", rawContent]);

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
      // Lone { that isn't {{ or {% — emit as text
      tokens.push(["t", "{"]);
      pos = openBrace + 1;
    }

    // Rstrip: if the last token had trailing whitespace control, skip leading whitespace
    if (tokens.at(-1)?.[2]) trailingStripWs = true;
    if (trailingStripWs && pos < src.length) {
      pos = skipWhitespace(src, pos);
    }
  }

  return tokens;
};

export { BLOCK_END_TAGS as BB, isBlockBlank, tokenize };
