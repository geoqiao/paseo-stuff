import type { ToolCallItemData } from "./timeline";

export const PREVIEW_LINES = 20;
export const MAX_FORMAT_CHARS = 1_000_000;

export interface DisplayValue {
  text: string;
  language: string;
}
export interface DetailSection {
  label: "Input" | "Output";
  value: unknown;
  language?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Whitespace only: retain numeric lexemes, duplicate keys, order and escapes. */
export function prettyJson(source: string): string | null {
  if (!source.trim() || source.length > MAX_FORMAT_CHARS) return null;
  try { JSON.parse(source); } catch { return null; }
  const tokens = source.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g) ?? [];
  const out: string[] = [];
  let depth = 0, length = 0;
  const push = (text: string) => { out.push(text); length += text.length; };
  const line = () => push("\n" + "  ".repeat(Math.min(depth, 40)));
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token === "{" || token === "[") {
      push(token); depth++;
      if (tokens[index + 1] !== "}" && tokens[index + 1] !== "]") line();
    } else if (token === "}" || token === "]") {
      depth--;
      if (tokens[index - 1] !== "{" && tokens[index - 1] !== "[") line();
      push(token);
    } else if (token === ",") { push(token); line(); }
    else if (token === ":") push(": ");
    else push(token);
    // Bound indentation amplification; fall back to the intact original.
    if (length > MAX_FORMAT_CHARS) return null;
  }
  return out.join("");
}

export function presentValue(value: unknown, language = "text"): DisplayValue {
  if (value === undefined) return { text: "", language };
  if (typeof value === "string") {
    const formatted = prettyJson(value);
    return { text: formatted ?? value, language: formatted !== null ? "json" : language };
  }
  try {
    // Reuse the bounded whitespace formatter: JSON.stringify(value, null, 2)
    // can amplify deeply nested objects into unbounded indentation.
    const source = JSON.stringify(value) ?? "";
    return { text: prettyJson(source) ?? source, language: "json" };
  } catch {
    return { text: String(value), language: "text" };
  }
}

/** Bound the source prefix before layout; the renderer also bounds wrapped lines. */
export function previewText(text: string): { text: string; truncated: boolean } {
  let end = -1;
  for (let line = 0; line < PREVIEW_LINES; line++) {
    end = text.indexOf("\n", end + 1);
    if (end === -1) return { text, truncated: false };
  }
  return { text: text.slice(0, end), truncated: true };
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Unwrap only a pure single-text transport. Never drop metadata or attachments.
 * Serialized JSON strings stay strings: parsing/re-serializing could lose keys/numbers.
 */
function outputValue(value: unknown): unknown {
  const envelope = record(value);
  if (!envelope || !onlyKeys(envelope, ["content"]) || !Array.isArray(envelope.content)
    || envelope.content.length !== 1) return value;
  let block = record(envelope.content[0]);
  if (block?.type === "content" && onlyKeys(block, ["type", "content"])) block = record(block.content);
  return block?.type === "text" && onlyKeys(block, ["type", "text"]) && typeof block.text === "string"
    ? block.text : value;
}

function inputSection(value: unknown, tool: string): DetailSection {
  const name = tool.trim().toLowerCase().replace(/^(?:functions|tools)\./, "");
  const codeTool = ["exec", "mcpscript", "mcp_script"].includes(name);
  const input = record(value);
  // A source-only wrapper is transparent; extra parameters remain structured JSON.
  if (codeTool && input && onlyKeys(input, ["code"]) && typeof input.code === "string"
    && input.code.trim()) return { label: "Input", value: input.code, language: "javascript" };
  return { label: "Input", value, ...(codeTool && typeof value === "string" ? { language: "javascript" } : {}) };
}

function without(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

/** Thin host-detail adaptation, not tool execution or semantic result interpretation. */
export function detailSections(data: ToolCallItemData): DetailSection[] {
  const detail = record(data.detail);
  let input: unknown;
  let output: unknown = data.detail;
  if (detail) {
    switch (detail.type) {
      case "unknown": {
        input = detail.input;
        const extra = without(detail, ["type", "input", "output"]);
        output = Object.keys(extra).length ? { ...extra, output: detail.output } : outputValue(detail.output);
        break;
      }
      case "shell": {
        input = { command: detail.command, ...(Object.hasOwn(detail, "cwd") ? { cwd: detail.cwd } : {}) };
        const result = without(detail, ["type", "command", "cwd"]);
        output = onlyKeys(result, ["output"]) ? result.output : result;
        break;
      }
      case "read":
        input = without(detail, ["type", "content"]);
        output = detail.content;
        break;
      case "write":
      case "edit":
        input = without(detail, ["type"]);
        output = undefined;
        break;
      case "plain_text":
      case "plan": {
        const result = without(detail, ["type"]);
        output = onlyKeys(result, ["text"]) ? result.text : result;
        break;
      }
    }
  }
  if (data.error !== undefined) output = { ...(output !== undefined ? { output } : {}), error: data.error };
  return [inputSection(input, data.name), { label: "Output", value: output }];
}
