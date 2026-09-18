import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

// Bundle only unmodified host test fixtures. No production code imports internals.
const fixtures = fileURLToPath(new URL("./fixtures/paseo-0.9", import.meta.url));
const code = buildSync({
  stdin: { contents: 'export * from "./agent-stream/presentation"; export * from "./plugins/timeline/model";', resolveDir: fixtures },
  bundle: true, format: "cjs", platform: "node", target: "node22",
  alias: { "@": fixtures }, external: ["@getpaseo/protocol/*", "markdown-it"], write: false,
}).outputFiles[0].text;
const module = { exports: {} };
runInThisContext("(function(require, module, exports) {\n" + code + "\n})")(createRequire(import.meta.url), module, module.exports);
export const { createStreamPresentation, transformTimelineItem } = module.exports;
