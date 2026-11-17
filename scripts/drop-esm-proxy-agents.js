const fs = require("fs");
const path = require("path");

// @typespec/ts-http-runtime is CommonJS and require()s these agents.
// A nested copy of the ESM v9 packages wins over the hoisted CommonJS v7.
const nested = path.join(
  __dirname,
  "..",
  "node_modules",
  "@typespec",
  "ts-http-runtime",
  "node_modules"
);

for (const name of ["https-proxy-agent", "http-proxy-agent", "agent-base"]) {
  fs.rmSync(path.join(nested, name), { recursive: true, force: true });
}
