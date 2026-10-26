import { describe, expect, it, vi } from "vitest";
import { createStreamPresentation, transformTimelineItem, ChatFindModel, getStreamItemMessageId } from "./host";
import { transformMessage } from "../client/transform";

const plugins = [{ id: "math", timelineTransformers: [
  { id: "math", query: { itemType: "assistant_message" }, transform: transformMessage },
] }];
const transform = input => transformTimelineItem({ ...input, plugins });
const message = text => ({ id: "answer", kind: "assistant_message", text, timestamp: new Date(0), timelineCursor: { epoch: "epoch", seq: 1 } });
const input = (head = [], tail = []) => ({ head, tail, level: "detailed", transform, isTurnActive: head.length > 0 });
describe("Paseo 0.13.2 whole-message presentation", () => {
  it("keeps streaming native and renders the whole completed reply with stable history identity", () => {
    const present = createStreamPresentation();
    const text = "Before\n\n$$x^2$$\n\nAfter";
    for (let n = 1; n <= text.length; n++) {
      const live = present(input([message(text.slice(0, n))]));
      expect([...live.tail, ...live.head].every(item => item.kind === "assistant_message")).toBe(true);
    }
    const final = present(input([], [message(text)]));
    expect(final.tail).toHaveLength(1);
    expect(final.tail[0].data.text).toBe(text);
    expect(final.tail[0].sourceId).toBe("answer");
    expect(final.tail[0].timelineCursor).toEqual({ epoch: "epoch", seq: 1 });
    expect(present(input([], [message(text)])).tail[0].id).toBe(final.tail[0].id);
  });
  it("renders a reply whose formula-free blocks use host-only Markdown", () => {
    const text = "$$x^2$$\n\n![plot](https://example.com/plot.png)\n\n[File](./file.ts)\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    const rows = createStreamPresentation()(input([], [message(text)])).tail;
    expect(rows.map(row => row.kind)).toEqual(["plugin"]);
    expect(rows[0].data.text).toBe(text);
  });
  it.each([
    "Inline $x$ next to ![plot](https://example.com/plot.png)",
    "| $a$ | b |\n|---|---|\n| 1 | 2 |",
    "See [File](./file.ts) for $x$",
    "$$x^2$$\n\n" + "a".repeat(96000),
    Array(65).fill("$$x$$").join("\n\n"),
  ])("keeps unsupported or oversized whole replies native", text => {
    const source = message(text);
    const rows = createStreamPresentation()(input([], [source])).tail;
    expect(rows).toEqual([source]);
    expect(rows).toEqual(createStreamPresentation()({ ...input([], [source]), transform: undefined }).tail);
  });
  it.each(["overview", "detailed"])("leaves tools unchanged in %s", level => {
    const tool = id => ({ id, kind: "tool_call", timestamp: new Date(0), payload: { source: "agent", data: {
      provider: "pi", callId: id, name: "exec", status: "completed", error: null, detail: { type: "shell", command: id, output: id },
    } } });
    const tail = [tool("one"), tool("two"), message("$$x$$")];
    const custom = createStreamPresentation()({ ...input([], tail), level });
    const native = createStreamPresentation()({ ...input([], tail), level, transform: undefined });
    expect(custom.tail.slice(0, -1)).toEqual(native.tail.slice(0, -1));
  });
  it("lets Chat Find target the rendered row through its source message", async () => {
    vi.useFakeTimers();
    const source = message("$$x^2$$\n\nfind-me");
    const present = createStreamPresentation();
    const custom = present(input([], [source]));
    const native = present({ ...input([], [source]), transform: undefined });
    const reveal = vi.fn(async () => ({ occurrence: 0, count: 1 }));
    const model = new ChatFindModel({
      search: async () => ({ epoch: "epoch", locations: [{ seq: 1, role: "assistant", count: 1 }], nextCursor: null }),
      load: async () => {}, reveal, clear() {},
    });
    try {
      model.updateHistory("epoch", [source]); model.open(); model.setQuery("find-me");
      await vi.advanceTimersByTimeAsync(121);
      const target = reveal.mock.calls[0][0];
      expect(target).toBe(source.id);
      expect(custom.tail.map(item => item.kind)).toEqual(["plugin"]);
      expect(custom.tail.map(getStreamItemMessageId)).toEqual([target]);
      // Native-reply mode restores the source row, whose formula source is searchable text.
      expect(native.tail).toEqual([source]);
      expect(native.tail.map(getStreamItemMessageId)).toEqual([target]);
    } finally { model.close(); vi.useRealTimers(); }
  });
});
