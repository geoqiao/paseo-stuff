import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReasoningActivity, ToolActivity } from "./client/activity";
import { transformReasoning, transformToolCall } from "./client/transform";
import { TOOL_CALL_RENDERER_KIND, TOOL_CALL_RENDERER_VERSION, toolCallItemDataSchema,
  REASONING_RENDERER_KIND, REASONING_RENDERER_VERSION, reasoningItemDataSchema } from "./shared/timeline";

export default function contribute(client: PluginClientContext) {
  // Paseo 0.8 to 0.10 expose no public display-mode/group context, so cards bypass Summary
  // grouping. Never change the host preference or guess it from private app state; the user
  // switches this client to native tool rows instead. Reasoning rows never join tool groups,
  // so the Thinking adapter stays. The choice is client-local and resets on reload.
  let removeToolCards: (() => void) | undefined;
  function useCards() {
    removeToolCards ??= client.addTimelineTransformer({ id: "tool-calls", query: { itemType: "tool_call" }, transform: transformToolCall });
  }
  function useNativeRows() {
    removeToolCards?.();
    removeToolCards = undefined;
  }
  const remove = [
    client.addTimelineRenderer({ kind: TOOL_CALL_RENDERER_KIND, version: TOOL_CALL_RENDERER_VERSION, schema: toolCallItemDataSchema, Component: ToolActivity }),
    client.addTimelineTransformer({ id: "reasoning", query: { itemType: "reasoning" }, transform: transformReasoning }),
    client.addTimelineRenderer({ kind: REASONING_RENDERER_KIND, version: REASONING_RENDERER_VERSION, schema: reasoningItemDataSchema, Component: ReasoningActivity }),
    client.addCommandCenterItem({
      id: "native-tool-rows", title: "Activity: use native tool rows (for Summary)", icon: "List", context: "global",
      keywords: ["activity", "summary", "tool", "native"], onSelect: useNativeRows,
    }),
    client.addCommandCenterItem({
      id: "tool-cards", title: "Activity: use tool cards (Full detail)", icon: "LayoutList", context: "global",
      keywords: ["activity", "full detail", "tool", "cards"], onSelect: useCards,
    }),
  ];
  useCards();
  return () => { useNativeRows(); for (const cleanup of remove.reverse()) cleanup(); };
}
