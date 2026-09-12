import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

export function Action({ label, onPress, theme, disabled, selected, compact }: {
  label: string; onPress(): void; theme: PluginHostProps["theme"];
  disabled?: boolean; selected?: boolean; compact?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <Pressable accessibilityRole={selected !== undefined ? "radio" : "button"} accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, ...(selected !== undefined ? { checked: selected } : {}) }} aria-checked={selected}
      disabled={disabled} onPress={onPress} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={({ pressed }) => ({
        minHeight: compact ? 44 : 32, justifyContent: "center", paddingHorizontal: 8, paddingVertical: 5,
        borderRadius: 4, opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed || selected ? theme.colors.surface1 : "transparent",
        ...(focus ? { outlineWidth: 1, outlineColor: theme.colors.accent, outlineStyle: "solid" } : {}),
      })}>
      <Text style={{ color: selected ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>{label}</Text>
    </Pressable>
  );
}
export function IconAction({ label, icon, onPress, theme, compact }: {
  label: string; icon: string; onPress(): void; theme: PluginHostProps["theme"]; compact: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
    style={({ pressed }) => ({
      width: compact ? 44 : 28, height: compact ? 44 : 28, alignItems: "center", justifyContent: "center", borderRadius: 4,
      backgroundColor: pressed ? theme.colors.surface1 : "transparent",
      ...(focus ? { outlineWidth: 1, outlineColor: theme.colors.accent, outlineStyle: "solid" } : {}),
    })}>
    <Icon name={icon} size={14} color={theme.colors.foregroundMuted} />
  </Pressable>;
}
export function Note({ children, theme, error = false }: {
  children: ReactNode; theme: PluginHostProps["theme"]; error?: boolean;
}) {
  return <Text accessibilityRole={error ? "alert" : undefined} style={{
    color: error ? theme.colors.statusDanger : theme.colors.foregroundMuted, fontSize: 12, lineHeight: 19,
  }}>{children}</Text>;
}
export function Page({ children, theme, compact }: { children: ReactNode; theme: PluginHostProps["theme"]; compact: boolean }) {
  return <View style={{ flex: 1, minWidth: 0, padding: compact ? 12 : 16, gap: 12, backgroundColor: theme.colors.surface0 }}>{children}</View>;
}
