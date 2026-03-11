# Droplet

The smallest Liquid template engine for JavaScript. **~27 KB** minified.

Droplet implements the [Liquid](https://shopify.github.io/liquid/) template language used by Shopify, Jekyll, and many others. It's async-only, runs anywhere JavaScript does, and stays small enough to embed in edge workers, browser bundles, or CLI tools.

## Install

```
npm install @shayarnett/droplet --registry=https://npm.pkg.github.com
```

Or add the registry to your `.npmrc` once and install normally:

```
echo "@shayarnett:registry=https://npm.pkg.github.com" >> .npmrc
npm install @shayarnett/droplet
```

## Quick Start

```js
const Droplet = require("./droplet");

const engine = new Droplet();
const html = await engine.parseAndRender("Hello {{ name }}!", { name: "World" });
// => "Hello World!"
```

## Migrating from LiquidJS

Swap your import for the compatibility shim and everything keeps working:

```js
// Before (LiquidJS):
// const { Liquid } = require("liquidjs");

// After (Droplet):
const { Liquid } = require("./ext/liquid-compat");
```

All the APIs you're used to work the same — `parse()`, `render()`, `parseAndRender()`, `renderFile()`, `parseFile()`, `registerFilter()`, `registerTag()`, `plugin()`, `express()`, `setTemplate()`. Sync methods (`parseAndRenderSync`, `renderSync`, etc.) throw with migration hints pointing you to the async equivalent.

Once migrated, you can gradually move to the native Droplet API for a smaller footprint.

## API

### `new Droplet(options?)`

Create an engine instance. Options:

| Option | Type | Description |
|--------|------|-------------|
| `globals` | `object` | Variables merged into every render context |
| `cache` | `boolean` | Cache parsed templates |
| `strictFilters` | `boolean` | Throw on unknown filters |
| `strictVariables` | `boolean` | Throw on undefined variables |

### `engine.parseAndRender(template, context?) → Promise<string>`

Parse and render a template string with the given context object.

```js
await engine.parseAndRender("{{ items | size }} items", { items: [1, 2, 3] });
// => "3 items"
```

### `engine.registerFilter(name, fn)`

Register a custom filter.

```js
engine.registerFilter("shout", (v) => String(v).toUpperCase() + "!!!");
await engine.parseAndRender("{{ 'hello' | shout }}");
// => "HELLO!!!"
```

### `engine.registerTag(name, handler)`

Register a custom tag. The handler receives `(tagContent, tokens, ctx, i, len, engine)` and returns the output string.

```js
engine.registerTag("now", async () => new Date().toISOString());
await engine.parseAndRender("{% now %}");
// => "2026-03-10T..."
```

## Extensions

Droplet keeps the core small. Optional extensions add features you opt into.

### Partials (`ext/partials.js`)

Adds `{% include %}` and `{% render %}` support with in-memory templates.

```js
const Droplet = require("./droplet");
const partials = require("./ext/partials");

const engine = new Droplet();
const templates = {
  header: "<h1>{{ title }}</h1>",
  footer: "<p>{{ year }} {{ site }}</p>",
};
partials(engine, templates);

await engine.parseAndRender("{% render 'header', title: 'Hi' %}");
// => "<h1>Hi</h1>"
```

Add templates at runtime:

```js
engine._fs["sidebar"] = "<nav>{{ links }}</nav>";
```

### Inline Errors (`ext/inline-errors.js`)

Renders errors inline instead of throwing, matching Ruby Liquid's `render_errors` mode.

```js
const inlineErrors = require("./ext/inline-errors");
inlineErrors(engine);
```

## Build

```bash
bun run build    # bundle src/ → droplet.js, then minify → droplet.min.js
bun run size     # print min/gzip/brotli sizes
bun test.js      # run unit tests
```

Source lives in `src/` as ES modules, bundled by [bun](https://bun.sh/) into a single CJS file, then minified by [terser](https://terser.org/).

## Spec Compliance

Droplet is tested against the [liquid-spec](https://github.com/Shopify/liquid-spec) test suite — 5,000+ tests covering Liquid Ruby, Shopify production recordings, and lax parsing.

```
bun spec-runner.js
```

Current results:

```
Basics ......................... 707/713 passed
Liquid Ruby .................... 1368/1694 passed
Shopify Production Recordings .. 2192/2610 passed
Liquid Ruby (Lax Mode) ......... 96/102 passed

Total: 4363 passed (85.2%)
```


## Supported Liquid Features

**Tags:** `if`/`elsif`/`else`/`unless`, `case`/`when`, `for`/`break`/`continue`, `tablerow`, `assign`, `capture`, `increment`/`decrement`, `comment`, `raw`, `liquid`, `echo`, `render`, `include`

**Operators:** `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains`, `and`, `or`

**Filters:** All standard Liquid filters including `abs`, `append`, `at`, `base64_decode`, `base64_encode`, `capitalize`, `ceil`, `compact`, `concat`, `date`, `default`, `divided_by`, `downcase`, `escape`, `escape_once`, `first`, `floor`, `join`, `last`, `lstrip`, `map`, `minus`, `modulo`, `newline_to_br`, `plus`, `prepend`, `remove`, `remove_first`, `remove_last`, `replace`, `replace_first`, `replace_last`, `reverse`, `round`, `rstrip`, `size`, `slice`, `sort`, `sort_natural`, `split`, `strip`, `strip_html`, `strip_newlines`, `sum`, `times`, `truncate`, `truncatewords`, `uniq`, `upcase`, `url_decode`, `url_encode`, `where`, `find`

## License

MIT
