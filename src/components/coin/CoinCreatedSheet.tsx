"use client";

// ── CEL-1 — Coin Created sheet, variant A "Stamp" ─────────────────────────────
// ONE shared component, mounted at app root (Providers), driven by coinCreatedStore.
// Mobile = bottom sheet; desktop (≥768px) = centered 420px dialog — SAME content.
// Theme tokens only (inverts correctly in light mode; NOT the finishing suite → no
// force-dark). Motion is compositor-only (transform / opacity / stroke-dashoffset);
// nothing animates layout. Reduced-motion → final state with a single .2s fade.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoinCreated, clearCoinCreated, onCoinConfirmed, type CoinCreatedResult } from "@/lib/coinCreatedStore";
import MediaRenderer from "@/components/MediaRenderer";
import { DottedLeader } from "@/components/Ledger";
import { getAspectRatio, chipForLayout } from "@/lib/aspectRatio";
import { supabase } from "@/lib/supabase/client";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
const short = (h: string) => (h && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

// test-only: the seam installer lives behind the build-time flag so it is DCE'd out of
// the prod bundle (NEXT_PUBLIC_TEST_SEAM is statically replaced).
function installSeam() {
  if (process.env.NEXT_PUBLIC_TEST_SEAM !== "1" || typeof window === "undefined") return () => {};
  (window as unknown as { __scopeFakeCoinCreated?: (v?: string) => void }).__scopeFakeCoinCreated = (variant?: string) => {
    const video = variant === "cel-video";
    const result: CoinCreatedResult = {
      post: {
        id: "seam-post",
        userId: "seam-user",
        title: video ? "Welcome to Pro" : "Golden hour, uncut",
        layoutId: "scope",
        mediaType: video ? "video" : "image",
        mediaUrl: video ? "/welcome-to-pro-new-ani.mp4" : "/cel-seam.jpg",
        posterUrl: video ? "/cel-seam.jpg" : null,
        deckName: variant === "cel-photo" ? "First Light" : null,
      },
      coin: { symbol: video ? "WLCM" : "GOLD", address: "0x1234000000000000000000000000000000005678" },
      receipt: { hash: "0x12ab0000000000000000000000000000000000000000000000000000000ccd34", chainLabel: "Base" },
    };
    onCoinConfirmed(result);
  };
  return () => { try { delete (window as unknown as Record<string, unknown>).__scopeFakeCoinCreated; } catch { /* noop */ } };
}

export default function CoinCreatedSheet() {
  const data = useCoinCreated();
  const router = useRouter();
  const [coinCount, setCoinCount] = useState<number | null>(null);
  const dragRef = useRef<{ y: number; active: boolean }>({ y: 0, active: false });
  const [dragDy, setDragDy] = useState(0);

  useEffect(() => installSeam(), []);

  // "Your coins …… N" — best-effort, non-blocking; render "—" until known.
  useEffect(() => {
    if (!data) { setCoinCount(null); setDragDy(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", data.post.userId)
          .not("coin_address", "is", null);
        if (!cancelled && typeof count === "number") setCoinCount(count);
      } catch { /* leave as — */ }
    })();
    return () => { cancelled = true; };
  }, [data]);

  if (!data) return null;
  const { post, coin, receipt } = data;
  const aspect = getAspectRatio(post.layoutId || "");
  const label = (() => { try { return chipForLayout(post.layoutId || "").label; } catch { return ""; } })();
  const basescan = `https://basescan.org/tx/${receipt.hash}`;

  const dismiss = () => clearCoinCreated();
  // CEL-1b §1 — land on the POST in the profile post scroll (not the grid): deep-link the post
  // id; the profile page opens ProfilePostViewer anchored at that id (same by-id anchoring Home
  // scroll memory uses via data-post-id).
  const viewPost = () => { clearCoinCreated(); router.push(`/profile?post=${encodeURIComponent(post.id)}`); };

  // minimal swipe-down on the handle/sheet: drag follows the finger, release >70px dismisses.
  const onPointerDown = (e: React.PointerEvent) => { dragRef.current = { y: e.clientY, active: true }; };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dy = Math.max(0, e.clientY - dragRef.current.y);
    setDragDy(dy);
  };
  const onPointerUp = () => {
    if (!dragRef.current.active) return;
    const dy = dragDy;
    dragRef.current.active = false;
    if (dy > 70) dismiss(); else setDragDy(0);
  };

  const ledgerRow = (idx: number, labelText: string, value: React.ReactNode) => (
    <div className={`cc-row cc-row-${idx}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0" }}>
      <span style={{ ...MONO, fontSize: 12, color: "rgb(var(--ink-rgb) / 0.6)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{labelText}</span>
      <DottedLeader style={{ flex: 1 }} />
      <span style={{ ...MONO, fontSize: 12, color: "var(--ink-100)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );

  return (
    <div className="cc-root" role="dialog" aria-modal="true" aria-label="Coin created" data-swipe-exclude
      style={{ position: "fixed", inset: 0, zIndex: 1250, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{CC_CSS}</style>

      {/* scrim */}
      <div className="cc-scrim" onClick={dismiss} style={{ position: "absolute", inset: 0, background: "rgb(var(--black-rgb) / 0.78)" }} />

      {/* sheet / dialog */}
      <div
        className="cc-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", maxWidth: 480, background: "var(--canvas)",
          borderTop: "1px solid rgb(var(--ink-rgb) / 0.10)",
          padding: "10px 22px calc(24px + env(safe-area-inset-bottom, 0px))",
          transform: dragDy ? `translateY(${dragDy}px)` : undefined,
          transition: dragRef.current.active ? "none" : "transform 0.25s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {/* grab handle */}
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={{ display: "flex", justifyContent: "center", padding: "2px 0 14px", cursor: "grab", touchAction: "none" }}>
          <div style={{ width: 36, height: 4, borderRadius: 0, background: "rgb(var(--ink-rgb) / 0.22)" }} />
        </div>

        {/* eyebrow */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ ...MONO, fontSize: 11, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Coin created</span>
          <span style={{ ...MONO, fontSize: 11, color: "rgb(var(--ink-rgb) / 0.5)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Base · confirmed</span>
        </div>

        {/* media — actual minted media, post aspect, no cover-crop, with hairline rect */}
        <div className="cc-media" style={{ position: "relative", width: "100%", maxHeight: "42svh", aspectRatio: aspect, margin: "0 auto 18px", background: "var(--black)" /* theme-ok: media letterbox */, overflow: "hidden" }}>
          <MediaRenderer
            url={post.mediaType === "video" ? (post.mediaUrl ?? "") : (post.mediaUrl ?? "")}
            mediaType={post.mediaType}
            thumbnailUrl={post.posterUrl}
            autoplay
            cropX={post.cropX} cropY={post.cropY} cropWidth={post.cropWidth} cropHeight={post.cropHeight}
            style={{ objectFit: "contain" }}
          />
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <rect className="cc-hair" x="0.75" y="0.75" width="98.5" height="98.5" pathLength={1000}
              fill="none" stroke="var(--ink-100)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        {/* title */}
        <div style={{ marginBottom: 16 }}>
          <div className="cc-title" style={{ ...SKB, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink-100)", lineHeight: 1.05, transformOrigin: "left center" }}>
            ${coin.symbol}
          </div>
          <div style={{ ...MONO, fontSize: 12, color: "rgb(var(--ink-rgb) / 0.55)", marginTop: 5, letterSpacing: "0.02em" }}>
            {post.title}{label ? ` · ${label}` : ""}
          </div>
        </div>

        {/* ledger — dash rule: never promise economics */}
        <div style={{ borderTop: "1px solid rgb(var(--ink-rgb) / 0.08)", marginBottom: 20 }}>
          {ledgerRow(0, "Receipt", (
            <a href={basescan} target="_blank" rel="noopener noreferrer" style={{ ...MONO, fontSize: 12, color: "var(--ink-100)", textDecoration: "none", fontVariantNumeric: "tabular-nums" }}>
              {short(receipt.hash)} <span aria-hidden style={{ color: "rgb(var(--ink-rgb) / 0.55)" }}>↗</span>
            </a>
          ))}
          {ledgerRow(1, "Your coins", coinCount == null ? "—" : String(coinCount))}
          {post.deckName ? ledgerRow(2, "Deck", post.deckName) : null}
        </div>

        {/* CTAs */}
        <div className="cc-cta" style={{ display: "flex", gap: 10 }}>
          <button onClick={viewPost} style={{ ...SKB, flex: 1, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--on-ink)", background: "var(--ink-100)", border: "none", cursor: "pointer", padding: "14px 0" }}>View post</button>
          <button onClick={dismiss} style={{ ...SKB, flex: 1, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-100)", background: "transparent", border: "1px solid rgb(var(--ink-rgb) / 0.3)", cursor: "pointer", padding: "14px 0" }}>Done</button>
        </div>
        {/* note: no coin disclaimer string exists in-app → none (per brief) */}
      </div>
    </div>
  );
}

// All eases/timings from the CEL-1 motion spec. Compositor-only properties.
const CC_CSS = `
.cc-scrim { opacity: 0; animation: ccScrim .3s ease forwards; }
.cc-sheet { transform: translateY(100%); animation: ccRise .55s cubic-bezier(.2,.8,.2,1) forwards; will-change: transform; }
.cc-media { opacity: 0; transform: translateY(-20px); animation: ccDrop .6s cubic-bezier(.2,.9,.2,1.2) .25s forwards; will-change: transform, opacity; }
.cc-hair { stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: ccDraw 1.1s ease-out .55s forwards; }
.cc-title { opacity: 0; transform: scale(1.25); animation: ccStamp .42s cubic-bezier(.2,.9,.3,1.3) 1.05s forwards; will-change: transform, opacity; }
.cc-row { opacity: 0; transform: translateY(6px); animation: ccRow .35s ease-out forwards; will-change: transform, opacity; }
.cc-row-0 { animation-delay: 1.35s; } .cc-row-1 { animation-delay: 1.50s; } .cc-row-2 { animation-delay: 1.65s; }
.cc-cta { opacity: 0; animation: ccFade .4s ease 2.7s forwards; }
@keyframes ccScrim { to { opacity: 1; } }
@keyframes ccRise { to { transform: translateY(0); } }
@keyframes ccDrop { to { opacity: 1; transform: translateY(0); } }
@keyframes ccDraw { to { stroke-dashoffset: 0; } }
@keyframes ccStamp { 55% { transform: scale(.98); opacity: 1; } to { transform: scale(1); opacity: 1; } }
@keyframes ccRow { to { opacity: 1; transform: translateY(0); } }
@keyframes ccFade { to { opacity: 1; } }
@keyframes ccRootFade { from { opacity: 0; } to { opacity: 1; } }
@media (min-width: 768px) {
  .cc-root { align-items: center !important; }
  .cc-sheet { max-width: 420px !important; border-top: none !important; border: 1px solid rgb(var(--ink-rgb) / 0.12) !important; transform: translateY(24px); animation: ccRiseDialog .55s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes ccRiseDialog { to { transform: translateY(0); } }
}
@media (prefers-reduced-motion: reduce) {
  .cc-root { animation: ccRootFade .2s ease forwards; }
  .cc-scrim, .cc-sheet, .cc-media, .cc-title, .cc-row, .cc-cta { animation: none !important; opacity: 1 !important; transform: none !important; }
  .cc-hair { animation: none !important; stroke-dashoffset: 0 !important; }
}
`;
