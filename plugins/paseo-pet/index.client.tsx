import type { PluginAgentPanelProps, PluginClientContext } from "@getpaseo/plugin/client";
import { PetPanel, PetSettings } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  function Panel(props: PluginAgentPanelProps) {
    return <PetPanel {...props} openSettings={() => client.openSettings("pets")} />;
  }
  const remove = [
    client.addSettingsScreen({ id: "pets", title: "Paseo pet", icon: "PawPrint", Component: PetSettings }),
    client.addWorkspacePanel({ id: "pet", title: "Pet", icon: "PawPrint", context: "agent", locations: ["explorer"], Component: Panel }),
    client.addCommandCenterItem({
      id: "open-pet", title: "Open Pet", icon: "PawPrint", context: "agent", keywords: ["codex", "companion"],
      onSelect({ openPanel }) { openPanel("pet", { location: "explorer" }); },
    }),
    client.addCommandCenterItem({
      id: "pet-settings", title: "Pet settings", icon: "PawPrint", context: "global",
      onSelect({ openSettings }) { openSettings("pets"); },
    }),
  ];
  return () => { for (const cleanup of remove.reverse()) cleanup(); };
}
