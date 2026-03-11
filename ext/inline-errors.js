// ext/inline-errors.js — render_errors mode: catch errors inline
// Usage: require("./ext/inline-errors")(engine)
// After enabling, errors render as "Liquid error (line N): message" instead of throwing

module.exports = function inlineErrors(engine) {
  const { tokenize, render, rout, evalOutput, evalExpr, stringify, evalCondition } = engine.constructor._internals;

  // Wrap parseAndRender to catch top-level errors
  const origParseAndRender = engine.parseAndRender.bind(engine);
  engine.parseAndRender = async function(template, data = {}) {
    try {
      return await origParseAndRender(template, data);
    } catch (e) {
      // Format as inline error
      const msg = e.message || String(e);
      // Try to extract line info
      const lineMatch = msg.match(/line (\d+)/);
      const line = lineMatch ? lineMatch[1] : "1";
      if (msg.startsWith("Liquid error")) return msg;
      return `Liquid error (line ${line}): ${msg}`;
    }
  };
};
