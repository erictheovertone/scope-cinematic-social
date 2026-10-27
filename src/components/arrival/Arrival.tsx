'use client';
// ── Arrival — the logged-out public profile (Brief ARR-1; docs/design/scope-arrival-mock.html) ──
// The first screen is real: header + the grid at the owner's layout, every frame opens in the
// theatre. Scrolling on draws the aperture in from the screen edges: the six blades of the mark
// slide in as WINDOWS on the dimmed page (holes in a canvas sheet), close on the content, and land
// solid as the mark, with the sign-up card beneath. Scroll back and it opens again.
// Scroll drive = the mock's, verbatim: one rAF per scroll event writes transforms + opacities on
// the SVG mask/ink groups and the card (no layout reads, no React re-render). Reduced motion: the
// mark + card appear with a plain fade at the same scroll point. A Scope surface — brand pair,
// force-dark regardless of the viewer's theme.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import type { PublicProfile, PublicFrame } from '@/lib/arrival/publicProfile';
import { BLADE_PATHS, BLADE_CX } from '@/lib/arrival/blades';
import { saveArrivalIntent } from '@/lib/arrival/intent';
import type { ArrivalLoginMethod } from '@/lib/arrival/loginMethods';
import { getAspectRatio } from '@/lib/aspectRatio';
import { feedImage } from '@/lib/mediaUrl';

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const UI = 'var(--font-display)';
const CANVAS = '#050505'; // SVG mask/sheet fill — the brand ground (this surface is force-dark)
const INK = '#E5E1DB';
const DESKTOP_MIN = 1024;

// The mock's two tunings, normalised to the viewport: mark centre (my), mark scale (k), card centre.
const TUNE = {
  mobile: { myF: 300 / 812, k375: 0.315, cardF: 548 / 812, start: 24, range: 260 },
  desktop: { myF: 175 / 720, k: 0.45, cardF: 445 / 720, start: 24, range: 320 },
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeIO = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

const METHOD_LABEL: Record<ArrivalLoginMethod, string> = { apple: 'Continue with Apple', google: 'Continue with Google', email: 'Continue with email' };

export default function Arrival({ profile, refTag, loginMethods }: { profile: PublicProfile; refTag: string | null; loginMethods: ArrivalLoginMethod[] }) {
  const router = useRouter();
  const [vp, setVp] = useState({ W: 375, H: 812 });
  const [follow, setFollow] = useState(true);
  const [theatre, setTheatre] = useState<PublicFrame | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const scRef = useRef<HTMLDivElement>(null);
  const holesRef = useRef<SVGGElement>(null);
  const inkRef = useRef<SVGGElement>(null);
  const bgRef = useRef<SVGRectElement>(null);
  const dimRef = useRef<SVGRectElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const badgesRef = useRef<HTMLDivElement>(null);

  const desktop = vp.W >= DESKTOP_MIN;
  const t = desktop
    ? { mx: vp.W / 2, my: vp.H * TUNE.desktop.myF, k: TUNE.desktop.k, cardTop: vp.H * TUNE.desktop.cardF, start: TUNE.desktop.start, range: TUNE.desktop.range }
    : { mx: vp.W / 2, my: vp.H * TUNE.mobile.myF, k: TUNE.mobile.k375 * Math.min(vp.W / 375, 1.25), cardTop: vp.H * TUNE.mobile.cardF, start: TUNE.mobile.start, range: TUNE.mobile.range };

  useEffect(() => {
    const read = () => setVp({ W: window.innerWidth, H: window.innerHeight });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  // ── the aperture drive ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sc = scRef.current, gH = holesRef.current, gI = inkRef.current;
    const bg = bgRef.current, dim = dimRef.current, card = cardRef.current, badges = badgesRef.current;
    if (!sc || !gH || !gI || !bg || !dim || !card || !badges) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const holes = Array.from(gH.children) as SVGElement[];
    const inks = Array.from(gI.children) as SVGElement[];
    let raf = 0;
    const render = () => {
      raf = 0;
      const p = clamp((sc.scrollTop - t.start) / t.range);
      const e = reduce ? (p > 0.6 ? 1 : 0) : 1 - Math.pow(1 - p, 3);
      const k = t.k * (1 + 0.45 * (1 - e));
      const gt = `translate(${t.mx} ${t.my}) scale(${k.toFixed(4)})`;
      gH.setAttribute('transform', gt); gI.setAttribute('transform', gt);
      const edge = (vp.W / 2) / k + 48;
      for (let i = 0; i < 6; i++) {
        // every blade starts just outside its own screen edge, so all six enter the moment scrolling begins
        const dx = (BLADE_CX[i] < 0 ? -1 : 1) * (1 - e) * (edge - Math.abs(BLADE_CX[i]));
        const tr = `translate(${dx.toFixed(1)} 0)`;
        holes[i].setAttribute('transform', tr); inks[i].setAttribute('transform', tr);
      }
      bg.setAttribute('opacity', (clamp(p / 0.06) * (0.22 + 0.78 * easeIO(p))).toFixed(3));
      dim.setAttribute('opacity', (0.55 * e).toFixed(3));
      gI.style.strokeOpacity = String(reduce ? e : clamp(p / 0.12));
      gI.style.fillOpacity = String(reduce ? e : clamp((p - 0.8) / 0.2));
      const cp = reduce ? e : clamp((p - 0.7) / 0.3);
      card.style.opacity = String(cp);
      card.style.transform = `translate(-50%,-50%) translateY(${((1 - cp) * 10).toFixed(1)}px)`;
      card.style.pointerEvents = cp > 0.9 ? 'auto' : 'none';
      card.setAttribute('aria-hidden', cp > 0.9 ? 'false' : 'true');
      badges.style.opacity = String(reduce ? e : clamp((p - 0.85) / 0.15));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(render); };
    sc.addEventListener('scroll', onScroll, { passive: true });
    render();
    return () => { sc.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [t.start, t.range, t.k, t.mx, t.my, vp.W]);

  /** Close the aperture (the header Follow, as in the mock). */
  const closeAperture = useCallback(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scRef.current?.scrollTo({ top: t.start + t.range + 12, behavior: reduce ? 'auto' : 'smooth' });
  }, [t.start, t.range]);

  // A signed-in viewer whose session cookie the server didn't see still gets the normal profile.
  const { ready, authenticated } = usePrivy();
  useEffect(() => {
    if (ready && authenticated) router.replace(`/profile/${encodeURIComponent(profile.username)}`);
  }, [ready, authenticated, router, profile.username]);

  // ── sign-up: the deep link (username + ref + follow) survives Privy ────────────────────────
  const { login } = useLogin({
    onComplete: () => router.push('/auth/callback'),
    onError: (err) => { if (String(err) !== 'exited_auth_flow') setAuthError('Sign-in didn’t complete. Try again.'); },
  });
  const begin = (method?: ArrivalLoginMethod) => {
    setAuthError(null);
    saveArrivalIntent({ username: profile.username, ref: refTag, follow });
    if (method) login({ loginMethods: [method] });
    else login();
  };

  const name = profile.username.toLowerCase();
  const topBadge = profile.badges[0]?.name ?? null;
  const cols = desktop ? Math.max(3, profile.desktopCols) : profile.mobileCols;
  const collage = profile.layoutId === 'collage';
  const cellAR = getAspectRatio(profile.layoutId);
  // The real first screen, then dark unexposed rows: enough scroll for the aperture to close fully.
  const real = profile.frames.slice(0, cols * (desktop ? 3 : 5));
  const darkCells = cols * (desktop ? 6 : 10);
  const aspectLabel = profile.layoutId.replace(/^\dx-/, '').replace('pana', 'Pana').replace('scope', 'Scope 2.39').replace('cine', 'Cine').replace('legacy', 'Legacy').replace('collage', 'Collage');

  const imgW = desktop ? Math.ceil(vp.W / cols) * 2 : Math.ceil(vp.W / cols) * 3;

  return (
    <div data-force-dark style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', color: 'var(--ink-100)', fontFamily: UI }}>
      <div ref={scRef} data-scroll style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        <div style={{ position: 'relative' }}>
          {/* the aperture, pinned to the screen from inside the scroller so scrolling back up always works */}
          <div style={{ position: 'sticky', top: 0, height: 0, zIndex: 5 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: vp.W, height: vp.H, pointerEvents: 'none' }}>
              <svg viewBox={`0 0 ${vp.W} ${vp.H}`} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
                <defs>
                  <mask id="arrival-iris" maskUnits="userSpaceOnUse" x={0} y={0} width={vp.W} height={vp.H}>
                    <rect width={vp.W} height={vp.H} fill="#fff" />
                    <g ref={holesRef}>{BLADE_PATHS.map((d, i) => <path key={i} d={d} fill="#000" />)}</g>
                  </mask>
                </defs>
                <rect ref={dimRef} width={vp.W} height={vp.H} fill={CANVAS} opacity={0} />
                <rect ref={bgRef} width={vp.W} height={vp.H} fill={CANVAS} mask="url(#arrival-iris)" opacity={0} />
                <g ref={inkRef} style={{ fill: INK, stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', fillOpacity: 0, strokeOpacity: 0 }}>
                  {BLADE_PATHS.map((d, i) => <path key={i} d={d} />)}
                </g>
              </svg>

              {/* the card */}
              <div ref={cardRef} aria-hidden style={{ position: 'absolute', left: '50%', top: t.cardTop, width: desktop ? 300 : 236, transform: 'translate(-50%,-50%) translateY(10px)', textAlign: 'center', opacity: 0, pointerEvents: 'none', display: 'grid', gap: 9, justifyItems: 'center' }}>
                {profile.avatarUrl
                  ? <img src={feedImage(profile.avatarUrl, 132)} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-3)' }} />}
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)' }}>{name} is on Scope</div>
                <div style={{ fontSize: desktop ? 26 : 22, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1 }}>{profile.framesCount} frame{profile.framesCount === 1 ? '' : 's'}</div>
                <div style={{ color: 'rgb(var(--ink-rgb) / 0.5)', fontSize: 12, marginTop: -3 }}>{aspectLabel}{topBadge ? ` · ${topBadge.charAt(0) + topBadge.slice(1).toLowerCase()}` : ''}</div>
                <button type="button" role="checkbox" aria-checked={follow} onClick={() => setFollow((f) => !f)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgb(var(--ink-rgb) / 0.85)', fontSize: 12, padding: '2px 0', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: UI }}>
                  <i style={{ width: 14, height: 14, border: '1px solid var(--ink-100)', display: 'inline-grid', placeItems: 'center' }}>
                    {follow && <span style={{ width: 7, height: 7, background: 'var(--ink-100)' }} />}
                  </i>
                  Follow {name}
                </button>
                <div style={{ display: 'grid', gap: 8, width: '100%' }}>
                  {/* Exactly what Privy has enabled (server-read), first one filled — Apple appears
                      on its own once it's switched on in the Privy dashboard. */}
                  {loginMethods.map((m, i) => (
                    <button key={m} type="button" onClick={() => begin(m)} style={btn(i === 0)}>{METHOD_LABEL[m]}</button>
                  ))}
                </div>
                {authError && <div role="alert" style={{ fontSize: 12, color: 'rgb(var(--ink-rgb) / 0.85)' }}>{authError}</div>}
                <div style={{ color: 'rgb(var(--ink-rgb) / 0.5)', fontSize: 12 }}>
                  Already on Scope?{' '}
                  <button type="button" onClick={() => begin()} style={{ color: 'var(--ink-100)', background: 'transparent', border: 'none', borderBottom: '1px solid rgb(var(--ink-rgb) / 0.32)', padding: 0, cursor: 'pointer', fontSize: 12, fontFamily: UI }}>Log in</button>
                </div>
              </div>

              {/* app badges — placeholders until the native builds ship */}
              <div ref={badgesRef} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `0 20px calc(${desktop ? 24 : 30}px + var(--safe-bottom, 0px))`, display: 'grid', gap: 8, justifyItems: 'center', opacity: 0, pointerEvents: 'none' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)' }}>Also on</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <StoreBadge small="Download on the" name="App Store" icon="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4.1 2.5-1.8 3-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8 2.2-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9-.1 0-2.9-1.1-2.9-4.1zM14 5.2c.7-.8 1.2-2 1-3.2-1 0-2.3.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z" />
                  <StoreBadge small="Get it on" name="Google Play" icon="M3.6 2.2c-.3.3-.5.8-.5 1.4v16.8c0 .6.2 1.1.5 1.4l.1.1 9.4-9.4v-.2L3.7 2.1l-.1.1zm12.6 12.6-3.1-3.1v-.2l3.1-3.1.1.1 3.7 2.1c1.1.6 1.1 1.6 0 2.2l-3.7 2.1-.1-.1zm-.1.1L13 11.8l-9.4 9.4c.3.4.9.4 1.6 0l10.9-6.3zM5.2 2.6l10.9 6.2L13 11.8 3.7 2.4c.6-.3 1.1-.3 1.5.2z" />
                </div>
              </div>
            </div>
          </div>

          {/* ── the real first screen ── */}
          <div style={{ height: 'var(--safe-top, 0px)' }} />
          <div style={{ height: desktop ? 60 : 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: desktop ? '0 32px' : '0 20px', borderBottom: '1px solid rgb(var(--ink-rgb) / 0.16)' }}>
            <span style={{ fontFamily: 'var(--font-script)', fontWeight: 400, fontSynthesis: 'none', fontSize: desktop ? 34 : 28, lineHeight: 1, color: 'var(--ink-100)' }}>scope</span>
            <button type="button" onClick={() => begin()} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, marginRight: -8 }}>Log in</button>
          </div>

          <div style={desktop
            ? { maxWidth: 'var(--shell-max, 1180px)', margin: '0 auto', padding: '28px 32px 22px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 24 }
            : { padding: '20px 20px 16px', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {profile.avatarUrl
                ? <img src={feedImage(profile.avatarUrl, desktop ? 240 : 192)} alt="" style={{ width: desktop ? 80 : 64, height: desktop ? 80 : 64, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: desktop ? 80 : 64, height: desktop ? 80 : 64, borderRadius: '50%', background: 'var(--surface-3)' }} />}
              <div>
                <h1 style={{ margin: 0, fontSize: desktop ? 28 : 22, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1 }}>{name}</h1>
                {profile.displayName && <div style={{ color: 'rgb(var(--ink-rgb) / 0.5)', fontSize: 13, marginTop: 4 }}>{profile.displayName}</div>}
              </div>
            </div>
            <div style={{ display: 'grid', gap: desktop ? 10 : 12 }}>
              {profile.bio && <div style={{ fontSize: 13, lineHeight: 1.45, color: 'rgb(var(--ink-rgb) / 0.8)', maxWidth: desktop ? '52ch' : undefined }}>{profile.bio}</div>}
              <div style={{ display: 'flex', gap: 14, fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)' }}>
                <span><b style={{ color: 'var(--ink-100)', fontWeight: 500 }}>{profile.framesCount}</b> frames</span>
                <span><b style={{ color: 'var(--ink-100)', fontWeight: 500 }}>{profile.decksCount}</b> decks</span>
                {topBadge && <span><b style={{ color: 'var(--ink-100)', fontWeight: 500 }}>{topBadge}</b></span>}
              </div>
            </div>
            <button type="button" onClick={closeAperture} style={{ ...btn(false), width: desktop ? 180 : '100%', padding: 12 }}>Follow</button>
          </div>

          {/* the grid at the owner's layout */}
          <div style={collage
            ? { columnCount: cols, columnGap: 2, background: '#000', marginTop: desktop ? 0 : 6 }
            : { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, background: '#000', marginTop: desktop ? 0 : 6 }}>
            {real.map((f, i) => (
              <button key={i} type="button" onClick={() => setTheatre(f)} aria-label={`Open frame ${i + 1}`}
                style={{ display: 'block', width: '100%', aspectRatio: collage ? f.aspect : cellAR, overflow: 'hidden', background: '#000', border: 'none', padding: 0, cursor: 'pointer', breakInside: 'avoid', marginBottom: collage ? 2 : 0 }}>
                <img src={feedImage(f.image, imgW)} alt="" loading={i < cols * 3 ? 'eager' : 'lazy'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, background: '#000', marginTop: 2 }} aria-hidden>
            {Array.from({ length: darkCells }, (_, i) => <div key={i} className="arrival-dark-cell" style={{ aspectRatio: collage ? '2.39 / 1' : cellAR }} />)}
          </div>
        </div>
      </div>

      {theatre && <Theatre frame={theatre} onClose={() => setTheatre(null)} W={vp.W} />}
      <style>{`
        .arrival-dark-cell { position: relative; background: #0A0A0A; border-top: 1px solid rgb(var(--ink-rgb) / 0.06); border-bottom: 1px solid rgb(var(--ink-rgb) / 0.06); }
        .arrival-dark-cell::before, .arrival-dark-cell::after { content: ""; position: absolute; left: 0; right: 0; height: 4px;
          background-image: radial-gradient(circle, rgb(var(--ink-rgb) / 0.22) 1.2px, transparent 1.4px); background-size: 12px 4px; background-repeat: repeat-x; }
        .arrival-dark-cell::before { top: 6px; } .arrival-dark-cell::after { bottom: 6px; }
        [data-scroll]::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function btn(fill: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 11, border: '1px solid var(--ink-100)', cursor: 'pointer',
    fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    background: fill ? 'var(--ink-100)' : 'transparent', color: fill ? 'var(--on-ink)' : 'var(--ink-100)',
  };
}

function StoreBadge({ small, name, icon }: { small: string; name: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgb(var(--ink-rgb) / 0.32)', padding: '7px 10px', color: 'rgb(var(--ink-rgb) / 0.5)', minWidth: 128 }}>
      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" style={{ flex: 'none' }} aria-hidden><path d={icon} /></svg>
      <span style={{ display: 'block', lineHeight: 1.1, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{small}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'rgb(var(--ink-rgb) / 0.8)' }}>{name}</span>
      </span>
      <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)', border: '1px solid rgb(var(--ink-rgb) / 0.16)', padding: '2px 5px' }}>soon</span>
    </div>
  );
}

/** Tap a frame on the first screen → the theatre: the frame full-width on canvas, video plays.
 *  ≤2000px requests: Cloudflare Stream thumbnails 400 above that. */
function Theatre({ frame, onClose, W }: { frame: PublicFrame; onClose: () => void; W: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const isHls = !!frame.video && /\.m3u8(\?|$)/.test(frame.video);
  return (
    <div role="dialog" aria-modal="true" aria-label="Frame" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 7, background: 'var(--canvas)', display: 'grid', placeItems: 'center', opacity: on ? 1 : 0, transition: 'opacity .25s ease-out' }}>
      <button type="button" onClick={onClose} aria-label="Close"
        style={{ position: 'absolute', top: 'calc(var(--safe-top, 0px) + 12px)', right: 12, width: 44, height: 44, display: 'grid', placeItems: 'center', color: 'var(--ink-100)', fontSize: 22, background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 'min(100vw, calc(85vh * 2.75))' }}>
        {frame.video && !isHls
          ? <video src={frame.video} poster={feedImage(frame.image, Math.min(2000, W * 2))} controls playsInline autoPlay muted style={{ width: '100%', aspectRatio: frame.aspect, objectFit: 'cover', display: 'block', background: '#000' }} />
          : <img src={feedImage(frame.image, Math.min(2000, W * 2))} alt="" style={{ width: '100%', aspectRatio: frame.aspect, objectFit: 'cover', display: 'block' }} />}
      </div>
    </div>
  );
}
