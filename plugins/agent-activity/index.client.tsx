import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReasoningActivity, ToolActivity } from "./client/activity";
import { transformReasoning, transformToolCall } from "./client/transform";
import { TOOL_CALL_RENDERER_KIND, TOOL_CALL_RENDERER_VERSION, toolCallItemDataSchema,
  REASONING_RENDERER_KIND, REASONING_RENDERER_VERSION, reasoningItemDataSchema } from "./shared/timeline";

export default function contribute(client: PluginClientContext) {
  const remove = [
    // Paseo 0.8/0.9 have no public display-mode/group context. Full detail only;
    // never change the host preference or guess it from private app state.
    client.addTimelineTransformer({ id: "tool-calls", query: { itemType: "tool_call" }, transform: transformToolCall }),
    client.addTimelineRenderer({ kind: TOOL_CALL_RENDERER_KIND, version: TOOL_CALL_RENDERER_VERSION, schema: toolCallItemDataSchema, Component: ToolActivity }),
    client.addTimelineTransformer({ id: "reasoning", query: { itemType: "reasoning" }, transform: transformReasoning }),
    client.addTimelineRenderer({ kind: REASONING_RENDERER_KIND, version: REASONING_RENDERER_VERSION, schema: reasoningItemDataSchema, Component: ReasoningActivity }),
  ];
  return () => { for (const cleanup of remove.reverse()) cleanup(); };
}
