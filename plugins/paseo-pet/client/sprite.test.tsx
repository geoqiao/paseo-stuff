import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import type { PetAsset } from "../shared/contracts";
import { Sprite } from "./sprite";
const policy = vi.hoisted(() => ({ reduced: false, active: true, frame: vi.fn(() => 2) }));
vi.mock("react-native", () => ({ Image: "Image", Text: "Text", View: "View", Pressable: "Pressable" }));
vi.mock("./motion", () => ({ useMotionPolicy: () => policy, useAnimationFrame: policy.frame }));
const theme = { colors: { foreground: "#222222", foregroundMuted: "#666666", statusDanger: "#990000" } } as PluginHostProps["theme"];
const asset: PetAsset = { pet: { key: "pet", id: "pet", displayName: "Pet", description: "", version: 2, bytes: 10, mime: "image/png", revision: "a".repeat(64) }, hash: "b".repeat(64), uri: "data:image/png;base64,AA==" };
let renderer: ReactTestRenderer;
const retry = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  policy.reduced = false; policy.active = true; policy.frame.mockReset().mockReturnValue(2); retry.mockClear();
  vi.spyOn(console, "error").mockImplementation((message) => {
    if (!String(message).startsWith("react-test-renderer is deprecated.")) throw new Error(String(message));
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const element = () => <Sprite asset={asset} state={{ animation: "running", label: "Working", still: false }} animate theme={theme} compact={false} retry={retry} />;
async function mount() { await act(async () => { renderer = create(element()); }); }
const nativeImage = () => renderer.root.find((node) => String(node.type) === "Image");
async function layout(width: number, height: number) {
  await act(async () => renderer.root.find((node) => typeof node.props.onLayout === "function").props.onLayout({ nativeEvent: { layout: { width, height } } }));
}
describe("sprite rendering", () => {
  it("only animates after decoding and positive layout, then stops for a retained hidden panel", async () => {
    await mount(); expect(policy.frame).toHaveBeenLastCalledWith("idle", false);
    await layout(300, 260); expect(policy.frame).toHaveBeenLastCalledWith("idle", false);
    await act(async () => nativeImage().props.onLoad());
    expect(policy.frame).toHaveBeenLastCalledWith("running", true);
    expect(nativeImage().props.style).toEqual({ width: 1536, height: 2288 });
    expect(nativeImage().parent?.parent?.props.style).toMatchObject({
      left: 0, top: 0, transform: [{ translateX: -384 }, { translateY: -1456 }],
    });
    await layout(0, 0); expect(policy.frame).toHaveBeenLastCalledWith("idle", false);
  });
  it("keeps decode failures explicit and only retries on request", async () => {
    await mount(); await act(async () => nativeImage().props.onError());
    expect(JSON.stringify(renderer.toJSON())).toContain("Cannot decode");
    expect(retry).not.toHaveBeenCalled();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Retry image" }).props.onPress());
    expect(retry).toHaveBeenCalledOnce();
  });
  it("uses the system motion setting even while app animation is enabled", async () => {
    await mount(); await layout(300, 260); await act(async () => nativeImage().props.onLoad());
    policy.reduced = true;
    await act(async () => renderer.update(element()));
    expect(policy.frame).toHaveBeenLastCalledWith("idle", false);
    expect(JSON.stringify(renderer.toJSON())).toContain("Reduced motion");
  });
  it("keeps atlas source, style and load callbacks stable across frames and motion state changes", async () => {
    await mount(); await layout(300, 260); await act(async () => nativeImage().props.onLoad());
    const original = nativeImage().props;
    policy.frame.mockReturnValue(4);
    await act(async () => renderer.update(element()));
    expect(nativeImage().parent?.parent?.props.style.transform).toEqual([{ translateX: -768 }, { translateY: -1456 }]);
    for (const prop of ["source", "style", "onLoad", "onError"]) expect(nativeImage().props[prop]).toBe(original[prop]);
    policy.reduced = true;
    await act(async () => renderer.update(element()));
    for (const prop of ["source", "style", "onLoad", "onError"]) expect(nativeImage().props[prop]).toBe(original[prop]);
  });
  it("makes the pet itself an accessible pause action without extra visible controls", async () => {
    const toggle = vi.fn();
    await act(async () => { renderer = create(<Sprite {...element().props} onToggle={toggle} />); });
    const button = renderer.root.findByProps({ accessibilityLabel: "Pause pet animation" });
    await act(async () => button.props.onPress());
    expect(toggle).toHaveBeenCalledOnce();
    await act(async () => renderer.update(<Sprite {...element().props} animate={false} onToggle={toggle} disabled />));
    expect(renderer.root.findByProps({ accessibilityLabel: "Resume pet animation" }).props.disabled).toBe(true);
  });
});
