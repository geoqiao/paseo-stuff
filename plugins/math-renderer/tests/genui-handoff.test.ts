import { describe, expect, it } from "vitest";
import { transformMessage } from "../client/transform";

const transform = (text: string, phase: "streaming" | "complete" = "complete") =>
  transformMessage({ item: { type: "assistant_message", text }, phase });

describe("generative-UI replies", () => {
  const UI = '```ui\nCard("Status", [Metric("Entities", "68")])\n```';

  it("leaves a reply with a ui fence to the live-UI renderer, even with a formula in it", () => {
    // Paseo offers a message to transformers first-wins in plugin-name order and
    // math-renderer sorts before genui: claiming the reply would show the widgets as code.
    expect(transform(UI)).toBeUndefined();
    expect(transform(`The total is $x^2$.\n\n${UI}`)).toBeUndefined();
    expect(transform("```app\n<b>hi</b>\n```")).toBeUndefined();
  });

  it("still claims a plain formula reply", () => {
    expect(transform("The total is $x^2$.")?.items).toHaveLength(1);
  });

  it("keeps streaming native", () => {
    expect(transform("The total is $x^2$.", "streaming")).toBeUndefined();
  });

  it("does not hand over a ui fence quoted inside another language's block", () => {
    const quoted = "````markdown\n```ui\nCard()\n```\n````\n\nThe total is $x^2$.";
    expect(transform(quoted)?.items).toHaveLength(1);
  });

  it("does not hand over lookalike fence languages", () => {
    expect(transform("```ui.json\n{}\n```\n\nThe total is $x^2$.")?.items).toHaveLength(1);
    expect(transform("```uish\nnot ui\n```\n\nThe total is $x^2$.")?.items).toHaveLength(1);
  });
});
