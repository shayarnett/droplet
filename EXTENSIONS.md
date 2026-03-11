# Droplet Extensions (Future)

247 spec tests are currently skipped because they require features outside core:

| Feature | Tests | Extension |
|---------|-------|-----------|
| filesystem (partials) | 136 | `ext/partials.js` — `{% include %}`, `{% render %}` with template loader |
| instantiate (drops) | 101 | `ext/drops.js` — Ruby Drop object protocol |
| ruby_types | 16 | `ext/ruby-types.js` — Symbol/BigDecimal handling |
| inline_errors | 2 | `ext/inline-errors.js` — Render errors inline |
| lax_parsing | 2 | `ext/lax-parsing.js` — Lenient parse mode |

## Architecture

Add `registerTag(name, handler)` to core (like `registerFilter`). Extensions are functions that register tags/behaviors:

```js
const Droplet = require("./droplet");
const partials = require("./ext/partials");

const engine = new Droplet();
partials(engine, { "header": "<h1>Hi</h1>" });
engine.parseAndRender("{% include 'header' %}");
```

Tag handlers receive `(tokens, ctx, i, len, engine)` and return `[output, nextIndex]`.
