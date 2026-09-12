import { describe, expect, it } from "vitest";
import { inputPresentation } from "./input-presentation";
import { resolveToolCallPresentation } from "./presentation";
import { createToolCallData } from "./timeline";

describe("real provider-shaped unknown tool input presentation", () => {
  it.each([
    ["exec", { code: 'await tools.exec_command({cmd: "npm run check"});' }, "Code", "JavaScript"],
    ["exec", { cmd: "npm run check" }, "Terminal", "npm run check"],
    ["exec_command", { cmd: "npm test" }, "Terminal", "npm test"],
    ["read", { path: "src/config.json" }, "FileText", "src/config.json"],
    ["functions.read_file", '{"file_path":"src/main.ts"}', "FileText", "src/main.ts"],
    ["find_roots", { app: "Paseo" }, "Monitor", "Paseo"],
    ["observe_ui", { root: "@r1", mode: "semantic" }, "Eye", "@r1 · semantic"],
    ["functions.search_ui", { text: "Appearance", stateId: "ignored" }, "Search", "Appearance"],
    ["inspect_ui", { ref: "@e12" }, "Eye", "@e12"],
    ["act_ui", { actions: [{ action: "press", ref: "@e12" }] }, "MousePointer", "press @e12"],
    ["wait_for", { text: "Ready" }, "Clock", "Ready"],
    ["ask_user", { questions: [{ prompt: "Choose an environment" }] }, "MessageSquare", "Choose an environment"],
    ["mcp", { tool: "list_plugins" }, "Plug", "list_plugins"],
    ["web_search", { queries: ["Paseo plugin SDK"] }, "Search", "Paseo plugin SDK"],
  ] as const)("recognizes %s without requiring a normalized shell/read detail", (name, input, icon, summary) => {
    expect(resolveToolCallPresentation({ name, detail: { type: "unknown", input, output: null } })).toMatchObject({ icon, summary });
  });

  it.each([null, undefined, 0, false, [], {}, '{"code":', { actions: [null, 123] }])("handles missing or malformed input %j", input => {
    const result = inputPresentation("future_tool", input);
    expect(result).toEqual({ category: "unknown", icon: "Wrench" });
  });

  it("bounds huge code and JSON input while retaining the complete original detail", () => {
    const input = { code: "await something(); " + "x".repeat(1_000_000) };
    const source = { type: "tool_call" as const, callId: "synthetic", name: "exec", status: "running" as const,
      error: null, detail: { type: "unknown" as const, input, output: null } };
    const data = createToolCallData(source);
    expect(data.presentation.summary!.length).toBeLessThanOrEqual(180);
    expect(data.presentation.icon).toBe("Code");
    expect(data.detail).toEqual(source.detail);
    expect(inputPresentation("read", JSON.stringify({ path: "x".repeat(100_000) })).summary).toBeUndefined();
    expect(inputPresentation("exec", " ".repeat(1_000_000)).summary).toBe("JavaScript");
  });

  it("keeps complete file paths while shortening only the header summary", () => {
    const path = "src/" + "x".repeat(1000) + ".ts";
    const data = inputPresentation("read", { path });
    expect(data.filePath).toBe(path);
    expect(data.summary!.length).toBeLessThanOrEqual(180);
  });

  it("summarizes actions without leaking typed text or state identifiers", () => {
    const data = inputPresentation("act_ui", { stateId: "private-state", actions: [
      { action: "setText", ref: "@e10", text: "password-secret" },
      { action: "press", ref: "@e11" }, { action: "scroll" }, { action: "keypress" },
    ] });
    expect(data.summary).toBe("setText @e10 · press @e11 · scroll · +1 more");
    expect(data.summary).not.toContain("secret");
    expect(data.summary).not.toContain("private-state");
  });

  it("keeps code out of the header instead of guessing inner tool calls", () => {
    expect(inputPresentation("exec", { code: "// comment\n\nthrow new Error('not executed');\nnext();" }).summary)
      .toBe("JavaScript");
    expect(inputPresentation("vendor.exec", { code: "something();" }).icon).toBe("Wrench");
  });
});
