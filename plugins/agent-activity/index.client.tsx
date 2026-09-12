import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ActivitySettings } from "./client/settings";
import { ReasoningActivity, ToolActivity } from "./client/activity";
import { transformReasoning, transformToolCall } from "./client/transform";
import {
  REASONING_RENDERER_KIND, TOOL_CALL_RENDERER_KIND,
  REASONING_RENDERER_VERSION, TOOL_CALL_RENDERER_VERSION,
  reasoningItemDataSchema, toolCallItemDataSchema,
} from "./shared/timeline";

export default function contribute(client: PluginClientContext) {
  const remove = [
    client.addSettingsScreen({ id: "display", title: "Readable Agent Activity · beta", icon: "List", Component: ActivitySettings }),
    client.addTimelineTransformer({ id: "reasoning", query: { itemType: "reasoning" }, transform: transformReasoning }),
    // Paseo 0.8 has no public display-mode/group context. This beta is Full detail
    // only; the user must select it on every client before enabling the plugin.
    client.addTimelineTransformer({ id: "tool-calls", query: { itemType: "tool_call" }, transform: transformToolCall }),
    client.addTimelineRenderer({ kind: REASONING_RENDERER_KIND, version: REASONING_RENDERER_VERSION, schema: reasoningItemDataSchema, Component: ReasoningActivity }),
    client.addTimelineRenderer({ kind: TOOL_CALL_RENDERER_KIND, version: TOOL_CALL_RENDERER_VERSION, schema: toolCallItemDataSchema, Component: ToolActivity }),
  ];
  return () => { for (const cleanup of remove.reverse()) cleanup(); };
}
