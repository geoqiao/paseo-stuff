import { useAgent, type PluginAgentPanelProps, type PluginHostProps, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useState } from "react";
import { View } from "react-native";
import { petState, type PetState } from "../shared/state";
import { Action, IconAction, Note, Page } from "./controls";
import { useSelectedPet } from "./data";
import { PetLibrary } from "./library";
import { Sprite } from "./sprite";

export function PetView({ theme, host, layout, state, openSettings }: PluginHostProps & { state: PetState; openSettings(): void }) {
  const { settings, root, library, pet, asset } = useSelectedPet(host.id);
  const [attempt, setAttempt] = useState(0);
  const compact = layout.compact;
  const retry = () => {
    void library.refetch().then(async (result) => {
      if (!result.isError && pet && result.data?.pets.find((entry) => entry.key === pet.key)?.revision === pet.revision) await asset.refetch();
      setAttempt((n) => n + 1);
    });
  };
  return <Page theme={theme} compact={compact}>
    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
      <IconAction label="Pet settings" icon="Settings2" onPress={openSettings} theme={theme} compact={compact} />
    </View>
    {settings.status !== "ready" ? <Note theme={theme} error={settings.status !== "loading"}>
      {settings.status === "loading" ? "Loading pet…" : "Pet settings are unavailable. Open settings to recover."}
    </Note> : !root || (!pet && !library.isPending && !library.isError) ? <>
      <Note theme={theme}>{!root || !settings.values.petKey ? "No pet selected." : "Selected pet is unavailable."}</Note>
      <Action label="Open pet settings" onPress={openSettings} theme={theme} compact={compact} />
    </> : library.error || (pet && asset.error) ? <>
      <Note theme={theme} error>{library.error?.message ?? asset.error?.message}</Note>
      <Action label="Retry pet" onPress={retry} theme={theme} compact={compact} />
    </> : pet && asset.data ? <Sprite key={host.id + ":" + asset.data.hash + ":" + attempt} asset={asset.data} state={state}
      animate={settings.values.animate} theme={theme} compact={compact} retry={() => setAttempt((n) => n + 1)} disabled={settings.saving}
      onToggle={() => { void settings.save({ ...settings.values, animate: !settings.values.animate }, settings.revision); }} />
      : <Note theme={theme}>Loading pet…</Note>}
    {settings.saveError ? <Note theme={theme} error>{settings.saveError}</Note> : null}
  </Page>;
}

export function PetPanel(props: PluginAgentPanelProps & { openSettings(): void }) {
  const agent = useAgent(props.agentId, ({ status, requiresAttention, attentionReason }) => ({ status, requiresAttention, attentionReason }));
  return <PetView key={props.host.id + ":" + props.agentId} {...props} state={petState(agent)} />;
}
export function PetSettings(props: PluginSurfaceProps) {
  return <PetLibrary key={props.host.id} {...props} />;
}
