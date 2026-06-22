"use client";

/**
 * PaletteTile — one saved-look tile in the PALETTE view. Renders the burned-in
 * thumbnail (source frame + look, captured at save) as the memory anchor. For a
 * thumb-less look (pre-existing save or a failed capture) it bakes the look onto
 * a neutral test frame so the tile still shows the look's CHARACTER — never a
 * black box. Sharp corners + red selected border per the palette tile language.
 */

import { useEffect, useState } from 'react';
import type { SavedLook } from '@/lib/looksService';
import { bakeLook } from '@/lib/editor/bakeLook';
import { neutralTestFrame } from './neutralFrame';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

// Fallback previews are cached per look id so re-renders don't re-bake, and
// serialized so we never mount many offscreen pipelines at once.
const fallbackCache = new Map<string, string>();
let bakeChain: Promise<unknown> = Promise.resolve();
function serialBake<T>(fn: () => Promise<T>): Promise<T> {
  const p = bakeChain.then(fn, fn);
  bakeChain = p.then(() => {}, () => {});
  return p;
}

export default function PaletteTile({ look, selected = false, onTap }: { look: SavedLook; selected?: boolean; onTap: () => void }) {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(
    look.thumb_url ? null : (fallbackCache.get(look.id) ?? null),
  );

  useEffect(() => {
    if (look.thumb_url || fallbackCache.has(look.id)) return;
    let cancelled = false;
    serialBake(async () => {
      const frame = await neutralTestFrame();
      const blob = await bakeLook(frame, look.params, 120, 120);
      const url = URL.createObjectURL(blob);
      fallbackCache.set(look.id, url);
      if (!cancelled) setFallbackUrl(url);
    }).catch(() => { /* tile keeps the neutral gradient backdrop — never black */ });
    return () => { cancelled = true; };
  }, [look.id, look.thumb_url]);

  const src = look.thumb_url ?? fallbackUrl;

  return (
    <button
      onClick={onTap}
      title="Apply to current"
      style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div style={{
        position: 'relative', width: 60, height: 60, overflow: 'hidden',
        border: `1px solid ${selected ? '#FF0000' : 'rgba(255,255,255,0.18)'}`,
        // Neutral gradient backdrop so the tile is NEVER a black box, even before
        // a fallback preview finishes baking (or if it fails).
        background: 'linear-gradient(135deg, #1a1a1a 0%, #555 50%, #c9c9c9 100%)',
      }}>
        {src && <img src={src} alt={look.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: selected ? '#FF0000' : 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{look.name}</span>
    </button>
  );
}
