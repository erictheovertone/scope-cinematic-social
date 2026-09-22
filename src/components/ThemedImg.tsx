'use client';
// ── ThemedImg — Brief T1-3 / T1-3b ────────────────────────────────────────────
// A drop-in <img> that resolves its src through themeAsset() against the live theme, so a
// badge / token icon / logomark / wordmark shows its hand-made light variant under
// [data-theme="light"] and the original under dark — reactively (Stage-4 toggle, no reload).
// Single <img> (forwards every prop), so it's a layout-safe <img>→<ThemedImg> swap.
//
// T1-3b: FORCE-DARK AWARENESS. A themed asset that sits inside a [data-force-dark] region (a
// viewing surface: theatre / lightbox / post viewer / the viewing-mode menus) is on a DARK
// ground even when the ROOT theme is light — so it must keep the DARK original, not the light
// variant (a charcoal logomark on a dark menu scrim would vanish). useTheme() reads the root
// attribute; here we additionally check for a [data-force-dark] ancestor and pin to 'dark' when
// found. Ancestry is static, so one check on mount (re-checked on theme change) suffices.

import { forwardRef, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/useTheme';
import { themeAsset } from '@/lib/themeAsset';

const ThemedImg = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement> & { src: string }>(
  function ThemedImg({ src, ...rest }, ref) {
    const theme = useTheme();
    const localRef = useRef<HTMLImageElement | null>(null);
    const [forceDark, setForceDark] = useState(false);
    useEffect(() => {
      setForceDark(!!localRef.current?.closest('[data-force-dark]'));
    }, [theme]);
    const effective = forceDark ? 'dark' : theme;
    const setRefs = (node: HTMLImageElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLImageElement | null>).current = node;
    };
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={setRefs} src={themeAsset(src, effective)} {...rest} />;
  },
);

export default ThemedImg;
