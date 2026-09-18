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
