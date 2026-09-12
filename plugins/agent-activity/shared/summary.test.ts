import { expect, it } from "vitest";
import { headerSummary } from "./summary";

it.each([false, true])("bounds every category summary in compact=%s, not just custom inputs", compact => {
  const data = { category: "shell" as const, icon: "Terminal", label: "Exec", summary: "npm test && ".repeat(100_000) };
  const text = headerSummary(data, compact)!;
  expect(text.length).toBeLessThanOrEqual(compact ? 40 : 64);
  expect(text.endsWith("…")).toBe(true);
});
it("keeps the filename at the end of long paths, and short queries intact", () => {
  const data = { category: "file" as const, icon: "FileText", label: "Read", filePath: "/very/".repeat(20) + "client/activity.tsx" };
  expect(headerSummary(data, true)).toBe("activity.tsx");
  expect(headerSummary(data, false)).toBe("activity.tsx");
  expect(headerSummary({ ...data, filePath: "path/a-very-long-file-name.tsx" }, true)).toMatch(/….*\.tsx$/);
  expect(headerSummary({ ...data, filePath: undefined, summary: "Appearance" }, false)).toBe("Appearance");
  expect(headerSummary({ ...data, filePath: undefined }, false)).toBeUndefined();
});
