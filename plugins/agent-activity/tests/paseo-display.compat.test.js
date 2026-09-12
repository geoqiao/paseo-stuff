import { describe, expect, it } from "vitest";
import { prepareToolCallHistory, projectToolCallDetailLevel } from "./fixtures/paseo-0.8/tool-calls/projection";
import { projectPluginTimelineItems } from "./fixtures/paseo-0.8/plugins/projection";
import { transformToolCall } from "../client/transform";

const call = (id, command, status = "completed") => ({
  id, kind: "tool_call", timestamp: new Date(0),
  payload: { source: "agent", data: {
    provider: "pi", callId: id, name: "exec", status, error: status === "failed" ? "failure" : null,
    detail: { type: "shell", command, output: command + " output" },
  } },
});
function transformer({ item, phase, sourceId }) {
  if (item.type !== "tool_call") return undefined;
  return transformToolCall({ item, phase })?.items.map((entry, index) => ({
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
