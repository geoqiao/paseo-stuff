import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { frameAt, type Animation } from "../shared/animation";

export function useMotionPolicy() {
  // Fail closed until the system preference is known.
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let disposed = false, changed = false;
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      changed = true;
      if (!disposed) setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!disposed && !changed) setReduced(value);
    }).catch(() => { /* Still frame if the system preference is unavailable. */ });
    const app = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => { disposed = true; motion.remove(); app.remove(); };
  }, []);
  return { reduced, active };
}
export function useAnimationFrame(animation: Animation, enabled: boolean): number {
  const [frame, setFrame] = useState({ animation, column: 0, enabled: false });
  useEffect(() => {
    if (!enabled) { setFrame({ animation, column: 0, enabled: false }); return; }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();
    const tick = () => {
      if (disposed) return;
      const value = frameAt(animation, Date.now() - start);
      setFrame({ animation, column: value.column, enabled: true });
      timer = setTimeout(tick, Math.max(1, value.remaining));
    };
    tick();
    return () => { disposed = true; clearTimeout(timer); };
  }, [animation, enabled]);
  return enabled && frame.enabled && frame.animation === animation ? frame.column : 0;
}
