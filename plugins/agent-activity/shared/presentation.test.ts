import { describe, expect, it } from "vitest";
import * as LucideIcons from "lucide-react";
import {
  PASEO_TOOL_ICONS,
  diffLinesForDetail,
  diffStatsFromStrings,
  diffStatsFromUnifiedDiff,
  fileIconForPath,
  formatReasoningText,
  languageForFilePath,
  paseoToolCategory,
  paseoToolIcon,
  paseoToolLabel,
  paseoToolLeafName,
  paseoToolSummary,
  resolveToolCallPresentation,
} from "./presentation";

describe("colorful activity presentation", () => {
  it("uses real Lucide exports for every configured Paseo tool icon, including aliases", () => {
    // Same icon release as Paseo 0.8.0's locked lucide-react-native. Test-only:
    // production still renders through the host Icon, not this web package.
    for (const [tool, name] of Object.entries(PASEO_TOOL_ICONS)) {
      const icon = Reflect.get(LucideIcons, name);
      expect(icon, tool + ": " + name).toBeDefined();
      expect(typeof icon === "function" || (typeof icon === "object" && icon !== null && "$$typeof" in icon), name).toBe(true);
      expect(icon).not.toBe(LucideIcons.Icon);
      expect(icon).not.toBe(LucideIcons.createLucideIcon);
    }
  });

  it.each([
    "paseo_get_agent_activity", "mcp_paseo_get_agent_activity",
    "mcp__paseo__get_agent_activity", "paseo.get_agent_activity",
  ])("gives %s a supported activity icon", (name) => {
    expect(paseoToolIcon(name)).toBe("Activity");
    expect(resolveToolCallPresentation({ name, detail: { type: "unknown", input: {}, output: "done" } }))
      .toMatchObject({ icon: "Activity", category: "agent" });
  });

  it("maps file extensions to icons and Shiki languages", () => {
    expect(fileIconForPath("src/web/main.tsx")).toBe("FileCode2");
    expect(fileIconForPath("package.json")).toBe("FileJson");
    expect(fileIconForPath("README.md")).toBe("FileText");
    expect(fileIconForPath(".env")).toBe("FileKey2");
    expect(languageForFilePath("src/web/main.tsx")).toBe("typescript");
    expect(languageForFilePath("styles.css")).toBe("css");
  });

  it("counts unified diff additions and deletions without file headers", () => {
    expect(
      diffStatsFromUnifiedDiff("--- a/main.ts\n+++ b/main.ts\n@@ -1 +1 @@\n-old\n+new\n"),
    ).toEqual({ additions: 1, deletions: 1 });
  });

  it("treats header-looking content inside a tracked hunk as diff content", () => {
    const unifiedDiff = [
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1,2 +1,3 @@",
      " ---",
      "---counter",
      "+++counter",
      "+---",
    ].join("\n");
    expect(diffStatsFromUnifiedDiff(unifiedDiff)).toEqual({ additions: 2, deletions: 1 });
    expect(diffLinesForDetail({ type: "edit", filePath: "README.md", unifiedDiff })).toEqual([
      { kind: "meta", text: "--- a/README.md" },
      { kind: "meta", text: "+++ b/README.md" },
      { kind: "meta", text: "@@ -1,2 +1,3 @@" },
      { kind: "context", text: "---" },
      { kind: "remove", text: "--counter" },
      { kind: "add", text: "++counter" },
      { kind: "add", text: "---" },
    ]);
  });

  it("tracks omitted, zero-count, and multiple-file hunk ranges", () => {
    const unifiedDiff = [
      "--- a/one.txt",
      "+++ b/one.txt",
      "@@ -1 +1 @@",
      "---counter",
      "+++counter",
      "--- a/two.txt",
      "+++ b/two.txt",
      "@@ -0,0 +1 @@",
      "+insert",
      "@@ -3,1 +3,0 @@",
      "-delete",
      "\\ No newline at end of file",
    ].join("\n");
    expect(diffStatsFromUnifiedDiff(unifiedDiff)).toEqual({ additions: 2, deletions: 2 });
    const lines = diffLinesForDetail({ type: "edit", filePath: "two.txt", unifiedDiff });
    expect(lines.filter((line) => line.kind === "meta").map((line) => line.text)).toEqual([
      "--- a/one.txt",
      "+++ b/one.txt",
      "@@ -1 +1 @@",
      "--- a/two.txt",
      "+++ b/two.txt",
      "@@ -0,0 +1 @@",
      "@@ -3,1 +3,0 @@",
      "\\ No newline at end of file",
    ]);
    expect(lines.filter((line) => line.kind === "add").map((line) => line.text)).toEqual(["++counter", "insert"]);
    expect(lines.filter((line) => line.kind === "remove").map((line) => line.text)).toEqual(["--counter", "delete"]);
  });

  it("keeps partial hunks visible and falls back conservatively for malformed headers", () => {
    const partial = ["--- a/file", "+++ b/file", "@@ -1,2 +1,2 @@", "-old", "+new"].join("\n");
    expect(diffStatsFromUnifiedDiff(partial)).toEqual({ additions: 1, deletions: 1 });
    expect(diffLinesForDetail({ type: "edit", filePath: "file", unifiedDiff: partial })).toHaveLength(5);

    const malformed = ["--- a/file", "+++ b/file", "@@ malformed @@", "-not parsed", "+not parsed"].join("\n");
    expect(() => diffLinesForDetail({ type: "edit", filePath: "file", unifiedDiff: malformed })).not.toThrow();
    expect(diffStatsFromUnifiedDiff(malformed)).toEqual({ additions: 0, deletions: 0 });
    expect(diffLinesForDetail({ type: "edit", filePath: "file", unifiedDiff: malformed }).map((line) => line.text)).toEqual(
      malformed.split("\n"),
    );
  });

  it("keeps a hunk active across whitespace-stripped blank context lines", () => {
    const unifiedDiff = "@@ -1,4 +1,4 @@\n a\n\n+b\n-c\n d\n";
    expect(diffStatsFromUnifiedDiff(unifiedDiff)).toEqual({ additions: 1, deletions: 1 });
    expect(diffLinesForDetail({ type: "edit", filePath: "a.txt", unifiedDiff }).map((line) => line.kind))
      .toEqual(["meta", "context", "context", "add", "remove", "context"]);
  });

  it("counts a large unified diff without changing its source", () => {
    const count = 100_000;
    const unifiedDiff = "@@ -0,0 +1," + count + " @@\n" + "+++counter;\n".repeat(count);
    expect(diffStatsFromUnifiedDiff(unifiedDiff)).toEqual({ additions: count, deletions: 0 });
    expect(unifiedDiff.endsWith("+++counter;\n")).toBe(true);
  });

  it("counts changes when an edit only has old and new strings", () => {
    expect(diffStatsFromStrings("one\ntwo\n", "one\nthree\n")).toEqual({
      additions: 1,
      deletions: 1,
    });
  });

  it("creates colored diff rows from old and new strings", () => {
    expect(
      diffLinesForDetail({
        type: "edit",
        filePath: "main.ts",
        oldString: "const oldValue = 1;\n",
        newString: "const newValue = 2;\n",
      }),
    ).toEqual([
      { kind: "remove", text: "const oldValue = 1;" },
      { kind: "add", text: "const newValue = 2;" },
    ]);
  });

  it("maps known tool details to screenshot-style presentation", () => {
    expect(
      resolveToolCallPresentation({
        name: "edit",
        detail: { type: "edit", filePath: "src/web/main.tsx", oldString: "", newString: "x" },
      }),
    ).toMatchObject({
      category: "file",
      icon: "FileCode2",
      label: "Edit",
      summary: "src/web/main.tsx",
      language: "typescript",
      diffStats: { additions: 1, deletions: 0 },
    });
    expect(
      resolveToolCallPresentation({
        name: "bash",
        detail: { type: "shell", command: "bun run typecheck && bun test" },
      }),
    ).toEqual({
      category: "shell",
      icon: "SquareTerminal",
      label: "Exec",
      summary: "bun run typecheck && bun test",
    });
  });

  it("gives namespaced Paseo tools a specialized title, icon, and summary", () => {
    const input = {
      title: "Random Number Agent 3",
      provider: "pi/plexus/gpt-5.6-luna",
    };
    expect(paseoToolLabel("mcp__paseo__create_agent")).toBe("Create Agent");
    expect(paseoToolLabel("mcp_paseo_create_agent")).toBe("Create Agent");
    expect(paseoToolIcon("paseo.create_agent")).toBe("Bot");
    expect(paseoToolLeafName("paseo_create_agent")).toBe("create_agent");
    expect(paseoToolLeafName("mcp_paseo_create_agent")).toBe("create_agent");
    expect(paseoToolLeafName("mcp__paseo__future_tool")).toBeNull();
    expect(paseoToolCategory("paseo_remote.create_agent")).toBe("agent");
    expect(paseoToolSummary("mcp__paseo__create_agent", input)).toBe(
      "Random Number Agent 3 · pi/plexus/gpt-5.6-luna",
    );
    expect(paseoToolLabel("mcp__github__create_issue")).toBeNull();
    expect(
      resolveToolCallPresentation({
        name: "mcp_paseo_create_agent",
        detail: { type: "unknown", input, output: { agentId: "agt_123" } },
      }),
    ).toMatchObject({
      category: "agent",
      icon: "Bot",
      label: "Paseo Create Agent",
      summary: "Random Number Agent 3 · pi/plexus/gpt-5.6-luna",
    });
    expect(
      resolveToolCallPresentation({
        name: "mcp__github__search_repositories",
        detail: { type: "unknown", input: { query: "paseo" }, output: {} },
      }),
    ).toMatchObject({
      category: "search",
      icon: "BookMarked",
      label: "GitHub Repository Search",
      summary: "paseo",
    });
    expect(
      resolveToolCallPresentation({
        name: "mcp__paseo__create_agent",
        detail: { type: "unknown", input, output: { agentId: "agt_123" } },
      }),
    ).toMatchObject({
      category: "agent",
      icon: "Bot",
      label: "Paseo Create Agent",
      summary: "Random Number Agent 3 · pi/plexus/gpt-5.6-luna",
    });
  });

  it("keeps reasoning formatting outside code spans", () => {
    expect(formatReasoningText("**Plan****Result**\n\n`**inline**`")).toBe(
      "**Plan**\n\n**Result**\n\n`**inline**`",
    );
  });


});
