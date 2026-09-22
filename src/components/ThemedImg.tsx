'use client';
// ── ThemedImg — Brief T1-3 ────────────────────────────────────────────────────
// A drop-in <img> that resolves its src through themeAsset() against the live theme, so a
// badge / token icon / logomark / wordmark shows its hand-made light variant under
// [data-theme="light"] and the original under dark — reactively (Stage-4 toggle, no reload).
// Single <img> (forwards every prop: style/className/onError/width/…), so it's layout-safe
// as a mechanical <img>→<ThemedImg> swap. Assets with no variant pass through unchanged.

import { forwardRef } from 'react';
import { useTheme } from '@/lib/useTheme';
import { themeAsset } from '@/lib/themeAsset';

// forwardRef so consumers that attach a ref to the <img> (e.g. BannerBadgeStrip's measure ref)
// keep working after the <img>→<ThemedImg> swap.
const ThemedImg = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement> & { src: string }>(
  function ThemedImg({ src, ...rest }, ref) {
    const theme = useTheme();
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={ref} src={themeAsset(src, theme)} {...rest} />;
  },
);

export default ThemedImg;
