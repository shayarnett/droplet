# Agents Guide: Using liquid-spec for Comprehensive Coverage

This document explains how AI agents (and humans) can use the `liquid-spec` test suite to systematically improve Droplet's Liquid compliance.

## Repository Structure

```
droplet.js              # Core engine (~49 KB source, ~28 KB minified)
droplet.min.js          # Minified build
ext/
  partials.js           # {% include %} and {% render %} support
  inline-errors.js      # Render errors inline instead of throwing
  liquid-compat.js      # LiquidJS API compatibility shim
spec-runner.js          # Runs all liquid-spec suites against Droplet
test.js                 # Unit tests for core engine
liquid-spec/            # Git submodule with YAML test specs
  specs/
    basics/             # Fundamental Liquid feature tests
    liquid_ruby/        # Full Ruby Liquid test suite (1694 tests)
    liquid_ruby_lax/    # Lax parsing mode tests (102 tests)
    shopify_production_recordings/  # Real Shopify template recordings (2610 tests)
```

## Test Suite Format

Each YAML file contains an array of test specs:

```yaml
- name: "test description"
  template: "{{ x | plus: 1 }}"
  environment:
    x: 5
  expected: "6"
  filesystem:           # optional: templates for {% render %} / {% include %}
    snippet: "hello"
  required_features:    # optional: features needed (drops, etc.)
    - instantiate
```

Some files use a wrapper format:

```yaml
_metadata:
  required_features: [instantiate]
specs:
  - name: "..."
    template: "..."
```

## Running the Spec Suite

```bash
bun spec-runner.js        # Summary output
bun spec-runner.js -v     # Verbose: show all failures with templates/expected/got
```

The runner loads specs from all suites, sets up the filesystem for partials, and compares rendered output against expected strings.

## Workflow for Fixing Failures

### Step 1: Identify Failure Categories

Run verbose and pipe to a file:

```bash
bun spec-runner.js -v > failures.txt 2>&1
```

Group failures by file to find patterns:

```bash
grep "Failures by file" -A 50 failures.txt
```

### Step 2: Analyze a Specific Category

Write a targeted analysis script. Example:

```js
// analyze-category.js
const yaml = require("js-yaml");
const fs = require("fs");
const Droplet = require("./droplet");
const partials = require("./ext/partials");

const engine = new Droplet();
partials(engine, {});

// Load one spec file
const specs = yaml.load(fs.readFileSync("liquid-spec/specs/liquid_ruby/filters.yml", "utf8"));
const items = Array.isArray(specs) ? specs : specs?.specs || [];

for (const spec of items) {
  if (!spec?.template || spec.expected === undefined) continue;
  engine._fs = spec.filesystem || {};
  const result = await engine.parseAndRender(spec.template, spec.environment || {});
  if (result !== spec.expected) {
    console.log(`FAIL: ${spec.name}`);
    console.log(`  template: ${spec.template}`);
    console.log(`  expected: ${spec.expected}`);
    console.log(`  got:      ${result}`);
  }
}
```

### Step 3: Fix the Engine

Common fix locations in `droplet.js`:

| Area | What to look for |
|------|-----------------|
| **Filters** | Search for the filter name in the `filters` object (~line 50-200) |
| **Tag handling** | The render loop's tag dispatch (~line 300-500) |
| **Expression evaluation** | `evalExpr` and `evalOutput` functions |
| **Tokenizer** | `tokenize` function at the top |
| **String output** | `stringify` and `rout` functions |

### Step 4: Rebuild and Test

```bash
npm run build             # Minify
bun test.js               # Unit tests
bun spec-runner.js        # Full spec suite
wc -c droplet.min.js      # Check size hasn't ballooned
```

## Key Patterns for Agents

### YAML Parsing Gotchas

The spec files use Ruby YAML types that need custom handling:

```js
const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type("!binary", { kind: "scalar", construct: d => Buffer.from(d, "base64").toString() }),
  new yaml.Type("!ruby/object:BigDecimal", { kind: "scalar", construct: d => parseFloat(d) }),
  new yaml.Type("!ruby/object:Liquid::Spec::ErrorDrop", { kind: "mapping", construct: d => d }),
]);
```

Some YAML files fail to parse as a whole — use the `parseYamlRobust` pattern from `spec-runner.js` to split and parse chunks individually.

### Ruby Symbol Conversion

Test environments may contain Ruby symbols (`:foo`) that need converting to plain strings:

```js
const convertSymbols = v => {
  if (typeof v === "string" && /^:[a-zA-Z_]\w*$/.test(v)) return v.slice(1);
  if (Array.isArray(v)) return v.map(convertSymbols);
  if (v && typeof v === "object") {
    const r = {};
    for (const [k, val] of Object.entries(v)) r[k] = convertSymbols(val);
    return r;
  }
  return v;
};
```

### Known Unfixable Categories

Some failures are inherent to JS vs Ruby differences. Don't spend time on these:

- **`required_features: [instantiate]`** — Ruby Drop objects with method dispatch. Would need a full Drop protocol implementation.
- **`materialized_drops.yml`** — Same as above, requires Drop support.
- **Big number precision** — Ruby handles arbitrary-precision integers; JS has 64-bit floats. Numbers >2^53 will differ.
- **Ruby hash format** — `{"a"=>"b"}` output format doesn't exist in JS.
- **Range objects** — Ruby `(1..5)` as first-class values.

### High-Value Fix Targets

Focus on these for maximum test gains:

1. **Filter edge cases** — Small fixes to existing filters often fix 5-20 tests each.
2. **Whitespace handling** — `{% raw -%}`, `{%- tag %}` trimming variations.
3. **Expression parsing** — Bracket access, nested property chains, range literals in for loops.
4. **Error handling** — Some tests expect `Liquid error: ...` inline output rather than thrown exceptions.

### Size Budget

The primary constraint is **minified size** (not gzip). Current: ~28 KB. Every fix should be weighed against bytes added. Run `wc -c droplet.min.js` after each build.

## Extension Development

To add a new extension:

1. Create `ext/your-extension.js`
2. Export a function that takes `(engine, ...args)` and calls `engine.registerTag()` / `engine.registerFilter()`
3. Load it in `spec-runner.js` to verify test improvements
4. Document it in README.md

Example extension skeleton:

```js
// ext/my-extension.js
module.exports = function(engine) {
  engine.registerTag("mytag", async (tag, tokens, ctx, i, len, engine) => {
    const args = tag.slice("mytag".length).trim();
    return `output for ${args}`;
  });
};
```

## Internals Reference

`Droplet._internals` exposes:

| Export | Purpose |
|--------|---------|
| `tokenize(src)` | Parse template string → token array |
| `render(tokens, ctx, start, end, engine)` | Render token range → result array |
| `rout(result)` | Flatten result array → output string |
| `evalOutput(expr, ctx)` | Evaluate `{{ expr \| filters }}` |
| `evalExpr(expr, ctx)` | Evaluate a single expression (variable lookup, literal) |
| `stringify(value)` | Convert value to Liquid output string |
| `evalCondition(expr, ctx)` | Evaluate a boolean condition |
