'use client';
// ── HomeLogomarkCue — Brief D14 ──────────────────────────────────────────────
// The "sweep + grow" attract cue on the desktop home logomark (the viewing-modes
// trigger). Matches prototype variant 09: two layers MASKED by the logomark PNG
// (same technique as ScopeLoader — a mask over a solid --ink fill, no new asset):
//   • BASE  — --ink, idle opacity .72, with the scale/opacity "grow" beat.
//   • SWEEP — a bright diagonal band that travels across the mark once per loop.
// The cue is a ~600ms event on a 3.5s rest (NOT continuous). Hover lifts the base
// to full ivory (the sweep keeps its clock); press scales the inner mark only (the
// button's hit geometry is untouched); reduced-motion / paused → static at .72.

// All timings as named constants.
const SWEEP_PERIOD_MS = 3500; // full loop — the sweep+grow fire inside it, then rest
const HOVER_FADE_MS = 150;    // base → full ivory on hover
const PRESS_SCALE = 0.94;     // inner-mark press (house press system; hit area unchanged)
const SCALE_BEAT = 1.1;       // the grow beat
const BASE_IDLE_OPACITY = 0.72;
const MARK = '/logomark-plain-white.png'; // reused AS THE MASK (alpha = the mark shape)
const MARK_W = 41, MARK_H = 26;

export default function HomeLogomarkCue({ animated }: { animated: boolean }) {
  return (
    <span
      className="d14-logo"
      data-animated={animated ? '1' : undefined}
      style={{
        position: 'relative', display: 'block', width: MARK_W, height: MARK_H,
        ['--d14-period' as string]: `${SWEEP_PERIOD_MS}ms`,
        ['--d14-hover' as string]: `${HOVER_FADE_MS}ms`,
        ['--d14-beat' as string]: String(SCALE_BEAT),
        ['--d14-press' as string]: String(PRESS_SCALE),
        ['--d14-idle' as string]: String(BASE_IDLE_OPACITY),
      }}
    >
      <span className="d14-base" />
      <span className="d14-sweep" />
      <style>{`
        .d14-logo{ --d14-mask:url(${MARK}) center/contain no-repeat; }
        .d14-base,.d14-sweep{ position:absolute; inset:0; -webkit-mask:var(--d14-mask); mask:var(--d14-mask); }
        .d14-base{ background:var(--ink); opacity:var(--d14-idle); transform-origin:center; transition:opacity var(--d14-hover) ease; }
        /* SWEEP: at rest the bright band sits off the mark (130%), so it's invisible until it travels. */
        .d14-sweep{ background:linear-gradient(100deg, transparent 0 30%, rgba(255,255,255,.98) 48% 52%, transparent 70% 100%); background-size:220% 100%; background-position:130% 0; }
        .d14-logo[data-animated="1"] .d14-base{ animation:d14grow var(--d14-period) ease-in-out infinite; }
        .d14-logo[data-animated="1"] .d14-sweep{ animation:d14sweep var(--d14-period) ease-in-out infinite; }
        /* Hover: base → full ivory immediately; pause the grow beat (freeze) but let the sweep run its clock. */
        .d14-logobtn:hover .d14-base{ opacity:1; animation-play-state:paused; }
        /* Press: inner mark only — the <button> hit box never moves (PopIcon rule). */
        .d14-logobtn:active .d14-logo{ transform:scale(var(--d14-press)); }
        @keyframes d14sweep{
          0%,58%{ background-position:130% 0; }   /* hold off-mark */
          74%{ background-position:-30% 0; }       /* travel across */
          100%{ background-position:-30% 0; }      /* hold to loop end */
        }
        @keyframes d14grow{
          0%,58%{ transform:scale(1); opacity:var(--d14-idle); }
          66%{ transform:scale(var(--d14-beat)); opacity:1; }
          76%{ transform:scale(1); opacity:.85; }
          100%{ transform:scale(1); opacity:var(--d14-idle); }
        }
        /* Reduced motion: no idle animation — static at .72; hover still lifts to full ivory. */
        @media (prefers-reduced-motion: reduce){ .d14-base,.d14-sweep{ animation:none !important; } }
      `}</style>
    </span>
  );
}
