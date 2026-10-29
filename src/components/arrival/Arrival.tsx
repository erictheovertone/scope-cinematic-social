'use client';
// ── Arrival — the logged-out public profile (Brief ARR-1/4/5; docs/design/scope-arrival-mock.html) ──
// The first screen is real: header + the grid at the owner's layout — the only unobstructed view for
// an anonymous visitor (ARR-4: no theatre on tap). Any tap on it, or scrolling on, draws the aperture
// in from the screen edges to surface the sign-up card. ARR-5: Neue Haas everywhere (no mono),
// uppercase username, badge as its image, the card is avatar · "<NAME> IS ON SCOPE" · Follow · the
// login methods · Log in (no economics), and the closed state is laid out to the real viewport height
// (mark ~30% down, card centred, store badges above the safe area, no overlaps 375×667 → 430×932).
// A Scope surface — force-dark regardless of the viewer's theme.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import type { PublicProfile, PublicFrame } from '@/lib/arrival/publicProfile';
import { BLADE_PATHS, BLADE_CX } from '@/lib/arrival/blades';
import { saveArrivalIntent } from '@/lib/arrival/intent';
import type { ArrivalLoginMethod } from '@/lib/arrival/loginMethods';
import { getAspectRatio } from '@/lib/aspectRatio';
import { feedImage } from '@/lib/mediaUrl';
import { BADGES } from '@/lib/economy/badges';

const UI = 'var(--font-display)'; // Neue Haas Grotesk — ARR-5: everywhere, mono nowhere
const CANVAS = '#050505';
const INK = '#E5E1DB';
const DESKTOP_MIN = 1024;
// ARR-5a — the one uppercase-label recipe: Haas 700, 12px, 0.08em.
const LABEL: React.CSSProperties = { fontFamily: UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' };

// Mark centre (my) ~30% down; card centred; the scroll drive's start/range unchanged.
const TUNE = {
  mobile: { myF: 0.30, k375: 0.315, cardF: 0.50, start: 24, range: 260 },
  desktop: { myF: 175 / 720, k: 0.45, cardF: 445 / 720, start: 24, range: 320 },
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeIO = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

const METHOD_LABEL: Record<ArrivalLoginMethod, string> = { apple: 'Continue with Apple', google: 'Continue with Google', email: 'Continue with email' };

export default function Arrival({ profile, refTag, loginMethods }: { profile: PublicProfile; refTag: string | null; loginMethods: ArrivalLoginMethod[] }) {
  const router = useRouter();
  const [vp, setVp] = useState({ W: 375, H: 812 });
  const [follow, setFollow] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const scRef = useRef<HTMLDivElement>(null);
  const holesRef = useRef<SVGGElement>(null);
  const inkRef = useRef<SVGGElement>(null);
  const bgRef = useRef<SVGRectElement>(null);
  const dimRef = useRef<SVGRectElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const badgesRef = useRef<HTMLDivElement>(null);

  const desktop = vp.W >= DESKTOP_MIN;
  // ARR-5e — the mark scales DOWN first when the viewport is short, so the mark · card · store-badges
  // stack never overlaps from 375×667 up to 430×932.
  const kShort = TUNE.mobile.k375 * Math.min(vp.W / 375, 1.25) * Math.max(0.72, Math.min(1.08, vp.H / 812));
  const t = desktop
    ? { mx: vp.W / 2, my: vp.H * TUNE.desktop.myF, k: TUNE.desktop.k, cardTop: vp.H * TUNE.desktop.cardF, start: TUNE.desktop.start, range: TUNE.desktop.range }
    : { mx: vp.W / 2, my: vp.H * TUNE.mobile.myF, k: kShort, cardTop: vp.H * TUNE.mobile.cardF, start: TUNE.mobile.start, range: TUNE.mobile.range };

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

  /** ARR-4/5f — reveal the sign-up card by driving the aperture shut (the scroll's own animation).
   *  ANY tap on the first screen fires this; manual scroll still drives it too. */
  const revealCTA = useCallback(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scRef.current?.scrollTo({ top: t.start + t.range + 12, behavior: reduce ? 'auto' : 'smooth' });
  }, [t.start, t.range]);

  const { ready, authenticated } = usePrivy();
  useEffect(() => {
    if (ready && authenticated) router.replace(`/profile/${encodeURIComponent(profile.username)}`);
  }, [ready, authenticated, router, profile.username]);

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

  const NAME = profile.username.toUpperCase();           // ARR-5b — uppercase in header + card
  const badge = profile.badges[0] ?? null;
  const badgeSrc = badge ? BADGES[badge.key]?.src : null; // ARR-5c — the badge's image
  const cols = desktop ? Math.max(3, profile.desktopCols) : profile.mobileCols;
  const collage = profile.layoutId === 'collage';
  const cellAR = getAspectRatio(profile.layoutId);
  const real = profile.frames.slice(0, cols * (desktop ? 3 : 5));
  const darkCells = cols * (desktop ? 6 : 10);
  const imgW = desktop ? Math.ceil(vp.W / cols) * 2 : Math.ceil(vp.W / cols) * 3;

  return (
    <div data-force-dark style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', color: 'var(--ink-100)', fontFamily: UI }}>
      <div ref={scRef} data-scroll style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        <div style={{ position: 'relative' }}>
          {/* the aperture, pinned from inside the scroller so scrolling back up always works */}
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

              {/* ── the sign-up card (ARR-5d) ── */}
              <div ref={cardRef} data-arrival-card aria-hidden style={{ position: 'absolute', left: '50%', top: t.cardTop, width: desktop ? 300 : 248, transform: 'translate(-50%,-50%) translateY(10px)', textAlign: 'center', opacity: 0, pointerEvents: 'none', display: 'grid', gap: 14, justifyItems: 'center' }}>
                {profile.avatarUrl
                  ? <img src={feedImage(profile.avatarUrl, 144)} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-3)' }} />}
                <div style={{ ...LABEL, color: 'rgb(var(--ink-rgb) / 0.6)' }}>{NAME} is on Scope</div>
                <button type="button" role="checkbox" aria-checked={follow} onClick={() => setFollow((f) => !f)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: 'var(--ink-100)', fontFamily: UI, fontSize: 15, padding: '2px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <i style={{ width: 18, height: 18, border: '1.5px solid var(--ink-100)', display: 'inline-grid', placeItems: 'center' }}>
                    {follow && <span style={{ width: 9, height: 9, background: 'var(--ink-100)' }} />}
                  </i>
                  Follow {NAME}
                </button>
                <div style={{ display: 'grid', gap: 10, width: '100%' }}>
                  {loginMethods.map((m, i) => (
                    <button key={m} type="button" onClick={() => begin(m)} style={btn(i === 0)}>{METHOD_LABEL[m]}</button>
                  ))}
                </div>
                {authError && <div role="alert" style={{ fontFamily: UI, fontSize: 13, color: 'rgb(var(--ink-rgb) / 0.85)' }}>{authError}</div>}
                <div style={{ fontFamily: UI, color: 'rgb(var(--ink-rgb) / 0.55)', fontSize: 13 }}>
                  Already on Scope?{' '}
                  <button type="button" onClick={() => begin()} style={{ fontFamily: UI, color: 'var(--ink-100)', background: 'transparent', border: 'none', borderBottom: '1px solid rgb(var(--ink-rgb) / 0.32)', padding: 0, cursor: 'pointer', fontSize: 13 }}>Log in</button>
                </div>
              </div>

              {/* app badges — placeholders until the native builds ship (ARR-5e: ≥24px above safe) */}
              <div ref={badgesRef} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `0 20px calc(24px + var(--safe-bottom, 0px))`, display: 'grid', gap: 10, justifyItems: 'center', opacity: 0, pointerEvents: 'none' }}>
                <div style={{ ...LABEL, color: 'rgb(var(--ink-rgb) / 0.5)' }}>Also on</div>
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
            <button type="button" onClick={() => begin()} style={{ ...LABEL, color: 'rgb(var(--ink-rgb) / 0.55)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, marginRight: -8 }}>Log in</button>
          </div>

          {/* ARR-4/5 — header is a tap target that reveals the CTA; username uppercase; badge as image */}
          <div onClick={revealCTA} style={desktop
            ? { maxWidth: 'var(--shell-max, 1180px)', margin: '0 auto', padding: '28px 32px 22px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 24, cursor: 'pointer' }
            : { padding: '20px 20px 16px', display: 'grid', gap: 12, cursor: 'pointer' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {profile.avatarUrl
                ? <img src={feedImage(profile.avatarUrl, desktop ? 240 : 192)} alt="" style={{ width: desktop ? 80 : 64, height: desktop ? 80 : 64, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: desktop ? 80 : 64, height: desktop ? 80 : 64, borderRadius: '50%', background: 'var(--surface-3)' }} />}
              <div>
                <h1 style={{ margin: 0, fontFamily: UI, fontSize: desktop ? 26 : 21, fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1 }}>{NAME}</h1>
                {profile.displayName && <div style={{ fontFamily: UI, color: 'rgb(var(--ink-rgb) / 0.5)', fontSize: 13, marginTop: 5 }}>{profile.displayName}</div>}
              </div>
            </div>
            <div style={{ display: 'grid', gap: desktop ? 10 : 12 }}>
              {profile.bio && <div style={{ fontFamily: UI, fontSize: 13, lineHeight: 1.45, color: 'rgb(var(--ink-rgb) / 0.8)', maxWidth: desktop ? '52ch' : undefined }}>{profile.bio}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...LABEL, color: 'rgb(var(--ink-rgb) / 0.5)' }}>
                <span><b style={{ color: 'var(--ink-100)', fontWeight: 700 }}>{profile.framesCount}</b> frames</span>
                <span><b style={{ color: 'var(--ink-100)', fontWeight: 700 }}>{profile.decksCount}</b> decks</span>
                {badgeSrc && <img src={badgeSrc} alt={badge?.name ?? ''} style={{ height: 22, width: 'auto', marginLeft: 'auto', display: 'block' }} />}
              </div>
            </div>
            <button type="button" onClick={revealCTA} style={{ ...btn(false), width: desktop ? 180 : '100%', padding: 12 }}>Follow</button>
          </div>

          {/* the grid at the owner's layout */}
          <div style={collage
            ? { columnCount: cols, columnGap: 2, background: '#000', marginTop: desktop ? 0 : 6 }
            : { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, background: '#000', marginTop: desktop ? 0 : 6 }}>
            {real.map((f, i) => (
              <button key={i} type="button" onClick={revealCTA} aria-label={`Join Scope to view ${NAME}’s frames`}
                style={{ display: 'block', width: '100%', aspectRatio: collage ? f.aspect : cellAR, overflow: 'hidden', background: '#000', border: 'none', padding: 0, cursor: 'pointer', breakInside: 'avoid', marginBottom: collage ? 2 : 0 }}>
                <FrameImg frame={f} width={imgW} alt="" loading={i < cols * 3 ? 'eager' : 'lazy'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, background: '#000', marginTop: 2 }} aria-hidden>
            {Array.from({ length: darkCells }, (_, i) => <div key={i} className="arrival-dark-cell" style={{ aspectRatio: collage ? '2.39 / 1' : cellAR }} />)}
          </div>
        </div>
      </div>

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
    width: '100%', padding: 12, border: '1px solid var(--ink-100)', cursor: 'pointer',
    fontFamily: UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
    background: fill ? 'var(--ink-100)' : 'transparent', color: fill ? 'var(--on-ink)' : 'var(--ink-100)',
  };
}

// ── ARR-2 — rendition-safe frame image ───────────────────────────────────────
function frameSrc(image: string, width: number, hasRenditions: boolean): string {
  if (hasRenditions || /cloudflarestream\.com/.test(image)) return feedImage(image, width);
  return image;
}
function FrameImg({ frame, width, ...rest }: { frame: PublicFrame; width: number } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState(() => frameSrc(frame.image, width, frame.hasRenditions));
  useEffect(() => { setSrc(frameSrc(frame.image, width, frame.hasRenditions)); }, [frame.image, width, frame.hasRenditions]);
  return <img {...rest} src={src} onError={() => { if (src !== frame.image) setSrc(frame.image); }} />;
}

function StoreBadge({ small, name, icon }: { small: string; name: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgb(var(--ink-rgb) / 0.32)', padding: '7px 10px', color: 'rgb(var(--ink-rgb) / 0.5)', minWidth: 128 }}>
      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" style={{ flex: 'none' }} aria-hidden><path d={icon} /></svg>
      <span style={{ display: 'block', lineHeight: 1.1, textAlign: 'left' }}>
        <span style={{ display: 'block', fontFamily: UI, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{small}</span>
        <span style={{ display: 'block', fontFamily: UI, fontSize: 12, fontWeight: 700, color: 'rgb(var(--ink-rgb) / 0.85)' }}>{name}</span>
      </span>
      <span style={{ marginLeft: 'auto', ...LABEL, fontSize: 8, color: 'rgb(var(--ink-rgb) / 0.5)', border: '1px solid rgb(var(--ink-rgb) / 0.16)', padding: '2px 5px' }}>soon</span>
    </div>
  );
}
