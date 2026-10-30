import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";
import { transformToolCall } from "./transform";
import { createToolCallData, toolCallItemDataSchema } from "../shared/timeline";

describe("tool-only source-preserving transform", () => {
  it.each([null, [], { type: "future", extra: false }, { type: "shell", command: 3 },
    { type: "read", filePath: [] }, { type: "unknown", input: { code: "x" }, output: { details: { keep: true } } }])(
    "preserves malformed, future and current details: %j", detail => {
      const item = { type: "tool_call" as const, callId: "id", name: "tool",
        status: "failed" as const, detail: detail as unknown as ToolCallDetail, error: { message: "keep", code: 2 } };
      const before = JSON.stringify(item);
      const data = createToolCallData(item);
      expect(toolCallItemDataSchema.safeParse(data).success).toBe(true);
      expect(data.detail).toEqual(detail);
      expect(data.error).toEqual(item.error);
      expect(data.presentation).toEqual({ icon: expect.any(String) });
      const projected = transformToolCall({ item, phase: "complete" });
      expect(projected?.items).toHaveLength(1);
      expect(projected?.items[0]?.data).toEqual(data);
      expect(JSON.stringify(item)).toBe(before);
    },
  );
  it("leaves native SpeakMessage untouched without affecting other tools", () => {
    const item = { type: "tool_call" as const, callId: "id", name: "speak", status: "completed" as const,
      detail: { type: "unknown" as const, input: "Hello", output: undefined }, error: null };
    expect(transformToolCall({ item, phase: "complete" })).toBeUndefined();
    expect(transformToolCall({ item: { ...item, name: "other" }, phase: "complete" })?.items).toHaveLength(1);
  });
  it("leaves turn-starting agent messages and heartbeats native", () => {
    const base = { type: "tool_call" as const, status: "completed" as const, error: null,
      detail: { type: "plain_text" as const, text: "Hi", icon: "bot" as const } };
    const sender = { id: "agent" };
    const native = [
      // Paseo 0.14 removes agentMessage before transformers run; the envelope remains.
      { ...base, callId: "paseo-agent-message:m1", name: "agent_message" },
      { ...base, callId: "other", name: "anything", agentMessage: { event: "message" as const, sender, text: "Hi" } },
      { ...base, callId: "paseo-system:abc", name: "heartbeat" },
    ];
    for (const item of native) expect(transformToolCall({ item, phase: "complete" })).toBeUndefined();
    // A provider's own tool with the same name, without the envelope, stays a card.
    expect(transformToolCall({ item: { ...base, callId: "call-1", name: "agent_message" }, phase: "complete" })?.items)
      .toHaveLength(1);
  });
  it("retains host status and avoids derived trace annotations or diff statistics", () => {
    const data = createToolCallData({ type: "tool_call", callId: "id", name: "exec", status: "running", error: null,
      detail: { type: "unknown", input: { code: "text(1)" }, output: {
        details: { status: "result", traces: [{ status: "failed" }] },
      } } });
    expect(data.status).toBe("running");
    expect(data).not.toHaveProperty("activity");
    expect(data.presentation).toEqual({ icon: "Code" });
  });
  it.each(["running", "completed", "failed", "canceled"] as const)("preserves native plan handling when %s", status => {
    for (const name of ["ExitPlanMode", "plan_approval", "other_plan"]) {
      const detail = name === "other_plan" ? { type: "plan", plan: "Keep native" } : { type: "unknown", input: {} };
      const outcome = status === "failed" ? { status, error: "rejected" } : { status, error: null };
      const item = { type: "tool_call" as const, callId: "plan", name, detail: detail as ToolCallDetail, ...outcome };
      expect(transformToolCall({ item, phase: status === "running" ? "streaming" : "complete" })).toBeUndefined();
    }
  });
});
