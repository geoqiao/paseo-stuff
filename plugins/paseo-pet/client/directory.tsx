import { useRpc, type PluginHostProps, type SettingsState } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { preferences, suggestRoot } from "../shared/contracts";
import { Action, Note } from "./controls";

type Ready = Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>;
export function DirectoryEditor({ settings, host, theme, compact, close }: {
  settings: Ready; host: PluginHostProps["host"]; theme: PluginHostProps["theme"]; compact: boolean; close(): void;
}) {
  // A draft owns its original revision: concurrent changes cannot be silently overwritten.
  const [initial] = useState({ values: settings.values, revision: settings.revision });
  const [root, setRoot] = useState(initial.values.root);
  const suggest = useRpc(suggestRoot);
  const suggestion = useMutation({
    mutationFn: () => suggest({}),
    onSuccess: (result) => setRoot(result.root),
  });
  return (
    <View style={{ gap: 10, minWidth: 0 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>Pet folder on {host.label}</Text>
      <Note theme={theme}>Read-only Codex packages on this host. Nothing is scanned until you save a folder. A remote host cannot read files on this device.</Note>
      <TextInput accessibilityLabel="Pet folder" value={root} onChangeText={setRoot} editable={!settings.saving && !suggestion.isPending}
        autoCapitalize="none" autoCorrect={false} placeholder="/absolute/path/to/pets" placeholderTextColor={theme.colors.foregroundMuted}
        style={{ color: theme.colors.foreground, backgroundColor: theme.colors.surface1, borderRadius: 4, padding: 10, fontSize: 13, minHeight: 44 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        <Action label="Use Codex location" disabled={settings.saving || suggestion.isPending} onPress={() => suggestion.mutate()} theme={theme} compact={compact} />
        <Action label="Save folder" disabled={settings.saving || suggestion.isPending || !root.trim()} onPress={() => {
          void settings.save({ ...initial.values, root: root.trim(), petKey: root.trim() === initial.values.root ? initial.values.petKey : "" }, initial.revision)
            .then((saved) => { if (saved) close(); });
        }} theme={theme} compact={compact} />
        <Action label="Discard changes" disabled={settings.saving} onPress={() => { void settings.reload(); close(); }} theme={theme} compact={compact} />
        {initial.values.root ? <Action label="Forget folder" disabled={settings.saving || suggestion.isPending} onPress={() => {
          void settings.save({ ...initial.values, root: "", petKey: "" }, initial.revision).then((saved) => { if (saved) close(); });
        }} theme={theme} compact={compact} /> : null}
      </View>
      {suggestion.error ? <Note theme={theme} error>Could not get the Codex location. Enter an absolute path instead.</Note> : null}
      {settings.saveError ? <Note theme={theme} error>{settings.saveError}</Note> : null}
    </View>
  );
}
