import { readFile, stat } from "node:fs/promises";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { createImageStartupPatch, imageStartupRepair } from "./image-startup";

const stale = [
  { id: "agent-default-model", name: "@deepseek-ai/dsh-agent-default-model",
    config: { provider: "deepseek-official", model: "deepseek-flash" } },
  { id: "acp", name: "@deepseek-ai/dsh-acp",
    config: { provider: "deepseek-official", model: "deepseek-v4-flash", sessionListPageSize: 7 } },
];
describe("DSH image startup compatibility", () => {
  it("repairs only the stale ACP default, preserving the entire replacement config", () => {
    const source = JSON.stringify(stale);
    expect(parse(imageStartupRepair(source)!)).toEqual([{
      id: "acp", config: { provider: "deepseek-official", model: "deepseek-flash", sessionListPageSize: 7 },
    }]);
    expect(JSON.stringify(stale)).toBe(source);
  });
  it.each(["deepseek-flash", "deepseek-v4-pro", "custom-model"])("leaves configured model %s alone", (model) => {
    const entries = structuredClone(stale); entries[1].config.model = model;
    expect(imageStartupRepair(JSON.stringify(entries))).toBeUndefined();
  });
  it.each(["provider", "name", "disabled", "default", "duplicate"])("leaves custom/ambiguous %s alone", (kind) => {
    const entries: (typeof stale[number] & { disabled?: boolean })[] = structuredClone(stale);
    if (kind === "provider") entries[1].config.provider = "custom";
    if (kind === "name") entries[1].name = "custom-acp";
    if (kind === "disabled") entries[1].disabled = true;
    if (kind === "default") entries[0].config.model = "deepseek-v4-flash";
    if (kind === "duplicate") entries.push(entries[1]);
    expect(imageStartupRepair(JSON.stringify(entries))).toBeUndefined();
  });
  it.each(["", "{}", "- [", "- foo", "x".repeat(256 * 1024 + 1)])("ignores malformed or oversized config", (source) => {
    expect(imageStartupRepair(source)).toBeUndefined();
  });
  it("does not execute or mistake tagged expressions for literal routes", () => {
    const source = stringify(stale).replace("model: deepseek-v4-flash", "model: !!js deepseek-v4-flash");
    expect(imageStartupRepair(source)).toBeUndefined();
  });
  it("creates a private, removable overlay outside DSH_HOME", async () => {
    const patch = await createImageStartupPatch(imageStartupRepair(JSON.stringify(stale))!);
    try {
      expect(parse(await readFile(patch.path, "utf8"))[0].config.provider).toBe("deepseek-official");
      if (process.platform !== "win32") expect((await stat(patch.path)).mode & 0o777).toBe(0o600);
    } finally { await patch.close(); }
    await expect(stat(patch.path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
