import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { createToolCallData, TOOL_CALL_RENDERER_KIND, TOOL_CALL_RENDERER_VERSION,
  REASONING_RENDERER_KIND, REASONING_RENDERER_VERSION } from "../shared/timeline";

// Density-only exception: retain exact thought text, without Markdown rewriting.
export const transformReasoning: PluginTimelineTransformerContribution<"reasoning">["transform"] = ({ item, phase }) => ({
  items: [{ type: "plugin", kind: REASONING_RENDERER_KIND, version: REASONING_RENDERER_VERSION,
    data: { text: item.text, phase } }],
});

// Messages from other agents and heartbeats are tool calls that start a turn. Since 0.14
// the host shows them as user rows and folds turns around them, so they stay native.
// Paseo 0.14 omits agentMessage from transformer input; its envelope keeps the name
// "agent_message" and a "paseo-agent-message:" call ID (getpaseo/paseo#7990).
function isTurnTrigger(item: Extract<AgentTimelineItem, { type: "tool_call" }>): boolean {
  return item.agentMessage !== undefined || item.name === "heartbeat"
    || (item.name === "agent_message" && item.callId.startsWith("paseo-agent-message:"));
}

export const transformToolCall: PluginTimelineTransformerContribution<"tool_call">["transform"] = ({ item }) => {
  // Paseo transforms before native plan suppression/presentation. Keep approval
  // tools and structured plans native, including rejected/completed plans.
  if (item.name === "ExitPlanMode" || item.name === "plan_approval" || item.detail?.type === "plan") return undefined;
  // This exact shape is a native SpeakMessage, not an ordinary tool card.
  if (item.name === "speak" && item.detail?.type === "unknown"
    && typeof item.detail.input === "string" && item.detail.input.trim()) return undefined;
  if (isTurnTrigger(item)) return undefined;
  return {
    items: [{
      type: "plugin",
      kind: TOOL_CALL_RENDERER_KIND,
      version: TOOL_CALL_RENDERER_VERSION,
      data: createToolCallData(item),
    }],
  };
};
