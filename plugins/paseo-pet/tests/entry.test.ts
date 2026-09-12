import { describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import clientEntry from "../index.client";
import serverEntry from "../index.server";

vi.mock("../client/library", () => ({ PetLibrary: () => null }));
vi.mock("../client/panel", () => ({ PetPanel: () => null, PetSettings: () => null }));

describe("public contributions and cleanup", () => {
  it("registers only settings, an agent panel and commands; never timeline transforms or approvals", () => {
    const cleanup = vi.fn();
    const client = {
      addSettingsScreen: vi.fn(() => cleanup),
      addWorkspacePanel: vi.fn(() => cleanup),
      addCommandCenterItem: vi.fn(() => cleanup),
      openSettings: vi.fn(),
    };
    const dispose = clientEntry(client as unknown as PluginClientContext);
    expect(client.addWorkspacePanel).toHaveBeenCalledWith(expect.objectContaining({ context: "agent", locations: ["explorer"] }));
    const command = client.addCommandCenterItem.mock.calls[0] as unknown as [{ onSelect(context: { openPanel: ReturnType<typeof vi.fn> }): void }];
    const openPanel = vi.fn(); command[0].onSelect({ openPanel });
    expect(openPanel).toHaveBeenCalledWith("pet", { location: "explorer" });
    const panel = (client.addWorkspacePanel.mock.calls[0] as unknown as [{ Component(props: object): { props: { openSettings(): void } } }])[0];
    panel.Component({}).props.openSettings();
    expect(client.openSettings).toHaveBeenCalledWith("pets");
    dispose(); expect(cleanup).toHaveBeenCalledTimes(4);
  });
  it("registers three read-only RPCs and settings without startup IO or lifecycle subscriptions", () => {
    const server = { registerSettings: vi.fn(), handle: vi.fn() };
    const dispose = serverEntry(server as unknown as PluginServerContext);
    expect(server.registerSettings).toHaveBeenCalledOnce();
    expect(server.handle.mock.calls.map(([contract]) => contract.name)).toEqual(["pets.suggest-root", "pets.list", "pets.load"]);
    dispose();
  });
});
