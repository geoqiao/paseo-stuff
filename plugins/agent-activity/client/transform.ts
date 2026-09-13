import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { createToolCallData, TOOL_CALL_RENDERER_KIND, TOOL_CALL_RENDERER_VERSION,
  REASONING_RENDERER_KIND, REASONING_RENDERER_VERSION } from "../shared/timeline";

// Density-only exception: retain exact thought text, without Markdown rewriting.
export const transformReasoning: PluginTimelineTransformerContribution<"reasoning">["transform"] = ({ item, phase }) => ({
  items: [{ type: "plugin", kind: REASONING_RENDERER_KIND, version: REASONING_RENDERER_VERSION,
    data: { text: item.text, phase } }],
});

export const transformToolCall: PluginTimelineTransformerContribution<"tool_call">["transform"] = ({ item }) => {
  // This exact shape is a native SpeakMessage, not an ordinary tool card.
  if (item.name === "speak" && item.detail?.type === "unknown"
    && typeof item.detail.input === "string" && item.detail.input.trim()) return undefined;
  return {
    items: [{
      type: "plugin",
      kind: TOOL_CALL_RENDERER_KIND,
      version: TOOL_CALL_RENDERER_VERSION,
      data: createToolCallData(item),
    }],
  };
};
