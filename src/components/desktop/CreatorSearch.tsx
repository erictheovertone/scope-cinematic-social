'use client';

// ── CreatorSearch (Brief D7 §3) — the desktop home SEARCH control, now real ───
// The old chrome was a static <div><span>SEARCH</span><svg/></div> — no input, no
// query, no results. This wires the full path: a controlled input → debounced
// searchCreators() → a results dropdown that navigates to /profile/<username>.
// Replaces the placeholder in both DesktopHome (Discover header) and the feed
// lightbox header. Mobile is untouched (this is a desktop-only component).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchCreators, type CreatorResult } from '@/lib/userService';

const SKB = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 } as const;
const SKR = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 } as const;

export default function CreatorSearch({ width = 160, height = 34 }: { width?: number; height?: number }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CreatorResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced query — 220ms after the last keystroke; a request token guards
  // against out-of-order responses (a slow early query resolving after a fast late one).
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setLoading(false); return; }
    setLoading(true);
    let alive = true;
    const t = setTimeout(async () => {
      const r = await searchCreators(term);
      if (alive) { setResults(r); setLoading(false); }
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const go = (username: string) => {
    setOpen(false); setQ('');
    router.push(`/profile/${encodeURIComponent(username)}`);
  };

  const showDrop = open && q.trim().length > 0;

  return (
    <div ref={boxRef} style={{ position: 'relative', width, flexShrink: 0 }}>
      <div style={{ width: '100%', height, border: '0.5px solid rgba(229,225,219,0.3)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', boxSizing: 'border-box' }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          placeholder="SEARCH"
          aria-label="Search creators"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', WebkitAppearance: 'none', appearance: 'none', ...SKB, fontSize: 11, color: '#E5E1DB', letterSpacing: '0.1em', textTransform: 'uppercase', caretColor: '#E5E1DB' }}
        />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.5)" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
      </div>

      {showDrop && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: Math.max(240, width), maxHeight: 320, overflowY: 'auto', background: '#0a0a0a', border: '0.5px solid rgba(229,225,219,0.3)', borderRadius: 3, zIndex: 300, boxShadow: '0 12px 32px rgba(0,0,0,0.55)' }}>
          {loading && results.length === 0 ? (
            <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '14px 12px', margin: 0 }}>Searching…</p>
          ) : results.length === 0 ? (
            <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '14px 12px', margin: 0 }}>No creators found</p>
          ) : (
            results.map((r) => (
              <button
                key={r.user_id}
                onClick={() => go(r.username)}
                className="press-row"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '0.5px solid rgba(229,225,219,0.08)', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#1a1a1a', display: 'block' }}>
                  {r.profile_image_url && <img src={r.profile_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ ...SKB, fontSize: 12, color: '#E5E1DB', letterSpacing: 'var(--track-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.display_name || r.username}</span>
                  <span style={{ ...SKR, fontSize: 10.5, color: 'rgba(229,225,219,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{r.username}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
