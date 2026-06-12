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
import { createScopeCoin, backOwnCoin, reconcileCoinFromTx } from '@/lib/zoraCoins';
import { updatePostCoinData, updatePostCoinTxHash } from '@/lib/postsService';
import { suggestTicker, normalizeTicker, isValidTicker, tickerError } from '@/lib/economy/ticker';

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

  const run = async () => {
    const sym = normalizeTicker(ticker);
    if (!isValidTicker(sym)) { setTicker(sym); return; }
    setPhase('working');
    setError(null);
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
          onDone?.();
          return;
        }
      }

      const image = (post.media_type === 'video' ? post.poster_url : null) || post.media_urls?.[0] || '';
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
          animationUrl: post.media_type === 'video' ? post.autoplay_clip_url : null,
          mimeType: post.media_type === 'video' ? 'video/mp4' : undefined,
        },
      });
      await updatePostCoinTxHash(post.id, hash).catch(() => {});
      await updatePostCoinData(post.id, { coin_address: coinAddress, ticker: sym, coin_tx_hash: hash, coin_currency: currency });
      setPhase('done');

      const buyUsd = parseFloat(selfBuyUsd);
      if (isFinite(buyUsd) && buyUsd > 0) {
        try { await backOwnCoin({ walletClient, creatorAddress: embeddedWallet.address, coinAddress, usdAmount: buyUsd }); }
        catch (e) { console.error('[CreateCoinSheet] self-buy failed (coin created):', e); }
      }
      onDone?.();
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
      <div onClick={working ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 560 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 375, background: '#080808', borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 561, padding: '24px 22px 40px' }}>
        <p style={{ ...SKB, fontSize: 14, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px' }}>CREATE YOUR COIN</p>
        <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '0 0 18px', lineHeight: 1.5 }}>
          This post is live but has no coin yet. Create it to start earning on every trade.
        </p>

        {phase === 'done' ? (
          <p style={{ ...SKB, fontSize: 11, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', padding: '14px 0' }}>COINED ✓</p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>TICKER</span>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.18)', padding: '0 12px', marginTop: 6 }}>
                <span style={{ ...SKB, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>$</span>
                <input value={ticker} onChange={(e) => setTicker(normalizeTicker(e.target.value))} placeholder="TICKER" maxLength={6}
                  style={{ ...SKB, fontSize: 16, color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '11px 6px', letterSpacing: '0.08em', textTransform: 'uppercase' }} />
              </div>
              {tickerError(ticker) && <p style={{ ...SKR, fontSize: 9, color: '#FF0000', margin: '6px 0 0', textTransform: 'uppercase' }}>{tickerError(ticker)}</p>}
            </div>

            <div style={{ marginBottom: 18 }}>
              <span style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>BACK YOUR POST <span style={{ color: 'rgba(255,255,255,0.3)' }}>· OPTIONAL</span></span>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.18)', padding: '0 12px', marginTop: 6 }}>
                <span style={{ ...SKB, fontSize: 16, color: selfBuyUsd ? '#FFF' : 'rgba(255,255,255,0.3)' }}>$</span>
                <input inputMode="decimal" value={selfBuyUsd} onChange={(e) => setSelfBuyUsd(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0"
                  style={{ ...SKB, fontSize: 16, color: '#FFF', background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '11px 6px' }} />
              </div>
            </div>

            {error && <p style={{ ...SKR, fontSize: 10, color: '#FF0000', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{error}</p>}

            <button onClick={run} disabled={working || !isValidTicker(ticker)}
              style={{ width: '100%', background: (working || !isValidTicker(ticker)) ? 'rgba(255,0,0,0.4)' : '#FF0000', border: 'none', cursor: (working || !isValidTicker(ticker)) ? 'default' : 'pointer', padding: '14px 0', marginBottom: 8 }}>
              <span style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {working ? 'CREATING COIN…' : !isValidTicker(ticker) ? 'ENTER A TICKER' : 'CREATE COIN'}
              </span>
            </button>
            <button onClick={onClose} disabled={working} style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: working ? 'default' : 'pointer', padding: '12px 0' }}>
              <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{phase === 'failed' ? 'CLOSE' : 'NOT NOW'}</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
