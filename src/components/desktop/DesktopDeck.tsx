'use client';
// ── DESKTOP DECK — the deck interior (Figma parity with the profile grid) ─────
// Mounted behind the useIsDesktop seam by the /decks/[deckId] route; the mobile
// DeckDetailPage is untouched at 375. Posts render as a GRID (the owner's shared
// AR × their desktop count — the profile-grid language), in its OWN full-height
// scroller (the shell fixes html/body → document scroll is off). Add = upload
// into the grid; the "…" menu is a proper desktop dropdown anchored to its
// trigger (contextual reads better than a centered panel for a short list).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import {
  getDeckById, getProfile, getUserByPrivyId, updateDeck, deleteDeck,
  addMediaToDeck, removeFromDeck, uploadImage, type DeckWithItems,
} from '@/lib/userService';
import { resolveLayout, ratioForAspect } from '@/lib/layoutModel';
import { feedImage } from '@/lib/mediaUrl';
import DesktopShell from '@/components/desktop/DesktopShell';
import { useFluidColumns } from '@/lib/useFluidColumns';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(229,225,219,0.14)';
const RED = '#E5E1DB';

const itemMedia = (it: DeckWithItems['items'][number]): string =>
  (it.media_url as string) || it.post?.media_urls?.[0] || '';

export default function DesktopDeck({ deckId }: { deckId: string }) {
  const router = useRouter();
  const { user } = usePrivy();
  const [deck, setDeck] = useState<DeckWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwn, setIsOwn] = useState(false);
  const [aspect, setAspect] = useState<number>(2.39);
  const [count, setCount] = useState(4);
  // Brief R1a — deck posts grow with the window; floored at the owner's desktop count,
  // adding columns once tiles would exceed ~460px.
  const [gridRef, gridCols] = useFluidColumns(count, 460);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const d = await getDeckById(deckId).catch(() => null);
    setDeck(d);
    setLoading(false);
    if (!d) return;
    // decks.user_id stores the OWNER'S Privy DID (like comments/likes) — NOT a uuid.
    // The old code fed the DID to getProfile (uuid-keyed) → null owner → default
    // layout, AND compared the DID to the viewer's resolved uuid → isOwn always
    // false → the "···" menu never rendered. Resolve DID→uuid for the profile read;
    // compare DIDs directly for ownership.
    const ownerUser = await getUserByPrivyId(d.user_id).catch(() => null);
    const owner = ownerUser ? await getProfile(ownerUser.id).catch(() => null) : null;
    const R = resolveLayout(owner as Parameters<typeof resolveLayout>[0]);
    setAspect(ratioForAspect(R.aspect));
    setCount(R.desktopCount);
    setIsOwn(!!user?.id && user.id === d.user_id);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [deckId, user?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editOpen) setEditOpen(false); else if (menuOpen) setMenuOpen(false); } };
    const onClick = (e: MouseEvent) => { if (menuOpen && !(e.target as HTMLElement).closest?.('[data-deck-menu]')) setMenuOpen(false); };
    window.addEventListener('keydown', onKey); window.addEventListener('click', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('click', onClick); };
  }, [menuOpen, editOpen]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !user || !deck) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, 'post-media', user.id);
        await addMediaToDeck(deck.id, url);
      }
      await load(); // reflect additions in the grid immediately
    } catch (e) { console.error('[desktop-deck] add error:', e); }
    finally { setBusy(false); }
  };
  const removeItem = async (itemId: string) => {
    if (!deck) return;
    await removeFromDeck(deck.id, itemId).catch(() => {});
    setDeck((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== itemId), item_count: Math.max(0, d.item_count - 1) } : d));
  };
  const saveEdit = async () => {
    if (!deck || !editTitle.trim()) return;
    setBusy(true);
    try { await updateDeck(deck.id, { title: editTitle.trim(), description: editDesc.trim() }); setDeck((d) => (d ? { ...d, title: editTitle.trim(), description: editDesc.trim() } : d)); }
    catch (e) { console.error('[desktop-deck] edit error:', e); }
    finally { setBusy(false); setEditOpen(false); }
  };
  const removeDeck = async () => {
    if (!deck) return;
    await deleteDeck(deck.id).catch(() => {});
    router.back();
  };

  const menuItem = (label: string, fn: () => void, danger?: boolean) => (
    <button onClick={() => { setMenuOpen(false); fn(); }} style={{ ...SKB, display: 'block', width: '100%', textAlign: 'left', fontSize: 11, color: danger ? RED : '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, cursor: 'pointer', padding: '12px 16px' }}>{label}</button>
  );

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, left: 'var(--rail-w)', background: '#000', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <DesktopShell width="fluid" padding="28px 48px 96px">{/* Brief R1a — media surface: fills the window, deck grid grows columns */}
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 26 }}>
          <div style={{ minWidth: 0 }}>
            <button onClick={() => router.back()} style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>← BACK</button>
            <h1 style={{ ...SKB, fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em', color: '#E5E1DB', textTransform: 'uppercase', margin: 0 }}>{loading ? '' : (deck?.title ?? 'DECK NOT FOUND')}</h1>
            {deck && <p style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.45)', margin: '8px 0 0' }}>{deck.item_count} {deck.item_count === 1 ? 'POST' : 'POSTS'}{deck.description ? ` · ${deck.description}` : ''}</p>}
          </div>
          {isOwn && deck && (
            <div data-deck-menu style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} aria-label="Options" style={{ width: 36, height: 33, border: `0.5px solid rgba(229,225,219,0.3)`, background: 'transparent', cursor: 'pointer', ...SKB, fontSize: 16, color: 'rgba(229,225,219,0.7)', letterSpacing: '0.05em' }}>···</button>
              {/* anchored dropdown — app menu language (black, hairline, tracked) */}
              {menuOpen && (
                <div style={{ position: 'absolute', top: 40, right: 0, width: 200, background: '#000', border: `1px solid ${HAIR}`, zIndex: 5 }}>
                  {menuItem('EDIT DECK', () => { setEditTitle(deck.title); setEditDesc(deck.description ?? ''); setEditOpen(true); })}
                  {menuItem('ADD POSTS', () => fileRef.current?.click())}
                  {menuItem('DELETE DECK', removeDeck, true)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* posts GRID — owner's AR × desktop count, scrollable (this container) */}
        {!loading && deck && (
          <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 6 }}>
            {isOwn && (
              <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ aspectRatio: `${aspect}`, border: `1px dashed ${HAIR}`, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="30" height="30" viewBox="0 0 34 34" fill="none"><path d="M17 6v22M6 17h22" stroke="rgba(229,225,219,0.7)" strokeWidth="1" /></svg>
                <span style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{busy ? 'ADDING…' : 'ADD POSTS'}</span>
              </button>
            )}
            {deck.items.map((it) => {
              const src = itemMedia(it);
              return (
                <div key={it.id} style={{ position: 'relative', aspectRatio: `${aspect}`, overflow: 'hidden', background: '#101010', border: `1px solid ${HAIR}` }} className="dk-deck-cell">
                  {src && <img src={feedImage(src, 700)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  {isOwn && (
                    <button onClick={() => removeItem(it.id)} aria-label="Remove" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', ...SKR, fontSize: 13, color: '#E5E1DB', lineHeight: 1 }}>×</button>
                  )}
                </div>
              );
            })}
            {deck.items.length === 0 && !isOwn && <p style={{ ...SKR, gridColumn: `span ${count}`, fontSize: 12, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', textAlign: 'center', padding: '60px 0' }}>EMPTY DECK</p>}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
      </DesktopShell>

      {/* EDIT modal — the creation-modal language */}
      {editOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 690, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setEditOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
          <div style={{ position: 'relative', width: 460, background: '#000', border: '1px solid #1a1a1a', padding: '30px 32px' }}>
            <h2 style={{ ...SKB, fontSize: 15, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 18px' }}>EDIT DECK</h2>
            <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="DECK TITLE" style={{ ...SKR, width: '100%', fontSize: 14, color: '#E5E1DB', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none', padding: '8px 0', boxSizing: 'border-box' }} />
            <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="DESCRIPTION (OPTIONAL)" style={{ ...SKR, width: '100%', fontSize: 13, color: 'rgba(229,225,219,0.75)', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, outline: 'none', padding: '8px 0', margin: '10px 0 0', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setEditOpen(false)} style={{ ...SKB, flex: 1, fontSize: 11, color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '12px 0' }}>CANCEL</button>
              <button onClick={() => void saveEdit()} disabled={!editTitle.trim() || busy} style={{ ...SKB, flex: 1, fontSize: 11, color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em', background: editTitle.trim() ? '#E5E1DB' : 'rgba(229,225,219,0.3)', border: 'none', cursor: 'pointer', padding: '12px 0' }}>{busy ? 'SAVING…' : 'SAVE'}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.dk-deck-cell:hover { outline: 1px solid rgba(229,225,219,0.25); }`}</style>
    </div>
  );
}
