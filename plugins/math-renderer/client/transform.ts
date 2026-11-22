import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { MATH_KIND } from "../shared/contracts";
import { parseDocument } from "../shared/markdown";

// Match findFences in paseo-plugin-genui@0.3.3 (shared/fallback.ts). The
// language token ends at punctuation other than hyphens and underscores,
// so ui.json and app.html are read as ui and app respectively.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)/;

/** True when the reply opens a ```ui or ```app fence another plugin renders live. */
function hasUiFence(text: string): boolean {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE_OPEN.exec(lines[index] ?? "");
    if (open === null) continue;
    const language = (open[2] ?? "").toLowerCase();
    if (language === "ui" || language === "app") return true;
    // A fence of another language swallows its body: a ```ui inside it is code
    // being quoted. Skip to the closing marker (or the end of the message).
    const marker = open[1] ?? "```";
    const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
    let close = index + 1;
    while (close < lines.length && !closing.test(lines[close] ?? "")) close++;
    index = close;
  }
  return false;
}

export const transformMessage: PluginTimelineTransformerContribution<"assistant_message">["transform"] = ({ item, phase }) => {
  // Paseo supplies the entire growing reply. Keep streaming native: a later image,
  // file link or size limit must not tear down an already interactive math card.
  // This also avoids parsing the whole document on every token update.
  if (phase === "streaming") return undefined;
  // Paseo sorts plugins by `${serverId}/${id}` and uses the first transform that
  // claims the reply. Yield when a live-UI fence is present so a later-sorting
  // UI installation gets a turn. With math-renderer alone, the reply stays native.
  // Temporary until Paseo supports priority or block composition (getpaseo/paseo#10486).
  if (hasUiFence(item.text)) return undefined;
  if (!/(?:\$|\\[[(]|(?:`{3,}|~{3,})[ \t]*math\b)/.test(item.text)) return undefined;
  const parsed = parseDocument(item.text);
  if (!parsed?.formulas) return undefined;
  // Let the host derive source identity; explicit IDs are plugin-global.
  return { items: [{ type: "plugin", kind: MATH_KIND, version: 1, data: { text: item.text } }] };
};
