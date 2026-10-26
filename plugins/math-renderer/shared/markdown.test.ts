import { describe, expect, it } from "vitest";
import { parseDocument } from "./markdown";
import { transformMessage } from "../client/transform";

const math = "$$x^2$$";
describe("conservative Markdown + display math", () => {
  it.each(["$$x^2$$", "$$\nx^2\n$$", "\\[\nx^2\n\\]", "```math\nx^2\n```"])("recognizes %s", text => {
    expect(parseDocument(text)?.formulas).toBe(1);
    expect(transformMessage({ item: { type: "assistant_message", text }, phase: "complete" })?.items[0].data).toEqual({ text });
  });
  it.each(["normal", "$5 and $10", "`$$x$$`", "```js\n$$x$$\n```", "    $$x$$", "\\$\\$x\\$\\$", "$$\nx^2", "```math\nx^2"])("passes native content through: %s", text => {
    expect(transformMessage({ item: { type: "assistant_message", text }, phase: "complete" })).toBeUndefined();
  });
  it("typesets inline formulas and keeps a subsequent unfinished block", () => {
    const doc = parseDocument(math + "\n\n行内 \\(x^2\\) 公式。\n\n\\[\nx^3")!;
    expect(doc.formulas).toBe(2);
    expect(doc.blocks[1]).toMatchObject({ inline: [
      { kind: "text", text: "行内 " }, { kind: "math", tex: "x^2", raw: "\\(x^2\\)" }, { kind: "text", text: " 公式。" },
    ] });
    expect(doc.blocks[2]).toEqual({ kind: "pending", text: "\\[\nx^3" });
  });
  it.each(["Let $x$ be real.", "If \\(a \\ne b\\), stop.", "- **$E=mc^2$** holds", "> see $\\alpha_1$"])("renders inline math: %s", text => {
    expect(parseDocument(text)?.formulas).toBe(1);
    expect(transformMessage({ item: { type: "assistant_message", text }, phase: "complete" })?.items[0].data).toEqual({ text });
  });
  it.each(["costs $5 and $10", "$5-$6 each", "US$5 and US$6", "pay $ 5 or $ 6", "a $x $ b", "\\$x\\$", "`$x$`", "$x", "\\(x", "\\(\\)", "$$ $$ x"])("keeps prices and unclosed TeX as text: %s", text => {
    expect(parseDocument(text)?.formulas ?? 0).toBe(0);
    expect(transformMessage({ item: { type: "assistant_message", text }, phase: "complete" })).toBeUndefined();
  });
  it("supports lists, quotes, headings, code and web links", () => {
    const text = "# Result\n\n- **one**\n- [two](https://example.com)\n\n> quote\n\n" + math + "\n\n```js\nconst x = 1\n```";
    expect(parseDocument(text)?.formulas).toBe(1);
  });
  it.each(["![image](https://example.com/x.png)", "[file](./a.ts)", "|a|b|\n|-|-|\n|1|2|", "<div>hi</div>", "[email](mailto:x@example.com)", "```js\nconst x = 1\n```"])("hands formula-free blocks to host Markdown: %s", prefix => {
    expect(parseDocument(prefix + "\n\n" + math)?.blocks).toEqual([
      { kind: "markdown", text: prefix }, { kind: "math", tex: "x^2", raw: math },
    ]);
  });
  it("joins consecutive formula-free blocks into one exact source slice", () => {
    expect(parseDocument("# Title\n\nOne\n\n\n- a\n- b\n\n" + math + "\n\nAfter")?.blocks).toEqual([
      { kind: "markdown", text: "# Title\n\nOne\n\n\n- a\n- b" },
      { kind: "math", tex: "x^2", raw: math },
      { kind: "markdown", text: "After" },
    ]);
  });
  it("keeps a whole list or quote with a formula in one plugin block, preserving numbering", () => {
    const blocks = parseDocument("3. first\n4. has $x$\n\n> quoted\n>\n> $$y$$")!.blocks;
    expect(blocks.map(block => block.kind)).toEqual(["list", "quote"]);
    expect(blocks[0]).toMatchObject({ start: 3 });
  });
  it("repeats link reference definitions in every host segment", () => {
    const blocks = parseDocument('See [docs][d].\n\n' + math + '\n\nAgain [docs][d].\n\n[d]: https://example.com/a "A \\"t\\""')!.blocks;
    const definition = '\n\n[D]: <https://example.com/a> "A \\"t\\""';
    expect(blocks[0]).toEqual({ kind: "markdown", text: "See [docs][d]." + definition });
    expect(blocks[2]).toEqual({ kind: "markdown", text: "Again [docs][d]." + definition });
  });
  it("does not append definitions inside an unclosed fence", () => {
    const blocks = parseDocument("[r]: https://example.com\n\n" + math + "\n\n```\ncode")!.blocks;
    expect(blocks.at(-1)).toEqual({ kind: "markdown", text: "```\ncode" });
  });
  it.each(["![i](https://example.com/x.png) and $x$", "[file](./a.ts) for $x$", "|$a$|b|\n|-|-|\n|1|2|",
    "<b>hi</b> $x$", "[email](mailto:x@example.com) $x$", "- ![i](https://example.com/x.png)\n- $x$"])("keeps the reply native when an unsupported construct shares a formula block: %s", text => {
    expect(parseDocument(text)).toBeNull();
  });
  it("keeps raw input and delegates replacement identity to the host", () => {
    const text = math + "\n\nMore";
    const one = transformMessage({ item: Object.freeze({ type: "assistant_message" as const, text }), phase: "complete" });
    const two = transformMessage({ item: { type: "assistant_message", text: text + " words" }, phase: "complete" });
    expect(one?.items[0].id).toBeUndefined();
    expect(two?.items[0].id).toBeUndefined();
    expect(JSON.parse(JSON.stringify(one))).toEqual(one);
    expect(one?.items[0].data).toEqual({ text });
  });
  it("bounds large or empty input and formula count", () => {
    expect(parseDocument("")).toBeNull();
    expect(parseDocument(math + "x".repeat(96_000))).toBeNull();
    expect(parseDocument(Array(64).fill(math).join("\n\n"))?.formulas).toBe(64);
    expect(parseDocument(Array(65).fill(math).join("\n\n"))).toBeNull();
    expect(parseDocument(Array(65).fill("$x$").join(" "))).toBeNull();
  });
  it.each(["> ```math\n> x^2\n> ```", "- item\n\n  $$\n  x^2\n  $$"])("handles nested math without flattening containers: %s", text => {
    expect(parseDocument(text)?.formulas).toBe(1);
  });
  it("preserves underscores/backslashes inside inline TeX", () => {
    const doc = parseDocument("inline $x_i$ and $x_j$ with \\(x_i\\), but \\[a_b\\] stays")!;
    expect(doc.formulas).toBe(3);
    expect(doc.blocks[0]).toMatchObject({ inline: [
      { kind: "text", text: "inline " }, { kind: "math", tex: "x_i", raw: "$x_i$" },
      { kind: "text", text: " and " }, { kind: "math", tex: "x_j", raw: "$x_j$" },
      { kind: "text", text: " with " }, { kind: "math", tex: "x_i", raw: "\\(x_i\\)" },
      { kind: "text", text: ", but \\[a_b\\] stays" },
    ] });
  });
  it("does not combine multiple same-line formulas into one expression", () => {
    expect(parseDocument("$$a$$ and $$b$$")?.formulas).toBe(0);
  });
});
