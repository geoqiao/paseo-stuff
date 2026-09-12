import { describe, expect, it } from "vitest";
import { detailSections, MAX_DECODE_CHARS, MAX_FORMAT_CHARS, PREVIEW_CHARS, PREVIEW_LINES, previewText, readableValue, renderReadable } from "./details";

function piExecResult(output: string, result: { exit_code?: number; session_id?: number } = { exit_code: 0 }): string {
  return JSON.stringify({ chunk_id: "synthetic-chunk", wall_time_seconds: 0.3, output, ...result });
}

function codeModeEnvelope(content: unknown[], details: Record<string, unknown> = { codeMode: true, status: "result" }) {
  return { content, details };
}

describe("explicit readable transport views", () => {
  it.each(["exec", "functions.exec", "mcpScript", "tools.mcp_script", "evaluate_browser"])("renders %s source as JS without executing or rewriting it", name => {
    const code = '// comment\nconst n = 90071992547409931234n;\nthrow new Error("literal");';
    const input = { [name === "evaluate_browser" ? "expression" : "code"]: code, timeoutMs: 1000 };
    for (const value of [input, JSON.stringify(input)]) {
      const view = readableValue(value, name)!;
      expect(view).toMatchObject({ kind: "code", language: "javascript" });
      expect(renderReadable(view, true).text).toBe(code);
    }
    expect(readableValue(code, "exec")).toMatchObject({ kind: "code", code });
  });

  it("keeps all input fields and raw envelope metadata available behind the readable view", () => {
    const input = { code: "await run();", timeoutMs: 10 };
    const output = { content: [{ type: "text", text: "first\nsecond" }, { type: "text", text: '{"id":90071992547409931234,"a":1,"a":2}' }], details: { token: 0 }, isError: false };
    const sections = detailSections({ name: "exec", status: "completed", detail: { type: "unknown", input, output }, presentation: { icon: "Code", category: "unknown", label: "Exec" } });
    expect(sections[0]!.value).toBe(input);
    expect(sections[1]!.value).toBe(output);
    const view = sections[1]!.readable!;
    expect(view.note).toContain("metadata and attachments in Raw");
    expect(renderReadable(view).text).toContain('first\nsecond\n\n{\n  "id": 90071992547409931234,\n  "a": 1,\n  "a": 2\n}');
  });

  it("extracts one bounded Pi code-mode exec result while keeping status and source boundaries", () => {
    const result = piExecResult("first\nsecond\n");
    const output = codeModeEnvelope([
      { type: "text", text: "Script completed" },
      { type: "text", text: result },
    ]);
    const view = readableValue(output, "exec", "output")!;
    expect(view).toMatchObject({ kind: "content", codeMode: { status: "result" } });
    expect(renderReadable(view, true).text).toBe("Script completed\n\nExit code: 0\nfirst\nsecond\n");
    expect(renderReadable(view, true).text).not.toContain("chunk_id");
    expect(renderReadable(view, true).segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "status", text: "Exit code: 0" }),
      expect.objectContaining({ kind: "text", text: "first\nsecond\n", language: "text" }),
    ]));
  });

  it("shows running, empty and nonzero nested outcomes without changing the outer script status", () => {
    const output = codeModeEnvelope([
      { type: "text", text: "Script completed" },
      { type: "text", text: piExecResult("", { session_id: 12 }) },
      { type: "text", text: piExecResult("", { exit_code: 7 }) },
    ]);
    const text = renderReadable(readableValue(output, "exec", "output")!, true).text;
    expect(text).toContain("Script completed");
    expect(text).toContain("Session 12 still running · No output yet");
    expect(text).toContain("Exit code: 7 · Empty output");
  });

  it("keeps mixed block languages and applies one global preview budget", () => {
    const longOutput = Array.from({ length: 40 }, (_, index) => "nested line " + index).join("\n");
    const output = codeModeEnvelope([
      { type: "text", text: "Script completed" },
      { type: "text", text: piExecResult(longOutput, { exit_code: 7 }) },
      { type: "image", mimeType: "image/png", get data() { throw new Error("Do not touch image data"); } },
      { type: "text", text: piExecResult('{"ok":true}', { exit_code: 0 }) },
      { type: "resource", uri: "https://example.invalid/never-fetch" },
    ]);
    const view = readableValue(output, "exec", "output")!;
    const preview = renderReadable(view);
    expect(preview.text.split("\n").length).toBeLessThanOrEqual(PREVIEW_LINES);
    expect(preview.text.length).toBeLessThanOrEqual(PREVIEW_CHARS);
    expect(preview.text).toContain("Exit code: 7");
    expect(preview.text).not.toContain("nested line 39");
    expect(preview.text).not.toContain("Exit code: 0");
    const full = renderReadable(view, true);
    expect(full.text).toContain("{\n  \"ok\": true\n}");
    expect(full.text).toContain("[image · image/png · data in Raw]");
    expect(full.text).toContain("[resource · data in Raw]");
    expect(full.segments?.some((segment) => segment.language === "json")).toBe(true);
  });

  it("extracts DSH-projected ACP text blocks one layer under the shared preview budget", () => {
    const longText = Array.from({ length: 40 }, (_, index) => "ACP line " + index).join("\n");
    const blocks = [
      { type: "content", content: { type: "text", text: "real\nbody" } },
      { type: "content", content: { type: "image", mimeType: "image/png", data: "synthetic-image" } },
      { type: "content", content: { type: "text", text: longText } },
      { type: "future", value: { nested: "information" } },
    ];
    const output = { content: blocks };
    const view = readableValue(output, "dsh", "output")!;
    if (view.kind !== "content") throw new Error("Expected a readable content view");
    const preview = renderReadable(view);
    expect(view.blocks).toBe(blocks);
    expect(preview.text).toContain("real\nbody");
    expect(preview.text).toContain("[content · data in Raw]");
    expect(preview.text).not.toContain("ACP line 39");
    expect(preview.text.split("\n").length).toBeLessThanOrEqual(PREVIEW_LINES);
    expect(preview.text.length).toBeLessThanOrEqual(PREVIEW_CHARS);

    const full = renderReadable(view, true);
    expect(full.text).toContain("real\nbody");
    expect(full.text).toContain("ACP line 39");
    expect(full.text).toContain("[future · data in Raw]");
    expect(full.segments?.some((segment) => segment.text === "real\nbody" && segment.language === "text")).toBe(true);
    expect(JSON.stringify(output)).toContain("synthetic-image");
  });

  it("does not inspect an unknown tail once the shared preview is exhausted", () => {
    const blocks = [
      { type: "text", text: Array.from({ length: 100 }, (_, index) => "line " + index).join("\n") },
      { get type() { throw new Error("Visited unneeded tail"); } },
    ];
    const view = readableValue({ content: blocks })!;
    const result = renderReadable(view);
    expect(result.truncated).toBe(true);
    expect(result.text.split("\n").length).toBeLessThanOrEqual(PREVIEW_LINES);
  });

  it("does not access base64, metadata or serialize a huge envelope for its default view", () => {
    const output = { content: [{ type: "text", text: "visible tree" }, { type: "image", mimeType: "image/png", get data() { throw new Error("Do not touch base64"); } }],
      get details() { throw new Error("Do not touch metadata"); }, toJSON() { throw new Error("No whole-envelope serialization"); } };
    expect(renderReadable(readableValue(output)!).text).toBe("visible tree\n\n[image · image/png · data in Raw]");
  });

  it("applies one twenty-line budget across many blocks without visiting the tail", () => {
    const blocks = Array.from({ length: 100_000 }, (_, i) => ({ type: "text", get text() {
      if (i > 10) throw new Error("Visited unneeded tail");
      return "block " + i;
    } }));
    const result = renderReadable(readableValue({ content: blocks })!);
    expect(result.truncated).toBe(true);
    expect(result.text.split("\n").length).toBeLessThanOrEqual(PREVIEW_LINES);
    expect(result.text.length).toBeLessThanOrEqual(PREVIEW_CHARS);
  });

  it("previews real newlines in a 100k-line tool result and retains full readable copying", () => {
    const text = Array.from({ length: 100_000 }, (_, i) => "UI node " + i).join("\n");
    const view = readableValue({ content: [{ type: "text", text }] })!;
    expect(renderReadable(view)).toEqual({ text: text.split("\n").slice(0, 20).join("\n"), truncated: true });
    expect(renderReadable(view, true)).toEqual({ text, truncated: false });
  });

  it("handles unknown, malformed and empty blocks visibly without dropping the raw container", () => {
    const value = { content: [{ type: "text", text: false }, { type: "resource", uri: "https://example.invalid/never-fetch" }, null] };
    expect(renderReadable(readableValue(value)!).text).toBe("[text · data in Raw]\n\n[resource · data in Raw]\n\n[Unknown block · data in Raw]");
    expect(renderReadable(readableValue({ content: [] })!)).toEqual({ text: "", truncated: false });
  });

  it("requires the explicit code-mode source marker and complete exec schema", () => {
    const result = piExecResult("visible");
    const malformed = codeModeEnvelope([{ type: "text", text: JSON.stringify({ chunk_id: "x", wall_time_seconds: 1, output: "partial" }) }]);
    const bothOutcomes = codeModeEnvelope([{ type: "text", text: JSON.stringify({ chunk_id: "x", wall_time_seconds: 1, output: "ambiguous", exit_code: 0, session_id: 1 }) }]);
    const foreign = { content: [{ type: "text", text: result }], details: { codeMode: false } };
    for (const value of [malformed, bothOutcomes, foreign]) {
      const text = renderReadable(readableValue(value, "exec", "output")!, true).text;
      expect(text).toContain("chunk_id");
      expect(text).not.toContain("Exit code:");
    }
    expect(renderReadable(readableValue({ content: [{ type: "text", text: "log\n[Output truncated]" }] })!, true).upstreamTruncated).toBeUndefined();
  });

  it("extracts only the wrapper layer and preserves literal backslash escapes", () => {
    const nested = JSON.stringify({ chunk_id: "nested", wall_time_seconds: 0, output: "nested", exit_code: 0 });
    const output = codeModeEnvelope([{ type: "text", text: piExecResult("real\nliteral \\n" + nested) }]);
    const text = renderReadable(readableValue(output, "exec", "output")!, true).text;
    expect(text).toContain("real\nliteral \\n" + nested);
    expect(text).not.toContain("Exit code: 0\n nested");
  });

  it("surfaces upstream truncation, script errors and formatting limits separately from preview", () => {
    const details = {
      codeMode: true,
      status: "result",
      scriptError: "synthetic failure",
      droppedTraceCount: 2,
      get traces() { throw new Error("Do not inspect traces"); },
    };
    const output = codeModeEnvelope([
      { type: "text", text: "Script error: synthetic failure" },
      { type: "text", text: piExecResult("part\n[Output truncated]", { exit_code: 9 }) },
    ], details);
    const result = renderReadable(readableValue(output, "exec", "output")!);
    expect(result.upstreamTruncated).toBe(true);
    expect(result.text).toContain("Script error: synthetic failure");
    expect(result.text).toContain("Exit code: 9");
    expect(result.text).toContain("Upstream output truncated");
    expect(result.text.match(/Script error: synthetic failure/g)).toHaveLength(1);
    const errorAfterCompleted = codeModeEnvelope([
      { type: "text", text: "Script completed" },
      { type: "text", text: piExecResult("failed", { exit_code: 9 }) },
    ], { codeMode: true, status: "result", scriptError: "synthetic failure" });
    const errorAfterCompletedText = renderReadable(readableValue(errorAfterCompleted, "exec", "output")!, true).text;
    expect(errorAfterCompletedText).toContain("Script error: synthetic failure");
    expect(errorAfterCompletedText).toContain("Script completed");
    expect(errorAfterCompletedText.match(/Script error: synthetic failure/g)).toHaveLength(1);
    const hugeJson = '{"text":"' + "x".repeat(MAX_FORMAT_CHARS + 10) + '"}';
    const limited = renderReadable(readableValue(codeModeEnvelope([{ type: "text", text: piExecResult(hugeJson) }]), "exec", "output")!);
    expect(limited.formatLimited).toBe(true);
    expect(limited.truncated).toBe(true);
    expect(limited.text).not.toContain("\n  \"text\":");
  });

  it("reports upstream truncation before a long malformed wrapper without repairing it", () => {
    const partial = '{"output":"' + "literal ".repeat(800) + "\n[Output truncated]";
    const source = codeModeEnvelope([{ type: "text", text: partial }]);
    const view = readableValue(source, "exec", "output")!;
    const preview = renderReadable(view);
    expect(preview.text.startsWith("Upstream output truncated")).toBe(true);
    expect(preview.text).toContain('{"output":"literal');
    expect(preview.upstreamTruncated).toBe(true);
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBeLessThanOrEqual(PREVIEW_CHARS);
    const full = renderReadable(view, true).text;
    expect(full.endsWith(partial)).toBe(true);
    expect(full.match(/Show all cannot restore omitted output/g)).toHaveLength(1);
    expect(source.content[0]).toEqual({ type: "text", text: partial });
  });

  it.each([null, false, [], "", '{"content":', { text: "not a tool envelope" }, { content: "not an array" }, { content: [{ text: "untyped" }] }])("does not guess transport wrappers from arbitrary data %j", value => {
    expect(readableValue(value)).toBeUndefined();
  });

  it("does not decode arbitrary nested strings or foreign tools' code properties", () => {
    expect(readableValue({ code: "secret();" }, "vendor.exec")).toBeUndefined();
    expect(readableValue({ expression: "1 + 1" }, "exec")).toBeUndefined();
    const view = readableValue({ content: [{ type: "text", text: '{"text":"line1\\nline2"}' }] })!;
    expect(renderReadable(view).text).toContain('"line1\\nline2"');
  });

  it("bounds serialized envelope decoding and preserves original input for fallback", () => {
    const serialized = JSON.stringify({ content: [{ type: "text", text: "x".repeat(MAX_DECODE_CHARS) }] });
    expect(readableValue(serialized)).toBeUndefined();
    expect(readableValue(JSON.stringify({ content: [{ type: "text", text: "a\nb" }] }))).toMatchObject({ kind: "content" });
  });

  it("never leaves a split surrogate in a character-limited preview", () => {
    const text = "x".repeat(PREVIEW_CHARS - 1) + "🐈tail";
    expect(previewText(text)).toEqual({ text: "x".repeat(PREVIEW_CHARS - 1), truncated: true });
  });

  it("does not remove a lone high surrogate at a line preview boundary", () => {
    const firstBlock = Array.from({ length: 19 }, (_, index) => "line " + index).join("\n") + "\nlast\uD83D";
    const preview = previewText(firstBlock + "\nnext block");
    expect(preview.text).toBe(firstBlock);
    expect(preview.truncated).toBe(true);
  });

  it("keeps a complete pair when the line preview ends after an emoji", () => {
    const firstBlock = Array.from({ length: 19 }, (_, index) => "line " + index).join("\n") + "\nlast🐈";
    expect(previewText(firstBlock + "\nnext block").text).toBe(firstBlock);
  });

  it("keeps multi-block preview segments lossless when the first block ends in a lone surrogate", () => {
    const firstBlock = Array.from({ length: 19 }, (_, index) => "line " + index).join("\n") + "\nlast\uD83D";
    const view = readableValue({ content: [{ type: "text", text: firstBlock }, { type: "text", text: "next block" }] })!;
    const preview = renderReadable(view);
    const reconstructed = preview.segments?.map((segment) => (segment.separator ?? "") + segment.text).join("");
    expect(reconstructed).toBe(preview.text);
    expect(preview.text).toBe(firstBlock);
    expect(preview.text.length).toBeLessThanOrEqual(PREVIEW_CHARS);
    expect(preview.text.split("\n")).toHaveLength(PREVIEW_LINES);
    expect(renderReadable(view, true).text).toBe(firstBlock + "\n\nnext block");
  });
});
