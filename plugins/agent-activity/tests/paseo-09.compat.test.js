import { describe, expect, it } from "vitest";
import { createStreamPresentation, transformTimelineItem } from "./host-09";
import { transformReasoning, transformToolCall } from "../client/transform";

const plugins = [{ id: "activity", timelineTransformers: [
  { id: "tools", query: { itemType: "tool_call" }, transform: transformToolCall },
  { id: "thoughts", query: { itemType: "reasoning" }, transform: transformReasoning },
] }];
const transform = input => transformTimelineItem({ ...input, plugins });
const call = (id, status = "completed", name = "exec", detail = { type: "shell", command: id, output: id }) => ({
  id, kind: "tool_call", timestamp: new Date(0), payload: { source: "agent", data: {
    provider: "pi", callId: id, name, status, error: status === "failed" ? "error" : null, detail,
  } },
});
const input = (head, level = "detailed") => ({ head, tail: [], level, transform, isTurnActive: true });
describe("Paseo 0.9.0-beta.1 actual presentation pipeline", () => {
  it.each(["running", "completed", "failed", "canceled"])("retains all %s tool data in Full detail", status => {
    const original = [call("one"), call("two", status)];
    const before = JSON.stringify(original);
    const { head } = createStreamPresentation()(input(original));
    expect(head.map(item => item.data.detail.command)).toEqual(["one", "two"]);
    expect(head[1].data.status).toBe(status);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("documents Summary bypass without claiming grouping compatibility", () => {
    const calls = [call("one"), call("two")];
    const native = createStreamPresentation()({ ...input(calls, "overview"), transform: undefined });
    expect(native.head).toHaveLength(1);
    expect(native.groupsByHostId.get(native.head[0].id).run.calls).toHaveLength(2);
    const custom = createStreamPresentation()(input(calls, "overview"));
    expect(custom.head).toHaveLength(2);
    expect(custom.head.map(item => item.data.detail.command)).toEqual(["one", "two"]);
    expect(custom.groupsByHostId.size).toBe(0);
  });
  it.each(["overview", "detailed"])("preserves native plan filtering and rendering in %s", level => {
    const calls = [call("exit", "completed", "ExitPlanMode"), call("pending", "running", "plan_approval"),
      call("done", "completed", "plan_approval", { type: "plan", plan: "Keep native" }),
      call("rejected", "failed", "plan_approval", { type: "plan", plan: "Rejected" })];
    const native = createStreamPresentation()({ ...input(calls, level), transform: undefined });
    const custom = createStreamPresentation()(input(calls, level));
    expect(custom.head).toEqual(native.head);
    expect(custom.head.map(item => item.id)).toEqual(["done", "rejected"]);
    expect(custom.head.every(item => item.kind === "tool_call")).toBe(true);
  });
  it("preserves source identity through live updates and history promotion", () => {
    const present = createStreamPresentation();
    const first = present(input([call("one", "running")]));
    const finalCall = call("one");
    const final = present({ ...input([]), tail: [finalCall], isTurnActive: false });
    expect(final.tail[0].id).toBe(first.head[0].id);
    expect(final.tail[0].data.status).toBe("completed");
  });
  it("keeps native speech and full accumulated reasoning", () => {
    const speech = call("speech", "completed", "speak", { type: "unknown", input: "Hello" });
    const thought = { id: "thought", kind: "thought", status: "loading", text: "First\n\nSecond", timestamp: new Date(0) };
    const result = createStreamPresentation()(input([thought, speech]));
    expect(result.head[0].data).toEqual({ text: thought.text, phase: "streaming" });
    expect(result.head[1]).toEqual(speech);
  });
});
