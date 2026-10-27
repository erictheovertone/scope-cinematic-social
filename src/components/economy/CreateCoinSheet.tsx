'use client';
// ── CreateCoinSheet — idempotent "Create coin" retry (proposal §5) ───────────
//
// For the author's own COIN-PENDING post (posted, but the coin failed or was
// skipped). Same coin flow as CreatePostFlow, reusable here so a failure never
// strands the post — it's retryable from the profile. RECONCILE-FIRST: if a
// createCoin tx hash was persisted, we check whether the coin actually landed
// and BACK-FILL instead of re-creating (the unique index on coin_address is the
// backstop). Reuses the same wallet + ticker rules.

import { useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import { createScopeCoin, backOwnCoin, reconcileCoinFromTx, coinImageUrl, streamHlsUrl, HLS_MIME } from '@/lib/zoraCoins';
import { updatePostCoinData, updatePostCoinTxHash } from '@/lib/postsService';
import { suggestTicker, normalizeTicker, isValidTicker, tickerError } from '@/lib/economy/ticker';
import { sanitizeDecimalInput } from '@/lib/amountInput'; // C3-15: comma/period decimal entry (iOS)
import ScopeLoader from '@/components/ScopeLoader';
import { onCoinConfirmed } from '@/lib/coinCreatedStore';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface PostLike {
  id: string;
  user_id: string;
  caption?: string | null;
  media_urls?: string[];
  poster_url?: string | null;
  autoplay_clip_url?: string | null;
  media_type?: string | null;
  ticker?: string | null;
  coin_tx_hash?: string | null;
  coin_currency?: string | null;
}

export default function CreateCoinSheet({
  post, visible, onClose, onDone,
}: {
  post: PostLike;
  visible: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { wallets } = useWallets();
  const [ticker, setTicker] = useState(() => normalizeTicker(post.ticker || suggestTicker(post.caption || '')));
  const [selfBuyUsd, setSelfBuyUsd] = useState('');
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Slim signature narration during the multi-signature sequence.
  const [narration, setNarration] = useState<string | null>(null);
  // CEL-1 — the celebration is the app-root <CoinCreatedSheet/> (coinCreatedStore). This
  // sheet fires onCoinConfirmed(result) at the receipt point, then closes (unchanged).
  const fireCoinCreated = (sym: string, address: string, hash: string) => {
    const pp = post as unknown as { stream_playback_url?: string | null; stream_poster_url?: string | null; thumbnail_url?: string | null; layout_id?: string | null; crop_x?: number; crop_y?: number; crop_width?: number; crop_height?: number };
    const isVid = post.media_type === 'video';
    onCoinConfirmed({
      post: {
        id: post.id,
        userId: post.user_id,
        title: post.caption || 'Scope Post',
        layoutId: pp.layout_id ?? '',
        mediaType: isVid ? 'video' : 'image',
        mediaUrl: isVid ? (pp.stream_playback_url ?? post.media_urls?.[0] ?? null) : (post.media_urls?.[0] ?? null),
        posterUrl: isVid ? (pp.stream_poster_url ?? post.poster_url ?? pp.thumbnail_url ?? null) : null,
        cropX: pp.crop_x, cropY: pp.crop_y, cropWidth: pp.crop_width, cropHeight: pp.crop_height,
        deckName: null,
      },
      coin: { symbol: sym, address },
      receipt: { hash, chainLabel: 'Base' },
    });
    onDone?.();
    onClose();
  };

  const run = async () => {
    const sym = normalizeTicker(ticker);
    if (!isValidTicker(sym)) { setTicker(sym); return; }
    setPhase('working');
    setError(null);
    // TRANSACTION PRESENCE: narrate from the first signature (the pressed
    // button transforms into the wheel — see the working-state render).
    const plannedBuy = parseFloat(selfBuyUsd);
    setNarration(isFinite(plannedBuy) && plannedBuy > 0 ? '1 OF 2 — CREATING YOUR COIN…' : 'CREATING YOUR COIN…');
    try {
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) throw new Error('No wallet found');
      await embeddedWallet.switchChain(base.id);
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: embeddedWallet.address as `0x${string}`, chain: base, transport: custom(provider) });

      // RECONCILE-FIRST: a prior attempt may have actually landed the coin.
      if (post.coin_tx_hash) {
        const existing = await reconcileCoinFromTx(post.coin_tx_hash);
        if (existing) {
          await updatePostCoinData(post.id, {
            coin_address: existing,
            ticker: sym,
            coin_tx_hash: post.coin_tx_hash,
            coin_currency: post.coin_currency || 'ETH',
          });
          setPhase('done');
          fireCoinCreated(sym, existing, post.coin_tx_hash); // receipt-confirmed (reconciled tx)
          return;
        }
      }

      // Brief V2e — the SAME four-link chain as the publish path (one function). By retry
      // time the webhook has usually landed stream_poster_url (link 3); else the constructed
      // Stream thumbnail (link 4). Guard is the backstop. Photos keep media_urls[0].
      const p = post as { poster_url?: string | null; thumbnail_url?: string | null; stream_poster_url?: string | null; stream_uid?: string | null };
      const image = post.media_type === 'video'
        ? (coinImageUrl({ thumbnailUrl: p.thumbnail_url, posterUrl: p.poster_url, streamPosterUrl: p.stream_poster_url, streamUid: p.stream_uid }) ?? '')
        : (post.media_urls?.[0] ?? '');
      const { coinAddress, hash, currency } = await createScopeCoin({
        walletClient,
        creatorAddress: embeddedWallet.address,
        post: {
          id: post.id,
          userId: post.user_id,
          name: post.caption || 'Scope Post',
          description: post.caption || '',
          symbol: sym,
          image,
          animationUrl: post.media_type === 'video' ? streamHlsUrl(p.stream_uid) : null,
          mimeType: post.media_type === 'video' ? HLS_MIME : undefined,
          streamUid: post.media_type === 'video' ? p.stream_uid : null, // C3-16 — route recovers image
        },
      });
      await updatePostCoinTxHash(post.id, hash).catch(() => {});
      await updatePostCoinData(post.id, { coin_address: coinAddress, ticker: sym, coin_tx_hash: hash, coin_currency: currency });
      setPhase('done');

      // Backing: OUTCOME decoupled (failure never un-coins), but the signature
      // is narrated and collected while its label is on screen.
      const buyUsd = parseFloat(selfBuyUsd);
      if (isFinite(buyUsd) && buyUsd > 0) {
        setNarration(`2 OF 2 — BACKING · $${buyUsd.toFixed(2)}…`);
        try {
          const r = await Promise.race([
            backOwnCoin({ walletClient, creatorAddress: embeddedWallet.address, coinAddress, usdAmount: buyUsd }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('backing timed out')), 45000)),
          ]);
          setNarration(r.pieces != null ? `[ BACKED · ${r.pieces} FRAGMENTS ]` : '[ BACKED ]');
        } catch (e) {
          console.warn('[CreateCoinSheet] backing did not land (coin unaffected):', (e as Error)?.message);
          setNarration('BACKING DIDN’T LAND — RETRY FROM YOUR POST');
        }
      }
      // CEL-1 — receipt-confirmed live; fire the shared app-root celebration, then close.
      // (Backing is decoupled; a backing miss above never un-coins the post.)
      fireCoinCreated(sym, coinAddress, hash);
    } catch (e: any) {
      console.error('[CreateCoinSheet] failed:', e);
      setError(e?.message?.includes('SCOPE_PLATFORM_REFERRER') ? 'Coin config error — contact support.' : 'Coin creation failed. Please try again.');
      setPhase('failed');
    }
  };

  if (!visible) return null;
  const working = phase === 'working';

  return (
    <>
      <div onClick={working ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgb(var(--black-rgb) / 0.85)', zIndex: 560 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: '30rem', background: 'var(--surface-08)', borderTop: '1px solid rgb(var(--ink-rgb) / 0.08)', zIndex: 561, padding: '24px 22px calc(40px + var(--safe-bottom))' }/* X3 §3 — bottom sheet: clear the home indicator */}>
        <p style={{ ...SKB, fontSize: 'var(--fs-14)', color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>CREATE YOUR COIN</p>
        <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgb(var(--ink-rgb) / 0.55)', margin: '0 0 18px', lineHeight: 1.5 }}>
          This post is live but has no coin yet. Create it to start earning on every trade.
        </p>

        {phase === 'done' ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-12)', color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>[ FRAGMENTS CREATED ]</p>
            {narration && (
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: narration.startsWith('[') ? 'var(--ink-100)' : 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '10px 0 0' }}>{narration}</p>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgb(var(--ink-rgb) / 0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>TICKER</span>
              {/* Bracket frame, not the $ cashtag — $ appears ONLY on money. */}
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgb(var(--ink-rgb) / 0.18)', padding: '0 12px', marginTop: 6 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'var(--ink-100)' }}>[</span>
                <input value={ticker} onChange={(e) => setTicker(normalizeTicker(e.target.value))} placeholder="TICKER" maxLength={6}
                  style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'var(--ink-100)', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', caretColor: 'var(--ink-100)', border: 'none', outline: 'none', width: '100%', padding: '11px 8px', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }} />
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'var(--ink-100)' }}>]</span>
              </div>
              {tickerError(ticker) && <p style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'var(--ink-100)', margin: '6px 0 0', textTransform: 'uppercase' }}>{tickerError(ticker)}</p>}
            </div>

            <div style={{ marginBottom: 18 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgb(var(--ink-rgb) / 0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>BACK YOUR POST <span style={{ color: 'rgb(var(--ink-rgb) / 0.3)' }}>· OPTIONAL</span></span>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgb(var(--ink-rgb) / 0.18)', padding: '0 12px', marginTop: 6 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-16)', color: selfBuyUsd ? 'var(--ink-100)' : 'rgb(var(--ink-rgb) / 0.3)' }}>$</span>
                <input type="text" inputMode="decimal" value={selfBuyUsd} onChange={(e) => setSelfBuyUsd(sanitizeDecimalInput(e.target.value))} placeholder="0"
                  style={{ ...SKB, fontSize: 'var(--fs-16)', color: 'var(--ink-100)', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', caretColor: 'var(--ink-100)', border: 'none', outline: 'none', width: '100%', padding: '11px 6px' }} />
              </div>
            </div>

            {error && <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'var(--danger)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{error}</p>}

            {working ? (
              /* THE WHEEL — pressed button transformed into live narration. */
              <div style={{ width: '100%', border: '1px solid rgb(var(--ink-rgb) / 0.55)', padding: '13px 0', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 46 }}>
                <ScopeLoader size="sm" />
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {narration ?? 'CREATING YOUR COIN…'}
                </span>
              </div>
            ) : (
              <button onClick={run} disabled={!isValidTicker(ticker)}
                style={{ width: '100%', background: !isValidTicker(ticker) ? 'rgb(var(--ink-rgb) / 0.4)' : 'var(--ink-100)', border: 'none', cursor: !isValidTicker(ticker) ? 'default' : 'pointer', padding: '14px 0', marginBottom: 8 }}>
                {/* Brief X2 §3 — the ENABLED state fills solid ivory → its label must go charcoal
                    (--on-ink); the disabled state is a translucent grey where ivory reads fine. */}
                <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: isValidTicker(ticker) ? 'var(--on-ink)' : 'var(--ink-100)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {/* Amount = the consented spend; "BACK" banned from the button. */}
                  {!isValidTicker(ticker) ? 'ENTER A TICKER'
                    : (() => { const b = parseFloat(selfBuyUsd); return isFinite(b) && b > 0 ? `CREATE COIN · $${b.toFixed(2)}` : 'CREATE COIN'; })()}
                </span>
              </button>
            )}
            <button onClick={onClose} disabled={working} style={{ width: '100%', background: 'transparent', border: '1px solid rgb(var(--ink-rgb) / 0.12)', cursor: working ? 'default' : 'pointer', padding: '12px 0' }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgb(var(--ink-rgb) / 0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{phase === 'failed' ? 'CLOSE' : 'NOT NOW'}</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
