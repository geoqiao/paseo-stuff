import { compactText } from "./summary";

export type ExaToolKind =
  | "search"
  | "fetch"
  | "agent"
  | "research-guide"
  | "schema-templates";

type JsonRecord = Record<string, unknown>;

const EXA_TOOL_LABELS: Readonly<Record<ExaToolKind, string>> = {
  search: "Exa Web Search",
  fetch: "Exa Web Fetch",
  agent: "Exa Agent",
  "research-guide": "Exa Research Guide",
  "schema-templates": "Exa Schema Templates",
};

const EXA_TOOL_ICONS: Readonly<Record<ExaToolKind, string>> = {
  search: "Search",
  fetch: "Globe",
  agent: "Bot",
  "research-guide": "BookOpen",
  "schema-templates": "Braces",
};

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function fieldString(record: JsonRecord | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record?.[key]);
    if (value) return value;
  }
  return undefined;
}

function toolLeaf(name: string): string {
  return name.trim().toLowerCase().split(/__|[.:/]/).at(-1) ?? "";
}

export function exaToolKind(name: string): ExaToolKind | null {
  const normalized = name.trim().toLowerCase();
  const leaf = toolLeaf(normalized);
  if (normalized.endsWith("web_search_exa") || leaf === "web_search_exa") return "search";
  if (normalized.endsWith("web_fetch_exa") || leaf === "web_fetch_exa") return "fetch";
  if (normalized.endsWith("exa_agent_run") || (normalized.includes("exa") && leaf === "agent_run")) {
    return "agent";
  }
  if (
    normalized.endsWith("exa_read_agent_research_guide") ||
    (normalized.includes("exa") && leaf === "read_agent_research_guide")
  ) {
    return "research-guide";
  }
  if (
    normalized.endsWith("exa_read_agent_schema_templates") ||
    (normalized.includes("exa") && leaf === "read_agent_schema_templates")
  ) {
    return "schema-templates";
  }
  return null;
}

export function exaToolLabel(kind: ExaToolKind): string {
  return EXA_TOOL_LABELS[kind];
}

export function exaToolIcon(kind: ExaToolKind): string {
  return EXA_TOOL_ICONS[kind];
}

export function exaToolSummary(kind: ExaToolKind, input: unknown): string | undefined {
  const record = asRecord(input);
  const value =
    kind === "search"
      ? fieldString(record, "query")
      : kind === "fetch"
        ? fieldString(record, "url")
        : fieldString(record, "prompt") ?? fieldString(record, "query");
  if (!value) return undefined;
  return compactText(value);
}
