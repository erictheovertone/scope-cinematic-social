"use client";

import { useEffect, useState } from "react";

/**
 * useFontReady — resolves true once a specific font face has loaded (or a safety
 * timeout fires). Used to gate a brand wordmark's visibility so it renders opacity 0
 * until the real face is ready, then fades in — guaranteeing no fallback-font frame
 * ever paints (Brief S2d, FOUT kill). Not for body copy, which should swap normally.
 *
 * `spec` is a CSS-font shorthand the Font Loading API understands, e.g.
 *   '400 100px "Birds of Paradise"'
 * The px size is only a hint — it loads the face regardless of the size it renders at.
 */
export function useFontReady(spec: string, timeoutMs = 3000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };

    const fonts = typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
    if (fonts?.load) {
      fonts.load(spec).then(finish, finish);
      // Belt: also resolve when the whole document's fonts settle, in case load() misses.
      fonts.ready?.then(finish, finish);
    } else {
      // No Font Loading API (very old browser) — don't leave the mark invisible.
      finish();
    }

    // Suspenders: never leave the wordmark hidden forever if the events never fire.
    const t = setTimeout(finish, timeoutMs);
    return () => clearTimeout(t);
  }, [spec, timeoutMs]);

  return ready;
}
