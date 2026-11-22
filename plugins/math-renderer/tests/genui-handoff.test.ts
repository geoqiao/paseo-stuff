import { describe, expect, it, vi } from "vitest";
import { transformMessage } from "../client/transform";
import { MATH_KIND } from "../shared/contracts";
import { createStreamPresentation, transformTimelineItem } from "./host";

const transform = (text: string, phase: "streaming" | "complete" = "complete") =>
  transformMessage({ item: { type: "assistant_message", text }, phase });
const FORMULA = "The total is $x^2$.";
const MIXED = `${FORMULA}\n\n\`\`\`ui.json\nCard("Status", [])\n\`\`\``;

describe("generative-UI replies", () => {
  it.each([
    "```ui", "```app", "```ui.json", "```app.html", "```ui+json", "```app:html",
    "   ~~~~\tAPP.HTML", "```UI title=example",
  ])("yields a mixed reply for the GenUI 0.3.3 opener %s", opener => {
    const close = opener.includes("~") ? "~~~~" : "```";
    expect(transform(`${FORMULA}\n\n${opener}\nexample\n${close}`)).toBeUndefined();
  });

  it("yields for an unclosed live-UI fence in a completed reply", () => {
    expect(transform(`${FORMULA}\n\n\`\`\`ui.json\nexample`)).toBeUndefined();
  });

  it("still claims a plain formula reply", () => {
    expect(transform(FORMULA)?.items).toMatchObject([{ kind: MATH_KIND }]);
  });

  it("keeps streaming native", () => {
    expect(transform(FORMULA, "streaming")).toBeUndefined();
    expect(transform(MIXED, "streaming")).toBeUndefined();
  });

  it.each([
    "````markdown\n```ui\nCard()\n```\n````",
    "~~~markdown\n```app.html\n<b>hi</b>\n```\n~~~",
    "> ```ui\n> Card()\n> ```",
    "    ```ui\n    Card()\n    ```",
  ])("keeps rendering formulas when a live-UI fence is quoted or indented", quoted => {
    expect(transform(`${FORMULA}\n\n${quoted}`)?.items).toMatchObject([{ kind: MATH_KIND }]);
  });

  it.each(["uish", "ui-json", "ui_json", "app2", "html"])("keeps rendering formulas with the %s language", language => {
    const fence = `\`\`\`${language}\nexample\n\`\`\``;
    expect(transform(`${FORMULA}\n\n${fence}`)?.items).toMatchObject([{ kind: MATH_KIND }]);
  });
});

describe("Paseo 0.16.2 first-wins transformer chain", () => {
  const installedPlugin = (id: string, transform: typeof transformMessage) => ({
    id, serverId: "local",
    timelineTransformers: [{ id: "assistant", query: { itemType: "assistant_message" }, transform }],
  });
  const source = (text: string) => ({
    id: "reply", kind: "assistant_message", text, timestamp: new Date(0),
  });
  const present = (reply: ReturnType<typeof source>, installations: ReturnType<typeof installedPlugin>[]) => {
    // Mirror PluginRegistry.publish ordering and run the pinned host's actual
    // transformer and projection code to observe which rows the host displays.
    const key = (plugin: ReturnType<typeof installedPlugin>) => `${plugin.serverId}/${plugin.id}`;
    const plugins = [...installations].sort((left, right) => key(left).localeCompare(key(right)));
    return createStreamPresentation()({
      head: [], tail: [reply], display: "full", isTurnActive: false, expandedTurnHostIds: new Set(),
      transform: (input: { item: unknown; sourceId: string; phase: string }) =>
        transformTimelineItem({ ...input, plugins }),
    }).tail;
  };

  it("hands the mixed reply to a UI installation that sorts after math-renderer", () => {
    const math = vi.fn(transformMessage);
    const ui = vi.fn<typeof transformMessage>(({ item }) => item.text === MIXED ? {
      items: [{ type: "plugin", kind: "genui-block", version: 1, data: { language: "ui" } }],
    } : undefined);
    const rows = present(source(MIXED), [installedPlugin("z-genui", ui), installedPlugin("math-renderer", math)]);

    expect(math).toHaveBeenCalledBefore(ui);
    expect(rows).toMatchObject([{ kind: "plugin", itemKind: "genui-block", pluginId: "z-genui" }]);
  });

  it("keeps a mixed reply native and renders a pure formula with only math-renderer installed", () => {
    const plugins = [installedPlugin("math-renderer", transformMessage)];
    const mixed = source(MIXED);

    expect(present(mixed, plugins)).toEqual([mixed]);
    expect(present(source(FORMULA), plugins)).toMatchObject([
      { kind: "plugin", itemKind: MATH_KIND, pluginId: "math-renderer", data: { text: FORMULA } },
    ]);
  });
});
