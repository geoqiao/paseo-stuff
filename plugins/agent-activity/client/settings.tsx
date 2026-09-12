import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";

/** Informational only: no host preference writes or redundant palette settings. */
export function ActivitySettings({ theme, layout }: PluginSurfaceProps) {
  const text = { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 21 };
  return (
    <View style={{ gap: 16, padding: layout.compact ? 12 : 20 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "600" }}>Readable Agent Activity · beta</Text>
      <Text style={text}>Neutral tool rows, theme-aware JSON and code, and manual-only expansion. No separate palette is needed.</Text>
      <Text accessibilityRole="alert" style={{ ...text, color: theme.colors.statusWarning }}>
        Paseo 0.8 compatibility: Full detail only on every connected client. Disable before switching to Summary: the host API does not expose grouping context to plugins.
      </Text>
      <Text style={text}>This plugin does not read or change Paseo's Tool call display preference. Summary compatibility is deferred, not silently emulated.</Text>
    </View>
  );
}
