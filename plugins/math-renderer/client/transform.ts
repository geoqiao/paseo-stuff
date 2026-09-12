import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { MATH_KIND } from "../shared/contracts";
import { parseDocument } from "../shared/markdown";

export const transformMessage: PluginTimelineTransformerContribution<"assistant_message">["transform"] = ({ item }) => {
  if (!/(?:\$\$|\\\[|(?:`{3,}|~{3,})[ \t]*math\b)/.test(item.text)) return undefined;
  const parsed = parseDocument(item.text);
  if (!parsed?.formulas) return undefined;
  // An explicit id in 0.8.0 is plugin-global, not source-relative. Let the host
  // derive a stable sourceId/index; assistant replies may span several source rows.
  return { items: [{ type: "plugin", kind: MATH_KIND, version: 1, data: { text: item.text } }] };
};
