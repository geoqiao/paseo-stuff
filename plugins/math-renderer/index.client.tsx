import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MathMessage } from "./client/message";
import { transformMessage } from "./client/transform";
import { MATH_KIND, messageData } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  let removeTransformer: (() => void) | undefined;
  function renderFormulas() {
    removeTransformer ??= client.addTimelineTransformer({ id: "block-math", query: { itemType: "assistant_message" }, transform: transformMessage });
  }
  function nativeReplies() {
    removeTransformer?.();
    removeTransformer = undefined;
  }
  const remove = [
    client.addTimelineRenderer({ kind: MATH_KIND, version: 1, schema: messageData, Component: MathMessage }),
    client.addCommandCenterItem({
      id: "native-replies", title: "Math: use native replies for chat Find", icon: "Search", context: "global",
      keywords: ["math", "formula", "search"], onSelect: nativeReplies,
    }),
    client.addCommandCenterItem({
      id: "render-formulas", title: "Math: render block formulas", icon: "Sigma", context: "global",
      keywords: ["math", "formula"], onSelect: renderFormulas,
    }),
  ];
  renderFormulas();
  return () => { nativeReplies(); for (const cleanup of remove.reverse()) cleanup(); };
}
