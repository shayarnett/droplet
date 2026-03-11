const Droplet = require("./droplet");

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  if (a === b) pass++;
  else { fail++; console.log("FAIL:", msg, "\n  got:", JSON.stringify(a), "\n  exp:", JSON.stringify(b)); }
};

(async () => {
  const engine = new Droplet();
  const r = (tpl, data) => engine.parseAndRender(tpl, data);

  // Variables
  eq(await r("{{x}}", {x: "hi"}), "hi", "simple var");
  eq(await r("{{ x }}", {x: 5}), "5", "var with spaces");
  eq(await r("{{ a.b }}", {a: {b: "deep"}}), "deep", "dot access");
  eq(await r("{{ a[0] }}", {a: [10,20]}), "10", "bracket access");

  // Filters
  eq(await r("{{ 'hello' | upcase }}"), "HELLO", "upcase");
  eq(await r("{{ 'HELLO' | downcase }}"), "hello", "downcase");
  eq(await r("{{ 'hello' | capitalize }}"), "Hello", "capitalize");
  eq(await r("{{ 'hello world' | truncate: 8 }}"), "hello...", "truncate");
  eq(await r("{{ 'hello' | append: ' world' }}"), "hello world", "append");
  eq(await r("{{ 'hello' | prepend: 'say ' }}"), "say hello", "prepend");
  eq(await r("{{ '  hi  ' | strip }}"), "hi", "strip");
  eq(await r("{{ 'foobarfoo' | remove: 'foo' }}"), "bar", "remove");
  eq(await r("{{ 'foobar' | replace: 'foo', 'baz' }}"), "bazbar", "replace");
  eq(await r("{{ 'a,b,c' | split: ',' | join: '-' }}"), "a-b-c", "split+join");
  eq(await r("{{ 5 | plus: 3 }}"), "8", "plus");
  eq(await r("{{ 10 | minus: 3 }}"), "7", "minus");
  eq(await r("{{ 3 | times: 4 }}"), "12", "times");
  eq(await r("{{ 10 | divided_by: 3 }}"), "3", "divided_by int");
  eq(await r("{{ -5 | abs }}"), "5", "abs");
  eq(await r("{{ 1.5 | ceil }}"), "2", "ceil");
  eq(await r("{{ 1.5 | floor }}"), "1", "floor");
  eq(await r("{{ 1.555 | round: 2 }}"), "1.56", "round");
  eq(await r("{{ 'hello' | size }}"), "5", "size");
  eq(await r("{{ 'hello' | slice: 1, 3 }}"), "ell", "slice");
  eq(await r("{{ '<b>hi</b>' | escape }}"), "&lt;b&gt;hi&lt;/b&gt;", "escape");
  eq(await r("{{ '<p>hi</p>' | strip_html }}"), "hi", "strip_html");
  eq(await r("{{ 'hi\nthere' | newline_to_br }}"), "hi<br />\nthere", "newline_to_br");
  eq(await r("{{ arr | first }}", {arr: [1,2,3]}), "1", "first");
  eq(await r("{{ arr | last }}", {arr: [1,2,3]}), "3", "last");
  eq(await r("{{ arr | reverse | join: ',' }}", {arr: [1,2,3]}), "3,2,1", "reverse");
  eq(await r("{{ arr | sort | join: ',' }}", {arr: [3,1,2]}), "1,2,3", "sort");
  eq(await r("{{ arr | uniq | join: ',' }}", {arr: [1,2,1,3]}), "1,2,3", "uniq");
  eq(await r("{{ arr | where: 'ok' | map: 'n' | join: ',' }}", {arr: [{n:"a",ok:true},{n:"b",ok:false},{n:"c",ok:true}]}), "a,c", "where+map");
  eq(await r("{{ 'hello world' | url_encode }}"), "hello+world", "url_encode");
  eq(await r("{{ 'hello+world' | url_decode }}"), "hello world", "url_decode");
  eq(await r("{{ x | default: 'fallback' }}"), "fallback", "default nil");
  eq(await r("{{ x | default: 'fallback' }}", {x: "val"}), "val", "default with value");

  // If/elsif/else
  eq(await r("{% if true %}yes{% endif %}"), "yes", "if true");
  eq(await r("{% if false %}yes{% endif %}"), "", "if false");
  eq(await r("{% if false %}a{% elsif true %}b{% endif %}"), "b", "elsif");
  eq(await r("{% if false %}a{% else %}b{% endif %}"), "b", "else");
  eq(await r("{% if x == 1 %}one{% elsif x == 2 %}two{% else %}other{% endif %}", {x: 2}), "two", "if comparison");

  // Unless
  eq(await r("{% unless false %}yes{% endunless %}"), "yes", "unless false");
  eq(await r("{% unless true %}yes{% endunless %}"), "", "unless true");

  // For loop
  eq(await r("{% for i in arr %}{{i}}{% endfor %}", {arr: [1,2,3]}), "123", "for");
  eq(await r("{% for i in (1..3) %}{{i}}{% endfor %}"), "123", "for range");
  eq(await r("{% for i in arr %}{{forloop.index}}{% endfor %}", {arr: ["a","b"]}), "12", "forloop.index");
  eq(await r("{% for i in arr %}{% if forloop.first %}F{% endif %}{{i}}{% endfor %}", {arr: [1,2]}), "F12", "forloop.first");
  eq(await r("{% for i in arr limit:2 %}{{i}}{% endfor %}", {arr: [1,2,3,4]}), "12", "for limit");
  eq(await r("{% for i in arr offset:2 %}{{i}}{% endfor %}", {arr: [1,2,3,4]}), "34", "for offset");
  eq(await r("{% for i in arr reversed %}{{i}}{% endfor %}", {arr: [1,2,3]}), "321", "for reversed");
  eq(await r("{% for i in arr %}{% if i == 2 %}{% break %}{% endif %}{{i}}{% endfor %}", {arr: [1,2,3]}), "1", "for break");
  eq(await r("{% for i in arr %}{% if i == 2 %}{% continue %}{% endif %}{{i}}{% endfor %}", {arr: [1,2,3]}), "13", "for continue");
  eq(await r("{% for i in empty %}x{% else %}empty{% endfor %}", {empty: []}), "empty", "for else");

  // Assign
  eq(await r("{% assign x = 'hello' %}{{x}}"), "hello", "assign");
  eq(await r("{% assign x = 5 | plus: 3 %}{{x}}"), "8", "assign with filter");

  // Capture
  eq(await r("{% capture x %}hello{% endcapture %}{{x}}"), "hello", "capture");

  // Case/when
  eq(await r("{% case x %}{% when 1 %}one{% when 2 %}two{% else %}other{% endcase %}", {x: 2}), "two", "case/when");

  // Comment
  eq(await r("a{% comment %}hidden{% endcomment %}b"), "ab", "comment");

  // Raw
  eq(await r("{% raw %}{{ not parsed }}{% endraw %}"), "{{ not parsed }}", "raw");

  // Increment/decrement
  eq(await r("{% increment x %}{% increment x %}{% increment x %}"), "012", "increment");
  eq(await r("{% decrement x %}{% decrement x %}{% decrement x %}"), "-1-2-3", "decrement");

  // Cycle
  eq(await r("{% cycle 'a', 'b', 'c' %}{% cycle 'a', 'b', 'c' %}{% cycle 'a', 'b', 'c' %}"), "abc", "cycle");

  // Whitespace control
  eq(await r("  {% if true -%}  hi  {%- endif %}  "), "  hi  ", "whitespace control");

  // Conditions
  eq(await r("{% if 'hello' contains 'ell' %}yes{% endif %}"), "yes", "contains string");
  eq(await r("{% if arr contains 2 %}yes{% endif %}", {arr: [1,2,3]}), "yes", "contains array");
  eq(await r("{% if true and true %}yes{% endif %}"), "yes", "and");
  eq(await r("{% if false or true %}yes{% endif %}"), "yes", "or");

  // Nested
  eq(await r("{% for i in (1..2) %}{% for j in (1..2) %}{{i}}{{j}} {% endfor %}{% endfor %}"), "11 12 21 22 ", "nested for");

  // Echo
  eq(await r("{% echo 'hello' | upcase %}"), "HELLO", "echo");

  // Truthy/falsy
  eq(await r("{% if nil %}yes{% else %}no{% endif %}"), "no", "nil is falsy");
  eq(await r("{% if 0 %}yes{% else %}no{% endif %}"), "yes", "0 is truthy");
  eq(await r("{% if '' %}yes{% else %}no{% endif %}"), "yes", "empty string is truthy");

  // Custom filter with engine context
  const moneyEngine = new Droplet({ i18n: { currency: "USD", symbol: "$" } });
  moneyEngine.registerFilter("money", function(v) {
    return `${this.i18n.symbol}${(+v).toFixed(2)}`;
  });
  eq(await moneyEngine.parseAndRender("{{ price | money }}", {price: 19.5}), "$19.50", "custom filter with engine context");

  // Async custom filter
  const asyncEngine = new Droplet();
  asyncEngine.registerFilter("fetch_name", async function(v) {
    return "async_" + v;
  });
  eq(await asyncEngine.parseAndRender("{{ x | fetch_name }}", {x: "test"}), "async_test", "async custom filter");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
