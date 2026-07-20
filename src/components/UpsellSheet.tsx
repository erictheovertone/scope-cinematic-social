'use client';
import { useEffect } from 'react';

export type UpsellLimit = 'posts' | 'decks' | 'links' | 'edit';

const COPY: Record<UpsellLimit, { headline: string; count: string; body: string; feature: string }> = {
  edit: {
    headline: 'UNLOCK THE FULL SUITE',
    count: 'SCOPE PRO TOOL',
    body: 'This is a Pro finishing tool. Go Pro for the full editing suite — bloom, halation, grain, and every tool to come.',
    feature: 'edit',
  },
  posts: {
    headline: 'YOUR REEL IS FULL',
    count: '25 / 25 POSTS',
    body: "You've published all 25 of your free posts. Go Pro for an unlimited reel — and the full cinematic toolkit.",
    feature: 'posts',
  },
  decks: {
    headline: 'CURATE WITHOUT LIMITS',
    count: '1 / 1 DECKS',
    body: 'Free includes one deck. Go Pro to build as many as your work demands — and unlock everything else.',
    feature: 'decks',
  },
  links: {
    headline: 'ADD MORE LINKS',
    count: '1 / 1 LINKS',
    body: 'Free includes one link. Go Pro for up to five — plus unlimited posts, decks, and the full editing suite.',
    feature: 'links',
  },
};

const FEATURES = [
  { key: 'posts', label: 'Unlimited posts' },
  { key: 'decks', label: 'Unlimited decks' },
  { key: 'links', label: 'Up to 5 links' },
  { key: 'edit', label: 'Full editing suite' },
];

export default function UpsellSheet({
  limit, onClose, onGoPro,
}: { limit: UpsellLimit | null; onClose: () => void; onGoPro: () => void; }) {
  useEffect(() => {
    if (!limit) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [limit, onClose]);

  if (!limit) return null;
  const c = COPY[limit];

  return (
    <div className="su-scrim" data-swipe-exclude onClick={onClose} role="dialog" aria-modal="true">
      <div className="su-panel" onClick={(e) => e.stopPropagation()}>
        <span className="su-bracket su-tl" /><span className="su-bracket su-tr" />
        <span className="su-bracket su-bl" /><span className="su-bracket su-br" />

        <div className="su-eyebrow">
          <span className="su-badge">
            <img src="/badges/scope-pro-badge-min-design-01.png" alt="Scope Pro" className="su-badge-flip" />
          </span>
          <span className="su-label">SCOPE PRO</span>
        </div>

        <h1 className="su-headline">{c.headline}</h1>

        <div className="su-meter">
          <div className="su-track"><div className="su-fill" /></div>
          <div className="su-count">{c.count}</div>
        </div>

        <p className="su-body">{c.body}</p>
        <div className="su-divider" />

        <ul className="su-features">
          {FEATURES.map((f) => (
            <li key={f.key} className={f.key === c.feature ? 'su-on' : ''}>
              <span className="su-tick" />{f.label}
            </li>
          ))}
        </ul>

        <button className="su-cta" onClick={onGoPro}>GO PRO →</button>
        <button className="su-cta2" onClick={onClose}>NOT NOW</button>
      </div>

      <style>{`
        .su-scrim{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;animation:su-scrimIn .26s ease both;padding:20px}
        @keyframes su-scrimIn{from{opacity:0}to{opacity:1}}
        .su-panel{position:relative;width:312px;max-width:100%;background:#000;padding:30px 26px 22px;animation:su-panelIn .34s cubic-bezier(.16,.84,.3,1) both;font-family:'SK-Modernist','Helvetica Neue',Arial,sans-serif}
        @keyframes su-panelIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .su-bracket{position:absolute;width:18px;height:18px;animation:su-focus .5s cubic-bezier(.16,.84,.3,1) both;animation-delay:.12s}
        .su-bracket::before,.su-bracket::after{content:"";position:absolute;background:#E5E1DB}
        .su-bracket::before{height:1.5px;width:18px}.su-bracket::after{width:1.5px;height:18px}
        .su-tl{top:-1px;left:-1px}.su-tl::before{top:0;left:0}.su-tl::after{top:0;left:0}
        .su-tr{top:-1px;right:-1px}.su-tr::before{top:0;right:0}.su-tr::after{top:0;right:0}
        .su-bl{bottom:-1px;left:-1px}.su-bl::before{bottom:0;left:0}.su-bl::after{bottom:0;left:0}
        .su-br{bottom:-1px;right:-1px}.su-br::before{bottom:0;right:0}.su-br::after{bottom:0;right:0}
        @keyframes su-focus{from{opacity:0;transform:scale(1.6)}to{opacity:1;transform:scale(1)}}
        .su-eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:18px;animation:su-rise .3s ease both;animation-delay:.10s}
        .su-badge{position:relative;width:34px;height:34px;flex-shrink:0;display:inline-flex;perspective:600px}
        .su-badge-flip{width:100%;height:100%;object-fit:contain;transform-style:preserve-3d;animation:pro-spin 7s linear infinite,pro-glow 3.6s ease-in-out -0.9s infinite}
        /* Option C — 3D spin + STRONG glow breath. Glow runs 3.6s (not 3.5): a
           non-integer ratio to the 7s spin so the combined loop never visibly
           repeats; negative delay offsets the phases from t=0. GPU only. */
        @keyframes pro-spin{from{transform:rotateY(0)}to{transform:rotateY(360deg)}}
        @keyframes pro-glow{0%,100%{filter:drop-shadow(0 0 3px rgba(242,237,228,.25))}50%{filter:drop-shadow(0 0 16px rgba(242,237,228,.75))}}
        @media (prefers-reduced-motion: reduce){.su-badge-flip{animation:none;filter:drop-shadow(0 0 3px rgba(242,237,228,.25))}}
        .su-label{color:#E5E1DB;font-weight:700;font-size:10px;letter-spacing:.18em;text-transform:uppercase}
        .su-headline{color:#E5E1DB;font-weight:700;font-size:25px;line-height:1.05;letter-spacing:-.02em;text-transform:uppercase;margin:0 0 18px;animation:su-rise .3s ease both;animation-delay:.15s}
        .su-meter{margin-bottom:16px;animation:su-rise .3s ease both;animation-delay:.20s}
        .su-track{height:3px;background:rgba(229,225,219,.12);position:relative;overflow:hidden}
        .su-fill{position:absolute;left:0;top:0;height:100%;width:0;background:#E5E1DB;animation:su-fill .55s cubic-bezier(.16,.84,.3,1) both;animation-delay:.30s}
        @keyframes su-fill{from{width:0}to{width:100%}}
        .su-count{margin-top:7px;color:rgba(229,225,219,.45);font-weight:700;font-size:9px;letter-spacing:.14em;text-transform:uppercase}
        .su-body{color:rgba(229,225,219,.70);font-weight:400;font-size:12px;line-height:1.5;letter-spacing:-.01em;margin:0 0 20px;animation:su-rise .3s ease both;animation-delay:.24s}
        .su-divider{height:1px;background:rgba(229,225,219,.12);margin-bottom:16px;animation:su-rise .3s ease both;animation-delay:.27s}
        .su-features{list-style:none;margin:0 0 22px;padding:0}
        .su-features li{display:flex;align-items:center;gap:9px;padding:5px 0;color:rgba(229,225,219,.70);font-weight:700;font-size:10px;letter-spacing:.06em;text-transform:uppercase;animation:su-rise .3s ease both}
        .su-features li:nth-child(1){animation-delay:.29s}.su-features li:nth-child(2){animation-delay:.32s}.su-features li:nth-child(3){animation-delay:.35s}.su-features li:nth-child(4){animation-delay:.38s}
        .su-tick{width:9px;height:9px;flex-shrink:0;border:1px solid rgba(229,225,219,.25)}
        .su-features li.su-on{color:#E5E1DB}.su-features li.su-on .su-tick{border-color:#E5E1DB;background:#E5E1DB}
        .su-cta{width:100%;height:46px;background:#E5E1DB;border:none;cursor:pointer;color:#000;font-family:inherit;font-weight:700;font-size:13px;letter-spacing:.10em;text-transform:uppercase;animation:su-rise .3s ease both;animation-delay:.40s;transition:opacity .15s ease}
        .su-cta:hover{opacity:.85}
        .su-cta2{width:100%;margin-top:6px;padding:12px;background:none;border:none;cursor:pointer;color:rgba(229,225,219,.45);font-family:inherit;font-weight:700;font-size:10px;letter-spacing:.12em;text-transform:uppercase;animation:su-rise .3s ease both;animation-delay:.43s;transition:color .15s ease}
        .su-cta2:hover{color:#E5E1DB}
        @keyframes su-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}
