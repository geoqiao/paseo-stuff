import { describe, expect, it } from "vitest";
import { animations, frameAt, spriteGeometry } from "./animation";
import { manifestSchema, packageKeySchema, preferences } from "./contracts";
import { petState } from "./state";

describe("Codex contract and frame table", () => {
  it("has no resource scan configured by default", () => {
    expect(preferences.schema.parse({})).toEqual({ root: "", petKey: "", animate: true });
  });
  it("defaults an omitted sprite version to v1, not a guessed v2", () => {
    const pet = { id: "pet", displayName: "Pet", spritesheetPath: "sprite.png", custom: true };
    expect(manifestSchema.parse(pet)).toMatchObject({ spriteVersionNumber: 1, custom: true });
    expect(manifestSchema.safeParse({ ...pet, spriteVersionNumber: 3 }).success).toBe(false);
  });
  it.each(["..", ".", "a/b", "a\\b", "x:y", "a\0b"])("rejects unsafe directory key %j", (key) => {
    expect(packageKeySchema.safeParse(key).success).toBe(false);
  });
  it.each(Object.keys(animations) as (keyof typeof animations)[])("only plays valid %s columns and durations", (name) => {
    const times = animations[name].durations;
    let elapsed = 0;
    times.forEach((duration, index) => {
      expect(frameAt(name, elapsed)).toEqual({ column: index, remaining: duration });
      expect(frameAt(name, elapsed + duration - 1)).toEqual({ column: index, remaining: 1 });
      elapsed += duration;
    });
    expect(frameAt(name, elapsed).column).toBe(0);
    expect(frameAt(name, -100).column).toBe(0);
    expect(frameAt(name, Infinity).column).toBe(0);
  });
  it.each([1, 2] as const)("crops v%s at cell boundaries without reading unused cells", (version) => {
    expect(spriteGeometry(version, "review", 200)).toMatchObject({ left: -960, top: -1664, atlasWidth: 1536, atlasHeight: version === 2 ? 2288 : 1872 });
    expect(spriteGeometry(version, "idle", -3, 96)).toMatchObject({ left: -0, width: 96, height: 104, atlasWidth: 768 });
  });
});
describe("agent signal priority", () => {
  const agent = { status: "running" as const, requiresAttention: false, attentionReason: null };
  it.each([
    [{ ...agent }, "running", "Working", false],
    [{ ...agent, status: "initializing" }, "running", "Starting", false],
    [{ ...agent, status: "idle" }, "idle", "Idle", false],
    [{ ...agent, requiresAttention: true, attentionReason: "finished" }, "review", "Ready to review", false],
    [{ ...agent, requiresAttention: true, attentionReason: "permission", status: "error" }, "waiting", "Needs your input", false],
    [{ ...agent, requiresAttention: true, attentionReason: "error" }, "failed", "Something went wrong", false],
    [{ ...agent, status: "error" }, "failed", "Something went wrong", false],
    [{ ...agent, requiresAttention: true }, "waiting", "Needs attention", false],
    [{ ...agent, attentionReason: "finished", status: "idle" }, "idle", "Idle", false],
    [{ ...agent, status: "closed", requiresAttention: true, attentionReason: "permission" }, "idle", "Agent closed", true],
    [null, "idle", "Not connected", true],
  ])("maps %j without performing any action", (signal, animation, label, still) => {
    expect(petState(signal as Parameters<typeof petState>[0])).toEqual({ animation, label, still });
  });
});
