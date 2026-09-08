'use client';

// ── VmodeCard (Brief D7 §9) — the mobile viewing-mode card recipe, reused on ──
// desktop. Same treatment as the mobile S1/S1a cards (ViewingModesMenu): a 1px
// ivory-49% border over a faint 90° ivory→charcoal gradient fill, with a
// display-weight name + a medium-weight description + a preview image. Desktop
// scales the type up and lays the four cards in a 2×2 grid (DesktopViewingModes);
// the mobile surface keeps its own inline copy so this extraction is desktop-only
// and cannot regress mobile. Mirage is "coming" on desktop (not yet built there).

import { motion } from 'framer-motion';

export type VmodeMode = 'theatre' | 'screening' | 'lightbox' | 'mirage' | 'feed';

export interface VmodeCardData {
  mode: VmodeMode;
  name: string;   // may contain \n (rendered via white-space: pre-line)
  desc: string;
  preview: string;
  aria: string;
  coming?: boolean;
}

// The four modes (Theatre / Screening Room / Mirage / Feed). Descriptions are the
// desktop-appropriate copy (the mobile "Turn your phone." doesn't apply on desktop);
// the visual recipe and preview assets are the shared mobile ones.
// Order (Brief D18 §2): Theatre · Screening Room · Lightbox · Mirage · Feed — the three
// focused modes on the top row, the two browsing modes below (reads as a clean 3+2 grid).
export const VMODE_CARDS: VmodeCardData[] = [
  { mode: 'theatre',   name: 'Theatre',         desc: 'Full-screen theatrical viewing.',                      preview: '/viewing-modes-v2/theatre-preview.png',   aria: 'Theatre — full-screen theatrical viewing' },
  { mode: 'screening', name: 'Screening\nRoom', desc: 'The best work on Scope. Chosen by you.',               preview: '/viewing-modes-v2/screening-preview.png', aria: 'Screening Room — the best work on Scope, chosen by you' },
  { mode: 'lightbox',  name: 'Lightbox',        desc: 'One post at a time. Full frame.',                      preview: '/Lightbox-viewing-mode-image.png',        aria: 'Lightbox — one post at a time, full frame' }, /* Brief D18 §2 — routes to the desktop home lightbox (DesktopHome.onSelectMode 'lightbox', lands on the most-recent post) */
  { mode: 'mirage',    name: 'Mirage',          desc: 'Everything in a collage. See what catches your eye.',  preview: '/viewing-modes-v2/mirage-preview.png',    aria: 'Mirage — everything in a collage' }, /* Brief M15 §3 — built on desktop now (was coming:true) */
  { mode: 'feed',      name: 'Feed',            desc: 'The standard home feed.',                              preview: '/viewing-modes-v2/feed-preview.png',      aria: 'Feed — the standard home feed' },
];

export default function VmodeCard({ card, index, reduced, selected, onSelect }: {
  card: VmodeCardData;
  index: number;
  reduced: boolean;
  selected: boolean;
  onSelect: (mode: VmodeMode) => void;
}) {
  return (
    <motion.button
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.32, delay: reduced ? 0 : 0.06 + index * 0.06, ease: 'easeOut' }}
      whileHover={reduced || card.coming ? undefined : { scale: 1.01 }}
      whileTap={reduced || card.coming ? undefined : { scale: 0.99 }}
      onClick={(e) => { e.stopPropagation(); if (card.coming) return; onSelect(card.mode); }}
      aria-label={card.aria}
      aria-pressed={selected}
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 150, borderRadius: 13,
        border: selected ? '1px solid rgba(229,225,219,0.8)' : '1px solid rgba(229,225,219,0.49)',
        background: 'linear-gradient(90deg, rgba(229,225,219,0.07), rgba(33,31,31,0.08))',
        overflow: 'hidden', cursor: card.coming ? 'default' : 'pointer', textAlign: 'left',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start',
        padding: '26px 30px 28px', gap: 18, opacity: card.coming ? 0.72 : 1,
      }}
    >
      {/* TEXT block — title + description, stacked at the top. */}
      <span style={{ flexShrink: 0, width: '100%', display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'calc(40px * var(--type-scale))', lineHeight: 0.82, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', whiteSpace: 'pre-line' }}>{card.name}</span>
        <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 13, lineHeight: 1.3, color: 'rgba(229,225,219,0.5)', marginTop: 10, maxWidth: 320 }}>{card.desc}</span>
      </span>
      {/* PREVIEW — BELOW the text, ~3× larger: fills the remaining card space (contain, own aspect). */}
      <span style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <img src={card.preview} alt="" aria-hidden style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', opacity: 0.78, display: 'block' }} />
      </span>
      {card.coming && (
        <span style={{ position: 'absolute', top: 14, right: 16, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 9, color: 'rgba(229,225,219,0.75)', textTransform: 'uppercase', letterSpacing: '0.14em', background: 'rgba(0,0,0,0.5)', padding: '3px 7px', borderRadius: 2 }}>Coming</span>
      )}
    </motion.button>
  );
}
