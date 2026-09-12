import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hermesPlatform = { darwin: "osx-bin", linux: "linux64-bin", win32: "win64-bin" }[process.platform];
const hermes = process.env.HERMES_BIN || join(root, "node_modules/react-native/sdks/hermesc", hermesPlatform || "unsupported", process.platform === "win32" ? "hermes.exe" : "hermes");

// Match Paseo v0.8.0 compiler.ts: neutral + ES2020, lowered async and eager CJS
// interop, then evaluate the wrapped bundle from a string (no Metro/Babel pass).
// https://github.com/getpaseo/paseo/blob/b8e24677e12b226c7c38c1c3a40649daa9f1152f/packages/server/src/server/plugins/compiler.ts
async function bundle(entry) {
  const result = await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, format: "cjs", jsx: "automatic",
    platform: "neutral", target: "es2020", supported: { "async-await": false },
    external: ["@getpaseo/plugin", "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui", "@getpaseo/plugin/client/react-native", "react", "react/jsx-runtime", "react-native", "zod", "@tanstack/react-query"],
    write: false, treeShaking: true,
  });
  const code = result.outputFiles[0].text.replaceAll("get: () => from[key]", "value: from[key]");
  return `(function(require) { const module = { exports: {} }; const exports = module.exports;\n${code}\nreturn module.exports; })`;
}

// Host UI/hooks and schema construction are stubs here. This checks real bundled
// dependencies and engine evaluation, NOT native UI rendering or Zod validation.
const host = `
function check(value, message) { if (!value) throw new Error(message); }
var schema = {};
["optional", "int", "nonnegative"].forEach(function(key) { schema[key] = function() { return schema; }; });
var z = {};
["object", "string", "number", "enum", "json"].forEach(function(key) { z[key] = function() { return schema; }; });
function runtimeRequire(name) {
  if (name === "zod") return { z: z };
  if (["react", "react/jsx-runtime", "react-native", "@getpaseo/plugin/client/react-native"].indexOf(name) !== -1) return {};
  throw new Error("Unexpected external module: " + name);
}
var evaluate = globalThis.eval;
`;

let entryBundle;
let highlightBundle;
beforeAll(async () => {
  [entryBundle, highlightBundle] = await Promise.all([bundle("index.client.tsx"), bundle("client/highlight.ts")]);
});

function smoke() {
  return host + `
var contributions = [];
var removed = [];
function register(item) { contributions.push(item); return function() { removed.push(item); }; }
var entry = evaluate(${JSON.stringify(entryBundle)})(runtimeRequire);
var cleanup = entry.default({ addSettingsScreen: register, addTimelineTransformer: register, addTimelineRenderer: register });
check(contributions.length === 5, "Missing client contributions");
check(contributions[2].query.itemType === "tool_call", "Missing tool transformer");
check(typeof contributions[4].Component === "function", "Missing tool renderer");
cleanup();
check(removed.length === 5 && removed[0] === contributions[4], "Cleanup did not unregister contributions");
var highlight = evaluate(${JSON.stringify(highlightBundle)})(runtimeRequire).highlightCode;
var colors = { foreground: "#dddddd", foregroundMuted: "#aaaaaa", accent: "#9ab8ce", surface1: "#181818" };
var samples = {
  bash: 'echo "hello"', css: 'a { color: red; }', go: 'var s = "hello"',
  html: '<div title="hello">text</div>', javascript: 'const s = "hello";',
  json: '{"s":"hello"}', markdown: '**hello**', python: 's = "hello"',
  rust: 'let s = "hello";', typescript: 'const s: string = "hello";',
  yaml: 's: "hello"', jsx: '<A name="hello" />', tsx: '<A name="hello" />'
};
Promise.all(Object.keys(samples).map(function(language) {
  var code = '\\n中文 🐈\\r\\n' + samples[language] + '\\n\\n';
  return highlight(code, language, colors).then(function(tokens) {
    check(tokens !== null, "Native highlighting fell back: " + language);
    check(tokens.map(function(line) { return line.map(function(token) { return token.content; }).join(""); }).join("\\n") === code, "Changed source: " + language);
    check(tokens.some(function(line) { return line.some(function(token) { return token.color !== colors.foreground; }); }), "Missing token colors: " + language);
  });
})).then(function() {
  check(typeof globalThis.Prism === "undefined", "Leaked global Prism");
  print("BUNDLE_SMOKE_OK");
}, function(error) { print("BUNDLE_SMOKE_FAILED " + error.stack); });
`;
}

describe("client bundle evaluation", () => {
  it("loads, registers, tokenizes and cleans up in a DOM-free JavaScript context", async () => {
    const output = [];
    await runInNewContext(smoke(), { print: (value) => output.push(value) }, { timeout: 10_000 });
    expect(output).toEqual(["BUNDLE_SMOKE_OK"]);
  });

  it.skipIf(!existsSync(hermes))("loads the full entry and all supported grammars in the RN Hermes engine", () => {
    const directory = mkdtempSync(join(tmpdir(), "activity-hermes-"));
    try {
      const file = join(directory, "smoke.js");
      writeFileSync(file, smoke());
      const output = execFileSync(hermes, [file], { encoding: "utf8", timeout: 20_000, maxBuffer: 128_000 });
      expect(output.trim()).toBe("BUNDLE_SMOKE_OK");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
