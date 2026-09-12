import { describe, expect, it } from "vitest";
import { projectPluginTimelineItems } from "./fixtures/paseo-0.8/plugins/projection";
import { transformTimelineItem } from "./fixtures/paseo-0.8/plugins/model";
import { prepareToolCallHistory, projectToolCallDetailLevel } from "./fixtures/paseo-0.8/tool-calls/projection";
import { transformMessage } from "../client/transform";
const call = id => ({
  id, kind: "tool_call", timestamp: new Date(0),
  payload: { source: "agent", data: {
    provider: "pi", callId: id, name: "exec", status: "completed", error: null,
    detail: { type: "shell", command: "echo " + id, output: id },
  } },
});
const message = text => ({ id: "message-1", kind: "assistant_message", timestamp: new Date(0), text });
const plugins = [{ id: "math-prototype", timelineTransformers: [{
  id: "block-math", query: { itemType: "assistant_message" }, transform: transformMessage,
}] }];
const transform = input => transformTimelineItem({ ...input, plugins });
describe("pinned 0.8 host projection, not a live-host test", () => {
  it.each(["overview", "detailed"])("preserves native tools in %s", level => {
    const calls = [call("a"), call("b")];
    const head = [...calls, message("$$x^2$$")];
    const before = JSON.stringify(head);
    const projected = projectToolCallDetailLevel({
      level, tail: [], head, preparedHistory: prepareToolCallHistory(level, []), isTurnActive: false,
    });
    const result = projectPluginTimelineItems(projected.head, transform);
    const tools = result.filter(item => item.kind === "tool_call");
    expect(tools.length).toBe(level === "overview" ? 1 : 2);
    if (level === "overview") expect(projected.groupsByHostId.get(tools[0].id).run.calls).toEqual(calls);
    expect(result.at(-1).kind).toBe("plugin");
    expect(JSON.stringify(head)).toBe(before);
    expect(projectPluginTimelineItems(projected.head, undefined)).toEqual(projected.head);
  });
  it("records that assistant updates arrive as complete, with stable projection ID", () => {
    const phases = [];
    const run = text => projectPluginTimelineItems([message(text)], input => {
      phases.push(input.phase); return transform(input);
    });
    const first = run("$$x^2$$");
    const second = run("$$x^2$$\n\nStill updating");
    expect(first[0].id).toBe(second[0].id);
    expect(phases).toEqual(["complete", "complete"]);
    expect(second[0].data.text).toContain("Still updating");
  });
  it("passes unsupported/plain messages through and restores source when removed", () => {
    const originals = [message("No formula"), message("![image](https://example.com/x)\n\n$$x$$")];
    expect(projectPluginTimelineItems(originals, transform)).toEqual(originals);
    const formula = [message("$$x^2$$")];
    projectPluginTimelineItems(formula, transform);
    expect(projectPluginTimelineItems(formula, undefined)).toEqual(formula);
  });
  it("keeps split rows and different messages distinct in the real host identity model", () => {
    const source = ["$$a$$", "$$b$$", "$$c$$"].map((text, n) => ({
      ...message(text), id: "split-" + n, messageId: n < 2 ? "same-message" : "other-message",
    }));
    const rows = projectPluginTimelineItems(source, transform);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    expect(rows.map(row => row.data.text)).toEqual(source.map(row => row.text));
    const updated = source.map(row => ({ ...row, text: row.text + "\n\nMore" }));
    expect(projectPluginTimelineItems(updated, transform).map(row => row.id)).toEqual(rows.map(row => row.id));
  });
});
