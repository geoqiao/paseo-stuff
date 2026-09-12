import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import { PetLibrary } from "./library";
import { PetView } from "./panel";
import { preferences } from "../shared/contracts";

const mock = vi.hoisted(() => ({
  settings: {} as Record<string, any>,
  list: vi.fn(), load: vi.fn(), suggest: vi.fn(),
}));
vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => mock.settings,
  useRpc: (contract: { name: string }) => contract.name === "pets.list" ? mock.list : contract.name === "pets.load" ? mock.load : mock.suggest,
}));
vi.mock("react-native", () => ({ Text: "Text", View: "View", Pressable: "Pressable" }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ ScrollView: "ScrollView", TextInput: "TextInput", Icon: "Icon" }));
vi.mock("./sprite", () => ({ Sprite: (props: object) => React.createElement("sprite", props) }));
const theme = { colors: { foreground: "#202020", foregroundMuted: "#606060", surface0: "#ffffff", surface1: "#eeeeee", accent: "#456789", statusDanger: "#990000" } } as PluginHostProps["theme"];
const props = { theme, host: { id: "host", label: "Local host" }, layout: { compact: true, platform: "web" as const } };
const pet = { key: "pet", id: "pet", displayName: "Test pet", description: "", version: 2, bytes: 100, mime: "image/png", revision: "a".repeat(64) };
let renderer: ReactTestRenderer, client: QueryClient;
let screen: "settings" | "pet";
const openSettings = vi.fn();
beforeEach(() => {
  screen = "settings"; openSettings.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation((message) => {
    if (!String(message).startsWith("react-test-renderer is deprecated.")) throw new Error(String(message));
  });
  mock.settings = { status: "ready", values: preferences.schema.parse({}), revision: "revision-1", saving: false, saveError: null, save: vi.fn().mockResolvedValue(true), reload: vi.fn(), reset: vi.fn() };
  mock.list.mockReset().mockResolvedValue({ root: "/pets", pets: [pet], issues: [], truncated: false });
  mock.load.mockReset().mockResolvedValue({ pet, hash: "b".repeat(64), uri: "data:image/png;base64,AA==" });
  mock.suggest.mockReset().mockResolvedValue({ root: "/home/example/.codex/pets" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
const tree = () => <QueryClientProvider client={client}>{screen === "settings" ? <PetLibrary {...props} />
  : <PetView {...props} state={{ animation: "running", label: "Working", still: false }} openSettings={openSettings} />}</QueryClientProvider>;
async function mount() { await act(async () => { renderer = create(tree()); }); }
async function flush() { await act(async () => { await new Promise((done) => setTimeout(done, 15)); }); }
async function click(label: string) {
  await act(async () => renderer.root.findByProps({ accessibilityLabel: label }).props.onPress());
  await flush();
}

describe("library workflow", () => {
  it("discards an unsaved first-run folder draft without scanning it", async () => {
    await mount();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Pet folder" }).props.onChangeText("/unsaved"));
    await click("Discard changes");
    expect(renderer.root.findByProps({ accessibilityLabel: "Pet folder" }).props.value).toBe("");
    expect(mock.list).not.toHaveBeenCalled();
  });
  it("can explicitly forget a configured folder without touching its files", async () => {
    mock.settings.values = { root: "/pets", petKey: "pet", animate: true };
    await mount(); await flush(); await click("Change folder"); await click("Forget folder");
    expect(mock.settings.save).toHaveBeenCalledWith({ root: "", petKey: "", animate: true }, "revision-1");
  });
  it("does not scan or load assets until the user confirms a directory", async () => {
    await mount();
    expect(mock.list).not.toHaveBeenCalled(); expect(mock.load).not.toHaveBeenCalled();
    await click("Use Codex location");
    expect(mock.suggest).toHaveBeenCalledOnce(); expect(mock.list).not.toHaveBeenCalled();
    await click("Save folder");
    expect(mock.settings.save).toHaveBeenCalledWith({ root: "/home/example/.codex/pets", petKey: "", animate: true }, "revision-1");
  });
  it("keeps a draft's original revision when another client changes settings", async () => {
    await mount();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: "Pet folder" }).props.onChangeText("/my/pets"));
    mock.settings = { ...mock.settings, revision: "revision-2", values: { root: "", petKey: "", animate: false } };
    await act(async () => renderer.update(tree()));
    await click("Save folder");
    expect(mock.settings.save).toHaveBeenCalledWith({ root: "/my/pets", petKey: "", animate: true }, "revision-1");
  });
  it("never loads an atlas in settings, even after selecting; only the separate pet view loads it", async () => {
    mock.settings.values.root = "/pets";
    await mount(); await flush();
    expect(mock.list).toHaveBeenCalledOnce(); expect(mock.load).not.toHaveBeenCalled();
    await click("Test pet · v2");
    expect(mock.settings.save).toHaveBeenCalledWith({ root: "/pets", petKey: "pet", animate: true }, "revision-1");
    mock.settings = { ...mock.settings, values: { ...mock.settings.values, petKey: "pet" }, revision: "revision-2" };
    await act(async () => renderer.update(tree())); await flush();
    expect(mock.load).not.toHaveBeenCalled();
    expect(renderer.root.findAll((node) => String(node.type) === "sprite")).toHaveLength(0);
    screen = "pet";
    await act(async () => renderer.update(tree())); await flush(); await flush();
    expect(mock.load).toHaveBeenCalledWith({ root: "/pets", key: "pet", revision: pet.revision });
    expect(renderer.root.findAll((node) => String(node.type) === "sprite")).toHaveLength(1);
  });
  it("refreshes an empty library without attempting to load an undefined pet", async () => {
    mock.settings.values.root = "/pets";
    await mount(); await flush(); await click("Refresh");
    expect(mock.list).toHaveBeenCalledTimes(2); expect(mock.load).not.toHaveBeenCalled();
  });
  it("does not show stale pet content after a folder switch or missing selection", async () => {
    screen = "pet";
    mock.settings.values = { root: "/pets", petKey: "pet", animate: true };
    await mount(); await flush(); await flush();
    expect(renderer.root.findAll((node) => String(node.type) === "sprite")).toHaveLength(1);
    mock.list.mockResolvedValueOnce({ root: "/other", pets: [], issues: [], truncated: false });
    mock.settings = { ...mock.settings, values: { root: "/other", petKey: "pet", animate: true } };
    await act(async () => renderer.update(tree())); await flush();
    expect(renderer.root.findAll((node) => String(node.type) === "sprite")).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("Selected pet is unavailable");
  });
  it("surfaces transport errors, leaves settings intact and offers retry", async () => {
    screen = "pet";
    mock.settings.values = { root: "/pets", petKey: "pet", animate: true };
    mock.load.mockRejectedValueOnce(new Error("host unavailable"));
    await mount(); await flush(); await flush();
    expect(JSON.stringify(renderer.toJSON())).toContain("host unavailable");
    expect(mock.settings.save).not.toHaveBeenCalled();
    await click("Retry pet"); await flush();
    expect(renderer.root.findAll((node) => String(node.type) === "sprite")).toHaveLength(1);
  });
  it("keeps invalid settings until explicit recovery", async () => {
    mock.settings = { ...mock.settings, status: "invalid", error: "Unsupported settings version" };
    await mount();
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.settings.reset).not.toHaveBeenCalled();
    await click("Reset pet settings");
    expect(mock.settings.reset).toHaveBeenCalledOnce();
  });
  it("routes first-run setup to a separate screen without embedding folder management", async () => {
    screen = "pet";
    await mount();
    expect(mock.list).not.toHaveBeenCalled(); expect(mock.load).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Pet folder");
    await click("Open pet settings");
    expect(openSettings).toHaveBeenCalledOnce();
  });
  it("shows only the pet and settings icon; pause is a deliberate pet action", async () => {
    screen = "pet";
    mock.settings.values = { root: "/pets", petKey: "pet", animate: true };
    await mount(); await flush(); await flush();
    const labels = renderer.root.findAll((node) => String(node.type) === "Pressable").map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual(["Pet settings"]);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Read-only assets");
    expect(mock.settings.save).not.toHaveBeenCalled();
    const sprite = renderer.root.find((node) => String(node.type) === "sprite");
    await act(async () => sprite.props.onToggle());
    expect(mock.settings.save).toHaveBeenCalledWith({ root: "/pets", petKey: "pet", animate: false }, "revision-1");
    await click("Pet settings");
    expect(openSettings).toHaveBeenCalledOnce();
  });
  it("keeps panel recovery in settings rather than automatically resetting preferences", async () => {
    screen = "pet"; mock.settings.status = "invalid";
    await mount();
    expect(mock.list).not.toHaveBeenCalled(); expect(mock.settings.reset).not.toHaveBeenCalled();
    await click("Pet settings");
    expect(openSettings).toHaveBeenCalledOnce();
  });
  it("retries metadata transport failures without ever preloading atlases in settings", async () => {
    mock.settings.values = { root: "/pets", petKey: "pet", animate: true };
    mock.list.mockRejectedValueOnce(new Error("host unavailable"));
    await mount(); await flush();
    expect(JSON.stringify(renderer.toJSON())).toContain("host unavailable");
    await click("Refresh");
    expect(JSON.stringify(renderer.toJSON())).toContain("Test pet · v2");
    expect(mock.load).not.toHaveBeenCalled();
  });
});
