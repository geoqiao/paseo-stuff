import type { PluginHostProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { Action, Note, Page } from "./controls";
import { usePetLibrary } from "./data";
import { DirectoryEditor } from "./directory";

// Management lives only in the host's Settings screen, never in the pet panel.
// No sprite component or atlas-loading hook is used on this screen.
export function PetLibrary({ theme, host, layout }: PluginHostProps) {
  const { settings, root, key, library } = usePetLibrary(host.id);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const compact = layout.compact;
  if (settings.status !== "ready") {
    return <Page theme={theme} compact={compact}>
      <Note theme={theme} error={settings.status !== "loading"}>{settings.status === "loading" ? "Loading pet settings…" : settings.error}</Note>
      {settings.status !== "loading" ? <Action label="Reload settings" onPress={() => { void settings.reload(); }} theme={theme} compact={compact} /> : null}
      {settings.status === "invalid" ? <Action label="Reset pet settings" onPress={() => { void settings.reset(); }} disabled={settings.saving} theme={theme} compact={compact} /> : null}
      {settings.saveError ? <Note theme={theme} error>{settings.saveError}</Note> : null}
    </Page>;
  }
  const refresh = () => {
    void library.refetch().then(() => queryClient.invalidateQueries({ queryKey: ["paseo-pet", "asset", host.id, root] }));
  };
  return <Page theme={theme} compact={compact}>
    <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 8 }} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: theme.colors.foreground, fontSize: 16 }}>Pet settings</Text>
      {editing || !root ? <DirectoryEditor key={host.id + ":directory:" + editorGeneration} settings={settings} host={host} theme={theme} compact={compact}
        close={() => { setEditing(false); setEditorGeneration((n) => n + 1); }} /> : <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          <Action label={settings.values.animate ? "Pause animation" : "Resume animation"} disabled={settings.saving}
            onPress={() => { void settings.save({ ...settings.values, animate: !settings.values.animate }, settings.revision); }} theme={theme} compact={compact} />
          <Action label="Refresh" disabled={library.isFetching} onPress={refresh} theme={theme} compact={compact} />
          <Action label="Change folder" onPress={() => setEditing(true)} theme={theme} compact={compact} />
        </View>
        {library.isPending ? <Note theme={theme}>Reading pet packages…</Note> : null}
        {library.error ? <Note theme={theme} error>{library.error.message}</Note> : null}
        <View accessibilityRole="radiogroup" accessibilityLabel="Choose pet" style={{ gap: 4 }}>
          {library.data?.pets.map((entry) => <Action key={entry.key}
            label={entry.displayName + " · v" + entry.version + (library.data.pets.some((other) => other.key !== entry.key && other.displayName === entry.displayName) ? " · " + entry.key : "")}
            selected={entry.key === key} disabled={settings.saving} theme={theme} compact={compact}
            onPress={() => { void settings.save({ ...settings.values, petKey: entry.key }, settings.revision); }} />)}
        </View>
        {library.data?.pets.length === 0 ? <Note theme={theme}>No supported pet packages found. Each subfolder needs pet.json and a static atlas.</Note> : null}
        {library.data?.truncated ? <Note theme={theme}>Folder limit reached: up to 128 pets / 512 entries.</Note> : null}
        {library.data?.issues.map((issue) => <Note key={issue.key} theme={theme} error>{issue.key + ": " + issue.message}</Note>)}
        <Note theme={theme}>Read-only assets · preferences shared by clients of {host.label}.</Note>
      </>}
      {settings.saveError && !editing ? <><Note theme={theme} error>{settings.saveError}</Note><Action label="Reload settings" onPress={() => { void settings.reload(); }} theme={theme} compact={compact} /></> : null}
    </ScrollView>
  </Page>;
}
