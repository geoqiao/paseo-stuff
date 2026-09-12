import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { diffLinesForDetail, isRenderableDetail, type DiffLine } from "./presentation";
import type { ToolCallItemData } from "./timeline";
import { formatUiText, isUiTool } from "./ui-text";

export const MAX_FORMAT_CHARS = 100_000;
export const PREVIEW_LINES = 20;
export const PREVIEW_CHARS = 4_000;
export const MAX_DECODE_CHARS = 1_000_000;

export type ReadableValue =
  | { kind: "code"; code: string; language: "javascript"; note: string }
  | {
      kind: "content";
      blocks: unknown[];
      language: "text";
      note: string;
      ui?: boolean;
      codeMode?: CodeModeMetadata;
    };

export type ReadableSegmentKind = "text" | "status";
export type ReadableSegmentTone = "muted" | "warning" | "error";

export interface ReadableSegment {
  kind: ReadableSegmentKind;
  text: string;
  language: string;
  separator?: string;
  tone?: ReadableSegmentTone;
}

export interface TextPreview {
  text: string;
  truncated: boolean;
  language?: string;
  segments?: ReadableSegment[];
  formatLimited?: boolean;
  upstreamTruncated?: boolean;
}

export interface DetailSection {
  label: string;
  value: unknown;
  language?: string;
  prose?: boolean;
  diff?: DiffLine[];
  raw?: unknown;
  readable?: ReadableValue;
}

export function rawValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

interface JsonFormat {
  text: string | null;
  limited: boolean;
}

function formatJson(source: string): JsonFormat {
  if (source.length > MAX_FORMAT_CHARS || !source.trim()) {
    return { text: null, limited: source.length > MAX_FORMAT_CHARS && looksLikeJson(source) };
  }
  try {
    JSON.parse(source);
  } catch {
    return { text: null, limited: false };
  }
  const tokens = source.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g) ?? [];
  let depth = 0;
  const out: string[] = [];
  let length = 0;
  const push = (value: string) => { out.push(value); length += value.length; };
  const line = () => push("\n" + "  ".repeat(Math.min(depth, 40)));
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "{" || token === "[") {
      push(token);
      depth += 1;
      if (tokens[index + 1] !== "}" && tokens[index + 1] !== "]") line();
    } else if (token === "}" || token === "]") {
      depth -= 1;
      if (tokens[index - 1] !== "{" && tokens[index - 1] !== "[") line();
      push(token);
    } else if (token === ",") {
      push(token);
      line();
    } else if (token === ":") {
      push(": ");
    } else {
      push(token);
    }
    // Small but deeply nested input can otherwise expand into megabytes of indentation.
    if (length > MAX_FORMAT_CHARS) return { text: null, limited: true };
  }
  return { text: out.join(""), limited: false };
}

/** Change whitespace only. Preserve large numbers, key order, duplicate keys and escapes. */
export function prettyJson(source: string): string | null {
  return formatJson(source).text;
}

export function presentValue(value: unknown, language?: string) {
  const raw = rawValue(value);
  const formattedResult = language && language !== "json" ? { text: null, limited: false } : formatJson(raw);
  const formatted = formattedResult.text;
  return {
    raw,
    text: formatted ?? raw,
    language: formatted !== null ? "json" : language ?? "text",
    canFormat: formatted !== null && formatted !== raw,
    ...(formattedResult.limited ? { formatLimited: true } : {}),
  };
}

export function previewText(text: string): TextPreview {
  const lines = text.slice(0, PREVIEW_CHARS + 1).split("\n");
  let preview = lines.slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARS);
  // Do not leave half a valid surrogate pair at a UTF-16 character boundary.
  // A lone surrogate is valid JS text and must not be silently removed.
  const last = preview.charCodeAt(preview.length - 1);
  const next = text.charCodeAt(preview.length);
  if (
    preview.length < text.length
    && last >= 0xd800 && last <= 0xdbff
    && next >= 0xdc00 && next <= 0xdfff
  ) preview = preview.slice(0, -1);
  return { text: preview, truncated: preview.length < text.length };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

interface CodeModeMetadata {
  status?: "running" | "yielded" | "terminated" | "result";
  cellId?: string;
  scriptError?: string;
  droppedTraceCount?: number;
}

type DerivedSegment = ReadableSegment & { formatLimited?: boolean; upstreamTruncated?: boolean };

interface PiExecResult {
  chunk_id: string;
  wall_time_seconds: number;
  output: string;
  exit_code?: number;
  session_id?: number;
  original_token_count?: number;
}

const UPSTREAM_OUTPUT_TRUNCATED = "[Output truncated]";
const UPSTREAM_OUTPUT_WARNING = "Upstream output truncated · Show all cannot restore omitted output";

function looksLikeJson(source: string): boolean {
  return /^\s*[[{"]/.test(source.slice(0, 256));
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function ownDataValue(record: Record<string, unknown> | undefined, key: string): unknown {
  if (!record) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/** Recognize only the public Pi code-mode result shape; never search for it inside other text. */
function parsePiExecResult(source: string): PiExecResult | undefined {
  if (source.length > MAX_DECODE_CHARS || !looksLikeJson(source)) return undefined;
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    return undefined;
  }
  const record = object(decoded);
  if (!record || typeof record.chunk_id !== "string" || !record.chunk_id
    || !isNonNegativeFiniteNumber(record.wall_time_seconds) || typeof record.output !== "string") return undefined;
  const hasExitCode = Object.prototype.hasOwnProperty.call(record, "exit_code");
  const hasSessionId = Object.prototype.hasOwnProperty.call(record, "session_id");
  if (hasExitCode === hasSessionId) return undefined;
  if (hasExitCode && !isInteger(record.exit_code)) return undefined;
  if (hasSessionId && !isInteger(record.session_id)) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, "original_token_count")
    && !isNonNegativeFiniteNumber(record.original_token_count)) return undefined;
  const exitCode = hasExitCode ? record.exit_code as number : undefined;
  const sessionId = hasSessionId ? record.session_id as number : undefined;
  const originalTokenCount = record.original_token_count as number | undefined;
  return {
    chunk_id: record.chunk_id,
    wall_time_seconds: record.wall_time_seconds,
    output: record.output,
    ...(hasExitCode ? { exit_code: exitCode } : {}),
    ...(hasSessionId ? { session_id: sessionId } : {}),
    ...(originalTokenCount !== undefined ? { original_token_count: originalTokenCount } : {}),
  };
}

function codeModeMetadata(value: Record<string, unknown> | undefined): CodeModeMetadata | undefined {
  // Read only ordinary decoded JSON data. Accessor-backed metadata can contain
  // traces or other deferred payloads and is not needed for the generic view.
  try {
    const details = object(ownDataValue(value, "details"));
    if (details?.codeMode !== true) return undefined;
    const status = details.status;
    return {
      ...(status === "running" || status === "yielded" || status === "terminated" || status === "result" ? { status } : {}),
      ...(typeof details.cellId === "string" ? { cellId: details.cellId } : {}),
      ...(typeof details.scriptError === "string" ? { scriptError: details.scriptError } : {}),
      ...(isInteger(details.droppedTraceCount) ? { droppedTraceCount: details.droppedTraceCount } : {}),
    };
  } catch {
    return undefined;
  }
}

function hasUpstreamTruncation(source: string): boolean {
  // Pi appends this marker to the affected text item. Check the received text only;
  // do not inspect traces or scan unrelated content blocks.
  return source === UPSTREAM_OUTPUT_TRUNCATED || source.endsWith("\n" + UPSTREAM_OUTPUT_TRUNCATED);
}

function formatTextSegment(source: string, ui: boolean, detectUpstreamTruncation = false): DerivedSegment {
  const formatted = formatJson(source);
  const text = formatted.text ?? (ui ? formatUiText(source) : source);
  return {
    kind: "text",
    text,
    language: formatted.text !== null ? "json" : "text",
    ...(formatted.limited ? { formatLimited: true } : {}),
    ...(detectUpstreamTruncation && hasUpstreamTruncation(source) ? { upstreamTruncated: true } : {}),
  };
}

/** Extract only the ACP content block shape projected by the DSH bridge. */
function readableBlockText(record: Record<string, unknown> | undefined): string | undefined {
  const type = ownDataValue(record, "type");
  if (type === "text") {
    const text = ownDataValue(record, "text");
    return typeof text === "string" ? text : undefined;
  }
  if (type !== "content") return undefined;
  const content = object(ownDataValue(record, "content"));
  if (ownDataValue(content, "type") !== "text") return undefined;
  const text = ownDataValue(content, "text");
  return typeof text === "string" ? text : undefined;
}

function statusTone(text: string): ReadableSegmentTone {
  if (/error|failed|exit code:\s*-[1-9]|exit code:\s*[1-9]\d*/i.test(text)) return "error";
  if (/running|truncated|terminated|omitted/i.test(text)) return "warning";
  return "muted";
}

function statusSegment(text: string, separator?: string, tone = statusTone(text)): DerivedSegment {
  return { kind: "status", text, language: "text", ...(separator ? { separator } : {}), tone };
}

function isCodeModeStatusText(text: string): boolean {
  return /^(?:Script completed|Script terminated|Script error:|Still running \(exec cell |Cell (?:#|terminated)|Session \d+ still running)/.test(text);
}

function metadataStatus(metadata: CodeModeMetadata): string | undefined {
  if (metadata.scriptError) return "Script error: " + metadata.scriptError;
  if (metadata.status === "yielded" || metadata.status === "running") {
    return metadata.cellId ? `Cell #${metadata.cellId} still running` : "Cell still running";
  }
  if (metadata.status === "terminated") return metadata.cellId ? `Cell #${metadata.cellId} terminated` : "Cell terminated";
  return undefined;
}

function codeModeStatusAlreadyShown(metadata: CodeModeMetadata, firstText: string | undefined): boolean {
  if (!firstText) return false;
  if (metadata.scriptError) {
    const error = "Script error: " + metadata.scriptError;
    return firstText === error || firstText.startsWith(error + "\n");
  }
  if (metadata.status === "running" || metadata.status === "yielded") {
    return /^(?:Still running \(exec cell |Cell (?:#\S+ )?still running)/.test(firstText);
  }
  if (metadata.status === "terminated") {
    return /^(?:Script terminated|Cell (?:#\S+ )?terminated)/.test(firstText);
  }
  return false;
}

function codeModePrefix(value: Extract<ReadableValue, { kind: "content" }>): DerivedSegment[] {
  if (!value.codeMode) return [];
  const prefix: DerivedSegment[] = [];
  const first = object(value.blocks[0]);
  const firstText = readableBlockText(first);
  const status = metadataStatus(value.codeMode);
  if (status && !codeModeStatusAlreadyShown(value.codeMode, firstText)) {
    prefix.push(statusSegment(status));
  }
  if (value.codeMode.droppedTraceCount && value.codeMode.droppedTraceCount > 0) {
    const count = value.codeMode.droppedTraceCount;
    const traceStatus = statusSegment(`Trace data truncated · ${count} ${count === 1 ? "entry" : "entries"} omitted`, prefix.length ? "\n" : undefined);
    prefix.push(traceStatus);
  }
  return prefix;
}

function execResultSegments(result: PiExecResult): DerivedSegment[] {
  const running = result.session_id !== undefined;
  const status = running ? `Session ${result.session_id} still running` : `Exit code: ${result.exit_code}`;
  const outputTruncated = hasUpstreamTruncation(result.output);
  const segments: DerivedSegment[] = [statusSegment(status)];
  // Keep this warning before a long body so it remains visible, participates in
  // the shared budget, and is included in complete Readable copies.
  if (outputTruncated) segments.push(statusSegment(UPSTREAM_OUTPUT_WARNING, "\n", "warning"));
  if (result.output) {
    const output = formatTextSegment(result.output, false, true);
    output.separator = "\n";
    segments.push(output);
  } else {
    segments[0]!.text += running ? " · No output yet" : " · Empty output";
  }
  return segments;
}

function readableBlockSegments(
  value: Extract<ReadableValue, { kind: "content" }>,
  block: unknown,
  index: number,
): DerivedSegment[] {
  const record = object(block);
  const text = readableBlockText(record);
  if (text !== undefined) {
    if (value.codeMode) {
      const result = parsePiExecResult(text);
      if (result) return execResultSegments(result);
      const segment = formatTextSegment(text, value.ui === true, true);
      if (index === 0 && isCodeModeStatusText(text)) {
        segment.kind = "status";
        segment.tone = statusTone(text);
      }
      // Partial JSON cannot be decoded, but Pi's explicit final truncation marker
      // must still be visible before the long literal fallback body.
      if (segment.upstreamTruncated) return [statusSegment(UPSTREAM_OUTPUT_WARNING, undefined, "warning"), { ...segment, separator: "\n" }];
      return [segment];
    }
    return [formatTextSegment(text, value.ui === true) as DerivedSegment];
  }
  // Non-text blocks and extra fields are explicitly retained in Raw, never fetched/executed.
  const typeValue = ownDataValue(record, "type");
  const mimeValue = ownDataValue(record, "mimeType");
  const type = typeof typeValue === "string" ? typeValue.slice(0, 40) : "Unknown block";
  const mime = typeof mimeValue === "string" ? " · " + mimeValue.slice(0, 80) : "";
  return [{ kind: "text", text: "[" + type + mime + " · data in Raw]", language: "text" }];
}

/** Decode only known transport containers; never recursively reinterpret arbitrary string fields. */
export function readableValue(value: unknown, toolName?: string, direction = toolName === undefined ? "output" : "input"): ReadableValue | undefined {
  let decoded = value;
  if (typeof value === "string" && value.length <= MAX_DECODE_CHARS) {
    try { decoded = JSON.parse(value); } catch { /* It may be literal JS input. */ }
  }
  const record = object(decoded);
  if (direction === "input") {
    const name = (toolName ?? "").trim().toLowerCase().replace(/^(?:functions|tools)\./, "");
    const codeTool = ["exec", "mcpscript", "mcp_script"].includes(name);
    const code = codeTool ? record?.code ?? (typeof decoded === "string" && !decoded.slice(0, 256).trimStart().startsWith("{") ? decoded : undefined)
      : name === "evaluate_browser" ? record?.expression : undefined;
    if (typeof code === "string") return { kind: "code", code, language: "javascript", note: "JavaScript · Full input in Raw" };
    return undefined;
  }
  const ui = isUiTool(toolName);
  const blocks = ui && typeof value === "string" && !record ? [{ type: "text", text: value }] : record?.content;
  // A typed content array is the explicit tool-result contract, not a random { text } object.
  if (!Array.isArray(blocks) || (blocks.length > 0 && typeof object(blocks[0])?.type !== "string")) return undefined;
  const codeMode = codeModeMetadata(record);
  return { kind: "content", blocks, language: "text", ...(ui ? { ui } : {}), ...(codeMode ? { codeMode } : {}), note: codeMode
    ? "Code mode · Nested exec output expanded one layer. Full response, metadata and attachments in Raw"
    : ui
      ? "UI view · Labels expanded; paths compacted. Full response and attachments in Raw"
      : "Readable content · Full response, metadata and attachments in Raw" };
}

function publicSegment(segment: DerivedSegment, text = segment.text, separator = segment.separator): ReadableSegment {
  return {
    kind: segment.kind,
    text,
    language: segment.language,
    ...(separator ? { separator } : {}),
    ...(segment.tone ? { tone: segment.tone } : {}),
  };
}

interface AppendResult {
  text: string;
  complete: boolean;
}

/** Append one segment while keeping the aggregate preview bounded. */
function appendPreviewSegment(
  text: string,
  segment: DerivedSegment,
  separator: string,
  all: boolean,
  output: ReadableSegment[],
): AppendResult {
  const actualSeparator = segment.separator ?? separator;
  if (all) {
    output.push(publicSegment(segment, segment.text, actualSeparator));
    return { text: text + actualSeparator + segment.text, complete: true };
  }

  // Only take a small prefix from this segment. The accumulated text is already
  // bounded, so this cannot turn a many-block preview into a per-block budget.
  const source = actualSeparator + segment.text;
  const candidate = text + source.slice(0, PREVIEW_CHARS + 1);
  const preview = previewText(candidate);
  // Noninitial segments have a newline separator, so appending cannot turn
  // an earlier lone surrogate into a split pair or shorten the emitted prefix.
  const visible = preview.text.slice(text.length);
  if (visible) {
    const separatorShown = actualSeparator && visible.startsWith(actualSeparator) ? actualSeparator : undefined;
    output.push(publicSegment(segment, separatorShown ? visible.slice(separatorShown.length) : visible, separatorShown));
  }
  const complete = source.length <= PREVIEW_CHARS + 1 && !preview.truncated && visible.length === source.length;
  return { text: preview.text, complete };
}

function resultHasSegments(value: Extract<ReadableValue, { kind: "content" }>, segments: ReadableSegment[]): boolean {
  return !!value.codeMode || value.blocks.length > 1 || segments.length > 1;
}

/** One preview budget across ALL blocks; do not serialize images/metadata or scan the tail eagerly. */
export function renderReadable(value: ReadableValue, all = false): TextPreview {
  if (value.kind === "code") return all ? { text: value.code, truncated: false } : previewText(value.code);

  const segments: ReadableSegment[] = [];
  let text = "";
  let truncated = false;
  let formatLimited = false;
  let upstreamTruncated = false;
  let hasPart = false;
  const append = (segment: DerivedSegment, separator: string) => {
    formatLimited ||= segment.formatLimited === true;
    upstreamTruncated ||= segment.upstreamTruncated === true;
    const result = appendPreviewSegment(text, segment, separator, all, segments);
    text = result.text;
    hasPart = true;
    if (!result.complete && !all) truncated = true;
    return result.complete;
  };

  for (const [index, segment] of codeModePrefix(value).entries()) {
    if (!append(segment, index ? "\n" : "")) return readableResult(value, text, true, segments, formatLimited, upstreamTruncated);
  }
  for (let index = 0; index < value.blocks.length; index++) {
    const blockSegments = readableBlockSegments(value, value.blocks[index], index);
    for (let segmentIndex = 0; segmentIndex < blockSegments.length; segmentIndex++) {
      const segment = blockSegments[segmentIndex]!;
      const separator = segmentIndex === 0 ? (hasPart ? "\n\n" : "") : "\n";
      if (!append(segment, separator)) return readableResult(value, text, true, segments, formatLimited, upstreamTruncated);
    }
  }
  return readableResult(value, text, truncated, segments, formatLimited, upstreamTruncated);
}

function readableResult(
  value: Extract<ReadableValue, { kind: "content" }>,
  text: string,
  truncated: boolean,
  segments: ReadableSegment[],
  formatLimited: boolean,
  upstreamTruncated: boolean,
): TextPreview {
  const result: TextPreview = { text, truncated };
  if (segments.length === 1 && segments[0]!.kind === "text" && segments[0]!.language === "json" && !segments[0]!.separator) {
    result.language = "json";
  }
  if (resultHasSegments(value, segments)) result.segments = segments;
  if (formatLimited) result.formatLimited = true;
  if (upstreamTruncated) result.upstreamTruncated = true;
  return result;
}

/** Host-validated detail is still treated defensively for history/provider evolution. */
export function detailSections(data: ToolCallItemData): DetailSection[] {
  if (!isRenderableDetail(data.detail)) {
    return [{ label: "Details", value: data.detail, language: undefined },
      ...(data.errorText ? [{ label: "Error", value: data.errorText, prose: true, language: "text" }] : [])];
  }
  const detail = data.detail as unknown as ToolCallDetail;
  const section = (label: string, value: unknown, language?: string): DetailSection => ({
    label, value, language,
  });
  let sections: DetailSection[];
  switch (detail.type) {
    case "unknown": {
      sections = [section("Input", detail.input), section("Output", detail.output)];
      const input = readableValue(detail.input, data.name);
      const output = readableValue(detail.output, data.name, "output");
      if (input) sections[0]!.readable = input;
      if (output) sections[1]!.readable = output;
      break;
    }
    case "shell":
      sections = [section("Command", detail.command, "bash")];
      if (detail.cwd) sections.push(section("Working directory", detail.cwd, "text"));
      sections.push(section("Output", detail.output, "text"));
      if (detail.exitCode !== undefined && detail.exitCode !== null) {
        sections.push(section("Exit code", String(detail.exitCode), "text"));
      }
      break;
    case "read": {
      const contents = section("Contents", detail.content, data.presentation.language ?? "text");
      sections = [
        section("File", detail.filePath, "text"),
        detail.offset !== undefined || detail.limit !== undefined ? { ...contents, raw: detail } : contents,
      ];
      break;
    }
    case "write":
      sections = [
        section("File", detail.filePath, "text"),
        section("Contents", detail.content, data.presentation.language ?? "text"),
      ];
      break;
    case "edit": {
      sections = [section("File", detail.filePath, "text")];
      const size = (detail.oldString?.length ?? 0) + (detail.newString?.length ?? 0);
      if (detail.unifiedDiff !== undefined) {
        sections.push({
          ...section("Diff", detail.unifiedDiff, "text"),
          raw: detail,
          ...(detail.unifiedDiff.length <= MAX_FORMAT_CHARS ? { diff: diffLinesForDetail(detail) } : {}),
        });
      } else if (size <= MAX_FORMAT_CHARS) {
        const diff = diffLinesForDetail(detail);
        sections.push({
          label: "Diff",
          value: diff.map((line) => (line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ") + line.text).join("\n"),
          diff,
          language: "text",
          raw: detail,
        });
      } else {
        sections.push(section("Before", detail.oldString, data.presentation.language ?? "text"));
        sections.push(section("After", detail.newString, data.presentation.language ?? "text"));
      }
      break;
    }
    case "plain_text":
    case "plan":
      sections = [{ label: "Output", value: detail.text, prose: true, language: "text" }];
      break;
    default:
      // Keep every field for search/fetch/subagent/provider-specific details.
      sections = [section("Details", detail)];
  }
  if (data.errorText) sections.push({ label: "Error", value: data.errorText, prose: true, language: "text" });
  return sections;
}

export function activityIcon(category: ToolCallItemData["presentation"]["category"]): string {
  return {
    shell: "Terminal",
    file: "FileText",
    search: "Search",
    agent: "User",
    plan: "List",
    communication: "MessageSquare",
    unknown: "Wrench",
  }[category];
}
