const MAX_UI_FORMAT_CHARS = 100_000;
const JSON_STRING = /"(?:\\[\s\S]|[^"\\])*"/g;

export function isUiTool(name: string | undefined): boolean {
  return !!name && ["find_roots", "observe_ui", "search_ui", "inspect_ui", "expand_ui", "read_text", "act_ui", "wait_for"]
    .includes(name.trim().toLowerCase().replace(/^(?:functions|tools)\./, ""));
}

function compactPath(line: string): string {
  const match = line.match(/^(\s*path:\s+)(.+)$/);
  if (!match) return line;
  // Labels are repeated in search results. Keep the role path here; exact labels remain in Raw.
  let valid = true;
  const roles = match[2]!.replace(JSON_STRING, token => {
    try { JSON.parse(token); } catch { valid = false; }
    return "";
  }).split("▸").map(part => part.trim());
  if (!valid) return line;
  if (roles.length < 2 || !roles.every(role => /^AX[\w/]+$/.test(role))) return line;
  const runs: { role: string; count: number }[] = [];
  for (const role of roles) {
    const last = runs.at(-1);
    if (last?.role === role) last.count += 1;
    else runs.push({ role, count: 1 });
  }
  return match[1] + runs.map(({ role, count }) => role + (count > 1 ? " × " + count : "")).join(" ▸ ");
}

/** A view for explicit UI-tool text, NOT a general backslash replacer or recursive decoder. */
export function formatUiText(source: string): string {
  if (source.length > MAX_UI_FORMAT_CHARS) return source;
  const output: string[] = [];
  let length = 0;
  for (const line of source.split("\n")) {
    let formatted = compactPath(line);
    const match = line.match(/^(\s*@e\d+\s+AX[\w/]+)\s+("(?:\\[\s\S]|[^"\\])*")(.*)$/);
    if (match) {
      try {
        const label: unknown = JSON.parse(match[2]!);
        if (typeof label === "string" && (label.includes("\n") || label.length > 160)) {
          formatted = match[1] + match[3] + "\n  Text:\n" + label.split("\n").map(part => "    " + part).join("\n");
        }
      } catch { /* Partial/invalid quoted labels must remain literal. */ }
    }
    length += formatted.length + 1;
    if (length > MAX_UI_FORMAT_CHARS) return source;
    output.push(formatted);
  }
  return output.join("\n");
}
