'use client';
// ── DESKTOP GRID PICKER — the 3-step takeover (2:783 → 2:815 → 2:844) ────────
// ASPECT → COUNT → COMMIT. Onboarding language: huge Bold titles in RED CORNER
// BRACKETS, the chosen state echoed top-right, black void. Esc exits without
// saving; back affordance between steps; reduced-motion = no transitions.
// The queued desktop-onboarding brief mounts this same component (reported).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { setSharedAspect, setDesktopCount, resolveLayout, legacyLayoutId, type AspectId } from '@/lib/layoutModel';
import { getProfile, updateProfileFields } from '@/lib/userService';
import {
  DESKTOP_ASPECTS, DESKTOP_COUNTS, chipFor,
  type DesktopAspect, type DesktopCount, type DesktopLayout,
} from '@/lib/desktopLayout';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const RED = '#E5E1DB';

type Step = 'aspect' | 'count' | 'commit';

function CornerBrackets({ children }: { children: React.ReactNode }) {
  const b = (pos: React.CSSProperties) => (
    <span style={{ position: 'absolute', width: 26, height: 26, ...pos }}>
      <span style={{ position: 'absolute', left: 0, right: 0, height: 2, background: RED, ...(pos.bottom !== undefined ? { bottom: 0 } : { top: 0 }) }} />
      <span style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: RED, ...(pos.right !== undefined ? { right: 0 } : { left: 0 }) }} />
    </span>
  );
  return (
    <span style={{ position: 'relative', display: 'inline-block', padding: '26px 40px' }}>
      {b({ left: 0, top: 0 })}{b({ right: 0, top: 0 })}{b({ left: 0, bottom: 0 })}{b({ right: 0, bottom: 0 })}
      {children}
    </span>
  );
}

export default function DesktopGridPicker({
  initial, userId, onApplied, onClose,
}: {
  initial: DesktopLayout;
  userId: string;
  onApplied: (layout: DesktopLayout) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('aspect');
  const [aspect, setAspect] = useState<DesktopAspect>(initial.aspect);
  const [count, setCount] = useState<DesktopCount>(initial.count);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const router = useRouter();
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chip = chipFor(aspect);
  // COMMIT CHOREOGRAPHY (mobile's pattern — the grid-layout page's SAVING…
  // label morph): mutation + cache invalidation → AUTO-RETURN to the profile
  // (the grid re-reads fresh; instant re-layout — reported, no crossfade v1).
  // Failure: the picker STAYS with a quiet inline error, CONFIRM retryable —
  // never a silent no-op (the exact round-2 bug: the missing column made
  // every save fail with nothing shown).
  const confirm = async () => {
    if (saving) return;
    setSaving(true); setSaveError(false);
    const layout: DesktopLayout = { aspect, count };
    // NEW MODEL: the AR step writes the SHARED aspect; the COUNT step writes the
    // DESKTOP count (an explicit choice → it no longer derives). Each writer
    // invalidates the cache + broadcasts 'scope:layout-changed' so grids re-read.
    const okA = await setSharedAspect(userId, aspect as AspectId);
    const okC = await setDesktopCount(userId, count);
    // LEGACY MIRROR (fixes desktop→mobile): also write grid_layout so the many
    // mobile readers still on it (public profile, PostItem, create) reflect the
    // shared AR. Use the resolved MOBILE count (explicit ?? matrix) so the mobile
    // grid's columns stay correct — mirroring both pickers' write shape.
    try {
      const prof = await getProfile(userId);
      const R = resolveLayout({ ...(prof as object), aspect_ratio: aspect, desktop_count: count } as Parameters<typeof resolveLayout>[0]);
      await updateProfileFields(userId, { grid_layout: legacyLayoutId(aspect as AspectId, R.mobileCount) });
    } catch (e) { console.warn('[layout] legacy mirror write:', (e as Error)?.message); }
    setSaving(false);
    if (okA && okC) {
      onApplied(layout);
      onClose();
      router.push('/profile'); // one flow — settings AND the future onboarding entry land here
    } else {
      setSaveError(true);
    }
  };

  const title = step === 'aspect' ? 'ASPECT' : step === 'count' ? 'COUNT' : 'COMMIT';
  const echo = step === 'aspect' ? null : step === 'count' ? `AR ${chip.ratioLabel}` : `AR ${chip.ratioLabel} · ${count}-ACROSS`;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 700, background: '#000', overflowY: 'auto' }}>
      {/* chrome: echo top-right, exit top-left, back between steps */}
      <div style={{ position: 'absolute', top: 22, left: 26, display: 'flex', gap: 22 }}>
        <button onClick={onClose} style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>× EXIT</button>
        {step !== 'aspect' && (
          <button onClick={() => setStep(step === 'commit' ? 'count' : 'aspect')} style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>← BACK</button>
        )}
      </div>
      {echo && (
        <span style={{ position: 'absolute', top: 22, right: 26, ...SKB, fontSize: 13, color: RED, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{echo}</span>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '64px 40px 80px', textAlign: 'center' }}>
        <CornerBrackets>
          <h1 style={{ ...SKB, fontSize: 72, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0, lineHeight: 1 }}>{title}</h1>
        </CornerBrackets>

        {/* ── STEP 1: ASPECT — outlined frames at true ratio ── */}
        {step === 'aspect' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, marginTop: 48 }}>
            {DESKTOP_ASPECTS.map((c) => (
              <button
                key={c.id}
                onClick={() => { setAspect(c.id as DesktopAspect); setStep('count'); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, opacity: reduced ? 1 : undefined }}
              >
                <span style={{ display: 'block', width: 300, aspectRatio: `${c.ratio}`, border: `1px solid ${aspect === c.id ? RED : 'rgba(229,225,219,0.35)'}`, transition: 'border-color 140ms ease' }} />
                <span style={{ ...SKB, fontSize: 12, color: aspect === c.id ? RED : 'rgba(229,225,219,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginTop: 8 }}>
                  {c.label} · AR {c.ratioLabel}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 2: COUNT — example grid rows at the chosen aspect ── */}
        {step === 'count' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 38, marginTop: 48 }}>
            {DESKTOP_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => { setCount(n); setStep('commit'); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: 620 }}
              >
                <span style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 5 }}>
                  {Array.from({ length: n }).map((_, i) => (
                    <span key={i} style={{ display: 'block', aspectRatio: `${chip.ratio}`, border: `1px solid ${count === n ? RED : 'rgba(229,225,219,0.35)'}`, transition: 'border-color 140ms ease' }} />
                  ))}
                </span>
                <span style={{ ...SKB, fontSize: 12, color: count === n ? RED : 'rgba(229,225,219,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginTop: 8 }}>
                  {n}-ACROSS
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 3: COMMIT — the full page grid in red outline ── */}
        {step === 'commit' && (
          <div style={{ marginTop: 48 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 5, maxWidth: 760, margin: '0 auto' }}>
              {Array.from({ length: count * 3 }).map((_, i) => (
                <span key={i} style={{ display: 'block', aspectRatio: `${chip.ratio}`, border: `1px solid ${RED}` }} />
              ))}
            </div>
            <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '34px 0 0' }}>
              Your mobile layout stays as it is.
            </p>
            {saveError && (
              <p style={{ ...SKR, fontSize: 11, color: RED, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '18px 0 0' }}>
                COULDN’T SAVE YOUR LAYOUT — TRY AGAIN
              </p>
            )}
            <button
              onClick={confirm}
              disabled={saving}
              style={{ ...SKB, fontSize: 13, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em', background: '#E5E1DB', border: 'none', cursor: 'pointer', padding: '14px 54px', marginTop: 22, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'SAVING…' : saveError ? 'RETRY' : 'CONFIRM'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
