import { describe, expect, it } from "vitest";
import { prepareToolCallHistory, projectToolCallDetailLevel } from "./fixtures/paseo-0.8/tool-calls/projection";
import { projectPluginTimelineItems } from "./fixtures/paseo-0.8/plugins/projection";
import { transformReasoning, transformToolCall } from "../client/transform";

const call = (id, command, status = "completed") => ({
  id, kind: "tool_call", timestamp: new Date(0),
  payload: { source: "agent", data: {
    provider: "pi", callId: id, name: "exec", status, error: status === "failed" ? "failure" : null,
    detail: { type: "shell", command, output: command + " output" },
  } },
});
function transformer({ item, phase, sourceId }) {
  const transform = item.type === "reasoning" ? transformReasoning : item.type === "tool_call" ? transformToolCall : undefined;
  return transform?.({ item, phase })?.items.map((entry, index) => ({
    ...entry, pluginId: "colorful-agent-activity", id: sourceId + "/" + index,
  }));
}
function project(level, calls, active = false) {
  const projected = projectToolCallDetailLevel({
    level, tail: [], head: calls, preparedHistory: prepareToolCallHistory(level, []), isTurnActive: active,
  });
  return { projected, items: projectPluginTimelineItems(projected.head, transformer) };
}
describe("actual Paseo 0.8 projection compatibility (pinned upstream fixtures)", () => {
  it("keeps assistant messages native and exact Thinking text in the density adapter", () => {
    const native = [{ id: "thought", kind: "thought", status: "loading", text: "**Keep this native**", timestamp: new Date(0) },
      { id: "answer", kind: "assistant_message", text: "Answer", timestamp: new Date(0) }];
    const projected = projectPluginTimelineItems(native, transformer);
    expect(projected[0].data).toEqual({ text: "**Keep this native**", phase: "streaming" });
    expect(projected[1]).toEqual(native[1]);
    const completed = projectPluginTimelineItems([{ ...native[0], status: "complete", text: "**Final**" }, native[1]], transformer);
    expect(completed.map(item => item.id)).toEqual(projected.map(item => item.id));
    expect(completed[0].data).toEqual({ text: "**Final**", phase: "complete" });
  });
  it("keeps one source identity for streaming/final conversion snapshots and preserves sibling tools", () => {
    const code = call("code", "unused", "running");
    code.payload.data.detail = { type: "unknown", input: { code: "compose tools" }, output: {
      content: [], details: { cellId: "cell", status: "running", traces: [{
        id: "trace", name: "exec_command", input: { cmd: "npm test" }, status: "running",
      }] },
    } };
    const before = project("detailed", [code, call("plain", "ordinary shell")], true).items;
    expect(before).toHaveLength(2);
    expect(before[0].data.detail.input.code).toBe("compose tools");
    expect(before[0].data).not.toHaveProperty("activity");
    const final = structuredClone(code);
    final.payload.data.status = "completed";
    Object.assign(final.payload.data.detail.output.details, { codeMode: true, status: "result" });
    final.payload.data.detail.output.details.traces[0].status = "done";
    const after = project("detailed", [final, call("plain", "ordinary shell")]).items;
    expect(after.map(item => item.id)).toEqual(before.map(item => item.id));
    expect(after[0].data).not.toHaveProperty("activity");
    expect(after[0].data.detail).toEqual(final.payload.data.detail);
    expect(after[1].data.detail.command).toBe("ordinary shell");
  });
  it("leaves native speak messages untouched", () => {
    const spoken = call("speech", "hello");
    spoken.payload.data.name = "speak";
    spoken.payload.data.detail = { type: "unknown", input: "Hello there" };
    const { items } = project("detailed", [spoken]);
    expect(items).toEqual([spoken]);
  });
  it.each(["running", "completed", "failed", "canceled"])("Full detail preserves all %s calls and their data", (status) => {
    const { items } = project("detailed", [call("1", "first"), call("2", "second", status)], status === "running");
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.data.detail.command)).toEqual(["first", "second"]);
    expect(items[1].data.status).toBe(status);
  });
  it("documents the known Summary blocker rather than claiming compatibility", () => {
    const { projected, items } = project("overview", [call("1", "first"), call("2", "second")]);
    expect(projected.groupsByHostId.get("1").run.calls).toHaveLength(2);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("plugin");
    expect(items[0].data.detail.command).toBe("second");
    expect(projected.groupsByHostId.has(items[0].id)).toBe(false);
  });
  it("preserves Summary correctly when the tool transformer is not registered", () => {
    const calls = [call("1", "first"), call("2", "second", "running")];
    const { projected } = project("overview", calls, true);
    const native = projectPluginTimelineItems(projected.head, undefined);
    expect(native[0].kind).toBe("tool_call");
    expect(projected.groupsByHostId.get(native[0].id).run.calls).toEqual(calls);
  });
  it("switching projection modes does not mutate the underlying history", () => {
    const calls = [call("1", "first"), call("2", "second")];
    const before = JSON.stringify(calls);
    expect(project("detailed", calls).items).toHaveLength(2);
    expect(project("overview", calls).items).toHaveLength(1);
    expect(project("detailed", calls).items).toHaveLength(2);
    expect(JSON.stringify(calls)).toBe(before);
  });
});
