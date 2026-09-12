import { diffLines } from "diff";
import type { JsonValue, ToolCallDetail, ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";
import { getPaseoToolLeafName } from "@getpaseo/protocol/tool-name-normalization";
import { exaToolIcon, exaToolKind, exaToolLabel, exaToolSummary } from "./exa";
import { inputPresentation } from "./input-presentation";
import { compactText } from "./summary";
import {
  githubToolIcon,
  githubToolKind,
  githubToolLabel,
  githubToolSummary,
} from "./github";

export const TOOL_CATEGORIES = [
  "shell",
  "file",
  "search",
  "agent",
  "plan",
  "communication",
  "unknown",
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface DiffLine {
  kind: "add" | "remove" | "context" | "meta";
  text: string;
}

export interface ToolCallPresentation {
  category: ToolCategory;
  icon: string;
  label: string;
  summary?: string;
  filePath?: string;
  fileIcon?: string;
  language?: string;
  diffStats?: DiffStats;
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  htm: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  less: "css",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  py: "python",
  pyw: "python",
  rs: "rust",
  sass: "css",
  scss: "css",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  vue: "html",
  wasm: "wasm",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const FILE_ICON_BY_EXTENSION: Record<string, string> = {
  c: "FileCode2",
  cc: "FileCode2",
  cpp: "FileCode2",
  cs: "FileCode2",
  css: "FileType",
  go: "FileCode2",
  h: "FileCode2",
  hpp: "FileCode2",
  html: "FileCode2",
  java: "FileCode2",
  js: "FileCode2",
  json: "FileJson",
  jsonc: "FileJson",
  jsx: "FileCode2",
  less: "FileType",
  md: "FileText",
  mdx: "FileText",
  mjs: "FileCode2",
  mts: "FileCode2",
  py: "FileCode2",
  pyw: "FileCode2",
  rs: "FileCode2",
  sass: "FileType",
  scss: "FileType",
  sh: "FileTerminal",
  sql: "FileCode2",
  ts: "FileCode2",
  tsx: "FileCode2",
  vue: "FileCode2",
  wasm: "FileCog",
  xml: "FileCode2",
  yaml: "FileCog",
  yml: "FileCog",
  zsh: "FileTerminal",
};

const FILE_ICON_BY_NAME: Record<string, string> = {
  ".env": "FileKey2",
  ".gitignore": "FileCog",
  dockerfile: "FileCog",
  "package-lock.json": "FileJson",
  "package.json": "FileJson",
  "pnpm-lock.yaml": "FileCog",
  "yarn.lock": "FileKey2",
};

const TOOL_ICON_NAMES: Record<string, string> = {
  bot: "Bot",
  brain: "Brain",
  eye: "Eye",
  mic_vocal: "MicVocal",
  pencil: "Pencil",
  paseo: "Sparkles",
  search: "Search",
  sparkles: "Sparkles",
  square_terminal: "SquareTerminal",
  wrench: "Wrench",
};

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1)?.toLowerCase() ?? filePath.toLowerCase();
}

export function extensionFromPath(filePath: string | undefined): string | null {
  if (!filePath) return null;
  const name = fileName(filePath);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1);
}

export function languageForFilePath(filePath: string | undefined): string | undefined {
  const extension = extensionFromPath(filePath);
  return extension ? EXTENSION_LANGUAGE[extension] : undefined;
}

export function fileIconForPath(filePath: string | undefined): string {
  if (!filePath) return "File";
  const name = fileName(filePath);
  const byName = FILE_ICON_BY_NAME[name];
  if (byName) return byName;
  const extension = extensionFromPath(filePath);
  return (extension && FILE_ICON_BY_EXTENSION[extension]) || "File";
}

function iconNameFromProtocol(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return TOOL_ICON_NAMES[value];
}

function prettyToolName(name: string): string {
  const normalized = name.trim().replace(/[._-]+/g, " ");
  if (!normalized) return "Tool";
  return normalized
    .split(/\s+/)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

const PASEO_TOOL_LABELS: Readonly<Record<string, string>> = {
  speak: "Speak",
  create_workspace: "Create Workspace",
  list_workspaces: "List Workspaces",
  archive_workspace: "Archive Workspace",
  create_agent: "Create Agent",
  send_agent_prompt: "Send Agent Prompt",
  get_agent_status: "Get Agent Status",
  list_agents: "List Agents",
  cancel_agent: "Cancel Agent Run",
  archive_agent: "Archive Agent",
  kill_agent: "Kill Agent",
  update_agent: "Update Agent",
  rename_workspace: "Rename Workspace",
  list_workspace_scripts: "List Workspace Scripts",
  start_workspace_script: "Start Workspace Script",
  stop_workspace_script: "Stop Workspace Script",
  list_terminals: "List Terminals",
  create_terminal: "Create Terminal",
  kill_terminal: "Kill Terminal",
  capture_terminal: "Capture Terminal",
  send_terminal_keys: "Send Terminal Keys",
  create_schedule: "Create Schedule",
  create_heartbeat: "Create Heartbeat",
  delete_heartbeat: "Delete Heartbeat",
  list_schedules: "List Schedules",
  inspect_schedule: "Inspect Schedule",
  pause_schedule: "Pause Schedule",
  resume_schedule: "Resume Schedule",
  delete_schedule: "Delete Schedule",
  update_schedule: "Update Schedule",
  schedule_logs: "Schedule Logs",
  run_schedule_once: "Run Schedule Once",
  list_providers: "List Providers",
  list_models: "List Models",
  list_profiles: "List Agent Profiles",
  inspect_provider: "Inspect Provider",
  get_agent_activity: "Get Agent Activity",
  set_agent_mode: "Set Agent Session Mode",
  list_pending_permissions: "List Pending Permissions",
  respond_to_permission: "Respond to Permission",
  browser_list_tabs: "List Browser Tabs",
  browser_new_tab: "Create Browser Tab",
  browser_snapshot: "Snapshot Browser Page",
  browser_click: "Click Browser Element",
  browser_fill: "Fill Browser Element",
  browser_wait: "Wait for Browser Condition",
  browser_type: "Type into Browser",
  browser_keypress: "Press Browser Key",
  browser_navigate: "Navigate Browser",
  browser_back: "Browser Back",
  browser_forward: "Browser Forward",
  browser_reload: "Browser Reload",
  browser_screenshot: "Capture Browser Screenshot",
  browser_upload: "Upload Files in Browser",
  browser_hover: "Hover Browser Element",
  browser_select: "Select Browser Option",
  browser_drag: "Drag Browser Element",
  browser_logs: "Read Browser Logs",
  browser_evaluate: "Evaluate Browser JavaScript",
  browser_scroll: "Scroll Browser",
  browser_resize: "Resize Browser Viewport",
  browser_close_tab: "Close Browser Tab",
};

export const PASEO_TOOL_ICONS: Readonly<Record<string, string>> = {
  speak: "MicVocal",
  create_workspace: "FolderPlus",
  list_workspaces: "Folders",
  archive_workspace: "Archive",
  create_agent: "Bot",
  send_agent_prompt: "Send",
  get_agent_status: "Activity",
  list_agents: "Users",
  cancel_agent: "CircleStop",
  archive_agent: "Archive",
  kill_agent: "CircleX",
  update_agent: "Settings2",
  rename_workspace: "Pencil",
  list_workspace_scripts: "ListTree",
  start_workspace_script: "Play",
  stop_workspace_script: "Square",
  list_terminals: "SquareTerminal",
  create_terminal: "SquareTerminal",
  kill_terminal: "CircleX",
  capture_terminal: "ScrollText",
  send_terminal_keys: "Keyboard",
  create_schedule: "CalendarClock",
  create_heartbeat: "HeartPulse",
  delete_heartbeat: "Trash2",
  list_schedules: "CalendarDays",
  inspect_schedule: "CalendarSearch",
  pause_schedule: "Pause",
  resume_schedule: "Play",
  delete_schedule: "Trash2",
  update_schedule: "CalendarCog",
  schedule_logs: "ScrollText",
  run_schedule_once: "CalendarCheck",
  list_providers: "Network",
  list_models: "Cpu",
  list_profiles: "ContactRound",
  inspect_provider: "ScanSearch",
  get_agent_activity: "Activity",
  set_agent_mode: "SlidersHorizontal",
  list_pending_permissions: "ShieldAlert",
  respond_to_permission: "ShieldCheck",
  browser_list_tabs: "PanelsTopLeft",
  browser_new_tab: "Globe2",
  browser_snapshot: "Scan",
  browser_click: "MousePointer2",
  browser_fill: "TextCursorInput",
  browser_wait: "Timer",
  browser_type: "Keyboard",
  browser_keypress: "KeyRound",
  browser_navigate: "Navigation",
  browser_back: "ArrowLeft",
  browser_forward: "ArrowRight",
  browser_reload: "RefreshCw",
  browser_screenshot: "Camera",
  browser_upload: "Upload",
  browser_hover: "Hand",
  browser_select: "ListFilter",
  browser_drag: "Move",
  browser_logs: "ScrollText",
  browser_evaluate: "Braces",
  browser_scroll: "Scroll",
  browser_resize: "Maximize2",
  browser_close_tab: "X",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

export function paseoToolLeafName(toolName: string): string | null {
  const namespacedLeafName = getPaseoToolLeafName(toolName);
  if (namespacedLeafName && PASEO_TOOL_LABELS[namespacedLeafName]) {
    return namespacedLeafName;
  }
  const normalized = toolName.trim().toLowerCase();
  const directMatch = normalized.match(/^(?:mcp_)?paseo_(.+)$/);
  const directLeafName = directMatch?.[1];
  return directLeafName && PASEO_TOOL_LABELS[directLeafName] ? directLeafName : null;
}

export function paseoToolLabel(toolName: string): string | null {
  const leafName = paseoToolLeafName(toolName);
  if (!leafName) return null;
  return PASEO_TOOL_LABELS[leafName] ?? prettyToolName(leafName);
}

export function paseoToolIcon(toolName: string): string | null {
  const leafName = paseoToolLeafName(toolName);
  if (!leafName) return null;
  return PASEO_TOOL_ICONS[leafName] ?? "Sparkles";
}

export function paseoToolCategory(toolName: string): ToolCategory | null {
  const leafName = paseoToolLeafName(toolName);
  if (!leafName) return null;
  if (leafName.startsWith("browser_")) return "search";
  if (leafName.includes("terminal") || leafName.includes("workspace_script")) return "shell";
  if (leafName.includes("schedule") || leafName.includes("heartbeat")) return "plan";
  if (leafName.includes("provider") || leafName.includes("profile")) return "agent";
  if (leafName.includes("agent") || leafName.includes("permission")) return "agent";
  if (leafName === "speak") return "communication";
  if (leafName.includes("workspace")) return "file";
  return "unknown";
}

export function paseoToolSummary(toolName: string, input: unknown): string | undefined {
  const leafName = paseoToolLeafName(toolName);
  if (!leafName) return undefined;
  const title = stringField(input, "title");
  const provider = stringField(input, "provider");
  const agentId = stringField(input, "agentId");
  const workspaceId = stringField(input, "workspaceId");
  const browserId = stringField(input, "browserId");
  const url = stringField(input, "url");
  const prompt = stringField(input, "prompt") ?? stringField(input, "initialPrompt");
  if (leafName === "create_agent" && title && provider) return `${title} · ${provider}`;
  if (leafName === "create_agent" && title) return title;
  if (leafName === "send_agent_prompt" && agentId) return agentId;
  if (leafName.endsWith("_agent") && agentId) return agentId;
  if (leafName.includes("workspace") && workspaceId) return workspaceId;
  if (leafName.startsWith("browser_") && url) return url;
  if (leafName.startsWith("browser_") && browserId) return browserId;
  if ((leafName === "create_schedule" || leafName === "create_heartbeat") && prompt) {
    return compactText(prompt);
  }
  if (leafName === "list_models" && provider) return provider;
  if (leafName === "speak" && stringField(input, "text")) return compactText(stringField(input, "text")!);
  return undefined;
}

function countLines(value: string): number {
  if (!value) return 0;
  const lines = value.replace(/\r/g, "").split("\n");
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

interface UnifiedHunkRange {
  oldRemaining: number;
  newRemaining: number;
}

const NO_NEWLINE_MARKER = "\\ No newline at end of file";
const UNIFIED_HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/;

function parseUnifiedHunkRange(line: string): UnifiedHunkRange | null {
  const match = line.match(UNIFIED_HUNK_HEADER);
  if (!match) return null;
  const count = (value: string | undefined): number | null => {
    const parsed = value === undefined ? 1 : Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const oldRemaining = count(match[2]);
  const newRemaining = count(match[4]);
  return oldRemaining === null || newRemaining === null ? null : { oldRemaining, newRemaining };
}

function isUnifiedFileHeader(line: string): boolean {
  return /^(?:---|\+\+\+)[ \t]/.test(line);
}

function classifyOutsideUnifiedLine(line: string): DiffLine {
  if (
    isUnifiedFileHeader(line)
    || line.startsWith("@@")
    || line === NO_NEWLINE_MARKER
    || line.startsWith("diff ")
    || line.startsWith("index ")
    || line.startsWith("new file mode ")
    || line.startsWith("deleted file mode ")
    || line.startsWith("similarity index ")
    || line.startsWith("rename from ")
    || line.startsWith("rename to ")
  ) {
    return { kind: "meta", text: line };
  }
  // A prefix outside a valid hunk is not enough evidence to call it a change.
  return { kind: "context", text: line };
}

function classifyUnifiedHunkLine(line: string, hunk: UnifiedHunkRange): DiffLine | null {
  if (line === NO_NEWLINE_MARKER) return { kind: "meta", text: line };
  if (line.startsWith("+") && hunk.newRemaining > 0) {
    hunk.newRemaining -= 1;
    return { kind: "add", text: line.slice(1) };
  }
  if (line.startsWith("-") && hunk.oldRemaining > 0) {
    hunk.oldRemaining -= 1;
    return { kind: "remove", text: line.slice(1) };
  }
  if ((line === "" || line.startsWith(" ")) && hunk.oldRemaining > 0 && hunk.newRemaining > 0) {
    hunk.oldRemaining -= 1;
    hunk.newRemaining -= 1;
    return { kind: "context", text: line.slice(1) };
  }
  return null;
}

/** Classify only lines covered by a valid hunk; headers outside it stay visible as metadata. */
function* classifyUnifiedDiff(unifiedDiff: string): Generator<DiffLine> {
  const lines = unifiedDiff.replace(/\r/g, "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  let hunk: UnifiedHunkRange | null = null;
  for (const line of lines) {
    const nextHunk = parseUnifiedHunkRange(line);
    if (nextHunk) {
      yield { kind: "meta", text: line };
      hunk = nextHunk;
      continue;
    }
    if (hunk) {
      const classified = classifyUnifiedHunkLine(line, hunk);
      if (classified) {
        yield classified;
        if (hunk.oldRemaining === 0 && hunk.newRemaining === 0) hunk = null;
        continue;
      }
      hunk = null;
    }
    yield classifyOutsideUnifiedLine(line);
  }
}

export function diffStatsFromUnifiedDiff(unifiedDiff: string): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const line of classifyUnifiedDiff(unifiedDiff)) {
    if (line.kind === "add") additions += 1;
    else if (line.kind === "remove") deletions += 1;
  }
  return { additions, deletions };
}

function boundedLineChanges(oldString: string, newString: string) {
  // maxEditLength bounds work deterministically. Fallback is a complete replacement,
  // not an empty diff, so no content is silently dropped.
  const fallback = () => [
    ...(oldString ? [{ value: oldString, removed: true }] : []),
    ...(newString ? [{ value: newString, added: true }] : []),
  ];
  if (oldString.length + newString.length > 100_000) return fallback();
  return diffLines(oldString, newString, { maxEditLength: 300 }) ?? fallback();
}

export function diffStatsFromStrings(oldString: string, newString: string): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const change of boundedLineChanges(oldString, newString)) {
    if (change.added) additions += countLines(change.value);
    if (change.removed) deletions += countLines(change.value);
  }
  return { additions, deletions };
}

export function diffStatsForDetail(detail: Extract<ToolCallDetail, { type: "edit" }>): DiffStats {
  if (detail.unifiedDiff !== undefined) return diffStatsFromUnifiedDiff(detail.unifiedDiff);
  return diffStatsFromStrings(detail.oldString ?? "", detail.newString ?? "");
}

function linesForChange(value: string): string[] {
  const normalized = value.replace(/\r/g, "");
  if (!normalized) return [];
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function diffLinesForDetail(detail: Extract<ToolCallDetail, { type: "edit" }>): DiffLine[] {
  if (detail.unifiedDiff !== undefined) {
    return Array.from(classifyUnifiedDiff(detail.unifiedDiff));
  }

  return boundedLineChanges(detail.oldString ?? "", detail.newString ?? "").flatMap((change) => {
    const kind = change.added ? "add" : change.removed ? "remove" : "context";
    return linesForChange(change.value).map((text) => ({ kind, text }));
  });
}

function shellSummary(detail: Extract<ToolCallDetail, { type: "shell" }>): string | undefined {
  return compactText(detail.command);
}

function detailFilePath(detail: ToolCallDetail): string | undefined {
  if (detail.type === "read" || detail.type === "edit" || detail.type === "write") {
    return detail.filePath || undefined;
  }
  return undefined;
}

/** Guard fields we actually dereference; preserve malformed/future details as generic JSON. */
export function isRenderableDetail(value: unknown): value is ToolCallDetail {
  if (!isRecord(value)) return false;
  const strings = (...keys: string[]) => keys.every(key => typeof value[key] === "string");
  const optional = (...keys: string[]) => keys.every(key => value[key] === undefined || typeof value[key] === "string");
  switch (value.type) {
    case "unknown": return true;
    case "shell": return strings("command") && optional("cwd") && (value.output == null || typeof value.output === "string");
    case "read":
    case "write": return strings("filePath") && (value.content == null || typeof value.content === "string");
    case "edit": return strings("filePath") && optional("oldString", "newString", "unifiedDiff");
    case "worktree_setup": return (strings("branchName") || strings("worktreePath")) && optional("branchName", "worktreePath");
    case "search": return strings("query");
    case "fetch": return strings("url");
    case "sub_agent": return optional("description", "subAgentType");
    case "plain_text": return optional("text", "label", "icon");
    case "plan": return strings("text");
    default: return false;
  }
}

export function resolveToolCallPresentation(
  item: Pick<ToolCallTimelineItem, "name" | "detail">,
): ToolCallPresentation {
  const name = item.name.trim().toLowerCase();
  const detail = item.detail;
  if (!isRenderableDetail(detail)) return { category: "unknown", icon: "Wrench", label: prettyToolName(item.name) };
  const filePath = detailFilePath(detail);
  const commonFileFields = filePath
    ? {
        filePath,
        fileIcon: fileIconForPath(filePath),
        language: languageForFilePath(filePath),
      }
    : {};

  switch (detail.type) {
    case "shell":
      return {
        category: "shell",
        icon: "SquareTerminal",
        label: "Exec",
        summary: shellSummary(detail),
      };
    case "worktree_setup":
      return {
        category: "shell",
        icon: "GitBranch",
        label: "Worktree",
        summary: compactText(detail.branchName || detail.worktreePath),
      };
    case "read":
      return {
        category: "file",
        icon: commonFileFields.fileIcon ?? "Eye",
        label: "Read",
        summary: compactText(detail.filePath),
        ...commonFileFields,
      };
    case "edit":
      return {
        category: "file",
        icon: commonFileFields.fileIcon ?? "Pencil",
        label: "Edit",
        summary: compactText(detail.filePath),
        // Avoid line scans/diffs for large edits on every streaming projection of a collapsed row.
        ...((detail.unifiedDiff?.length ?? ((detail.oldString?.length ?? 0) + (detail.newString?.length ?? 0))) <= 100_000
          ? { diffStats: diffStatsForDetail(detail) } : {}),
        ...commonFileFields,
      };
    case "write":
      return {
        category: "file",
        icon: commonFileFields.fileIcon ?? "Pencil",
        label: "Write",
        summary: compactText(detail.filePath),
        ...commonFileFields,
      };
    case "search":
      return {
        category: "search",
        icon: "Search",
        label: "Search",
        summary: compactText(detail.query),
      };
    case "fetch":
      return {
        category: "search",
        icon: "Globe",
        label: "Fetch",
        summary: compactText(detail.url),
      };
    case "sub_agent":
      return {
        category: "agent",
        icon: "Bot",
        label: "Sub-agent",
        summary: detail.description
          ? compactText(detail.description)
          : compactText(detail.subAgentType ?? ""),
      };
    case "plain_text":
      return {
        category: "communication",
        icon: iconNameFromProtocol(detail.icon) ?? "Wrench",
        label: detail.label || prettyToolName(item.name),
      };
    case "plan":
      return {
        category: "plan",
        icon: "ListChecks",
        label: "Plan",
      };
    case "unknown": {
      if (name === "thinking") {
        return { category: "plan", icon: "Brain", label: "Thinking" };
      }
      if (name === "task") {
        return { category: "agent", icon: "Bot", label: "Task", summary: compactText(item.name) };
      }
      if (name === "speak") {
        return { category: "communication", icon: "MicVocal", label: "Speak" };
      }
      const githubKind = githubToolKind(item.name);
      if (githubKind) {
        return {
          category: githubKind === "pull-request" || githubKind === "actions-run" ? "agent" : "search",
          icon: githubToolIcon(githubKind),
          label: githubToolLabel(githubKind),
          summary: githubToolSummary(githubKind, detail.input),
        };
      }
      const exaKind = exaToolKind(item.name);
      if (exaKind) {
        return {
          category: exaKind === "agent" ? "agent" : "search",
          icon: exaToolIcon(exaKind),
          label: exaToolLabel(exaKind),
          summary: exaToolSummary(exaKind, detail.input),
        };
      }
      const paseoLabel = paseoToolLabel(item.name);
      if (paseoLabel) {
        return {
          category: paseoToolCategory(item.name) ?? "unknown",
          icon: paseoToolIcon(item.name) ?? "Sparkles",
          label: `Paseo ${paseoLabel}`,
          summary: paseoToolSummary(item.name, detail.input),
        };
      }
      return {
        ...inputPresentation(item.name, detail.input),
        label: prettyToolName(item.name),
      };
    }
  }
}

export function toJsonValue(value: unknown): JsonValue {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : (JSON.parse(serialized) as JsonValue);
  } catch {
    return null;
  }
}

export function formatUnknownValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatError(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined;
  const text = typeof error === "string" ? error : formatUnknownValue(error);
  return text || undefined;
}

export function formatReasoningText(text: string): string {
  if (!text) return "";
  const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/(\*\*[^*\s\n](?:[^*\n]*?[^*\s\n])?\*\*)\s*(?=\*\*)/g, "$1\n\n");
    })
    .join("");
}
