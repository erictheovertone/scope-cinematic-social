'use client';
// ── CollectSheetV2 (Economy UI brief Part 2.4 + spend-first correction) ───────
//
// Dev-flag-gated preview of the economy collect sheet. Reads ONLY through the
// EconomyProvider boundary (useEconomy) — never the chain directly.
//
// COINS MODEL (replaces the 1155 quantity multiplier, which dies with the
// migration):
//  • BUY = dollar-led. Large $ input + quick chips + custom; live "≈ N PIECES"
//    receipt from the pool quote; USDC | ETH payment selector; FUND WALLET.
//  • SELL = position-led. Pieces held; sell by pieces or % chips; $ proceeds
//    preview; FIRST CUT guard — selling below the founding amount permanently
//    ends the founding position (confirm step).
//  • Dollars lead everywhere; ETH is secondary detail, never the headline.
//  • Keeps the FIRST CUT provenance row + slot list + urgency line.
//
// Rendered in place of the real CollectSheet only when economyPreviewEnabled().

import { useEffect, useState, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useEconomy } from '@/components/EconomyProvider';
import { economyPreviewEnabled } from '@/lib/economy/flag';
import FirstCutFlourish from '@/components/economy/FirstCutFlourish';
import GradedVideo from '@/components/finishing/GradedVideo';
import type { PostMarket, BuyQuote, SellQuote, TradeCurrency } from '@/lib/economy/types';
import ApertureMark from '@/components/economy/ApertureMark';
import TickerMark from '@/components/economy/TickerMark';
import FrameLoader from '@/components/FrameLoader';
import { getAspectRatio } from '@/lib/aspectRatio';
import { notifyTradeSettled } from '@/lib/economy/tradeEvents';
import { notifyFirstCutEarned } from '@/lib/firstCutLedger';
import { openPostLightbox } from '@/lib/postLightbox';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);
const eth = (n: number) => `${n.toFixed(n < 0.1 ? 5 : 4)} ETH`;
const BASE_PER_PIECE = 100_000; // 1 piece = 100,000 base tokens (display detail)

interface Props {
  post: {
    id: string; username: string; caption?: string; media_urls: string[]; ticker?: string | null;
    media_type?: string; poster_url?: string | null; thumbnail_url?: string | null; layout_id?: string;
    edit_params?: unknown; autoplay_clip_url?: string | null;
    crop_x?: number; crop_y?: number; crop_width?: number; crop_height?: number;
  };
  visible: boolean;
  onClose: () => void;
  /** False for legacy ETH-paired coins (unroutable). The sheet keeps the post
      header but replaces the whole BUY/SELL surface with a non-tradeable note. */
  tradeable?: boolean;
}

const BUY_CHIPS = [1, 5, 25, 100];
const SELL_PCTS = [25, 50, 100];

export default function CollectSheetV2({ post, visible, onClose, tradeable = true }: Props) {
  const economy = useEconomy();
  const { user } = usePrivy();
  const viewerWallet = user?.wallet?.address ?? null;
  // Moment 1 (First Cut flourish) — set only when the in-flow check verifies
  // THIS buy newly earned First Cut. Additive over the buy's success state.
  const [firstCut, setFirstCut] = useState<{ rank: number | null } | null>(null);
  // Tick-up payoff timing: hold a confirmed First Cut earn until the sheet closes
  // (= return to feed), so the home-feed count pulse plays where the user lands.
  const firstCutEarnRef = useRef<string | null>(null);
  // The default post-buy close timer. When a buy EARNS First Cut, the celebration
  // takes over the exit (this gets cancelled) so the whip fires as Moment 1 ends.
  const closeTimerRef = useRef<number | null>(null);
  const sheetVisibleRef = useRef(visible);
  sheetVisibleRef.current = visible;
  const [market, setMarket] = useState<PostMarket | null>(null);
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [showSlots, setShowSlots] = useState(false);

  // BUY state
  const [buyUsd, setBuyUsd] = useState('');
  const [buyCurrency, setBuyCurrency] = useState<TradeCurrency>('USDC');
  const [buyQuote, setBuyQuote] = useState<BuyQuote | null>(null);

  // SELL state
  const [sellPieces, setSellPieces] = useState(0);
  const [sellQuote, setSellQuote] = useState<SellQuote | null>(null);
  const [sellCurrency, setSellCurrency] = useState<TradeCurrency>('ETH');
  const [confirmEndFirstCut, setConfirmEndFirstCut] = useState(false);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  // THE CEREMONY — on confirmed collect the red corner brackets SNAP onto the
  // media (the frame motif's third verb: it loads pages, it captures looks —
  // now it claims pieces), the terminal holds a beat, then the sheet returns
  // the collector to where they came from.
  const [captured, setCaptured] = useState(false);

  const refresh = () => economy.getPostMarket(post.id).then(setMarket).catch(() => {});

  useEffect(() => {
    if (!visible) {
      setShowSlots(false); setDone(null); setMode('buy');
      setBuyUsd(''); setBuyQuote(null); setSellPieces(0); setSellQuote(null);
      setConfirmEndFirstCut(false); setTradeError(null); setCaptured(false);
      // NOTE: do NOT clear firstCut here. The sheet auto-closes ~4s after a buy;
      // clearing on close truncated the flourish mid-play. It self-clears via its
      // own onDone (1.8s); a fresh buy sets it anew. So it always plays in full.
      return;
    }
    let cancelled = false;
    economy.getPostMarket(post.id).then((m) => { if (!cancelled) setMarket(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [visible, post.id, economy]);

  // Live BUY quote.
  useEffect(() => {
    const v = parseFloat(buyUsd);
    if (!isFinite(v) || v <= 0) { setBuyQuote(null); return; }
    let cancelled = false;
    economy.quoteBuy(post.id, v).then((q) => { if (!cancelled) setBuyQuote(q); }).catch(() => {});
    return () => { cancelled = true; };
  }, [buyUsd, post.id, economy]);

  // Live SELL quote.
  useEffect(() => {
    if (sellPieces <= 0) { setSellQuote(null); return; }
    let cancelled = false;
    economy.quoteSell(post.id, sellPieces).then((q) => { if (!cancelled) setSellQuote(q); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sellPieces, post.id, economy]);

  const held = market?.collectedByViewer ?? 0;
  const foundingAmount = market?.foundingAmount ?? 0;
  const viewerFounding = market?.viewerFounding ?? false;
  // Would this sale drop the holder below their founding position?
  const sellEndsFirstCut = viewerFounding && held - sellPieces < foundingAmount && sellPieces > 0;

  // Plain-English failure line — the layers below throw human messages; this
  // is the catch-all. Money outcome honesty: gas may be spent, nothing bought.
  const humanError = (e: unknown) =>
    (e as Error)?.message?.length && (e as Error).message.length < 140
      ? (e as Error).message
      : 'Trade didn’t go through — nothing was bought or sold. Try again.';

  // After the held terminal beat, the sheet returns the collector to their
  // ORIGINATING context — it's an overlay, so closing it lands them exactly
  // where they were (feed or visited profile, scroll position intact).
  const ceremonyResolve = (postId: string, piecesDelta?: number, proceeds?: { usd: number; currency: 'ETH' | 'USDC' }) => {
    // The ONE post-trade refresh: MC chips re-read + wallet holdings refetch.
    // piecesDelta (+buy / −sell, receipt-true) drives the optimistic holdings patch;
    // proceeds (receipt-true, sells) drives the INSTANT wallet-balance tick-up.
    notifyTradeSettled(postId, (piecesDelta != null || proceeds != null)
      ? { piecesDelta, proceedsUsd: proceeds?.usd, proceedsCurrency: proceeds?.currency }
      : undefined);
    // ~4s hold: time to read the count and watch the price move before the sheet
    // returns the collector to where they came from. If THIS buy earns First Cut,
    // checkFirstCut cancels this timer and the celebration owns the exit instead
    // (Moment 1 plays full → its disappearance whips into the counter). The whip
    // is NO LONGER fired here — it's the celebration's exit (see onFlourishDone).
    closeTimerRef.current = window.setTimeout(() => { onClose(); }, 4000);
  };

  // The celebration's exit IS the whip. When the flourish finishes its extended
  // hold, clear it, return the buyer to their ORIGIN (feed OR Lightbox — both now
  // host a First Cut counter), then a beat later fire the earn signal so the mark
  // whips from screen-centre into that counter and ticks it up. Origin-agnostic:
  // the sheet is the same in every view, so this fires identically everywhere.
  const onFlourishDone = () => {
    setFirstCut(null);
    if (sheetVisibleRef.current) onClose(); // back to origin (only if still open)
    const earned = firstCutEarnRef.current;
    firstCutEarnRef.current = null;
    if (earned) {
      // Small beat so the sheet begins sliding away and the destination counter
      // is revealed for the whip to land on. reduced-motion: the chip just ticks.
      window.setTimeout(() => notifyFirstCutEarned(earned), 260);
    }
  };

  // Moment 1 — the in-flow First Cut check. Fire-and-forget AFTER the buy's own
  // success is already set: it must never block or delay the confirmation.
  // Celebrates ONLY when the server confirms this buy newly earned First Cut
  // (earned && firstTime).
  //
  // DEFERRED-AWARD RETRY: the server returns deferred:true when the buy clears
  // the floor and a slot is open but the buy isn't in Zora's swap feed yet
  // (indexing lag). A defer used to drop forever; now we re-check over the
  // indexing window (~42s, capped) so a genuine-but-not-yet-indexed earn still
  // lands. Each re-check is the SAME authoritative server check (verified swap
  // read + on-chain confirm), so it only ever awards a real founder — a defer
  // that resolves to "not a founder" (sub-floor / slot filled) correctly stops.
  // Aggressive early retries so a deferred (not-yet-indexed) earn fires ASAP —
  // the old 5s first delay was the visible lag. Same ~20s window, just front-loaded.
  const FIRST_CUT_RETRY_MS = [1500, 3000, 6000, 12000]; // re-check a defer, then stop
  const checkFirstCut = (postId: string, txHash: string, buyUsdAmount: number) => {
    if (!viewerWallet || !txHash) return;
    const attempt = (retryIdx: number) => {
      fetch('/api/first-cut/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // buyUsd = the USD the buy flow computed (the hardened pricing path) — the
        // server's qualifying floor checks THIS purchase against it.
        body: JSON.stringify({ postId, txHash, buyer: viewerWallet, buyUsd: buyUsdAmount }),
      })
        .then((res) => res.json())
        .then((j) => {
          if (j?.earned && j?.firstTime) {
            // The celebration now OWNS the exit + whip. Cancel the default
            // sheet-close so Moment 1 plays full before anything happens; the
            // whip fires off the flourish's onDone (onFlourishDone), whether the
            // sheet is still open or already returned. One chained sequence:
            // earn → celebration (full + hold) → exit → whip → tick-up.
            if (closeTimerRef.current != null) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
            firstCutEarnRef.current = postId; // the whip target, released on exit
            setFirstCut({ rank: j.rank ?? null }); // Moment 1
            return;
          }
          // Retry ONLY a defer (genuine earn awaiting indexing). A definitive
          // earned:false (sub-floor / slot full / already held) never retries.
          if (j?.deferred && retryIdx < FIRST_CUT_RETRY_MS.length) {
            setTimeout(() => attempt(retryIdx + 1), FIRST_CUT_RETRY_MS[retryIdx]);
          }
        })
        .catch(() => { /* additive beat — a check failure never disturbs the buy */ });
    };
    attempt(0);
  };

  // Lifecycle — after a sell, expire the First Cut slot IFF this sell drops the
  // remaining holding below the $4.50 keep-floor. Server-authoritative + on-chain
  // confirmed; never expires on a flaky read. Fire-and-forget; the badge
  // re-resolves on the next profile load.
  const expireCheckFirstCut = (postId: string, txHash: string) => {
    if (!viewerWallet || !txHash) return;
    fetch('/api/first-cut/expire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, txHash, seller: viewerWallet }),
    }).catch(() => { /* never disturbs the sell */ });
  };

  const doBuy = async () => {
    const v = parseFloat(buyUsd);
    if (!isFinite(v) || v <= 0) return;
    setBusy(true); setTradeError(null);
    try {
      const r = await economy.buy(post.id, v, buyCurrency);
      if (r.ok) {
        // r.pieces is RECEIPT-derived (the chain's word) — never a quote
        // estimate or stale balance.
        const n = r.pieces;
        setDone(market?.live ? `[ COLLECTED · ${n} ${n === 1 ? 'PIECE' : 'PIECES'} ]` : `COLLECTED ${n} ${n === 1 ? 'PIECE' : 'PIECES'} (MOCK)`);
        setCaptured(true); // bracket-capture snaps onto the media
        refresh();         // price/MC re-read — the buyer sees the price they moved
        ceremonyResolve(post.id, n); // +pieces bought → optimistic wallet patch
        checkFirstCut(post.id, r.ref, v); // Moment 1 — additive, non-blocking ($ floor)
      }
    } catch (e) {
      console.error('[collect] buy failed:', e);
      setTradeError(humanError(e)); // failure: loud, plain-English, no ceremony
    } finally { setBusy(false); }
  };

  const doSell = async () => {
    if (sellPieces <= 0) return;
    if (sellEndsFirstCut && !confirmEndFirstCut) { setConfirmEndFirstCut(true); return; }
    setBusy(true); setTradeError(null);
    try {
      const r = await economy.sell(post.id, sellPieces, sellCurrency);
      if (r.ok) {
        // Receipt-true pieces AND proceeds. Quieter than the collect ceremony —
        // no bracket capture (that celebrates acquiring; selling is matter-of-fact).
        const proceeds = r.proceedsUsd != null ? ` · ${usd(r.proceedsUsd)}` : '';
        setDone(market?.live ? `[ SOLD · ${r.pieces} ${r.pieces === 1 ? 'PIECE' : 'PIECES'}${proceeds} ]` : `SOLD ${r.pieces} ${r.pieces === 1 ? 'PIECE' : 'PIECES'} (MOCK)`);
        setConfirmEndFirstCut(false); setSellPieces(0); refresh();
        // −pieces (optimistic holdings) + receipt-true proceeds (instant balance tick-up).
        ceremonyResolve(
          post.id,
          r.pieces != null ? -r.pieces : undefined,
          r.proceedsUsd != null ? { usd: r.proceedsUsd, currency: sellCurrency } : undefined,
        );
        expireCheckFirstCut(post.id, r.ref); // lifecycle — expire the slot if this sell drops below the keep-floor
      }
    } catch (e) {
      console.error('[collect] sell failed:', e);
      setTradeError(humanError(e));
    } finally { setBusy(false); }
  };

  const fc = market?.firstCut;
  const filled = fc?.slots ?? [];
  const holdingCount = filled.filter((s) => s.holding).length;
  const openCount = fc?.openCount ?? 0;

  // LONGHAND borders only — never the `border` shorthand in this component:
  // mixing it with borderBottom* flips React's conflicting-property warning on
  // rerender. Both states carry the IDENTICAL property set; only color varies.
  const tabStyle = (active: boolean): React.CSSProperties => ({
    ...SKB, flex: 1, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
    padding: '10px 0', textAlign: 'center', cursor: 'pointer',
    color: active ? '#FFF' : 'rgba(255,255,255,0.4)',
    background: 'transparent',
    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: active ? '#FF0000' : 'rgba(255,255,255,0.1)',
  });

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500,
          opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 375,
        background: '#080808', borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 501,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
        padding: '24px 22px 40px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Banner ONLY for mock data — real coin reads (live) carry no banner. */}
        {market && !market.live && (
          <div style={{ ...SKB, fontSize: 7, letterSpacing: '0.2em', color: '#FF0000', textTransform: 'uppercase', marginBottom: 14 }}>
            ECONOMY PREVIEW · MOCK DATA
          </div>
        )}

        {/* Post head — media WIDE in the creator's actual aspect ratio (never
            re-cropped square). Video now PLAYS (graded) via the feed's GradedVideo
            (autoplay/muted/loop/playsInline); image = the baked/graded image. Wide
            ARs stack the text below; the taller 4:3 sits text-beside. */}
        {(() => {
          const isVideo = post.media_type === 'video';
          const mediaSrc = isVideo
            ? (post.poster_url || post.thumbnail_url || null)
            : (post.media_urls?.[0] || null);
          const arCss = getAspectRatio(post.layout_id ?? '');
          const arNum = (() => {
            const [w, h] = String(arCss).split('/').map((x) => parseFloat(x));
            return isFinite(w) && isFinite(h) && h > 0 ? w / h : 2.39;
          })();
          const stacked = arNum >= 1.6; // 2.75 / 2.39 / 1.85 stack; 4:3 sits beside
          const text = (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 3px' }}>
                <p style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>@{post.username}</p>
                {post.ticker && <TickerMark ticker={post.ticker} size={10} />}
              </div>
              <p style={{ ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{post.caption || ''}</p>
            </div>
          );
          const media = (
            <div
              onClick={() => openPostLightbox(post.id)}
              style={{ position: 'relative', width: stacked ? '100%' : '55%', aspectRatio: String(arCss), background: '#111', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
            >
              {isVideo ? (
                <GradedVideo
                  url={post.media_urls?.[0] ?? ''}
                  posterUrl={post.poster_url ?? post.thumbnail_url ?? null}
                  clipUrl={post.autoplay_clip_url ?? null}
                  editParams={post.edit_params}
                  cropX={post.crop_x ?? 0}
                  cropY={post.crop_y ?? 0}
                  cropWidth={post.crop_width ?? 1}
                  cropHeight={post.crop_height ?? 1}
                  autoplayFlag
                  gridMode
                  style={{ width: '100%', height: '100%' }}
                  onClick={() => openPostLightbox(post.id)}
                />
              ) : (
                mediaSrc && <img src={mediaSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
              {/* BRACKET CAPTURE — the staggered corner lock (same family as
                  the look-saved choreography): the work is claimed. */}
              {captured && (
                <>
                  <div style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderTop: '2px solid #FF0000', borderLeft: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease forwards', opacity: 0 }} />
                  <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderTop: '2px solid #FF0000', borderRight: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease 0.1s forwards', opacity: 0 }} />
                  <div style={{ position: 'absolute', bottom: 6, left: 6, width: 22, height: 22, borderBottom: '2px solid #FF0000', borderLeft: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease 0.2s forwards', opacity: 0 }} />
                  <div style={{ position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderBottom: '2px solid #FF0000', borderRight: '2px solid #FF0000', animation: 'cornerReveal 0.6s ease 0.3s forwards', opacity: 0 }} />
                  <style>{`@keyframes cornerReveal { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }`}</style>
                </>
              )}
            </div>
          );
          return stacked ? (
            <div style={{ marginBottom: 18 }}>
              {media}
              <div style={{ marginTop: 10 }}>{text}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              {media}
              {text}
            </div>
          );
        })()}

        {/* LEGACY pairing — unroutable coin. Keep the post head above; replace
            the entire market/trade surface with an honest non-tradeable note
            (detected by pairing upstream, never by catching a trade error). */}
        {tradeable ? (<>

        {/* Price + MC in dollars, pieces framing. A no-trades pool has no
            discovered price yet — show "—", never a fabricated number. */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 18, background: 'rgba(255,255,255,0.08)' }}>
          {[
            { k: 'PRICE / PIECE', v: market ? (market.priceUsd != null ? usd(market.priceUsd) : '—') : '—' },
            { k: 'MARKET CAP', v: market ? usd(market.mcUsd) : '—' },
            { k: 'PIECES', v: market ? market.supply.toLocaleString() : '10,000' },
          ].map((c) => (
            <div key={c.k} style={{ flex: 1, background: '#080808', padding: '12px 10px' }}>
              <p style={{ ...SKB, fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 5px' }}>{c.k}</p>
              <p style={{ ...SKB, fontSize: 13, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{c.v}</p>
            </div>
          ))}
        </div>

        {/* CURRENT HOLDING — surfaced on the initial/BUY view so the collector
            sees what they already own WITHOUT switching to SELL. Same source the
            SELL tab reads (market.collectedByViewer); hidden in SELL (which has its
            own YOU HOLD) and during the confirmation terminal. */}
        {!done && mode === 'buy' && held > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOU HOLD</span>
            <span style={{ ...SKB, fontSize: 13, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
              {held.toLocaleString()} {held === 1 ? 'PIECE' : 'PIECES'}
              {market?.priceUsd != null && (
                <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.45)', marginLeft: 7 }}>· {usd(held * market.priceUsd)}</span>
              )}
            </span>
          </div>
        )}

        {/* STAGE B: real trades for live coins through the same boundary calls
            the mock skeleton always used — identical UI, real tradeCoin. */}
        {done ? (
          <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '18px 14px', textAlign: 'center', marginBottom: 18 }}>
            <p style={{ ...SKB, fontSize: 12, color: done.startsWith('[') ? '#FF0000' : '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{done}</p>
            {market && !market.live && (
              <p style={{ ...SKR, fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 0' }}>PREVIEW ONLY · NO REAL TRANSACTION</p>
            )}
          </div>
        ) : (
          <>
            {/* BUY / SELL tabs */}
            <div style={{ display: 'flex', marginBottom: 18 }}>
              <button style={tabStyle(mode === 'buy')} onClick={() => setMode('buy')}>BUY</button>
              <button style={tabStyle(mode === 'sell')} onClick={() => setMode('sell')}>SELL</button>
            </div>

            {mode === 'buy' ? (
              /* ── BUY — dollar-led ── */
              <>
                {/* Large amount input */}
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 8, marginBottom: 12 }}>
                  <span style={{ ...SKB, fontSize: 34, color: buyUsd ? '#FFF' : 'rgba(255,255,255,0.25)' }}>$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={buyUsd}
                    onChange={(e) => setBuyUsd(e.target.value.replace(/[^0-9.]/g, ''))}
                    style={{ ...SKB, fontSize: 34, color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: 0, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>

                {/* Quick chips + custom (the input itself is the custom entry) */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {BUY_CHIPS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBuyUsd(String(c))}
                      style={{ ...SKB, flex: 1, fontSize: 11, color: '#FFF', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', padding: '8px 0', cursor: 'pointer' }}
                    >
                      ${c}
                    </button>
                  ))}
                </div>

                {/* Live receipt — pieces lead, ETH/USDC secondary */}
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '12px 12px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOU RECEIVE</span>
                    <span style={{ ...SKB, fontSize: 18, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
                      ≈ {buyQuote ? buyQuote.pieces.toLocaleString() : 0} {buyQuote && buyQuote.pieces === 1 ? 'PIECE' : 'PIECES'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ ...SKR, fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>1 PIECE = {BASE_PER_PIECE.toLocaleString()} TOKENS</span>
                    <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
                      {buyCurrency === 'ETH' ? (buyQuote ? `≈ ${eth(buyQuote.ethAmount)}` : '') : (buyQuote ? `≈ ${buyQuote.usdAmount.toFixed(2)} USDC` : '')}
                    </span>
                  </div>
                </div>

                {/* Currency selector (payment side) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>PAY WITH</span>
                  <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.12)' }}>
                    {(['USDC', 'ETH'] as TradeCurrency[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setBuyCurrency(c)}
                        style={{ ...SKB, fontSize: 10, letterSpacing: '0.08em', padding: '6px 14px', cursor: 'pointer', border: 'none', color: buyCurrency === c ? '#000' : '#FFF', background: buyCurrency === c ? '#FFF' : '#080808' }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {tradeError && (
                  <p style={{ ...SKR, fontSize: 10, color: '#FF0000', margin: '0 0 10px', lineHeight: 1.4 }}>{tradeError}</p>
                )}
                {busy ? (
                  /* THE WHEEL — pressed button transformed into narration. */
                  <div style={{ width: '100%', border: '1px solid rgba(255,0,0,0.55)', padding: '13px 0', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
                    <FrameLoader size={22} />
                    <span style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      BUYING · {buyQuote ? usd(buyQuote.usdAmount) : ''}…
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={doBuy}
                    disabled={!buyQuote}
                    style={{ width: '100%', background: !buyQuote ? 'rgba(255,0,0,0.4)' : '#FF0000', border: 'none', cursor: !buyQuote ? 'default' : 'pointer', padding: '14px 0', marginBottom: 8 }}
                  >
                    <span style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {buyQuote ? `BUY · ${usd(buyQuote.usdAmount)}` : 'ENTER AN AMOUNT'}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => { /* Coinbase Onramp wired later */ }}
                  style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: '11px 0' }}
                >
                  <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>FUND WALLET</span>
                </button>
              </>
            ) : (
              /* ── SELL — position-led ── */
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOU HOLD</span>
                  <span style={{ ...SKB, fontSize: 18, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
                    {held.toLocaleString()} {held === 1 ? 'PIECE' : 'PIECES'}
                    {market?.priceUsd != null && held > 0 && (
                      <span style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginLeft: 7 }}>· {usd(held * market.priceUsd)}</span>
                    )}
                  </span>
                </div>

                {held <= 0 ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '16px 0' }}>
                    NOTHING TO SELL ON THIS POST.
                  </p>
                ) : (
                  <>
                    {/* pieces input */}
                    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 8, marginBottom: 12 }}>
                      <input
                        inputMode="numeric"
                        placeholder="0"
                        value={sellPieces || ''}
                        onChange={(e) => { setConfirmEndFirstCut(false); setSellPieces(Math.min(held, Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, '') || '0', 10)))); }}
                        style={{ ...SKB, fontSize: 30, color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: 0, fontVariantNumeric: 'tabular-nums' }}
                      />
                      <span style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>PIECES</span>
                    </div>

                    {/* 25% / 50% / MAX chips + custom (the input is custom entry) */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                      {SELL_PCTS.map((p) => (
                        <button
                          key={p}
                          onClick={() => { setConfirmEndFirstCut(false); setSellPieces(p === 100 ? held : Math.max(1, Math.round((held * p) / 100))); }}
                          style={{ ...SKB, flex: 1, fontSize: 11, color: '#FFF', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', padding: '8px 0', cursor: 'pointer' }}
                        >
                          {p === 100 ? 'MAX' : `${p}%`}
                        </button>
                      ))}
                    </div>

                    {/* $ proceeds preview ("YOU RECEIVE") + price impact */}
                    <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '12px 12px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOU RECEIVE</span>
                        <span style={{ ...SKB, fontSize: 18, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
                          ≈ {sellQuote ? usd(sellQuote.usdAmount) : '$0.00'}
                          <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{sellQuote && sellCurrency === 'ETH' ? `(${eth(sellQuote.ethAmount)})` : sellQuote ? '(USDC)' : ''}</span>
                        </span>
                      </div>
                      {/* PRICE IMPACT — mandatory on thin pools: selling moves
                          the price hard; say so plainly before the press. */}
                      {(() => {
                        if (!sellQuote || market?.priceUsd == null || sellPieces <= 0) return null;
                        const spot = sellPieces * market.priceUsd;
                        if (spot <= 0) return null;
                        const impact = Math.max(0, (spot - sellQuote.usdAmount) / spot) * 100;
                        if (impact < 0.5) return null;
                        return (
                          <p style={{ ...SKB, fontSize: 8, color: impact >= 5 ? '#FF0000' : 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '8px 0 0' }}>
                            PRICE IMPACT ≈ {impact.toFixed(1)}%{impact >= 5 ? ' — THIS POOL IS THIN; YOUR SALE MOVES THE PRICE' : ''}
                          </p>
                        );
                      })()}
                    </div>

                    {/* Receive-currency selector (same options as the buy side) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>RECEIVE</span>
                      <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.12)' }}>
                        {(['USDC', 'ETH'] as TradeCurrency[]).map((c) => (
                          <button
                            key={c}
                            onClick={() => setSellCurrency(c)}
                            style={{ ...SKB, fontSize: 10, letterSpacing: '0.08em', padding: '6px 14px', cursor: 'pointer', border: 'none', color: sellCurrency === c ? '#000' : '#FFF', background: sellCurrency === c ? '#FFF' : '#080808' }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* FIRST CUT guard */}
                    {sellEndsFirstCut && (
                      <div style={{ border: '1px solid #FF0000', padding: '12px 12px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <ApertureMark size={12} />
                        <p style={{ ...SKR, fontSize: 10, color: '#FFF', lineHeight: 1.4, margin: 0 }}>
                          This sale ends your First Cut on this post — <span style={{ color: '#FF0000', ...SKB }}>permanently.</span>
                        </p>
                      </div>
                    )}

                    {tradeError && (
                      <p style={{ ...SKR, fontSize: 10, color: '#FF0000', margin: '0 0 10px', lineHeight: 1.4 }}>{tradeError}</p>
                    )}
                    {busy ? (
                      /* THE WHEEL — pressed button transformed into narration. */
                      <div style={{ width: '100%', border: '1px solid rgba(255,0,0,0.55)', padding: '13px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
                        <FrameLoader size={22} />
                        <span style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          SELLING · {sellPieces} {sellPieces === 1 ? 'PIECE' : 'PIECES'}…
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={doSell}
                        disabled={sellPieces <= 0}
                        style={{ width: '100%', background: sellPieces <= 0 ? 'rgba(255,255,255,0.08)' : (sellEndsFirstCut && confirmEndFirstCut ? '#FF0000' : 'transparent'), border: sellPieces <= 0 ? 'none' : '1px solid #FF0000', cursor: sellPieces <= 0 ? 'default' : 'pointer', padding: '14px 0' }}
                      >
                        <span style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {sellPieces <= 0 ? 'ENTER PIECES'
                            : sellEndsFirstCut && !confirmEndFirstCut ? 'SELL — END FIRST CUT'
                            : sellEndsFirstCut && confirmEndFirstCut ? 'CONFIRM — END FIRST CUT'
                            : `SELL${sellQuote ? ` · ${usd(sellQuote.usdAmount)}` : ''}`}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── FIRST CUT provenance row ──
            ] • [ · FIRST CUT · 10 mini-avatars (18px, -7 overlap, departed 30%)
            · count (or "N OF 10 SLOTS OPEN" when slots remain) · › chevron.
            STILL MOCK (no indexer yet) → preview-flag-gated; hidden on real
            coins until founding slots come from real trade events. */}
        {economyPreviewEnabled() && (
        <div
          onClick={() => setShowSlots((v) => !v)}
          style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '12px 12px', marginTop: 18, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <ApertureMark size={12} />
            <span style={{ ...SKB, fontSize: 9, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.12em' }}>FIRST CUT</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              {openCount > 0 ? (
                <span style={{ ...SKB, fontSize: 8, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{openCount} OF 10 SLOTS OPEN</span>
              ) : (
                <span style={{ ...SKR, fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{holdingCount} HOLDING</span>
              )}
              <span style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1, transform: showSlots ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}>›</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const slot = filled.find((s) => s.position === i + 1);
              return (
                <div key={i} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                  {slot && slot.avatarUrl ? (
                    <img src={slot.avatarUrl} alt={slot.handle} style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid #080808', display: 'block', opacity: slot.holding ? 1 : 0.3, filter: slot.holding ? 'none' : 'grayscale(1)' }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.25)', background: 'transparent' }} />
                  )}
                </div>
              );
            })}
          </div>

          {showSlots && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ApertureMark size={11} />
                <span style={{ ...SKB, fontSize: 9, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.12em' }}>FIRST CUT</span>
                <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.08em' }}>THE FIRST 10 · PERMANENT</span>
              </div>
              {Array.from({ length: 10 }).map((_, idx) => {
                const pos = idx + 1;
                const slot = filled.find((s) => s.position === pos);
                const isOpen = !slot;
                const lit = slot?.holding;
                return (
                  <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: !isOpen && !lit ? 0.38 : 1 }}>
                    <span style={{ ...SKB, fontSize: 10, width: 18, color: lit ? '#FF0000' : 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>{String(pos).padStart(2, '0')}</span>
                    {isOpen ? (
                      <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>OPEN</span>
                    ) : (
                      <>
                        {slot!.avatarUrl && <img src={slot!.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                        <span style={{ ...SKR, fontSize: 10, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>@{slot!.handle}</span>
                        <span style={{ ...SKB, fontSize: 8, marginLeft: 'auto', color: lit ? '#FF0000' : 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{lit ? 'HOLDING' : 'DEPARTED'}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        </>) : (
          /* ── NOT TRADEABLE — legacy ETH-paired coin ── */
          <div style={{ border: '1px solid rgba(255,0,0,0.4)', padding: '24px 16px', textAlign: 'center', marginTop: 2 }}>
            <p style={{ ...SKB, fontSize: 12, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 12px' }}>[ NOT TRADEABLE ]</p>
            <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 auto', maxWidth: 240 }}>
              This coin uses a legacy pairing and can&rsquo;t be traded.
            </p>
          </div>
        )}

        {/* Mock-data disclaimer only — live coins carry no fake-trade caveat. */}
        {market && !market.live && (
          <p style={{ ...SKR, fontSize: 8, color: 'rgba(255,255,255,0.25)', textAlign: 'center', margin: '14px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            PREVIEW ONLY · NO REAL TRANSACTION
          </p>
        )}
      </div>

      {/* Moment 1 — First Cut flourish over the confirmation (additive). Plays
          full + holds, then its exit whips into the counter (onFlourishDone). */}
      <FirstCutFlourish show={!!firstCut} rank={firstCut?.rank} onDone={onFlourishDone} />
    </>
  );
}
