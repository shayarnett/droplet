// test-e2e.js — Integration / end-to-end tests for Droplet as a consumer would use it
// Exercises: core API, extensions (partials, inline-errors, liquid-compat), custom tags/filters

const Droplet = require("./droplet");
const partials = require("./ext/partials");
const inlineErrors = require("./ext/inline-errors");
const { Liquid } = require("./ext/liquid-compat");

let pass = 0, fail = 0, section = "";
const eq = (a, b, msg) => {
  if (a === b) pass++;
  else { fail++; console.log(`FAIL [${section}]: ${msg}\n  got: ${JSON.stringify(a)}\n  exp: ${JSON.stringify(b)}`); }
};

(async () => {
  // ─── Core API ───

  section = "core";

  // Basic construction and render
  const engine = new Droplet();
  eq(await engine.parseAndRender("Hello {{ name }}!", { name: "World" }), "Hello World!", "basic render");

  // Options stored on engine
  const gEngine = new Droplet({ myopt: "val" });
  eq(gEngine.options.myopt, "val", "options stored on engine");

  // Multiple renders share nothing (stateless)
  eq(await engine.parseAndRender("{% assign x = 1 %}{{ x }}"), "1", "assign render 1");
  eq(await engine.parseAndRender("{{ x }}"), "", "assign doesn't leak between renders");

  // Increment/decrement state within a single render
  eq(await engine.parseAndRender("{% increment c %}{% increment c %}{% increment c %}"), "012", "increment within render");

  // Nested data access
  eq(await engine.parseAndRender("{{ a.b.c }}", { a: { b: { c: "deep" } } }), "deep", "deep dot access");
  eq(await engine.parseAndRender("{{ a[0].name }}", { a: [{ name: "first" }] }), "first", "array dot access");

  // ─── Custom Filters ───

  section = "custom filters";

  const fEngine = new Droplet();
  fEngine.registerFilter("double", (v) => (+v) * 2);
  eq(await fEngine.parseAndRender("{{ 5 | double }}"), "10", "custom filter");

  // Filter chaining with builtin
  fEngine.registerFilter("exclaim", (v) => v + "!");
  eq(await fEngine.parseAndRender("{{ 'hi' | upcase | exclaim }}"), "HI!", "custom + builtin chain");

  // Filter with arguments
  fEngine.registerFilter("repeat", (v, times) => String(v).repeat(+times));
  eq(await fEngine.parseAndRender("{{ 'ab' | repeat: 3 }}"), "ababab", "filter with args");

  // Async filter
  fEngine.registerFilter("async_upper", async (v) => String(v).toUpperCase());
  eq(await fEngine.parseAndRender("{{ 'hello' | async_upper }}"), "HELLO", "async filter");

  // Filter with engine context (this = engine options)
  const ctxEngine = new Droplet({ locale: "en" });
  ctxEngine.registerFilter("greet", function(name) {
    return this.locale === "en" ? `Hello ${name}` : `Hola ${name}`;
  });
  eq(await ctxEngine.parseAndRender("{{ 'Alice' | greet }}"), "Hello Alice", "filter with engine context");

  // ─── Custom Tags ───

  section = "custom tags";

  const tEngine = new Droplet();
  tEngine.registerTag("shout", async (tag) => {
    const text = tag.slice(5).trim();
    return text.toUpperCase();
  });
  eq(await tEngine.parseAndRender("{% shout hello world %}"), "HELLO WORLD", "custom tag");

  // Async custom tag
  tEngine.registerTag("delayed", async (tag) => {
    return "resolved";
  });
  eq(await tEngine.parseAndRender("{% delayed %}"), "resolved", "async custom tag");

  // ─── Partials Extension ───

  section = "partials";

  const pEngine = new Droplet();
  partials(pEngine, {
    header: "<h1>{{ title }}</h1>",
    item: "{{ item }}",
    nav: "{% render 'item', item: 'home' %} {% render 'item', item: 'about' %}",
    counter: "{% increment x %}",
    loop_item: "{{ val }}-{{ forloop.index }}",
  });

  // render with params
  eq(await pEngine.parseAndRender("{% render 'header', title: 'Hi' %}"), "<h1>Hi</h1>", "render with params");

  // render isolates scope
  eq(await pEngine.parseAndRender("{% assign title = 'Outer' %}{% render 'header', title: 'Inner' %}{{ title }}"), "<h1>Inner</h1>Outer", "render scope isolation");

  // render with for
  eq(await pEngine.parseAndRender("{% render 'loop_item' for items as val %}", { items: ["a", "b"] }), "a-1b-2", "render for loop");

  // render with (single value binding)
  eq(await pEngine.parseAndRender("{% render 'item' with 'solo' %}"), "solo", "render with");

  // nested render
  eq(await pEngine.parseAndRender("{% render 'nav' %}"), "home about", "nested render");

  // include shares scope
  eq(await pEngine.parseAndRender("{% include 'header', title: 'Shared' %}{{ title }}"), "<h1>Shared</h1>Shared", "include shares scope");

  // Dynamic filesystem update
  pEngine._fs["dynamic"] = "I am dynamic";
  eq(await pEngine.parseAndRender("{% render 'dynamic' %}"), "I am dynamic", "dynamic fs update");

  // ─── Inline Errors Extension ───

  section = "inline-errors";

  const eEngine = new Droplet();
  inlineErrors(eEngine);

  // Errors render inline instead of throwing
  const errResult = await eEngine.parseAndRender("{% if %}yes{% endif %}");
  eq(typeof errResult, "string", "inline error returns string instead of throwing");

  // Valid template still works normally
  eq(await eEngine.parseAndRender("{{ 'hello' | upcase }}"), "HELLO", "inline-errors doesn't break valid templates");

  // ─── Liquid-Compat Extension ───

  section = "liquid-compat";

  // LiquidJS-compatible API
  const liq = new Liquid({ globals: { site: "Test" } });
  eq(await liq.parseAndRender("Hello {{ site }}!"), "Hello Test!", "compat parseAndRender");

  // parse + render (two-step)
  const tpl = liq.parse("{{ x | upcase }}");
  eq(await liq.render(tpl, { x: "hi" }), "HI", "compat parse + render");

  // registerFilter
  liq.registerFilter("rev", (v) => String(v).split("").reverse().join(""));
  eq(await liq.parseAndRender("{{ 'abc' | rev }}"), "cba", "compat registerFilter");

  // registerTag (function-style passthrough)
  liq.registerTag("stamp", async (tag) => "STAMPED");
  eq(await liq.parseAndRender("{% stamp %}"), "STAMPED", "compat registerTag");

  // setTemplate + render partial
  liq.setTemplate("greeting", "Hi {{ who }}!");
  eq(await liq.parseAndRender("{% render 'greeting', who: 'there' %}"), "Hi there!", "compat setTemplate + render");

  // Sync methods throw with migration hints
  let syncErr = "";
  try { liq.parseAndRenderSync("test"); } catch (e) { syncErr = e.message; }
  eq(syncErr.includes("async-only"), true, "sync methods throw migration hint");

  // renderFile with in-memory template
  liq.setTemplate("page", "Page: {{ title }}");
  eq(await liq.renderFile("page", { title: "About" }), "Page: About", "compat renderFile");

  // plugin API
  let pluginCalled = false;
  liq.plugin(function(engine) { pluginCalled = true; });
  eq(pluginCalled, true, "compat plugin()");

  // Cache mode
  const cacheLiq = new Liquid({ cache: true });
  eq(await cacheLiq.parseAndRender("{{ 1 | plus: 2 }}"), "3", "compat cache mode");
  eq(await cacheLiq.parseAndRender("{{ 1 | plus: 2 }}"), "3", "compat cache hit");

  // ─── Complex Templates ───

  section = "complex";

  // Real-world-ish template
  const products = [
    { title: "Widget", price: 9.99, active: true },
    { title: "Gadget", price: 24.50, active: false },
    { title: "Doohickey", price: 4.99, active: true },
  ];
  const tmpl = `{% assign active = products | where: 'active' %}{% for p in active %}{{ p.title }}: {{ p.price }}{% unless forloop.last %}, {% endunless %}{% endfor %}`;
  eq(await engine.parseAndRender(tmpl, { products }), "Widget: 9.99, Doohickey: 4.99", "real-world product list");

  // Nested control flow
  const nested = `{% for i in (1..3) %}{% case i %}{% when 1 %}one{% when 2 %}two{% else %}other{% endcase %} {% endfor %}`;
  eq(await engine.parseAndRender(nested), "one two other ", "nested for + case");

  // Capture + filters
  eq(await engine.parseAndRender("{% capture greeting %}Hello {{ name }}{% endcapture %}{{ greeting | upcase }}", { name: "world" }),
    "HELLO WORLD", "capture + filter");

  // Tablerow
  eq(await engine.parseAndRender("{% tablerow i in (1..3) cols:3 %}{{ i }}{% endtablerow %}"),
    '<tr class="row1">\n<td class="col1">1</td><td class="col2">2</td><td class="col3">3</td></tr>\n',
    "tablerow");

  // Whitespace control in complex template
  eq(await engine.parseAndRender("a {%- assign x = 'hi' -%} {{ x }}"), "ahi", "whitespace control trims both sides");

  // For loop with else
  eq(await engine.parseAndRender("{% for x in empty %}{{ x }}{% else %}none{% endfor %}", { empty: [] }), "none", "for else on empty");

  // Blank/empty handling
  eq(await engine.parseAndRender("{{ x | default: 'n/a' }}", {}), "n/a", "default on missing var");
  eq(await engine.parseAndRender("{{ '' | default: 'n/a' }}"), "n/a", "default on empty string");
  eq(await engine.parseAndRender("{{ false | default: 'n/a' }}"), "n/a", "default on false");

  // ─── Edge Cases ───

  section = "edge cases";

  // Empty template
  eq(await engine.parseAndRender(""), "", "empty template");

  // Template with only whitespace
  eq(await engine.parseAndRender("   "), "   ", "whitespace-only template");

  // Nil output
  eq(await engine.parseAndRender("{{ nil }}"), "", "nil renders empty");
  eq(await engine.parseAndRender("{{ novar }}"), "", "undefined var renders empty");

  // Boolean output
  eq(await engine.parseAndRender("{{ true }}"), "true", "true renders as string");
  eq(await engine.parseAndRender("{{ false }}"), "false", "false renders as string");

  // Numeric edge cases
  eq(await engine.parseAndRender("{{ 0 }}"), "0", "zero renders");
  eq(await engine.parseAndRender("{{ -1 }}"), "-1", "negative renders");
  eq(await engine.parseAndRender("{{ 1.5 }}"), "1.5", "float renders");

  // Special characters in output
  eq(await engine.parseAndRender("{{ '<script>' | escape }}"), "&lt;script&gt;", "XSS escape");

  // Contains operator
  eq(await engine.parseAndRender("{% if 'hello' contains 'ell' %}y{% endif %}"), "y", "string contains");
  eq(await engine.parseAndRender("{% if arr contains 'b' %}y{% endif %}", { arr: ["a", "b", "c"] }), "y", "array contains");

  // Multiple conditions
  eq(await engine.parseAndRender("{% if true and false %}y{% else %}n{% endif %}"), "n", "and short-circuit");
  eq(await engine.parseAndRender("{% if false or true %}y{% else %}n{% endif %}"), "y", "or short-circuit");

  // ─── Results ───

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
