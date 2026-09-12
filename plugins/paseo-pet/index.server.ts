import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listPets, loadPet, preferences, suggestRoot } from "./shared/contracts";
import { defaultRoot, listLibrary, loadAsset } from "./server/library";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  server.handle(suggestRoot, () => ({ root: defaultRoot() }));
  server.handle(listPets, listLibrary);
  server.handle(loadPet, loadAsset);
  // No filesystem scan at startup, subscriptions, timers, subprocesses or HTTP server.
  return () => {};
}
