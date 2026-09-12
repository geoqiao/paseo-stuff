import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnimationFrame, useMotionPolicy } from "./motion";
import type { Animation } from "../shared/animation";

const signals = vi.hoisted(() => ({
  motion: undefined as undefined | ((value: boolean) => void),
  app: undefined as undefined | ((value: string) => void),
  reduce: vi.fn<() => Promise<boolean>>(),
  motionRemove: vi.fn(), appRemove: vi.fn(),
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: signals.reduce,
    addEventListener: (_: string, callback: (value: boolean) => void) => { signals.motion = callback; return { remove: signals.motionRemove }; },
  },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, callback: (value: string) => void) => { signals.app = callback; return { remove: signals.appRemove }; },
  },
}));
let renderer: ReactTestRenderer | undefined;
function Probe({ animation = "running", enabled = true }: { animation?: Animation; enabled?: boolean }) {
  const policy = useMotionPolicy();
  const column = useAnimationFrame(animation, enabled && !policy.reduced && policy.active);
  return React.createElement("probe", { column, ...policy });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  signals.reduce.mockResolvedValue(false);
  signals.motionRemove.mockClear(); signals.appRemove.mockClear();
  vi.spyOn(console, "error").mockImplementation((message) => {
    if (!String(message).startsWith("react-test-renderer is deprecated.")) throw new Error(String(message));
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount(props: Parameters<typeof Probe>[0] = {}) {
  await act(async () => { renderer = create(<Probe {...props} />); });
}
const value = () => renderer!.root.find((node) => String(node.type) === "probe").props;

describe("motion lifecycle", () => {
  it("respects variable frame times and resets to frame zero when paused and resumed", async () => {
    await mount();
    expect(value().column).toBe(0);
    await act(async () => { vi.advanceTimersByTime(120); });
    expect(value().column).toBe(1);
    await act(async () => renderer!.update(<Probe enabled={false} />));
    expect(value().column).toBe(0); expect(vi.getTimerCount()).toBe(0);
    await act(async () => renderer!.update(<Probe enabled />));
    expect(value().column).toBe(0);
  });
  it("stops in the background, for reduced motion, and on unmount", async () => {
    await mount();
    await act(async () => signals.app!("background"));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => signals.app!("active"));
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => signals.motion!(true));
    expect(value().reduced).toBe(true); expect(vi.getTimerCount()).toBe(0);
    await act(async () => renderer!.unmount()); renderer = undefined;
    expect(signals.appRemove).toHaveBeenCalledOnce(); expect(signals.motionRemove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps a still frame if the preference cannot be read", async () => {
    signals.reduce.mockRejectedValueOnce(new Error("unavailable"));
    await mount();
    expect(value().reduced).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not overwrite a newer motion event with an older async preference read", async () => {
    let resolve!: (value: boolean) => void;
    signals.reduce.mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done; }));
    await mount();
    await act(async () => { signals.motion!(true); resolve(false); });
    expect(value().reduced).toBe(true);
  });
  it("resets columns when the work state changes", async () => {
    await mount();
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(value().column).toBe(5);
    await act(async () => renderer!.update(<Probe animation="waiting" />));
    expect(value().column).toBe(0);
  });
});
