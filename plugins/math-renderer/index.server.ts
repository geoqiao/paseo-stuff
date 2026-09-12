import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createMathRenderer } from "./server/render";
import { renderMath } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const renderer = createMathRenderer();
  server.handle(renderMath, renderer.render);
  return renderer.dispose;
}
