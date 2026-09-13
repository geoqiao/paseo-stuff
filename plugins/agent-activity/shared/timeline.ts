import type { AgentTimelineItem, JsonValue } from "@getpaseo/protocol/agent-types";
import { z } from "zod";
import { toolIcon } from "./presentation";

export const TOOL_CALL_RENDERER_KIND = "colorful-tool-call";
export const TOOL_CALL_RENDERER_VERSION = 1;
export const REASONING_RENDERER_KIND = "colorful-reasoning";
export const REASONING_RENDERER_VERSION = 1;

export const reasoningItemDataSchema = z.object({
  text: z.string(),
  phase: z.enum(["streaming", "complete"]),
});
export type ReasoningItemData = z.output<typeof reasoningItemDataSchema>;

export const toolCallItemDataSchema = z.object({
  name: z.string(),
  status: z.enum(["running", "completed", "failed", "canceled"]),
  detail: z.json(),
  error: z.json().optional(),
  presentation: z.object({ icon: z.string() }),
});
export type ToolCallItemData = z.output<typeof toolCallItemDataSchema>;

function jsonValue(value: unknown): JsonValue {
  try {
    const source = JSON.stringify(value);
    return source === undefined ? null : JSON.parse(source) as JsonValue;
  } catch { return null; }
}

export function createToolCallData(
  item: Extract<AgentTimelineItem, { type: "tool_call" }>,
): ToolCallItemData {
  return {
    name: item.name,
    status: item.status,
    detail: jsonValue(item.detail),
    ...(item.error != null ? { error: jsonValue(item.error) } : {}),
    presentation: { icon: toolIcon(item.name, item.detail) },
  };
}
