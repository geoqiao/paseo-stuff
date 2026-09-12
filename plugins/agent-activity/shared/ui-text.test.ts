import { expect, it } from "vitest";
import { formatUiText, isUiTool } from "./ui-text";
import { readableValue, renderReadable } from "./details";

const label = 'Observed synthetic UI\n\n@e1 AXWindow "Demo"\n  @e2 AXGroup\n  Windows path: C:\\new\\test';
const quoted = JSON.stringify(label);
const path = '  path: AXWindow/AXStandardWindow "Demo" ▸ ' + 'AXGroup ▸ '.repeat(50) + 'AXStaticText ' + quoted;
const source = 'Found 1 outline match; returned 1.\n@e42 AXStaticText ' + quoted + ' [prefix]\n' + path;

it("expands only the quoted UI label and compresses a repeated path", () => {
  const text = formatUiText(source);
  expect(text).toContain('@e42 AXStaticText [prefix]\n  Text:\n    Observed synthetic UI\n');
  expect(text).toContain('    Windows path: C:\\new\\test');
  expect(text).toContain('  path: AXWindow/AXStandardWindow ▸ AXGroup × 50 ▸ AXStaticText');
  expect(text).not.toContain('\\n\\n@e1');
  expect(text.match(/Observed synthetic UI/g)).toHaveLength(1);
});

it.each(['@e1 AXStaticText "partial\\n', '@e1 AXStaticText "invalid\\qescape"', 'const value = "keep\\ncode";', 'log says \\n is a backslash sequence', '  path: custom("value") ▸ unknown'])('preserves unrecognized/partial syntax: %s', source => {
  expect(formatUiText(source)).toBe(source);
});

it("is applied only to explicit UI output, with the complete raw payload preserved", () => {
  const raw = { content: [{ type: "text", text: source }], details: { all: true } };
  const ui = readableValue(raw, "functions.search_ui", "output")!;
  expect(renderReadable(ui).text).toContain("AXGroup × 50");
  expect(renderReadable(readableValue(raw)! ).text).toBe(source);
  expect(raw.content[0]!.text).toBe(source);
  expect(isUiTool("vendor.search_ui")).toBe(false);
  expect(readableValue(source, "search_ui", "output")).toMatchObject({ ui: true });
});

it("preserves exactly one decoding layer instead of interpreting code inside a label", () => {
  const code = 'const escaped = "\\n";\nnext();';
  const formatted = formatUiText('@e1 AXStaticText ' + JSON.stringify(code));
  expect(formatted).toContain('    const escaped = "\\n";\n    next();');
});

it("reapplies the shared preview budget after expanding quoted newlines", () => {
  const text = '@e1 AXStaticText ' + JSON.stringify(Array.from({ length: 80 }, (_, i) => 'nested line ' + i).join('\n'));
  const view = readableValue({ content: [{ type: "text", text }] }, "search_ui", "output")!;
  expect(renderReadable(view).text.split('\n').length).toBeLessThanOrEqual(20);
  expect(renderReadable(view).truncated).toBe(true);
  expect(renderReadable(view, true).text).toContain("nested line 79");
});

it("bounds formatting input and generated output", () => {
  const huge = '@e1 AXStaticText ' + JSON.stringify('line\n'.repeat(30_000));
  expect(formatUiText(huge)).toBe(huge);
  const expansion = '@e1 AXStaticText ' + JSON.stringify('\n'.repeat(30_000));
  expect(formatUiText(expansion)).toBe(expansion);
});

it("keeps JSON token highlighting for a single JSON text block", () => {
  const view = readableValue({ content: [{ type: "text", text: '{"id":90071992547409931234}' }] })!;
  expect(renderReadable(view)).toMatchObject({ language: "json", text: '{\n  "id": 90071992547409931234\n}' });
  expect(renderReadable(view, true).language).toBe("json");
});
