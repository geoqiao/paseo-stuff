import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createMakaProvider } from "./server/provider";

export default function contribute(server: PluginServerContext) {
  const provider = createMakaProvider();
  server.registerProvider(provider);
  return async () => {
    await provider.dispose();
  };
}
