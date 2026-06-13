import { useEffect, useRef, useState } from "react";

// easeOutCubic — the settle curve money figures roll in on (fast, then eases
// to the final cent). Matches the platform's other "arrival" motions.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animate a dollar/number figure from its current displayed value to a new
 * target whenever the target changes. The FIRST real value lands instantly
 * (no 0→N flash on load); only subsequent changes roll. Pass null while the
 * figure is unknown and it stays null (so callers can render "$—").
 */
export function useCountUp(target: number | null, durationMs = 700): number | null {
  const [value, setValue] = useState<number | null>(target);
  const fromRef = useRef<number>(target ?? 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) { setValue(null); return; }
    // First number after null: land it, don't animate up from zero.
    if (value == null) { setValue(target); fromRef.current = target; return; }
    if (value === target) return;

    const from = value;            // snapshot at the moment target changed
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(from + (target - from) * easeOutCubic(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // value is intentionally excluded — it's read once as the animation origin.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
