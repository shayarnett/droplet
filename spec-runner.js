#!/usr/bin/env bun
// Runs liquid-spec YAML tests against droplet
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");
const Droplet = require("./droplet");
const partials = require("./ext/partials");

const SPEC_DIR = path.join(__dirname, "liquid-spec/specs");

const SPEC_SUITES = [
  { name: "Basics", dirs: ["basics"] },
  { name: "Liquid Ruby", dirs: ["liquid_ruby"] },
  { name: "Shopify Production Recordings", dirs: ["shopify_production_recordings"] },
  { name: "Liquid Ruby (Lax Mode)", dirs: ["liquid_ruby_lax"] },
  // { name: "Shopify Theme Dawn", dirs: ["shopify_theme_dawn"] }, // different format
];

// Convert Ruby symbols (:foo) to plain strings ("foo") in environments
const convertSymbols = v => {
  if (typeof v === "string" && /^:[a-zA-Z_]\w*$/.test(v)) return v.slice(1);
  if (Array.isArray(v)) return v.map(convertSymbols);
  if (v && typeof v === "object") { const r = {}; for (const [k, val] of Object.entries(v)) r[k] = convertSymbols(val); return r; }
  return v;
};

// Custom YAML schema to handle Ruby-specific tags
const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type("!binary", { kind: "scalar", construct: d => Buffer.from(d, "base64").toString() }),
  new yaml.Type("!ruby/object:BigDecimal", { kind: "scalar", construct: d => parseFloat(d) }),
  new yaml.Type("!ruby/object:Liquid::Spec::ErrorDrop", { kind: "mapping", construct: d => d }),
]);

function parseYamlRobust(content) {
  try { return yaml.load(content, { schema: CUSTOM_SCHEMA }); } catch(e) { /* fall through */ }
  // Fallback: split by top-level "- name:" entries and parse individually
  const chunks = content.split(/\n(?=- name:)/);
  const result = [];
  for (const chunk of chunks) {
    try {
      const c = chunk.startsWith("---") ? chunk.replace(/^---\n?/, "") : chunk;
      const items = yaml.load(c.startsWith("- ") ? c : "- " + c.trimStart(), { schema: CUSTOM_SCHEMA });
      if (Array.isArray(items)) result.push(...items);
      else if (items) result.push(items);
    } catch(e2) { /* skip unparseable chunk */ }
  }
  return result.length ? result : null;
}

// Load suite.yml defaults for a directory
function loadSuiteDefaults(dir) {
  const suitePath = path.join(dir, "suite.yml");
  if (!fs.existsSync(suitePath)) return {};
  try {
    return yaml.load(fs.readFileSync(suitePath, "utf8")) || {};
  } catch(e) { return {}; }
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
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed.specs) {
      items = parsed.specs;
      metadata = parsed._metadata;
    } else continue;
    for (const item of items) {
      if (!item || !item.template || item.expected === undefined) continue;
      // Apply suite defaults
      const renderErrors = item.render_errors ?? (metadata && metadata.render_errors) ?? (suiteDefaults.defaults && suiteDefaults.defaults.render_errors) ?? false;
      specs.push({ ...item, _file: file, _metadata: metadata, _renderErrors: renderErrors });
    }
  }
  return specs;
}

// Format error message for inline rendering
function formatInlineError(e, templateName) {
  const msg = e.message || String(e);
  // Already formatted
  if (msg.startsWith("Liquid error")) return msg;
  // Try to get line number from error
  const lineMatch = msg.match(/line (\d+)/i);
  const line = lineMatch ? lineMatch[1] : "1";
  const prefix = templateName ? `${templateName} line ${line}` : `line ${line}`;
  return `Liquid error (${prefix}): ${msg}`;
}

async function runSpecs() {
  let grandTotal = 0, grandPassed = 0, grandFailed = 0, grandErrors = 0;
  const allFailures = [];
  const engine = new Droplet();
  partials(engine, {});
  const suiteResults = [];

  for (const suite of SPEC_SUITES) {
    let total = 0, passed = 0, failed = 0, errors = 0;
    const failures = [];

    for (const dirName of suite.dirs) {
      const dir = path.join(SPEC_DIR, dirName);
      const specs = loadSpecs(dir);

      for (const spec of specs) {
        total++;
        // Set up filesystem for partials if spec provides one
        engine._fs = spec.filesystem || {};
        try {
          const result = await engine.parseAndRender(spec.template, convertSymbols(spec.environment || {}));
          if (result === spec.expected) {
            passed++;
          } else {
            failed++;
            failures.push({ name: spec.name, file: spec._file, suite: suite.name, got: result, expected: spec.expected, template: spec.template });
          }
        } catch (e) {
          if (spec._renderErrors) {
            // In render_errors mode, format error inline and compare
            const inlineResult = formatInlineError(e);
            if (inlineResult === spec.expected) {
              passed++;
            } else {
              failed++;
              failures.push({ name: spec.name, file: spec._file, suite: suite.name, got: inlineResult, expected: spec.expected, template: spec.template });
            }
          } else if (spec.expected && spec.expected.includes("Liquid error")) {
            failed++;
            failures.push({ name: spec.name, file: spec._file, suite: suite.name, got: "ERROR: " + e.message, expected: spec.expected, template: spec.template });
          } else {
            errors++;
            failures.push({ name: spec.name, file: spec._file, suite: suite.name, error: e.message, template: spec.template });
          }
        }
      }
    }

    suiteResults.push({ name: suite.name, total, passed, failed, errors });
    grandTotal += total; grandPassed += passed; grandFailed += failed; grandErrors += errors;
    allFailures.push(...failures);
  }

  // Print results
  console.log("\nbun spec-runner.js\n");
  const maxName = Math.max(...suiteResults.map(s => s.name.length));
  for (const s of suiteResults) {
    const dots = ".".repeat(maxName - s.name.length + 2);
    if (s.total === 0) {
      console.log(`${s.name} ${dots} skipped`);
    } else if (s.failed + s.errors === 0) {
      console.log(`${s.name} ${dots} ${s.passed}/${s.total} passed`);
    } else {
      console.log(`${s.name} ${dots} ${s.passed}/${s.total} passed (${s.failed} failed, ${s.errors} errors)`);
    }
  }

  const pct = grandTotal > 0 ? ((grandPassed / grandTotal) * 100).toFixed(1) : "0";
  console.log(`\nTotal: ${grandPassed} passed, ${grandFailed} failed, ${grandErrors} errors (${pct}%)`);

  if (allFailures.length > 0 && process.argv.includes("-v")) {
    const bySuite = {};
    for (const f of allFailures) { bySuite[f.suite] = (bySuite[f.suite] || 0) + 1; }
    console.log("\nFailures by suite:");
    for (const [suite, count] of Object.entries(bySuite).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${suite}: ${count}`);
    }
    const byFile = {};
    for (const f of allFailures) { byFile[f.file] = (byFile[f.file] || 0) + 1; }
    console.log("\nFailures by file:");
    for (const [file, count] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${file}: ${count}`);
    }
    console.log("\nAll failures:");
    for (const f of allFailures.slice(0, 500)) {
      console.log(`  [${f.suite}] ${f.file}::${f.name}`);
      if (f.error) console.log(`    ERROR: ${f.error}`);
      else {
        console.log(`    template: ${JSON.stringify(f.template).slice(0, 100)}`);
        console.log(`    expected: ${JSON.stringify(f.expected).slice(0, 80)}`);
        console.log(`    got:      ${JSON.stringify(f.got).slice(0, 80)}`);
      }
    }
  }

  return { total: grandTotal, passed: grandPassed, failed: grandFailed, errors: grandErrors, pct };
}

runSpecs().then(r => {
  process.exit(r.failed + r.errors > 0 ? 1 : 0);
});
