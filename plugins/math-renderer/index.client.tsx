import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MathMessage } from "./client/message";
import { transformMessage } from "./client/transform";
import { MATH_KIND, messageData } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  const remove = [
    client.addTimelineTransformer({ id: "block-math", query: { itemType: "assistant_message" }, transform: transformMessage }),
    client.addTimelineRenderer({ kind: MATH_KIND, version: 1, schema: messageData, Component: MathMessage }),
  ];
  return () => { for (const cleanup of remove.reverse()) cleanup(); };
}
