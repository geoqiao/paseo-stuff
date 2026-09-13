import * as icons from "lucide-react";
import { describe, expect, it } from "vitest";
import { PASEO_TOOL_ICONS, toolIcon } from "./presentation";

describe("tool logos without semantic summaries", () => {
  it.each([
    ["exec", "Code"], ["functions.exec_command", "Terminal"], ["tools.write_stdin", "Keyboard"],
    ["mcpScript", "Code"], ["apply_patch", "FileDiff"], ["view_image", "Image"],
    ["ask_user", "MessageSquare"], ["observe_ui", "Eye"], ["web_search", "Search"],
    ["mcp__github__pull_request_read", "GitPullRequest"], ["github_search_code", "Code2"],
    ["web_search_exa", "Search"], ["paseo_get_agent_activity", "Activity"],
    ["mcp__paseo__create_agent", "Bot"], ["mcp_paseo_list_workspaces", "Folders"],
    ["unknown_tool", "Wrench"], ["__proto__", "Wrench"], ["constructor", "Wrench"],
  ])("%s keeps its recognizable icon %s", (name, icon) => {
    expect(toolIcon(name, { type: "unknown" })).toBe(icon);
    expect(icons).toHaveProperty(icon);
  });
  it.each(Object.entries(PASEO_TOOL_ICONS))("keeps the existing Paseo logo for %s", (name, icon) => {
    expect(toolIcon("paseo_" + name)).toBe(icon);
    expect(icons).toHaveProperty(icon);
  });
  it("uses host tool categories without inspecting arguments or generating summaries", () => {
    expect(toolIcon("exec", { type: "shell", command: "hi" })).toBe("SquareTerminal");
    expect(toolIcon("custom", { type: "read" })).toBe("Eye");
    expect(toolIcon("custom", { type: "future" })).toBe("Wrench");
    const detail = { type: "unknown", get input() { throw new Error("must not inspect arguments"); } };
    expect(toolIcon("exec", detail)).toBe("Code");
  });
});
