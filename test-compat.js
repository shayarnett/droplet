const { Liquid } = require("./ext/liquid-compat");

async function test(desc, fn) {
  try {
    const result = await fn();
    console.log("  PASS", desc);
  } catch(e) {
    console.log("  FAIL", desc, "-", e.message.substring(0, 80));
  }
}

async function assert(desc, got, expected) {
  if (got === expected) console.log("  PASS", desc);
  else console.log("  FAIL", desc, `\n       exp: ${JSON.stringify(expected)}\n       got: ${JSON.stringify(got)}`);
}

(async () => {
  console.log("=== Basic API ===");

  const engine = new Liquid();
  await assert("parseAndRender",
    await engine.parseAndRender("Hello {{ name }}!", { name: "World" }),
    "Hello World!");

  await assert("parse + render",
    await engine.render(engine.parse("{{ x | plus: 1 }}"), { x: 5 }),
    "6");

  console.log("\n=== Globals ===");
  const eng2 = new Liquid({ globals: { site: "My Site" } });
  await assert("globals merged with context",
    await eng2.parseAndRender("{{ site }} - {{ page }}", { page: "Home" }),
    "My Site - Home");

  console.log("\n=== registerFilter ===");
  const eng3 = new Liquid();
  eng3.registerFilter("shout", v => v.toUpperCase() + "!!!");
  await assert("custom filter",
    await eng3.parseAndRender("{{ 'hello' | shout }}", {}),
    "HELLO!!!");

  console.log("\n=== registerTag (object-based) ===");
  const eng4 = new Liquid();
  eng4.registerTag("greet", {
    parse(tagToken) { this.name = tagToken.args.trim(); },
    *render(ctx) { return "Hello, " + this.name + "!"; }
  });
  await assert("object tag",
    await eng4.parseAndRender("{% greet World %}", {}),
    "Hello, World!");

  console.log("\n=== Templates / partials ===");
  const eng5 = new Liquid({ templates: { header: "<h1>{{ title }}</h1>" } });
  await assert("render with template",
    await eng5.parseAndRender("{% render 'header', title: 'Hi' %}", {}),
    "<h1>Hi</h1>");

  console.log("\n=== setTemplate ===");
  eng5.setTemplate("footer", "<p>bye</p>");
  await assert("setTemplate",
    await eng5.parseAndRender("{% render 'footer' %}", {}),
    "<p>bye</p>");

  console.log("\n=== renderFile ===");
  eng5.setTemplate("page", "Page: {{ content }}");
  await assert("renderFile from memory",
    await eng5.renderFile("page", { content: "test" }),
    "Page: test");

  console.log("\n=== parseFile ===");
  const tpl = await eng5.parseFile("page");
  await assert("parseFile + render",
    await eng5.render(tpl, { content: "cached" }),
    "Page: cached");

  console.log("\n=== Cache ===");
  const eng6 = new Liquid({ cache: true });
  await assert("cached parseAndRender",
    await eng6.parseAndRender("{{ 1 | plus: 2 }}", {}),
    "3");
  await assert("cached second call",
    await eng6.parseAndRender("{{ 1 | plus: 2 }}", {}),
    "3");

  console.log("\n=== plugin ===");
  const eng7 = new Liquid();
  eng7.plugin(function() {
    this.registerFilter("double", v => v * 2);
  });
  await assert("plugin registers filter",
    await eng7.parseAndRender("{{ 5 | double }}", {}),
    "10");

  console.log("\n=== Sync methods throw helpful errors ===");
  const eng8 = new Liquid();
  await test("parseAndRenderSync throws", async () => {
    try { eng8.parseAndRenderSync("test"); throw new Error("should have thrown"); }
    catch(e) { if (!e.message.includes("async-only")) throw e; }
  });
  await test("renderSync throws", async () => {
    try { eng8.renderSync(eng8.parse("test")); throw new Error("should have thrown"); }
    catch(e) { if (!e.message.includes("async-only")) throw e; }
  });

  console.log("\n=== express() ===");
  await test("express returns function", async () => {
    const fn = eng8.express();
    if (typeof fn !== "function") throw new Error("expected function");
  });
})();
