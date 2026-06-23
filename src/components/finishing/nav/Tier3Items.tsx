"use client";

/**
 * Tier3Items — the middle item row (horizontal scroll).
 *
 *   • EDIT → tool tiles (line icon + label). crop + exposure are real; the rest
 *     are disabled "SOON". Pro tools carry a small red dot.
 *   • LOOKS / PALETTE / FX → placeholder thumbnails (content lands in later
 *     briefs). Scaffolded so real items drop in with no layout change.
 *   • HISTORY is handled by the shell (vertical ripple), never here.
 */

import ToolIcon from '../ToolIcon';
import type { EditTool, Mode } from './navModel';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const RED = '#FF0000';

const ROW: React.CSSProperties = { display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 14px 14px', alignItems: 'flex-start' };
// Theatre-only leaner rail: tighter padding, no boxed tiles, no FREE/PRO line.
const LEAN_ROW: React.CSSProperties = { display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 12px 9px', alignItems: 'flex-start' };

interface Tier3ItemsProps {
  mode: Mode;
  /** EDIT only — resolved tools for the active subcategory */
  editItems: EditTool[];
  toolTouched: (t: EditTool) => boolean;
  toolEnabled: (t: EditTool) => boolean;
  /** generic pro-lock decision (pro tool + not a Pro user) — drives the lock glyph */
  toolLocked: (t: EditTool) => boolean;
  onOpenTool: (t: EditTool) => void;
  /** Theatre-only lean variant: borderless icon+label, no FREE/PRO line, smaller icons. */
  lean?: boolean;
}

// Scope line-style padlock — shown on any locked pro tile (generic, not per-tool).
function LockGlyph() {
  return (
    <span style={{ position: 'absolute', top: 4, right: 4, lineHeight: 0 }}>
      <svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}

export default function Tier3Items({ mode, editItems, toolTouched, toolEnabled, toolLocked, onOpenTool, lean = false }: Tier3ItemsProps) {
  if (mode === 'edit') {
    if (editItems.length === 0) {
      return <div style={{ ...(lean ? LEAN_ROW : ROW), justifyContent: 'center' }}><EmptyNote /></div>;
    }
    return (
      <div style={lean ? LEAN_ROW : ROW}>
        {editItems.map((t) => {
          const touched = toolTouched(t);
          const enabled = toolEnabled(t);
          const locked = toolLocked(t);
          // ── Theatre LEAN tile: borderless icon + label, no FREE/PRO line, smaller
          //    icon. Active/touched reads via red icon+label (replaces the box). Pro
          //    lock badge / pro dot preserved as the gating signal. ──
          if (lean) {
            return (
              <button
                key={t.key}
                onClick={() => enabled && onOpenTool(t)}
                disabled={!enabled}
                style={{
                  position: 'relative', flexShrink: 0, background: 'transparent', border: 'none',
                  cursor: enabled ? 'pointer' : 'default', padding: '4px 8px',
                  opacity: enabled ? 1 : 0.4,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  minWidth: 54, color: touched ? RED : 'white',
                }}
              >
                {locked ? <LockGlyph /> : t.pro && <span style={{ position: 'absolute', top: 0, right: 2, width: 5, height: 5, background: RED }} />}
                <ToolIcon toolKey={t.key} size={19.5} />
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: touched ? RED : 'white', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{t.label}</span>
              </button>
            );
          }
          const sub = !enabled ? 'SOON' : t.kind === 'geometry' ? 'EDIT' : t.pro ? 'PRO' : 'FREE';
          return (
            <button
              key={t.key}
              onClick={() => enabled && onOpenTool(t)}
              disabled={!enabled}
              style={{
                position: 'relative', flexShrink: 0, background: 'transparent',
                border: `1px solid ${touched ? RED : 'rgba(255,255,255,0.18)'}`,
                cursor: enabled ? 'pointer' : 'default', padding: '10px 12px 9px',
                opacity: enabled ? 1 : 0.4,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                minWidth: 72, color: touched ? RED : 'white',
              }}
            >
              {/* Pro marker — lock glyph when locked (free user), else a small red dot */}
              {locked ? <LockGlyph /> : t.pro && <span style={{ position: 'absolute', top: 5, right: 5, width: 5, height: 5, background: RED }} />}
              <ToolIcon toolKey={t.key} size={23.5} />
              <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: touched ? RED : 'white', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{t.label}</span>
              <span style={{
                ...SKB, fontSize: 'var(--fs-7)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap',
                color: !enabled ? RED : 'rgba(255,255,255,0.3)',
              }}>{sub}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // LOOKS / PALETTE / FX — placeholder thumbnail rail (scaffold only).
  return (
    <div style={ROW}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 0.4 }}>
          <div style={{ width: 64, height: 64, border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: RED, textTransform: 'uppercase', letterSpacing: '0.1em' }}>SOON</span>
          </div>
          <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>—</span>
        </div>
      ))}
    </div>
  );
}

function EmptyNote() {
  return (
    <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '18px 0' }}>
      NOTHING HERE YET
    </span>
  );
}
