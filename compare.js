#!/usr/bin/env bun
// Runs liquid-spec YAML tests against both Droplet and LiquidJS side by side
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");
const Droplet = require("./droplet");
const partials = require("./ext/partials");
const { Liquid } = require("liquidjs");

const SPEC_DIR = path.join(__dirname, "liquid-spec/specs");

const SPEC_SUITES = [
  { name: "Basics", dirs: ["basics"] },
  { name: "Liquid Ruby", dirs: ["liquid_ruby"] },
  { name: "Shopify Production Recordings", dirs: ["shopify_production_recordings"] },
  { name: "Liquid Ruby (Lax Mode)", dirs: ["liquid_ruby_lax"] },
];

const convertSymbols = v => {
  if (typeof v === "string" && /^:[a-zA-Z_]\w*$/.test(v)) return v.slice(1);
  if (Array.isArray(v)) return v.map(convertSymbols);
  if (v && typeof v === "object") { const r = {}; for (const [k, val] of Object.entries(v)) r[k] = convertSymbols(val); return r; }
  return v;
};

const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type("!binary", { kind: "scalar", construct: d => Buffer.from(d, "base64").toString() }),
  new yaml.Type("!ruby/object:BigDecimal", { kind: "scalar", construct: d => parseFloat(d) }),
  new yaml.Type("!ruby/object:Liquid::Spec::ErrorDrop", { kind: "mapping", construct: d => d }),
]);

function parseYamlRobust(content) {
  try { return yaml.load(content, { schema: CUSTOM_SCHEMA }); } catch(e) { /* fall through */ }
  const chunks = content.split(/\n(?=- name:)/);
  const result = [];
  for (const chunk of chunks) {
    try {
      const c = chunk.startsWith("---") ? chunk.replace(/^---\n?/, "") : chunk;
      const items = yaml.load(c.startsWith("- ") ? c : "- " + c.trimStart(), { schema: CUSTOM_SCHEMA });
      if (Array.isArray(items)) result.push(...items);
      else if (items) result.push(items);
    } catch(e2) { /* skip */ }
  }
  return result.length ? result : null;
}

function loadSuiteDefaults(dir) {
  const suitePath = path.join(dir, "suite.yml");
  if (!fs.existsSync(suitePath)) return {};
  try { return yaml.load(fs.readFileSync(suitePath, "utf8")) || {}; } catch(e) { return {}; }
}

function loadSpecs(dir) {
  const specs = [];
  if (!fs.existsSync(dir)) return specs;
  const suiteDefaults = loadSuiteDefaults(dir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".yml") && f !== "suite.yml");
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const parsed = parseYamlRobust(content);
    if (!parsed) continue;
    let items, metadata;
    if (Array.isArray(parsed)) { items = parsed; }
    else if (parsed.specs) { items = parsed.specs; metadata = parsed._metadata; }
    else continue;
    for (const item of items) {
      if (!item || !item.template || item.expected === undefined) continue;
      const renderErrors = item.render_errors ?? (metadata && metadata.render_errors) ?? (suiteDefaults.defaults && suiteDefaults.defaults.render_errors) ?? false;
      specs.push({ ...item, _file: file, _metadata: metadata, _renderErrors: renderErrors });
    }
  }
  return specs;
}

// Create a LiquidJS engine with a virtual filesystem for a given spec
function makeLiquidEngine(filesystem) {
  const fsMap = filesystem || {};
  return new Liquid({
    fs: {
      readFileSync: (name) => {
        const key = name.replace(/\.liquid$/, "");
        if (key in fsMap) return fsMap[key];
        if ((key + ".liquid") in fsMap) return fsMap[key + ".liquid"];
        if (name in fsMap) return fsMap[name];
        throw new Error(`File not found: ${name}`);
      },
      existsSync: (name) => {
        const key = name.replace(/\.liquid$/, "");
        return key in fsMap || (key + ".liquid") in fsMap || name in fsMap;
      },
      resolve: (root, file, ext) => file,
      contains: () => true,
      fallback: () => undefined,
    },
    dynamicPartials: false,
    relativeReference: false,
    strictFilters: false,
    strictVariables: false,
    lenientIf: true,
    jsTruthy: false,
  });
}

async function runSpec(engine, spec, type) {
  try {
    let result;
    if (type === "droplet") {
      engine._fs = spec.filesystem || {};
      result = await engine.parseAndRender(spec.template, convertSymbols(spec.environment || {}));
    } else {
      const liq = makeLiquidEngine(spec.filesystem);
      result = await liq.parseAndRender(spec.template, convertSymbols(spec.environment || {}));
    }
    return { ok: result === spec.expected, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const verbose = process.argv.includes("-v");
  const dropletEngine = new Droplet();
  partials(dropletEngine, {});

  const suiteResults = [];
  let dropletOnlySpecs = [], liquidOnlySpecs = [], bothFailSpecs = [];

  for (const suite of SPEC_SUITES) {
    let total = 0, dropletPass = 0, liquidPass = 0, bothPass = 0, bothFail = 0;
    let dropletOnly = 0, liquidOnly = 0;

    for (const dirName of suite.dirs) {
      const dir = path.join(SPEC_DIR, dirName);
      const specs = loadSpecs(dir);

      for (const spec of specs) {
        total++;
        const [d, l] = await Promise.all([
          runSpec(dropletEngine, spec, "droplet"),
          runSpec(null, spec, "liquidjs"),
        ]);

        if (d.ok && l.ok) { bothPass++; dropletPass++; liquidPass++; }
        else if (d.ok && !l.ok) { dropletPass++; dropletOnly++; dropletOnlySpecs.push({ ...spec, suite: suite.name, lResult: l.result, lError: l.error }); }
        else if (!d.ok && l.ok) { liquidPass++; liquidOnly++; liquidOnlySpecs.push({ ...spec, suite: suite.name, dResult: d.result, dError: d.error }); }
        else { bothFail++; bothFailSpecs.push({ ...spec, suite: suite.name }); }
      }
    }

    suiteResults.push({ name: suite.name, total, dropletPass, liquidPass, bothPass, bothFail, dropletOnly, liquidOnly });
  }

  // Print results
  console.log("\n  Droplet vs LiquidJS — liquid-spec comparison\n");

  const col = (s, w) => s + " ".repeat(Math.max(0, w - s.length));
  const maxName = Math.max(...suiteResults.map(s => s.name.length));

  console.log(`  ${col("Suite", maxName)}   Total  Droplet  LiquidJS  Both OK  Both Fail  D only  L only`);
  console.log(`  ${"-".repeat(maxName)}   -----  -------  --------  -------  ---------  ------  ------`);

  let gt = 0, gd = 0, gl = 0, gb = 0, gbf = 0, gdo = 0, glo = 0;
  for (const s of suiteResults) {
    const r = (n, w = 7) => ("" + n).padStart(w);
    console.log(`  ${col(s.name, maxName)}  ${r(s.total, 6)}  ${r(s.dropletPass)}  ${r(s.liquidPass, 8)}  ${r(s.bothPass)}  ${r(s.bothFail, 9)}  ${r(s.dropletOnly, 6)}  ${r(s.liquidOnly, 6)}`);
    gt += s.total; gd += s.dropletPass; gl += s.liquidPass; gb += s.bothPass; gbf += s.bothFail; gdo += s.dropletOnly; glo += s.liquidOnly;
  }

  console.log(`  ${"-".repeat(maxName)}   -----  -------  --------  -------  ---------  ------  ------`);
  const r = (n, w = 7) => ("" + n).padStart(w);
  console.log(`  ${col("Total", maxName)}  ${r(gt, 6)}  ${r(gd)}  ${r(gl, 8)}  ${r(gb)}  ${r(gbf, 9)}  ${r(gdo, 6)}  ${r(glo, 6)}`);

  const dpct = gt > 0 ? ((gd / gt) * 100).toFixed(1) : "0";
  const lpct = gt > 0 ? ((gl / gt) * 100).toFixed(1) : "0";
  console.log(`\n  Droplet: ${gd}/${gt} (${dpct}%)    LiquidJS: ${gl}/${gt} (${lpct}%)`);
  console.log(`  Both pass: ${gb}    Both fail: ${gbf}    Droplet only: ${gdo}    LiquidJS only: ${glo}`);

  if (verbose && dropletOnlySpecs.length > 0) {
    console.log(`\n  --- Droplet passes, LiquidJS fails (${dropletOnlySpecs.length}) ---`);
    for (const s of dropletOnlySpecs.slice(0, 30)) {
      console.log(`  [${s.suite}] ${s._file}::${s.name}`);
      if (s.lError) console.log(`    LiquidJS error: ${s.lError.slice(0, 100)}`);
      else console.log(`    LiquidJS got: ${JSON.stringify(s.lResult).slice(0, 80)}`);
    }
    if (dropletOnlySpecs.length > 30) console.log(`  ... and ${dropletOnlySpecs.length - 30} more`);
  }

  if (verbose && liquidOnlySpecs.length > 0) {
    console.log(`\n  --- LiquidJS passes, Droplet fails (${liquidOnlySpecs.length}) ---`);
    for (const s of liquidOnlySpecs.slice(0, 30)) {
      console.log(`  [${s.suite}] ${s._file}::${s.name}`);
      if (s.dError) console.log(`    Droplet error: ${s.dError.slice(0, 100)}`);
      else console.log(`    Droplet got: ${JSON.stringify(s.dResult).slice(0, 80)}`);
    }
    if (liquidOnlySpecs.length > 30) console.log(`  ... and ${liquidOnlySpecs.length - 30} more`);
  }

  console.log("");
}

main();
