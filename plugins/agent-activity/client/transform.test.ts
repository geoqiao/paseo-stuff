import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";
import { transformReasoning, transformToolCall } from "./transform";
import { createToolCallData, toolCallItemDataSchema } from "../shared/timeline";
import { detailSections } from "../shared/details";

function toolCall(detail: ToolCallDetail, status: "running" | "completed" = "completed") {
  return {
    type: "tool_call" as const,
    callId: "call-1",
    name: "edit",
    detail,
    status,
    error: null,
  };
}

describe("colorful activity timeline transforms", () => {
  it.each([null, [], { type: "future", extra: false }, { type: "shell", command: 3 }, { type: "read", filePath: [] }, { type: "edit", filePath: "a", unifiedDiff: null }, { type: "worktree_setup" }, { type: "plain_text", text: false }])("preserves malformed/future details rather than throwing during projection: %j", detail => {
    const item = { ...toolCall(detail as unknown as ToolCallDetail), status: "failed" as const, error: "keep error" };
    const data = createToolCallData(item);
    expect(toolCallItemDataSchema.safeParse(data).success).toBe(true);
    expect(data.detail).toEqual(detail);
    expect(data.presentation.icon).toBe("Wrench");
    expect(detailSections(data)).toMatchObject([{ label: "Details", value: detail }, { label: "Error", value: "keep error" }]);
    expect(() => transformToolCall({ phase: "complete", item: { ...item, name: "speak" } })).not.toThrow();
  });

  it("accepts optional plain_text content and safely falls back for unsupported icons", () => {
    const data = createToolCallData(toolCall({ type: "plain_text", label: "Progress", icon: "eye" }));
    expect(data.presentation).toMatchObject({ label: "Progress", icon: "Eye" });
    expect(detailSections(data)).toMatchObject([{ label: "Output", value: undefined }]);
    const malformed = createToolCallData(toolCall({ type: "plain_text", icon: "not-a-host-icon" } as unknown as ToolCallDetail));
    expect(malformed.presentation.icon).toBe("Wrench");
  });

  it("skips header diff work on huge edits without losing detail content", () => {
    const before = "old\n".repeat(100_000), after = "new\n".repeat(100_000);
    const data = createToolCallData(toolCall({ type: "edit", filePath: "a.ts", oldString: before, newString: after }));
    expect(data.presentation.diffStats).toBeUndefined();
    expect(detailSections(data).slice(1)).toMatchObject([{ label: "Before", value: before }, { label: "After", value: after }]);
  });

  it("replaces reasoning while preserving the streaming phase", () => {
    expect(
      transformReasoning({
        item: { type: "reasoning", text: "**Plan****Result**" },
        phase: "streaming",
      }),
    ).toEqual({
      items: [
        {
          type: "plugin",
          kind: "colorful-reasoning",
          version: 1,
          data: { text: "**Plan**\n\n**Result**", phase: "streaming" },
        },
      ],
    });
  });

  it("projects edit presentation, file icon, and diff stats", () => {
    const result = transformToolCall({
      phase: "complete",
      item: toolCall({
        type: "edit",
        filePath: "src/web/main.tsx",
        oldString: "const oldValue = 1;\n",
        newString: "const newValue = 2;\n",
      }),
    });
    expect(result).toEqual({
      items: [
        {
          type: "plugin",
          kind: "colorful-tool-call",
          version: 1,
          data: {
            name: "edit",
            status: "completed",
            detail: {
              type: "edit",
              filePath: "src/web/main.tsx",
              oldString: "const oldValue = 1;\n",
              newString: "const newValue = 2;\n",
            },
            presentation: {
              category: "file",
              icon: "FileCode2",
              label: "Edit",
              summary: "src/web/main.tsx",
              filePath: "src/web/main.tsx",
              fileIcon: "FileCode2",
              language: "typescript",
              diffStats: { additions: 1, deletions: 1 },
            },
          },
        },
      ],
    });
  });

  it("projects running shell calls with a stable generic fallback", () => {
    const result = transformToolCall({
      phase: "streaming",
      item: {
        ...toolCall(
          { type: "shell", command: "bun test", output: "170 pass" },
          "running",
        ),
        name: "run",
      },
    });
    expect(result?.items[0]?.data).toMatchObject({
      name: "run",
      status: "running",
      presentation: {
        category: "shell",
        icon: "SquareTerminal",
        label: "Exec",
        summary: "bun test",
      },
    });
  });
});
