import type { ToolCallPresentation } from "./presentation";

/** Normalize only a bounded prefix; headers never need the complete source. */
export function compactText(value: string, maxLength = 180): string | undefined {
  const normalized = value.slice(0, maxLength * 4).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength || value.length > maxLength * 4
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

/** Headers are signposts, not miniature code/output panes. Full inputs live in details. */
export function headerSummary(presentation: ToolCallPresentation, compact: boolean): string | undefined {
  const limit = compact ? 40 : 64;
  const value = presentation.filePath ?? presentation.summary;
  if (!value) return undefined;
  if (presentation.filePath) {
    // A 64-character middle truncation can still lose its filename to CSS tail ellipsis.
    // Use short full paths on desktop, otherwise the basename; budget for monospace width.
    const pathLimit = compact ? 16 : 40;
    const label = compact || value.length > pathLimit
      ? value.slice(Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\")) + 1) || value : value;
    if (label.length <= pathLimit) return label;
    const head = Math.floor(pathLimit / 3);
    return label.slice(0, head) + "…" + label.slice(-(pathLimit - head - 1));
  }
  const text = value.slice(0, 512).replace(/\s+/g, " ").trim();
  return text.length > limit || value.length > 512 ? text.slice(0, limit - 1) + "…" : text || undefined;
}
