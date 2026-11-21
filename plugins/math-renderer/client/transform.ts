import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { MATH_KIND } from "../shared/contracts";
import { parseDocument } from "../shared/markdown";

// The language is the whole first word of the info string, so ```ui.json and
// ```ui+json stay ordinary code blocks rather than handing the reply over.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/;

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
  // A ```ui/```app fence belongs to a live-UI renderer (genui). Paseo offers the
  // message to transformers first-wins in plugin-name order and math-renderer
  // sorts before genui, so claiming it here would show the widgets as code.
  if (hasUiFence(item.text)) return undefined;
  if (!/(?:\$|\\[[(]|(?:`{3,}|~{3,})[ \t]*math\b)/.test(item.text)) return undefined;
  const parsed = parseDocument(item.text);
  if (!parsed?.formulas) return undefined;
  // Let the host derive source identity; explicit IDs are plugin-global.
  return { items: [{ type: "plugin", kind: MATH_KIND, version: 1, data: { text: item.text } }] };
};
