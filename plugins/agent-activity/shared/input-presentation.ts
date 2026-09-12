import type { ToolCategory } from "./presentation";

const MAX_INPUT_JSON_CHARS = 32_000;
const MAX_SUMMARY_CHARS = 180;

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "string" && value.length <= MAX_INPUT_JSON_CHARS) {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Bound work before whitespace normalization; never stringify an entire input for a title. */
function compact(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const prefix = value.slice(0, MAX_SUMMARY_CHARS * 4);
  const text = prefix.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > MAX_SUMMARY_CHARS || prefix.length < value.length
    ? text.slice(0, MAX_SUMMARY_CHARS - 1) + "…" : text;
}

function field(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const text = compact(input[key]);
    if (text) return text;
  }
  return undefined;
}

interface InputPresentation {
  category: ToolCategory;
  icon: string;
  summary?: string;
  filePath?: string;
}

/** Presentation only: retain the original unknown detail and its complete input/output. */
export function inputPresentation(toolName: string, value: unknown): InputPresentation {
  const name = toolName.trim().toLowerCase().replace(/^(?:functions|tools)\./, "");
  const input = record(value);
  const make = (icon: string, summary?: string, category: ToolCategory = "unknown"): InputPresentation =>
    ({ category, icon, ...(summary ? { summary } : {}) });

  if (["bash", "shell", "exec_command", "run_command", "run_shell_command", "exec"].includes(name)) {
    const command = field(input, "command", "cmd");
    if (command) return make("Terminal", command, "shell");
  }
  if (["exec", "mcpscript", "mcp_script"].includes(name)) {
    return make("Code", "JavaScript");
  }
  if (["read", "read_file", "write", "write_file", "edit", "edit_file"].includes(name)) {
    const path = [input.path, input.file_path, input.filePath].find(value => typeof value === "string" && compact(value));
    return { ...make("FileText", compact(path), "file"), ...(typeof path === "string" ? { filePath: path } : {}) };
  }
  switch (name) {
    case "find_roots": return make("Monitor", field(input, "app", "text", "bundleId", "kind"));
    case "observe_ui": return make("Eye", [field(input, "root"), field(input, "mode")].filter(Boolean).join(" · "));
    case "search_ui": return make("Search", field(input, "text", "role", "capability"), "search");
    case "inspect_ui": return make("Eye", field(input, "ref"));
    case "expand_ui": return make("List", field(input, "ref"));
    case "read_text": return make("FileText", field(input, "ref"));
    case "act_ui": {
      const actions = Array.isArray(input.actions) ? input.actions : [];
      const descriptions = actions.slice(0, 3).map(value => {
        const action = record(value);
        // Do not expose typed text, passwords, clipboard contents or opaque state IDs in a header.
        return [field(action, "action"), field(action, "ref")].filter(Boolean).join(" ");
      }).filter(Boolean);
      return make("MousePointer", compact(descriptions.join(" · ") + (actions.length > 3 ? " · +" + (actions.length - 3) + " more" : "")));
    }
    case "wait_for": return make("Clock", field(input, "text", "ref", "role"));
    case "launch_browser":
    case "navigate_browser":
    case "fetch_content": return make("Globe", field(input, "url") ?? compact(Array.isArray(input.urls) ? input.urls[0] : undefined), "search");
    case "evaluate_browser": return make("Code", "JavaScript");
    case "web_search": return make("Search", field(input, "query") ?? compact(Array.isArray(input.queries) ? input.queries[0] : undefined), "search");
    case "ask_user": return make("MessageSquare", field(record(Array.isArray(input.questions) ? input.questions[0] : undefined), "prompt"), "communication");
    case "mcp": return make("Plug", field(input, "tool", "describe", "search", "connect", "server", "action"));
    default: return make("Wrench", field(input, "description", "query", "url", "path", "file_path", "filePath"));
  }
}
