import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createDeepSeekHarnessProvider } from "./server/provider";

export default function contribute(server: PluginServerContext) {
  const provider = createDeepSeekHarnessProvider();
  server.registerProvider(provider);
  return async () => {
    await provider.dispose();
  };
}
