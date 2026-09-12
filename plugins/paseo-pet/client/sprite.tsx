import type { PluginHostProps } from "@getpaseo/plugin/client";
import { memo, useCallback, useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { spriteGeometry, type Animation } from "../shared/animation";
import type { PetAsset, SpriteVersion } from "../shared/contracts";
import type { PetState } from "../shared/state";
import { Action, Note } from "./controls";
import { useAnimationFrame, useMotionPolicy } from "./motion";

// The Image must not receive per-frame callbacks/style objects. RN Web includes
// onLoad/onError in its image-loading effect dependencies: changing them reloads
// and requests decoding of the entire atlas, even when the URI is unchanged.
const AtlasImage = memo(function AtlasImage({ uri, width, height, onLoad, onError }: {
  uri: string; width: number; height: number; onLoad(): void; onError(): void;
}) {
  const source = useMemo(() => ({ uri }), [uri]);
  const style = useMemo(() => ({ width, height }), [width, height]);
  return <Image source={source} resizeMode="stretch" accessible={false}
    onLoad={onLoad} onError={onError} style={style} />;
});

// Only this small transform layer re-renders for a frame. Labels, buttons and
// the large Image subtree stay outside the animation update path.
function SpriteTrack({ uri, version, animation, enabled, width, onLoad, onError }: {
  uri: string; version: SpriteVersion; animation: Animation; enabled: boolean;
  width: number; onLoad(): void; onError(): void;
}) {
  const column = useAnimationFrame(animation, enabled);
  const frame = spriteGeometry(version, animation, column, width);
  return <View style={{
    position: "absolute", width: frame.atlasWidth, height: frame.atlasHeight,
    left: 0, top: 0, transform: [{ translateX: frame.left }, { translateY: frame.top }],
  }}>
    <AtlasImage uri={uri} width={frame.atlasWidth} height={frame.atlasHeight} onLoad={onLoad} onError={onError} />
  </View>;
}

export function Sprite({ asset, state, animate, theme, compact, retry, onToggle, disabled }: {
  asset: PetAsset; state: PetState; animate: boolean;
  theme: PluginHostProps["theme"]; compact: boolean; retry(): void;
  onToggle?(): void; disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const onLoad = useCallback(() => setLoaded(true), []);
  const onError = useCallback(() => { setFailed(true); setLoaded(false); }, []);
  const motion = useMotionPolicy();
  const enabled = animate && !state.still && !motion.reduced && motion.active && visible && loaded && !failed;
  const animation = enabled ? state.animation : "idle";
  const frame = spriteGeometry(asset.pet.version, animation, 0, compact ? 144 : 192);
  const picture = <View accessibilityRole="image" accessibilityLabel={asset.pet.displayName + " · " + state.label}
    style={{ width: frame.width, height: frame.height, overflow: "hidden" }}>
    {!failed ? <SpriteTrack uri={asset.uri} version={asset.pet.version} animation={animation} enabled={enabled}
      width={frame.width} onLoad={onLoad} onError={onError} /> : null}
  </View>;
  return <View style={{ gap: 6, alignItems: "center", minWidth: 0 }} onLayout={({ nativeEvent }) => {
    setVisible(nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0);
  }}>
    {onToggle ? <Pressable accessibilityRole="button" accessibilityLabel={animate ? "Pause pet animation" : "Resume pet animation"}
      accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onToggle}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ borderRadius: 4, ...(focused ? { outlineWidth: 1, outlineColor: theme.colors.accent, outlineStyle: "solid" as const } : {}) }}>
      {picture}
    </Pressable> : picture}
    {failed ? <><Note theme={theme} error>Cannot decode this atlas.</Note><Action label="Retry image" onPress={retry} theme={theme} compact={compact} /></>
      : <Note theme={theme}>{!loaded ? "Loading pet…" : !animate ? "Paused" : motion.reduced ? state.label + " · Reduced motion" : state.label}</Note>}
  </View>;
}
