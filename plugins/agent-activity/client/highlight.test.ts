import { describe, expect, it, vi } from "vitest";
import { Prism } from "prism-react-renderer/dist/index.mjs";
import { highlightCode, MAX_HIGHLIGHT_CHARS } from "./highlight";

const colors = { foreground: "#dddddd", foregroundMuted: "#aaaaaa", accent: "#9ab8ce", surface1: "#181818" };

function failGrammar() {
  const descriptor = Object.getOwnPropertyDescriptor(Prism.languages, "json")!;
  const read = vi.fn(() => { throw new Error("synthetic grammar failure"); });
  Object.defineProperty(Prism.languages, "json", { configurable: true, get: read });
  return { read, restore: () => Object.defineProperty(Prism.languages, "json", descriptor) };
}

describe("native-safe syntax highlighting", () => {
  it("tokenizes shell commands without HTML or DOM APIs", async () => {
    const tokens = await highlightCode("$ bun run test\n170 pass", "bash", colors);
    const content = tokens?.flat().map((token) => token.content).join("");
    expect(content).toContain("bun");
    expect(content).toContain("170 pass");
    expect(tokens?.flat().some((token) => token.color)).toBe(true);
  });

  it("tokenizes arbitrary JSON payloads", async () => {
    const tokens = await highlightCode(
      '{\n  "content": [{"type": "text"}]\n}',
      "json",
      colors,
    );
    const content = tokens?.flat().map((token) => token.content).join("");
    expect(content).toContain('"content"');
    expect(content).toContain('"text"');
    expect(tokens?.flat().some((token) => token.color)).toBe(true);
  });

  it("returns a fallback signal for oversized output", async () => {
    await expect(highlightCode("x".repeat(MAX_HIGHLIGHT_CHARS + 1), "ansi", colors)).resolves.toBeNull();
  });

  it.each([
    { ...colors, statusSuccess: "#8dc891", statusWarning: "#efbf69" },
    { foreground: "#202020", foregroundMuted: "#606060", accent: "#345678", surface1: "#eeeeee", statusSuccess: "#23713b", statusWarning: "#895500" },
  ])("colors every JSON value type and key using the host palette %j", async palette => {
    const source = '{"message":"hello","count":12,"enabled":true,"missing":null,"items":[false,-2.5]}';
    const tokens = (await highlightCode(source, "json", palette))!.flat();
    expect(tokens.map(token => token.content).join("")).toBe(source);
    for (const key of ['"message"', '"count"', '"enabled"', '"missing"', '"items"']) {
      expect(tokens.find(token => token.content === key)?.color).toBe(palette.foreground);
    }
    expect(tokens.find(token => token.content === '"hello"')?.color).toBe(palette.statusSuccess);
    for (const value of ["12", "true", "null", "false", "-2.5"]) {
      expect(tokens.find(token => token.content === value)?.color).toBe(palette.statusWarning);
    }
  });

  it("invalidates cached JSON tokens when only the host value colors change", async () => {
    const source = '{"value":"hello","number":5}';
    const before = { ...colors, statusSuccess: "#112233", statusWarning: "#445566" };
    const after = { ...before, statusSuccess: "#223344", statusWarning: "#556677" };
    await highlightCode(source, "json", before);
    const tokens = (await highlightCode(source, "json", after))!.flat();
    expect(tokens.find(token => token.content === '"hello"')?.color).toBe(after.statusSuccess);
    expect(tokens.find(token => token.content === "5")?.color).toBe(after.statusWarning);
  });

  it.each(["javascript", "js"])("keeps complete JS tokens and applies theme colors for %s", async language => {
    const code = '// comment\nconst result = await run("hello");\ntext(result);';
    const tokens = (await highlightCode(code, language, colors))!;
    expect(tokens.map(line => line.map(token => token.content).join("")).join("\n")).toBe(code);
    expect(tokens.flat().some(token => token.color?.toLowerCase() === colors.accent)).toBe(true);
  });

  it("uses the new host palette for the same code after a theme switch", async () => {
    const code = '{"message":"hello","count":12}';
    const light = { foreground: "#202020", foregroundMuted: "#606060", accent: "#345678", surface1: "#eeeeee" };
    const darkTokens = (await highlightCode(code, "json", colors))!.flat();
    const lightTokens = (await highlightCode(code, "json", light))!.flat();
    expect(lightTokens.map((token) => token.content).join("")).toBe(code);
    expect(darkTokens.some((token) => token.color?.toLowerCase() === colors.accent)).toBe(true);
    expect(lightTokens.some((token) => token.color?.toLowerCase() === light.accent)).toBe(true);
    const palette = new Set([light.foreground, light.foregroundMuted, light.accent]);
    expect(lightTokens.every((token) => !token.color || palette.has(token.color.toLowerCase()))).toBe(true);
  });

  it.each(["bash", "sh", "shell", "shellscript", "css", "go", "html", "js", "ts", "json", "md", "py", "rust", "yaml", "yml", "jsx", "tsx"])(
    "preserves Unicode, blank lines, CRLF and a final newline for %s", async (language) => {
      const code = '\n/* 中文 🐈 */\r\nconst value = "<tag>&\\n";\n\n';
      const tokens = await highlightCode(code, language, colors);
      expect(tokens).not.toBeNull();
      expect(tokens!.map((line) => line.map((token) => token.content).join("")).join("\n")).toBe(code);
    },
  );

  it.each(["text", "unknown", "__proto__", "constructor", "toString"])("falls back for %s", async (language) => {
    await expect(highlightCode("literal text", language, colors)).resolves.toBeNull();
  });

  it("colors shell strings and comments without changing escapes or interpreting commands", async () => {
    const code = 'echo "# literal $HOME" && echo \'中文\' # comment\n';
    const tokens = (await highlightCode(code, "bash", colors))!.flat();
    expect(tokens.find((token) => token.content === '"# literal $HOME"')?.color).toBe(colors.accent);
    expect(tokens.find((token) => token.content === "# comment")?.color).toBe(colors.foregroundMuted);
  });

  it("preserves malformed streaming JSON and bounds a supported language before tokenizing", async () => {
    const code = '{"incomplete": "中文\\';
    const tokens = await highlightCode(code, "json", colors);
    expect(tokens!.flat().map((token) => token.content).join("")).toBe(code);
    const grammar = failGrammar();
    try {
      await expect(highlightCode("", "json", colors)).resolves.toBeNull();
      await expect(highlightCode("x".repeat(MAX_HIGHLIGHT_CHARS + 1), "json", colors)).resolves.toBeNull();
      expect(grammar.read).not.toHaveBeenCalled();
    } finally {
      grammar.restore();
    }
  });

  it("falls back on tokenizer failure without poisoning later requests", async () => {
    const grammar = failGrammar();
    try {
      const code = '{"retry":"after failure"}';
      await expect(highlightCode(code, "json", colors)).resolves.toBeNull();
      grammar.restore();
      expect(await highlightCode(code, "json", colors)).not.toBeNull();
    } finally {
      grammar.restore();
    }
  });
});
