import { describe, expect, it } from "vitest";
import { detailSections, presentValue, previewText, prettyJson, MAX_FORMAT_CHARS } from "./details";
import type { ToolCallItemData } from "./timeline";

const data = (detail: unknown, name = "tool", error?: unknown): ToolCallItemData =>
  ({ detail, name, error, status: "completed", presentation: { icon: "Wrench" } }) as ToolCallItemData;
const values = (detail: unknown, name?: string, error?: unknown) => detailSections(data(detail, name, error)).map(section => section.value);

describe("one lossless formatter", () => {
  it("changes only JSON whitespace, preserving duplicates, order, escapes and big numeric lexemes", () => {
    const source = String.raw`{"10":9007199254740993,"2":1e99,"x":"\\n","x":"\u4e2d","n":-0}`;
    const formatted = prettyJson(source)!;
    expect(formatted).toBe(String.raw`{` + '\n  "10": 9007199254740993,\n  "2": 1e99,\n'
      + String.raw`  "x": "\\n",` + "\n" + String.raw`  "x": "\u4e2d",` + '\n  "n": -0\n}');
    expect(presentValue(source)).toEqual({ text: formatted, language: "json" });
  });
  it.each(["", "   ", '{"stream":', "ordinary\ntext", "null trailing", "undefined"])("preserves non-JSON or partial JSON: %j", source => {
    expect(prettyJson(source)).toBeNull();
    expect(presentValue(source)).toEqual({ text: source, language: "text" });
  });
  it.each(["null", "false", "42", '""', "[]", "{}", '{"nested":[1,{"x":true}]}'])("formats any complete JSON value: %s", source => {
    expect(JSON.parse(prettyJson(source)!)).toEqual(JSON.parse(source));
    expect(presentValue(source).language).toBe("json");
  });
  it("distinguishes missing output from null, false, zero and empty text", () => {
    expect([undefined, null, false, 0, ""].map(value => presentValue(value).text)).toEqual(["", "null", "false", "0", ""]);
  });
  it("formats large decoded objects without losing their tail", () => {
    const value = { rows: Array.from({ length: 30_000 }, (_, i) => i), last: "TAIL" };
    const full = presentValue(value);
    expect(full.language).toBe("json");
    expect(JSON.parse(full.text)).toEqual(value);
    expect(previewText(full.text).text.split("\n")).toHaveLength(20);
    expect(previewText(full.text).text).not.toContain("TAIL");
  });
  it("keeps oversize serialized JSON intact rather than silently truncating it", () => {
    const source = '{"large":"' + "x".repeat(MAX_FORMAT_CHARS) + '"}';
    expect(prettyJson(source)).toBeNull();
    expect(presentValue(source).text).toBe(source);
  });
  it("bounds indentation amplification and handles invalid non-JSON objects defensively", () => {
    const deep = "[".repeat(10_000) + "1" + "]".repeat(10_000);
    expect(prettyJson(deep)).toBeNull();
    expect(presentValue(deep).text).toBe(deep);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(() => presentValue(circular)).not.toThrow();
  });
});

describe("twenty logical lines", () => {
  it.each([0, 1, 19, 20, 21, 100_000])("previews %i lines without scanning/splitting all of them", count => {
    const lines = Array.from({ length: count }, (_, index) => "line " + index);
    expect(previewText(lines.join("\n"))).toEqual({ text: lines.slice(0, 20).join("\n"), truncated: count > 20 });
  });
  it("does not introduce a 4,000-character limit or split Unicode", () => {
    const text = ("x".repeat(4100) + "🐈\r\n").repeat(25);
    expect(previewText(text).text).toBe(text.split("\n").slice(0, 20).join("\n"));
    expect(previewText(text).text).toContain("🐈");
  });
  it("retains blank and trailing lines in the full value", () => {
    const text = "\n".repeat(20);
    expect(previewText(text)).toEqual({ text: "\n".repeat(19), truncated: true });
    expect(presentValue(text).text).toBe(text);
  });
});

describe("one Input / Output adapter", () => {
  it.each(["exec", "wait", "exec_command", "write_stdin", "view_image", "apply_patch", "ordinary-tool"])("preserves every result field for %s", name => {
    const output = { content: [{ type: "text", text: '{"ok":false}' }], details: {
      output: "failure", exit_code: 2, traces: [{ result: "x[value truncated]" }], droppedTraceCount: 1,
    }, custom: { keep: true } };
    const detail = { type: "unknown", input: { cmd: "test", extra: 42 }, output };
    const before = JSON.stringify(detail);
    const sections = detailSections(data(detail, name));
    expect(sections.map(section => section.label)).toEqual(["Input", "Output"]);
    expect(sections[0]!.value).toEqual(detail.input);
    expect(JSON.parse(presentValue(sections[1]!.value).text)).toEqual(output);
    expect(JSON.stringify(detail)).toBe(before);
  });
  it("unwraps only a pure single-text result, including ACP text", () => {
    for (const block of [{ type: "text", text: '{"ok":true}' },
      { type: "content", content: { type: "text", text: '{"ok":true}' } }]) {
      expect(values({ type: "unknown", output: { content: [block] } })[1]).toBe('{"ok":true}');
    }
  });
  it.each([
    { content: [] },
    { content: [{ type: "text", text: "hi", extra: true }] },
    { content: [{ type: "text", text: "hi" }, { type: "image", data: "base64" }] },
    { content: [{ type: "content", content: { type: "text", text: "hi" }, extra: true }] },
    { content: [{ type: "image", data: "base64", mimeType: "image/png" }] },
    { content: [{ type: "text", text: "hi" }], details: null },
  ])("never hides metadata, multiple blocks or attachment bodies: %j", output => {
    expect(values({ type: "unknown", output })[1]).toBe(output);
    expect(JSON.parse(presentValue(output).text)).toEqual(output);
  });
  it("does not decode serialized envelopes or arbitrary nested strings", () => {
    const output = String.raw`{"content":[{"type":"text","text":"hello"}],"n":9007199254740993,"n":1}`;
    expect(values({ type: "unknown", output })[1]).toBe(output);
    expect(presentValue(output).text).toContain("9007199254740993");
  });
  it.each(["exec", "functions.exec", "tools.exec", "mcpScript"])("shows source-only %s input in place, without an extra Calls panel", name => {
    const code = 'const r = await tools.exec_command({cmd:"echo hello"});\ntext(r);';
    expect(detailSections(data({ type: "unknown", input: { code } }, name))[0]).toEqual({
      label: "Input", value: code, language: "javascript",
    });
  });
  it("retains extra input parameters instead of showing just the code", () => {
    const input = { code: "text(1);", timeoutMs: 1, custom: true };
    expect(values({ type: "unknown", input }, "exec")[0]).toEqual(input);
  });
  it("preserves conflicting, empty and malformed input", () => {
    for (const input of [null, [], { code: "   " }, { cmd: "ls", code: "x" }, { code: false }]) {
      expect(values({ type: "unknown", input }, "exec")[0]).toEqual(input);
    }
  });
  it("keeps native shell parameters and all result fields", () => {
    expect(values({ type: "shell", command: "ls", cwd: "/tmp", output: "a\nb", exitCode: 2, extra: true })).toEqual([
      { command: "ls", cwd: "/tmp" }, { output: "a\nb", exitCode: 2, extra: true },
    ]);
    expect(values({ type: "shell", command: "ls", output: "a\nb" })[1]).toBe("a\nb");
  });
  it("keeps read ranges, full write content and original edit fields without reconstructing a diff", () => {
    expect(values({ type: "read", filePath: "a", offset: 1, limit: 3, content: "hello" })).toEqual([
      { filePath: "a", offset: 1, limit: 3 }, "hello",
    ]);
    for (const type of ["write", "edit"]) {
      const detail = { type, filePath: "a", content: "c", oldString: "old", newString: "new", unifiedDiff: "raw diff", extra: true };
      const { type: _, ...input } = detail;
      expect(values(detail)).toEqual([input, undefined]);
    }
  });
  it.each([null, [], { type: "future", all: 1 }, { type: "search", query: "needle", paths: ["a"] }])("preserves unsupported details intact: %j", detail => {
    expect(values(detail)).toEqual([undefined, detail]);
  });
  it("keeps unknown detail extensions and actual errors inside Output", () => {
    expect(values({ type: "unknown", input: 1, output: false, custom: "keep" }, "tool", { message: "oops" })).toEqual([
      1, { output: { custom: "keep", output: false }, error: { message: "oops" } },
    ]);
    expect(values({ type: "unknown" }, "tool", "oops")).toEqual([undefined, { error: "oops" }]);
  });
});
