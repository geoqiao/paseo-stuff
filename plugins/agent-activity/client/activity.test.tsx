import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReasoningItemData, ToolCallItemData } from "../shared/timeline";
import { createToolCallData } from "../shared/timeline";
import { ReasoningActivity, ToolActivity } from "./activity";
import { copyText, useRevealedText } from "@getpaseo/plugin/client/react-native";
import { PREVIEW_CHARS, PREVIEW_LINES } from "../shared/details";
import { useSyntaxTokens } from "./highlight";

vi.mock("react-native", () => ({ Pressable: "Pressable", Text: "Text", View: "View", ActivityIndicator: "ActivityIndicator" }));
vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => ({ status: "ready", values: { palette: "vivid" } }),
}));
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
  Icon: "Icon",
  ScrollView: "ScrollView",
  useRevealedText: vi.fn((text: string) => text),
}));
vi.mock("./highlight", () => ({ useSyntaxTokens: vi.fn(() => null) }));

const mounted = new Set<ReactTestRenderer>();

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.mocked(useSyntaxTokens).mockClear();
  vi.mocked(useRevealedText).mockClear();
  vi.spyOn(console, "error").mockImplementation((message, ...args: unknown[]) => {
    if (String(message).startsWith("react-test-renderer is deprecated.")) return;
    throw new Error([message, ...args].map(String).join(" "));
  });
});
afterEach(async () => {
  await act(async () => {
    for (const renderer of mounted) renderer.unmount();
  });
  mounted.clear();
  vi.restoreAllMocks();
});

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  mounted.add(renderer);
  return renderer;
}

function labels(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAllByProps({ accessibilityRole: "button" })
    .map((button) => button.props.accessibilityLabel as string)
    .filter((label) => /^(Expand|Collapse) /.test(label));
}

function displayed(renderer: ReactTestRenderer): string {
  return renderer.root.findAll((node) => String(node.type) === "Text")
    .flatMap((node) => node.children.filter((child) => typeof child === "string")).join("\n");
}

async function press(renderer: ReactTestRenderer, label: string) {
  await act(async () => renderer.root.findByProps({ accessibilityLabel: label }).props.onPress());
}

async function click(renderer: ReactTestRenderer, index = 0): Promise<void> {
  await act(async () => {
    renderer.root.findAllByProps({ accessibilityRole: "button" }).filter((button) => /^(Expand|Collapse) /.test(button.props.accessibilityLabel))[index]!.props.onPress();
  });
}

function toolData(status: ToolCallItemData["status"]): ToolCallItemData {
  return {
    name: "test-tool",
    status,
    detail: { type: "plain_text", text: "test output" },
    presentation: { category: "unknown", icon: "Wrench", label: "Test tool" },
  };
}

describe.each([
  { name: "wide dark desktop", compact: false, platform: "web" as const, dark: true },
  { name: "compact light mobile", compact: true, platform: "ios" as const, dark: false },
])("manual-only expansion: $name", ({ compact, platform, dark }) => {
  function props<Data>(data: Data, timestamp = 1): PluginTimelineItemProps<Data> {
    return {
      agentId: "test-agent",
      timestamp: new Date(timestamp),
      host: { id: "test-host", label: "Test host" },
      layout: { compact, platform },
      theme: {
        colors: {
          surface0: dark ? "#101010" : "#ffffff",
          surface1: dark ? "#181818" : "#f4f4f5",
          surface2: dark ? "#242424" : "#e4e4e7",
          foreground: dark ? "#f4f4f5" : "#18181b",
          foregroundMuted: "#71717a",
          border: "#71717a",
          accent: "#60a5fa",
          accentForeground: "#0f172a",
          statusSuccess: "#4ade80",
          statusWarning: "#fbbf24",
          statusDanger: "#f87171",
        },
      } as PluginTimelineItemProps["theme"],
      item: { type: "plugin", kind: "test", version: 1, data },
    };
  }

  it("keeps the activity icon and manual disclosure through a tool status update", async () => {
    const data = (status: "running" | "completed") => createToolCallData({
      type: "tool_call", callId: "activity-icon", name: "paseo_get_agent_activity", status, error: null,
      detail: { type: "unknown", input: { agentId: "synthetic-agent" }, output: status },
    });
    const renderer = await mount(<ToolActivity {...props(data("running"))} />);
    const checkIcon = () => {
      const icon = renderer.root.findAll((node) => String(node.type) === "Icon" && node.props.name === "Activity");
      expect(icon).toHaveLength(1);
      expect(icon[0]!.props).toMatchObject({ size: 14, color: props(data("running")).theme.colors.foregroundMuted });
    };
    checkIcon();
    await click(renderer);
    expect(labels(renderer)[0]).toMatch(/^Collapse /);
    await act(async () => renderer.update(<ToolActivity {...props(data("completed"), 2)} />));
    checkIcon();
    expect(labels(renderer)[0]).toMatch(/^Collapse /);
    await click(renderer);
    checkIcon();
    expect(labels(renderer)[0]).toMatch(/^Expand /);
  });

  it.each(["running", "completed", "failed", "canceled"] as const)(
    "starts a %s tool call collapsed",
    async (status) => {
      const renderer = await mount(<ToolActivity {...props(toolData(status))} />);
      expect(labels(renderer)).toEqual(["Expand Test tool"]);
      expect(JSON.stringify(renderer.toJSON())).not.toContain("test output");
    },
  );

  it.each(["streaming", "complete"] as const)("starts %s reasoning collapsed", async (phase) => {
    const renderer = await mount(<ReasoningActivity {...props<ReasoningItemData>({ text: "test reasoning", phase })} />);
    expect(labels(renderer)).toEqual(["Expand Thinking"]);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("test reasoning");
  });

  it("allows opening and closing running tools without updates overriding the choice", async () => {
    const renderer = await mount(<ToolActivity {...props(toolData("running"))} />);
    await click(renderer);
    expect(labels(renderer)).toEqual(["Collapse Test tool"]);
    expect(JSON.stringify(renderer.toJSON())).toContain("test output");
    await act(async () => renderer.update(<ToolActivity {...props(toolData("running"), 2)} />));
    expect(labels(renderer)).toEqual(["Collapse Test tool"]);
    await click(renderer);
    expect(labels(renderer)).toEqual(["Expand Test tool"]);
    await act(async () => renderer.update(<ToolActivity {...props(toolData("completed"), 3)} />));
    expect(labels(renderer)).toEqual(["Expand Test tool"]);
  });

  it("allows closing streaming reasoning and keeps it closed after more text and completion", async () => {
    const renderer = await mount(<ReasoningActivity {...props<ReasoningItemData>({ text: "first", phase: "streaming" })} />);
    await click(renderer);
    expect(labels(renderer)).toEqual(["Collapse Thinking"]);
    await click(renderer);
    for (const phase of ["streaming", "complete"] as const) {
      await act(async () => renderer.update(<ReasoningActivity {...props<ReasoningItemData>({ text: "more text", phase }, 2)} />));
      expect(labels(renderer)).toEqual(["Expand Thinking"]);
    }
  });

  it("uses Paseo-style Thinking typography and a small Brain without changing disclosure", async () => {
    const renderer = await mount(<ReasoningActivity {...props<ReasoningItemData>({ text: "reasoning body", phase: "complete" })} />);
    const title = () => renderer.root.findAll((node) => String(node.type) === "Text" && node.children.includes("Thinking"))[0]!;
    const header = () => renderer.root.findByProps({ accessibilityLabel: "Expand Thinking" });
    expect(title().props.style).toMatchObject({ fontSize: 14, fontWeight: "400", color: props(null).theme.colors.foregroundMuted });
    expect(renderer.root.findByProps({ name: "Brain" }).props).toMatchObject({ size: 12, color: props(null).theme.colors.foregroundMuted });
    expect(displayed(renderer)).not.toContain("Thought process");
    await act(async () => header().props.onHoverIn());
    expect(title().props.style.color).toBe(props(null).theme.colors.foreground);
    await act(async () => header().props.onHoverOut());
    await click(renderer);
    expect(title().props.style.color).toBe(props(null).theme.colors.foreground);
    expect(renderer.root.findAllByProps({ name: "ChevronRight" })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ name: "ChevronDown" })).toHaveLength(0);
    expect(displayed(renderer)).toContain("reasoning body");
  });

  it("starts a newer card collapsed without closing an explicitly opened older card", async () => {
    const first = <ToolActivity key="first" {...props(toolData("completed"))} />;
    const renderer = await mount(<>{first}</>);
    await click(renderer);
    await act(async () => renderer.update(<>{first}<ToolActivity key="second" {...props(toolData("running"), 2)} /></>));
    expect(labels(renderer)).toEqual(["Collapse Test tool", "Expand Test tool"]);
    await click(renderer, 1);
    expect(labels(renderer)).toEqual(["Collapse Test tool", "Collapse Test tool"]);
  });
  it("has a neutral arrow-free header with no background fill or bold monospace title", async () => {
    const renderer = await mount(<ToolActivity {...props(toolData("completed"))} />);
    const header = renderer.root.findByProps({ accessibilityLabel: "Expand Test tool" });
    const style = Object.assign({}, ...header.props.style({ pressed: false }).filter(Boolean));
    expect(style.backgroundColor).toBeUndefined();
    expect(style.minHeight).toBe(compact ? 44 : 16);
    const title = renderer.root.findAll((node) => String(node.type) === "Text" && node.children.includes("Test tool"))[0]!;
    expect(title.props.style.fontFamily).toBeUndefined();
    expect(title.props.style.fontWeight).toBeUndefined();
    expect(title.props.style).toMatchObject({ flexShrink: 1, minWidth: 0, maxWidth: "60%" });
    expect(renderer.root.findAllByProps({ name: "CircleCheck" })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ name: "ChevronRight" })).toHaveLength(0);
    expect(renderer.root.findByProps({ name: "Wrench" }).props).toMatchObject({ size: 14, color: props(null).theme.colors.foregroundMuted });
    expect(useSyntaxTokens).not.toHaveBeenCalled();
    await click(renderer);
    expect(renderer.root.findAllByProps({ name: "ChevronDown" })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: "Collapse Test tool" }).props.accessibilityState.expanded).toBe(true);
  });

  it("renders resolved unknown-tool icons and summaries, retaining disclosure across streaming", async () => {
    const source = { type: "tool_call" as const, callId: "synthetic", name: "exec", status: "running" as const,
      error: null, detail: { type: "unknown" as const, input: { code: 'await tools.exec_command({cmd: "npm test"});' }, output: null } };
    const renderer = await mount(<ToolActivity {...props(createToolCallData(source))} />);
    expect(renderer.root.findByProps({ name: "Code" }).props.size).toBe(14);
    expect(renderer.root.findAllByProps({ name: "Wrench" })).toHaveLength(0);
    expect(displayed(renderer)).toContain("JavaScript");
    expect(displayed(renderer)).not.toContain("await tools.exec_command");
    expect(labels(renderer)).toEqual(["Expand Exec"]);
    await click(renderer);
    await act(async () => renderer.update(<ToolActivity {...props(createToolCallData({ ...source, status: "completed" }))} />));
    expect(labels(renderer)).toEqual(["Collapse Exec"]);
    expect(renderer.root.findByProps({ name: "Code" })).toBeTruthy();
    const read = createToolCallData({ ...source, name: "read", detail: { type: "read", filePath: "src/main.ts", content: "hello" } });
    const fileRenderer = await mount(<ToolActivity {...props(read)} />);
    expect(fileRenderer.root.findByProps({ name: "FileCode2" })).toBeTruthy();
    expect(displayed(fileRenderer)).toContain(compact ? "main.ts" : "src/main.ts");
  });

  it("budgets for the host gap without negative margins or shrinking compact touch rows", async () => {
    for (const status of ["running", "completed", "failed", "canceled"] as const) {
      const renderer = await mount(<ToolActivity {...props(toolData(status))} />);
      const header = renderer.root.findByProps({ accessibilityLabel: "Expand Test tool" });
      const style = Object.assign({}, ...header.props.style({ pressed: false }).filter(Boolean));
      expect(style.minHeight).toBe(compact ? 44 : 16);
      expect(style.paddingVertical).toBe(compact ? 4 : 0);
      const title = renderer.root.findAll((node) => String(node.type) === "Text" && node.children.includes("Test tool"))[0]!;
      expect(title.props.style.lineHeight).toBe(compact ? 20 : 16);
      const row = renderer.root.findAll((node) => String(node.type) === "View")[0]!;
      expect(row.props.style).toEqual({ minWidth: 0 });
      if (status === "failed") {
        const error = renderer.root.findAll((node) => String(node.type) === "Text" && node.children.includes("Failed"))[0]!;
        expect(Object.assign({}, ...error.props.style).lineHeight).toBe(compact ? 20 : 16);
      }
    }
  });

  it("renders JS input directly, with complete code copy and original wrapper in Raw", async () => {
    const code = '// keep comment\nconst text = "a\\nb";\nawait run(text);';
    const input = { code, timeoutMs: 5000 };
    const data = { ...toolData("running"), name: "exec", detail: { type: "unknown", input, output: null } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain(code);
    expect(displayed(renderer)).toContain("Waiting for output…");
    expect(vi.mocked(useSyntaxTokens).mock.calls.some(([text, language]) => text === code && language === "javascript")).toBe(true);
    await press(renderer, "Copy Input");
    expect(copyText).toHaveBeenLastCalledWith(code);
    await press(renderer, "Show raw Input");
    await press(renderer, "Copy Input");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(input);
    await press(renderer, "Format Input");
    expect(displayed(renderer)).toContain(code);
  });

  it("renders unified diff colors and copies the selected source or complete edit detail", async () => {
    const detail = {
      type: "edit" as const,
      filePath: "README.md",
      unifiedDiff: [
        "--- a/README.md",
        "+++ b/README.md",
        "@@ -1,2 +1,3 @@",
        " ---",
        "---counter",
        "+++counter",
        "+---",
      ].join("\n"),
      oldString: "old source that remains available",
      newString: "new source that remains available",
    };
    const renderer = await mount(<ToolActivity {...props(createToolCallData({
      type: "tool_call", callId: "edit", name: "edit", status: "completed", error: null, detail,
    }))} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("+++counter");
    expect(displayed(renderer)).toContain("−--counter");
    const addRow = renderer.root.find((node) => String(node.type) === "Text" && node.children.includes("+++counter"));
    const removeRow = renderer.root.find((node) => String(node.type) === "Text" && node.children.includes("−--counter"));
    expect(Object.assign({}, ...addRow.props.style.filter(Boolean)).color).toBe(props(null).theme.colors.statusSuccess);
    expect(Object.assign({}, ...removeRow.props.style.filter(Boolean)).color).toBe(props(null).theme.colors.statusDanger);
    await press(renderer, "Copy Diff");
    expect(copyText).toHaveBeenLastCalledWith(detail.unifiedDiff);
    await press(renderer, "Show raw Diff");
    await press(renderer, "Copy Diff");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(detail);
  });

  it("serializes lazy Raw only when selected or its source changes, not for Copy or Show all", async () => {
    const tail = vi.fn(() => "x".repeat(100_000));
    const detail = {
      type: "edit", filePath: "a.ts", unifiedDiff: "@@ -1 +1 @@\n-old\n+new",
      get sourceTail() { return tail(); },
    };
    const data = { ...toolData("running"), detail };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(tail).not.toHaveBeenCalled();
    await press(renderer, "Show raw Diff");
    expect(tail).toHaveBeenCalledTimes(1);
    await press(renderer, "Copy Diff");
    await press(renderer, "Show all Diff");
    expect(tail).toHaveBeenCalledTimes(1);
    const nextTail = vi.fn(() => "current source");
    const updated = { ...data, detail: {
      type: "edit", filePath: "a.ts", unifiedDiff: detail.unifiedDiff,
      get sourceTail() { return nextTail(); },
    } };
    await act(async () => renderer.update(<ToolActivity {...props(updated)} />));
    await press(renderer, "Copy Diff");
    expect(nextTail).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0]).sourceTail).toBe("current source");
  });

  it("keeps read range metadata in Raw while normal Contents stays copied as content", async () => {
    const detail = { type: "read" as const, filePath: "README.md", content: "visible contents", offset: 0, limit: 0 };
    const renderer = await mount(<ToolActivity {...props(createToolCallData({
      type: "tool_call", callId: "read", name: "read", status: "completed", error: null, detail,
    }))} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("visible contents");
    await press(renderer, "Copy Contents");
    expect(copyText).toHaveBeenLastCalledWith(detail.content);
    await press(renderer, "Show raw Contents");
    await press(renderer, "Copy Contents");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(detail);
  });

  it("renders bounded readable result blocks, keeping metadata/images in full Raw copies", async () => {
    const text = Array.from({ length: 100 }, (_, i) => "tree line " + i).join("\n");
    const output = { content: [{ type: "text", text }, { type: "image", mimeType: "image/png", data: "B64".repeat(100_000) }] as Record<string, string>[], details: { extra: true } };
    const data = { ...toolData("running"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("tree line 19");
    expect(displayed(renderer)).not.toContain("tree line 20");
    expect(displayed(renderer)).not.toContain("B64");
    expect(displayed(renderer)).toContain("metadata and attachments in Raw");
    await press(renderer, "Show all Output");
    expect(displayed(renderer)).toContain("tree line 99");
    expect(displayed(renderer)).toContain("image/png · data in Raw");
    const updated = { ...data, status: "completed" as const, detail: { ...data.detail, output: { ...output, content: [...output.content, { type: "text", text: "tail update" }] } } };
    await act(async () => renderer.update(<ToolActivity {...props(updated)} />));
    expect(displayed(renderer)).toContain("tail update");
    await press(renderer, "Copy Output");
    expect(vi.mocked(copyText).mock.lastCall![0]).toContain("tree line 99");
    await press(renderer, "Show raw Output");
    await press(renderer, "Copy Output");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(updated.detail.output);
    await press(renderer, "Format Output");
    expect(renderer.root.findByProps({ accessibilityLabel: "Show less Output" })).toBeTruthy();
    await press(renderer, "Show less Output");
    expect(displayed(renderer)).not.toContain("tree line 99");
  });

  it("renders the DSH-projected ACP content wrapper without recursive unwrapping", async () => {
    const output = {
      content: [
        { type: "content", content: { type: "text", text: "real\nbody" } },
        { type: "content", content: { type: "image", mimeType: "image/png", data: "synthetic-image" } },
        { type: "content", content: { type: "text", text: '{"ok":true}' } },
      ],
    };
    const data = { ...toolData("completed"), name: "dsh", detail: { type: "unknown" as const, input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data as unknown as ToolCallItemData)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("real\nbody");
    expect(displayed(renderer)).toContain("[content · data in Raw]");
    expect(displayed(renderer)).toContain('"ok": true');
    await press(renderer, "Copy Output");
    expect(copyText).toHaveBeenLastCalledWith('real\nbody\n\n[content · data in Raw]\n\n{\n  "ok": true\n}');
    await press(renderer, "Show raw Output");
    await press(renderer, "Copy Output");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(output);
  });

  it("renders code-mode results as status and language-aware segments with one shared budget", async () => {
    const longOutput = Array.from({ length: 40 }, (_, index) => "nested line " + index).join("\n") + "\n[Output truncated]";
    const output = {
      content: [
        { type: "text", text: "Script completed" },
        { type: "text", text: JSON.stringify({ chunk_id: "first", wall_time_seconds: 0.3, output: longOutput, exit_code: 7 }) },
        { type: "image", mimeType: "image/png", data: "B64" },
        { type: "text", text: JSON.stringify({ chunk_id: "second", wall_time_seconds: 0.1, output: '{"ok":true}', exit_code: 0 }) },
        { type: "resource", uri: "https://example.invalid/never-fetch" },
      ],
      details: { codeMode: true, status: "result" },
    };
    const data = { ...toolData("completed"), name: "exec", detail: { type: "unknown" as const, input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data as unknown as ToolCallItemData)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("Script completed");
    expect(displayed(renderer)).toContain("Exit code: 7");
    expect(renderer.root.findAll(node => String(node.type) === "Text" && node.children.length === 1 && typeof node.children[0] === "string" && /^\n+$/.test(node.children[0]))).toHaveLength(0);
    expect(displayed(renderer)).toContain("nested line 0");
    expect(displayed(renderer)).not.toContain("nested line 39");
    expect(displayed(renderer).match(/Upstream output truncated · Show all cannot restore omitted output/g)).toHaveLength(1);
    expect(displayed(renderer)).not.toContain("Exit code: 0");
    expect(displayed(renderer)).toContain("Preview limit");
    expect(vi.mocked(useSyntaxTokens).mock.calls.some(([code, language]) => language === "json" && code.includes('"ok": true'))).toBe(false);
    await press(renderer, "Show all Output");
    expect(displayed(renderer)).toContain("nested line 39");
    expect(displayed(renderer)).toContain('"ok": true');
    expect(displayed(renderer)).toContain("image/png · data in Raw");
    expect(vi.mocked(useSyntaxTokens).mock.calls.some(([code, language]) => language === "json" && code.includes('"ok": true'))).toBe(true);
    await press(renderer, "Copy Output");
    expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining("nested line 39"));
    expect(copyText).toHaveBeenLastCalledWith(expect.not.stringContaining('"chunk_id"'));
    expect(vi.mocked(copyText).mock.lastCall![0].match(/Upstream output truncated · Show all cannot restore omitted output/g)).toHaveLength(1);
    await press(renderer, "Show raw Output");
    await press(renderer, "Copy Output");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(output);
  });

  it("keeps code-mode disclosure, Raw mode and complete selected-view copies through streaming", async () => {
    const makeOutput = (tail: string) => ({
      content: [
        { type: "text", text: "Still running (exec cell \"cell-1\"). Use wait once near expected completion; avoid short polling" },
        { type: "text", text: JSON.stringify({ chunk_id: "running", wall_time_seconds: 0.2, output: "start\n" + tail, session_id: 21 }) },
      ],
      details: { codeMode: true, status: "yielded", cellId: "cell-1" },
    });
    const longTail = Array.from({ length: 500 }, (_, index) => "line " + index).join("\n");
    const first = { ...toolData("running"), name: "exec", detail: { type: "unknown" as const, input: {}, output: makeOutput(longTail) } };
    const renderer = await mount(<ToolActivity {...props(first as unknown as ToolCallItemData)} />);
    await click(renderer);
    await press(renderer, "Show all Output");
    await press(renderer, "Show raw Output");
    expect(displayed(renderer)).toContain("chunk_id");
    const second = {
      ...first,
      status: "completed" as const,
      detail: {
        ...first.detail,
        output: {
          ...makeOutput("first\nsecond"),
          content: [
            ...makeOutput(longTail + "\nsecond").content,
            { type: "text", text: JSON.stringify({ chunk_id: "done", wall_time_seconds: 0.1, output: "tail", exit_code: 0 }) },
          ],
          details: { codeMode: true, status: "result" },
        },
      },
    };
    await act(async () => renderer.update(<ToolActivity {...props(second as unknown as ToolCallItemData)} />));
    expect(labels(renderer)).toEqual(["Collapse Test tool"]);
    expect(renderer.root.findByProps({ accessibilityLabel: "Show less Output" })).toBeTruthy();
    expect(displayed(renderer)).toContain("chunk_id");
    await press(renderer, "Copy Output");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(second.detail.output);
    await press(renderer, "Format Output");
    expect(displayed(renderer)).toContain("Exit code: 0");
    expect(renderer.root.findByProps({ accessibilityLabel: "Show less Output" })).toBeTruthy();
  });

  it("does not leak stale clipboard success/failure across a stream or Raw change", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(copyText).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const data = { ...toolData("running"), detail: { type: "unknown", input: {}, output: '{"a":1}' } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    await press(renderer, "Copy Output");
    expect(displayed(renderer)).toContain("Copying…");
    await act(async () => renderer.update(<ToolActivity {...props({ ...data, detail: { ...data.detail, output: '{"a":2}' } })} />));
    await act(async () => reject(new Error("old request")));
    expect(renderer.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    expect(displayed(renderer)).not.toContain("Copying…");
    await press(renderer, "Copy Output");
    expect(displayed(renderer)).toContain("Copied");
    await press(renderer, "Show raw Output");
    expect(displayed(renderer)).not.toContain("Copied");
  });

  it("formats UI quoted labels and paths only in the readable view, retaining exact Raw copying", async () => {
    const label = JSON.stringify('Synthetic panel\n  @e1 AXButton "Open"');
    const text = '@e42 AXStaticText ' + label + '\n  path: AXWindow ▸ AXGroup ▸ AXGroup ▸ AXStaticText ' + label;
    const output = { content: [{ type: "text", text }] };
    const data = { ...toolData("completed"), name: "search_ui", detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain('Text:\n    Synthetic panel\n      @e1 AXButton "Open"');
    expect(displayed(renderer)).toContain("AXGroup × 2");
    await press(renderer, "Copy Output");
    expect(vi.mocked(copyText).mock.lastCall![0]).toContain("AXGroup × 2");
    await press(renderer, "Show raw Output");
    await press(renderer, "Copy Output");
    expect(JSON.parse(vi.mocked(copyText).mock.lastCall![0])).toEqual(output);
  });

  it("retains JSON highlighting inside a single text result block", async () => {
    const output = { content: [{ type: "text", text: '{"ok":true}' }] };
    const data = { ...toolData("completed"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(vi.mocked(useSyntaxTokens).mock.calls.some(([text, language]) => text.includes('"ok": true') && language === "json")).toBe(true);
  });

  it("wraps oversized JSON fallback with an explicit formatting-limit notice", async () => {
    const output = '{"text":"' + "x".repeat(110_000) + '"}';
    const data = { ...toolData("completed"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("Formatting limit");
    expect(renderer.root.findAllByProps({ horizontal: true })).toHaveLength(0);
    expect(displayed(renderer)).not.toContain("x".repeat(PREVIEW_CHARS));
    await press(renderer, "Copy Output");
    expect(copyText).toHaveBeenLastCalledWith(output);
  });

  it("retains visible keyboard focus and neutral hover feedback", async () => {
    const renderer = await mount(<ToolActivity {...props(toolData("completed"))} />);
    const header = () => renderer.root.findByProps({ accessibilityLabel: "Expand Test tool" });
    await act(async () => header().props.onHoverIn());
    expect(Object.assign({}, ...header().props.style({ pressed: false }).filter(Boolean)).backgroundColor).toBe(props(null).theme.colors.surface1);
    await act(async () => { header().props.onFocus(); header().props.onHoverOut(); });
    expect(Object.assign({}, ...header().props.style({ pressed: false }).filter(Boolean))).toMatchObject({ outlineWidth: 1, outlineColor: props(null).theme.colors.accent });
  });

  it("formats JSON, toggles original text, and copies the complete selected representation", async () => {
    const raw = '{"id":90071992547409931234,"escape":"a\\\\nb"}';
    const data = { ...toolData("completed"), detail: { type: "unknown", input: { zero: 0, ok: false }, output: raw } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(JSON.stringify(renderer.toJSON())).toContain("90071992547409931234");
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Copy Output" }).props.onPress());
    expect(copyText).toHaveBeenLastCalledWith('{\n  "id": 90071992547409931234,\n  "escape": "a\\\\nb"\n}');
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Show raw Output" }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Copy Output" }).props.onPress());
    expect(copyText).toHaveBeenLastCalledWith(raw);
    expect(labels(renderer)).toEqual(["Collapse Test tool"]);
  });

  it("previews output, shows all only on click, and always copies the complete source", async () => {
    const output = Array.from({ length: 50 }, (_, index) => "line-" + index).join("\n");
    const data = { ...toolData("completed"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("line-19");
    expect(displayed(renderer)).not.toContain("line-20");
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Next page Output" })).toHaveLength(0);
    await press(renderer, "Copy Output");
    expect(copyText).toHaveBeenLastCalledWith(output);
    await press(renderer, "Show all Output");
    expect(displayed(renderer)).toContain("line-49");
    const updated = { ...data, detail: { ...data.detail, output: output + "\nline-50" } };
    await act(async () => renderer.update(<ToolActivity {...props(updated)} />));
    expect(displayed(renderer)).toContain("line-50");
    expect(renderer.root.findByProps({ accessibilityLabel: "Show less Output" })).toBeTruthy();
    await press(renderer, "Show less Output");
    expect(displayed(renderer)).not.toContain("line-49");
  });

  it("bounds a 100,000-line UI dump on initial expansion and streaming updates", async () => {
    const output = Array.from({ length: 100_000 }, (_, index) => "UI node " + index.toString().padStart(6, "0")).join("\n");
    const data = { ...toolData("running"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    expect(useSyntaxTokens).not.toHaveBeenCalled();
    await click(renderer);
    expect(displayed(renderer).match(/UI node /g)).toHaveLength(PREVIEW_LINES);
    expect(displayed(renderer)).not.toContain("UI node 099999");
    await act(async () => renderer.update(<ToolActivity {...props({ ...data, detail: { ...data.detail, output: output + "\nnew node" } })} />));
    expect(displayed(renderer).match(/UI node /g)).toHaveLength(PREVIEW_LINES);
    for (const [code] of vi.mocked(useSyntaxTokens).mock.calls) {
      expect(code.length).toBeLessThanOrEqual(PREVIEW_CHARS);
      expect(code.split("\n").length).toBeLessThanOrEqual(PREVIEW_LINES);
    }
    await press(renderer, "Show all Output");
    expect(displayed(renderer)).toContain("UI node 099999");
    await press(renderer, "Show less Output");
    expect(displayed(renderer).match(/UI node /g)).toHaveLength(PREVIEW_LINES);
  });

  it("previews a megabyte-long line while retaining Show all and complete copies", async () => {
    const output = "x".repeat(1_000_000);
    const data = { ...toolData("running"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    expect(displayed(renderer)).toContain("x".repeat(PREVIEW_CHARS));
    expect(displayed(renderer)).not.toContain("x".repeat(PREVIEW_CHARS + 1));
    await press(renderer, "Copy Output");
    expect(copyText).toHaveBeenLastCalledWith(output);
    await press(renderer, "Show all Output");
    expect(displayed(renderer)).toContain(output);
    await act(async () => renderer.update(<ToolActivity {...props({ ...data, detail: { ...data.detail, output: "replacement" } })} />));
    expect(displayed(renderer)).toContain("replacement");
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Show less Output" })).toHaveLength(0);
  });

  it("preserves Show all across Raw/Formatted changes without losing complete copies", async () => {
    const output = JSON.stringify(Array.from({ length: 60 }, (_, index) => ({ index })));
    const data = { ...toolData("completed"), detail: { type: "unknown", input: {}, output } };
    const renderer = await mount(<ToolActivity {...props(data)} />);
    await click(renderer);
    await press(renderer, "Show all Output");
    await press(renderer, "Show raw Output");
    expect(displayed(renderer)).toContain(output);
    await press(renderer, "Copy Output");
    expect(copyText).toHaveBeenLastCalledWith(output);
    await press(renderer, "Format Output");
    expect(displayed(renderer)).toContain('"index": 59');
    expect(renderer.root.findByProps({ accessibilityLabel: "Show less Output" })).toBeTruthy();
  });

  it("previews reasoning before pacing and shows the complete huge text only on request", async () => {
    const text = "```typescript\n" + Array.from({ length: 100_000 }, (_, index) => "const value" + index + " = 1;").join("\n") + "\n```";
    const renderer = await mount(<ReasoningActivity {...props<ReasoningItemData>({ text, phase: "streaming" })} />);
    expect(useRevealedText).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ name: "ChevronRight" })).toHaveLength(0);
    await click(renderer);
    expect(displayed(renderer)).toContain("value0");
    expect(displayed(renderer)).not.toContain("value99999");
    for (const [value] of vi.mocked(useRevealedText).mock.calls) {
      expect(value.length).toBeLessThanOrEqual(PREVIEW_CHARS);
      expect(value.split("\n").length).toBeLessThanOrEqual(PREVIEW_LINES);
    }
    await press(renderer, "Show all reasoning");
    expect(displayed(renderer)).toContain("```typescript");
    expect(displayed(renderer)).toContain("value99999");
    expect(renderer.root.findAll((node) => String(node.type) === "Text").length).toBeLessThan(20);
    await act(async () => renderer.update(<ReasoningActivity {...props<ReasoningItemData>({ text: text + "\nDone", phase: "complete" })} />));
    expect(displayed(renderer)).toContain("Done");
    await press(renderer, "Show less reasoning");
    expect(displayed(renderer)).not.toContain("value99999");
  });

  it("reports clipboard failure without collapsing the tool", async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error("denied"));
    const renderer = await mount(<ToolActivity {...props(toolData("completed"))} />);
    await click(renderer);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Copy Output" }).props.onPress());
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).children.join("")).toContain("Copy failed");
    expect(labels(renderer)).toEqual(["Collapse Test tool"]);
  });

  it("preserves raw mode during streaming and keeps errors in the collapsed header", async () => {
    const first = { ...toolData("running"), detail: { type: "unknown", input: {}, output: '{"a":1}' } };
    const renderer = await mount(<ToolActivity {...props(first)} />);
    await click(renderer);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Show raw Output" }).props.onPress());
    const updated = { ...first, detail: { ...first.detail, output: '{"a":2}' } };
    await act(async () => renderer.update(<ToolActivity {...props(updated)} />));
    expect(renderer.root.findByProps({ accessibilityLabel: "Format Output" })).toBeTruthy();
    await click(renderer);
    await act(async () => renderer.update(<ToolActivity {...props({ ...updated, status: "failed" as const, errorText: "full failure detail" })} />));
    expect(labels(renderer)).toEqual(["Expand Test tool"]);
    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("Failed");
    expect(tree).not.toContain("full failure detail");
  });

});
