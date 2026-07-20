'use client';
// ── DESKTOP WALLET — the mobile wallet, configured for 1440 ──────────────────
// No new features/data: header band (title · TOTAL hero · three stats), two
// columns — money LEFT (baked action cards + ASSETS rows), depth RIGHT
// (HOLDINGS · EARNINGS · ACTIVITY tabs). Everything reads through the
// existing services; session caches carry over; receipt-true flows untouched.
//
// SHEETS: SwapSheet/EarningsSheet self-portal as bottom-anchored panels with
// their own 30rem max width — on desktop they present as centered-bottom
// modals. Re-seating them mid-screen would mean a presentation prop on each
// shared sheet (mobile files) — REPORTED as the resisting class, not forced.
// DEPOSIT = Privy's own funding modal (already centered). SEND = a small
// centered modal mirroring the mobile ops (validation via viem getAddress).

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useFundWallet, useWallets } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { createWalletClient, custom, getAddress, parseEther, encodeFunctionData } from 'viem';
import { publicClient, quoteSwap } from '@/lib/zoraCoins';
import { getEthBalance, getUsdcBalance, getZoraBalance, getTransactionHistoryCached } from '@/lib/wallet';
import { useEconomy } from '@/components/EconomyProvider';
import type { Holding } from '@/lib/economy/types';
import { useCountUp } from '@/lib/economy/useCountUp';
import { groupActivity, type ActivityRow } from '@/lib/walletActivity';
import { getUserByPrivyId } from '@/lib/userService';
import { getEarnings, sumAll, type EarningsData } from '@/lib/economy/earnings';
import { feedImage } from '@/lib/mediaUrl';
import EarningsSheet from '@/components/economy/EarningsSheet';
import SwapSheet, { type SwapInitial } from '@/components/SwapSheet';
import { GAS_FLOOR_ETH } from '@/lib/economy/preflight';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(229,225,219,0.12)';
const RED = '#E5E1DB';
const GREEN = '#00E08A';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const usd = (n: number | null) => (n == null ? '$—' : `$${n.toFixed(2)}`);

type Tab = 'holdings' | 'earnings' | 'activity';
type FcRewardPost = { postId: string; coinAddress: string; accruedUsd: number; unpaidUsd: number; ticker: string | null; thumb: string | null };

export default function DesktopWallet() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const economy = useEconomy();
  const walletAddress = user?.wallet?.address ?? null;

  const [eth, setEth] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [zora, setZora] = useState<number | null>(null);
  const [zoraUsd, setZoraUsd] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [fcRewards, setFcRewards] = useState<{ posts: FcRewardPost[]; totalUsd: number; unpaidUsd: number } | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('holdings');
  const [openCat, setOpenCat] = useState<'portfolio' | 'collected' | null>('portfolio');
  const [uuid, setUuid] = useState<string | null>(null);

  const [showSwap, setShowSwap] = useState(false);
  const [swapInitial, setSwapInitial] = useState<SwapInitial | null>(null);
  const [earnOpen, setEarnOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshBalances = async () => {
    if (!walletAddress) return;
    try {
      const [e, u, z, r] = await Promise.all([
        getEthBalance(walletAddress),
        getUsdcBalance(walletAddress),
        getZoraBalance(walletAddress).catch(() => null),
        economy.getEthUsdRate(),
      ]);
      setEth(parseFloat(e)); setUsdc(parseFloat(u)); setRate(r);
      if (z != null) {
        const zn = parseFloat(z);
        setZora(zn);
        if (zn > 0.01) {
          // the CREATOR EARNINGS hero — the same real full-balance quote as mobile
          quoteSwap({ sell: 'ZORA', buy: 'USDC', amountIn: BigInt(Math.floor(zn * 1e18)), sender: walletAddress as `0x${string}` })
            .then(({ amountOut }) => setZoraUsd(Number(amountOut) / 1e6))
            .catch(() => setZoraUsd(null));
        } else setZoraUsd(0);
      }
    } catch (e) { console.error('[desktop-wallet] balances error:', e); }
  };

  useEffect(() => { refreshBalances(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [walletAddress]);
  useEffect(() => {
    economy.getHoldings().then(setHoldings).catch(() => setHoldings([]));
  }, [economy]);
  useEffect(() => {
    if (!user?.id) return;
    getUserByPrivyId(user.id).then((u) => {
      if (!u) return;
      setUuid(u.id);
      getEarnings(u.id).then(setEarnings).catch(() => {});
      fetch(`/api/fc-rewards?user=${u.id}`).then((r) => r.json())
        .then((j) => setFcRewards({ posts: j.posts ?? [], totalUsd: j.totalUsd ?? 0, unpaidUsd: j.unpaidUsd ?? 0 }))
        .catch(() => setFcRewards({ posts: [], totalUsd: 0, unpaidUsd: 0 }));
    }).catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    if (tab !== 'activity' || !walletAddress || activity !== null) return;
    getTransactionHistoryCached(walletAddress)
      .then((txs) => { setActivity(groupActivity(txs as never, walletAddress, rate)); setActivityFailed(false); })
      .catch(() => setActivityFailed(true));
  }, [tab, walletAddress, activity]);

  const availableUsd = eth != null && usdc != null && rate != null ? eth * rate + usdc + (zoraUsd ?? 0) : null;
  const holdingsUsd = holdings ? holdings.reduce((s, h) => s + h.valueUsd, 0) : null;
  const totalUsd = availableUsd != null ? availableUsd + (holdingsUsd ?? 0) : null;
  const earnedUsd = earnings ? sumAll(earnings.events) : null;
  const animatedTotal = useCountUp(totalUsd);

  const byPost = earnings?.byPost ?? [];
  const heldMap = useMemo(() => new Map((holdings ?? []).map((h) => [h.postId, h])), [holdings]);

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, left: 71, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ═══ 1. HEADER BAND ═══ */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 22 }}>
          <div>
            <h1 style={{ ...SKB, fontSize: 22, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>WALLET</h1>
            <p style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 4px' }}>TOTAL BALANCE</p>
            <p style={{ ...SKB, fontSize: 40, color: '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(animatedTotal)}</p>
          </div>
          <div style={{ display: 'flex', gap: 44 }}>
            <div>
              <p style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>AVAILABLE</p>
              <p style={{ ...SKB, fontSize: 15, color: '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(availableUsd)}</p>
            </div>
            <div>
              <p style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>HOLDINGS</p>
              <p style={{ ...SKB, fontSize: 15, color: RED, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(holdingsUsd)}</p>
            </div>
            <button onClick={() => earnings && setEarnOpen(true)} style={{ background: 'transparent', border: 'none', cursor: earnings ? 'pointer' : 'default', textAlign: 'left', padding: 0 }}>
              <p style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>SCOPE EARNINGS ⓘ</p>
              <p style={{ ...SKB, fontSize: 15, color: '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(earnedUsd)}</p>
            </button>
          </div>
        </div>
        <div style={{ height: 1, background: HAIR }} />

        {/* ═══ 2. TWO COLUMNS ═══ */}
        <div style={{ display: 'flex', gap: 40, marginTop: 28 }}>
          {/* ── LEFT: money ── */}
          <div style={{ width: 420, flexShrink: 0 }}>
            {/* Cards — MOBILE'S EXACT ANATOMY: glow circle + directional arrows
                (the same SVG files/rotations) + label + mobile's exact subtext. */}
            <div style={{ display: 'flex', gap: 10 }}>
              {([
                { label: 'DEPOSIT', sub: 'Add funds to your wallet', arrows: [{ src: '/wallet-redux/arrow-deposit.svg', rot: 'rotate(90deg)' }], onClick: () => walletAddress && fundWallet(walletAddress, { chain: base }) },
                { label: 'SWAP', sub: 'USDC ⇄ ETH', arrows: [{ src: '/wallet-redux/arrow-swap-a.svg', rot: 'none' }, { src: '/wallet-redux/arrow-swap-b.svg', rot: 'rotate(180deg)' }], onClick: () => { setSwapInitial(null); setShowSwap(true); } },
                { label: 'SEND', sub: 'Send to any address', arrows: [{ src: '/wallet-redux/arrow-send.svg', rot: 'rotate(-45deg)' }], onClick: () => setSendOpen(true) },
              ] as const).map((card) => (
                <button key={card.label} onClick={card.onClick} style={{ position: 'relative', flex: 1, aspectRatio: '111 / 83', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'transparent', border: 'none', borderRadius: 3, cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
                  <img src="/wallet-redux/action-card-chrome.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
                  <span style={{ position: 'relative', width: 26, height: 26, display: 'block' }}>
                    <img src="/wallet-redux/icon-glow-circle.svg" alt="" style={{ position: 'absolute', inset: 0, width: 26, height: 26 }} />
                    {card.arrows.length === 1 ? (
                      <img src={card.arrows[0].src} alt="" style={{ position: 'absolute', left: '50%', top: '50%', width: 14, height: 8.2, transform: `translate(-50%,-50%) ${card.arrows[0].rot}` }} />
                    ) : (
                      <>
                        <img src={card.arrows[0].src} alt="" style={{ position: 'absolute', left: '50%', top: 6.5, transform: 'translateX(-50%)', width: 13, height: 7.5 }} />
                        <img src={card.arrows[1].src} alt="" style={{ position: 'absolute', left: '50%', bottom: 6.5, transform: 'translateX(-50%) rotate(180deg)', width: 13, height: 7.5 }} />
                      </>
                    )}
                  </span>
                  <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ ...SKB, fontSize: 11.5, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{card.label}</span>
                    <span style={{ ...SKR, fontSize: 9.7, color: 'rgba(229,225,219,0.68)', letterSpacing: '-0.082px' }}>{card.sub}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* ASSETS — mobile's TOKEN PANEL anatomy: the custom token circles
                (eth-token-circle + eth-logo overlay; usdc-token-circle + $),
                scope-earnings badge, balance sub-lines @0.37, › disclosures. */}
            <p style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '26px 0 6px' }}>ASSETS</p>
            <div style={{ borderTop: `1px solid ${HAIR}` }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 50, borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
                <span style={{ position: 'relative', width: 30, height: 30, flexShrink: 0, marginRight: 11 }}>
                  <img src="/wallet-redux/eth-token-circle.svg" alt="" style={{ position: 'absolute', inset: 0, width: 30, height: 30 }} />
                  <img src="/wallet-redux/eth-logo.png" alt="" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 13, height: 'auto' }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...SKR, fontSize: 13.5, color: '#E5E1DB', display: 'block' }}>ETH</span>
                  <span style={{ ...SKR, fontSize: 10.5, color: '#E5E1DB', opacity: 0.37, display: 'block', marginTop: 1 }}>{eth != null ? `${eth.toFixed(4)} ETH` : '…'}</span>
                </span>
                <span style={{ ...SKR, fontSize: 13.5, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{eth != null && rate != null ? `$${(eth * rate).toFixed(2)}` : '$—'}</span>
                <span style={{ fontFamily: 'Batang, serif', fontSize: 14.5, color: '#E5E1DB', opacity: 0.75, marginLeft: 10 }}>›</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', height: 50, borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
                <span style={{ position: 'relative', width: 30, height: 30, flexShrink: 0, marginRight: 11 }}>
                  <img src="/wallet-redux/usdc-token-circle.svg" alt="" style={{ position: 'absolute', inset: 0, width: 30, height: 30 }} />
                  <span style={{ ...SKB, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, color: '#E5E1DB' }}>$</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...SKR, fontSize: 13.5, color: '#E5E1DB', display: 'block' }}>USDC</span>
                  <span style={{ ...SKR, fontSize: 10.5, color: '#E5E1DB', opacity: 0.37, display: 'block', marginTop: 1 }}>{usdc != null ? `${usdc.toFixed(2)} USDC` : '…'}</span>
                </span>
                <span style={{ ...SKR, fontSize: 13.5, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{usdc != null ? `$${usdc.toFixed(2)}` : '$—'}</span>
                <span style={{ fontFamily: 'Batang, serif', fontSize: 14.5, color: '#E5E1DB', opacity: 0.75, marginLeft: 10 }}>›</span>
              </div>
              {/* CREATOR EARNINGS — hidden until earned (mobile parity); tap → CASH OUT */}
              {zora != null && zora > 0 && (
                <button
                  onClick={() => { setSwapInitial({ sell: 'ZORA', buy: 'USDC', amount: (Math.floor(zora * 100) / 100).toFixed(2), cashOut: true }); setShowSwap(true); }}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', height: 50, borderBottom: '1px solid rgba(229,225,219,0.08)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                >
                  <span style={{ width: 30, height: 30, flexShrink: 0, marginRight: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/scope-earnings-icon.png" alt="" style={{ width: 30, height: 'auto', display: 'block' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...SKR, fontSize: 13.5, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>Creator Earnings</span>
                    <span style={{ ...SKR, fontSize: 10.5, color: '#E5E1DB', opacity: 0.37, display: 'block', marginTop: 1 }}>{zora >= 1000 ? Math.round(zora).toLocaleString() : zora.toFixed(2)} ZORA</span>
                  </span>
                  <span style={{ ...SKR, fontSize: 13.5, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{zoraUsd != null ? `$${zoraUsd.toFixed(2)}` : '$—'}</span>
                  <span style={{ fontFamily: 'Batang, serif', fontSize: 14.5, color: '#E5E1DB', opacity: 0.75, marginLeft: 10 }}>›</span>
                </button>
              )}
            </div>

            {/* DIRECT DEPOSIT — the full live address + copy (mobile parity) */}
            {walletAddress && (
              <button
                onClick={() => { navigator.clipboard?.writeText(walletAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, marginTop: 16, background: 'rgba(229,225,219,0.03)', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '10px 12px', textAlign: 'left' }}
              >
                <span style={{ ...SKB, fontSize: 9.5, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>DIRECT DEPOSIT</span>
                <span style={{ ...SKR, fontSize: 10, color: copied ? '#00E08A' : 'rgba(229,225,219,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {copied ? 'COPIED ✓' : walletAddress}
                </span>
              </button>
            )}
          </div>

          {/* ── RIGHT: depth ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 40, borderBottom: `1px solid ${HAIR}` }}>
              {(['holdings', 'earnings', 'activity'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 9px', ...SKB, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: tab === t ? '#E5E1DB' : 'rgba(229,225,219,0.5)' }}>
                  {t.toUpperCase()}
                  {tab === t && <span style={{ position: 'absolute', left: 0, bottom: -1, width: 45, height: 1, background: `linear-gradient(90deg, ${RED} 0%, #E5E1DB 55%, ${RED} 100%)` }} />}
                </button>
              ))}
            </div>

            {/* HOLDINGS — larger thumbs (feedImage 600) */}
            {tab === 'holdings' && (
              <div style={{ paddingTop: 6 }}>
                {holdings === null ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>LOADING…</p>
                ) : holdings.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>NO POSITIONS YET</p>
                ) : holdings.map((h) => (
                  <div key={h.postId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: `1px solid ${HAIR}` }}>
                    {h.thumbUrl ? (
                      <img src={feedImage(h.thumbUrl, 600)} alt="" style={{ width: 108, height: 62, objectFit: 'cover', display: 'block', background: '#111', flexShrink: 0 }} />
                    ) : <div style={{ width: 108, height: 62, background: '#111', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...SKB, fontSize: 12.5, color: '#E5E1DB', textTransform: 'uppercase', display: 'block' }}>{h.ticker ? `[ ${h.ticker} ]` : '—'}</span>
                      <span style={{ ...SKR, fontSize: 10.5, color: 'rgba(229,225,219,0.5)', display: 'block', marginTop: 3 }}>{h.pieces.toLocaleString()} FRAGMENTS · MC {h.priceUsd != null ? usd(h.priceUsd * 10_000) : '$—'}</span>
                    </span>
                    <span style={{ ...SKB, fontSize: 13.5, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{usd(h.valueUsd)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* EARNINGS — the mobile pane's content at width; the chart lives in
                the earnings modal (the ⓘ stat), full column width here */}
            {tab === 'earnings' && (
              <div style={{ paddingTop: 6 }}>
                {([
                  ['portfolio', 'PORTFOLIO', 'CREATOR FEES', earnings ? sumAll(earnings.events) : null] as const,
                  ['collected', 'COLLECTED', fcRewards && fcRewards.unpaidUsd > 0.005 ? `$${fcRewards.unpaidUsd.toFixed(2)} PENDING` : 'FIRST CUT REWARDS', fcRewards?.totalUsd ?? null] as const,
                ]).map(([key, label, sub, total]) => (
                  <div key={key}>
                    <button onClick={() => setOpenCat(openCat === key ? null : key)} style={{ display: 'flex', width: '100%', alignItems: 'baseline', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', padding: '15px 2px 12px' }}>
                      <span style={{ ...SKB, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ ...SKR, fontSize: 9.5, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sub}</span>
                        <span style={{ ...SKB, fontSize: 14, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{total != null ? `$${total.toFixed(2)}` : '…'}</span>
                        <span style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)' }}>{openCat === key ? '−' : '+'}</span>
                      </span>
                    </button>
                    <div style={{ height: 1, background: HAIR }} />
                    {openCat === key && key === 'portfolio' && (
                      byPost.length === 0
                        ? <p style={{ ...SKR, fontSize: 10.5, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '12px 2px' }}>{earnings ? 'NO CREATOR FEES YET' : 'LOADING…'}</p>
                        : byPost.map((p) => (
                          <div key={p.postId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: `1px solid rgba(229,225,219,0.06)` }}>
                            {p.thumb ? <img src={feedImage(p.thumb, 96)} alt="" style={{ width: 62, height: 38, objectFit: 'cover', background: '#111', flexShrink: 0 }} /> : <div style={{ width: 62, height: 38, background: '#111', flexShrink: 0 }} />}
                            <span style={{ ...SKB, fontSize: 11.5, color: '#E5E1DB', textTransform: 'uppercase', flex: 1 }}>{p.ticker ? `[ ${p.ticker} ]` : '—'}</span>
                            <span style={{ ...SKB, fontSize: 12.5, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>${p.usd.toFixed(2)}</span>
                          </div>
                        ))
                    )}
                    {openCat === key && key === 'collected' && (
                      !fcRewards || fcRewards.posts.length === 0
                        ? <p style={{ ...SKR, fontSize: 10.5, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '12px 2px' }}>{fcRewards ? 'NO FIRST CUT REWARDS YET' : 'LOADING…'}</p>
                        : (
                          <>
                            {fcRewards.unpaidUsd > 0.005 && (
                              <p style={{ ...SKR, fontSize: 9.5, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 2px 0' }}>
                                ${fcRewards.unpaidUsd.toFixed(2)} ACCRUED · PAYS OUT WEEKLY
                              </p>
                            )}
                            {fcRewards.posts.map((p) => {
                              const pos = heldMap.get(p.postId);
                              return (
                                <div key={p.postId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: `1px solid rgba(229,225,219,0.06)` }}>
                                  {p.thumb ? <img src={feedImage(p.thumb, 96)} alt="" style={{ width: 62, height: 38, objectFit: 'cover', background: '#111', flexShrink: 0 }} /> : <div style={{ width: 62, height: 38, background: '#111', flexShrink: 0 }} />}
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ ...SKB, fontSize: 11.5, color: '#E5E1DB', textTransform: 'uppercase', display: 'block' }}>{p.ticker ? `[ ${p.ticker} ]` : '—'}</span>
                                    <span style={{ ...SKR, fontSize: 9.5, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase' }}>{pos ? `POSITION $${pos.valueUsd.toFixed(2)}` : 'POSITION EXITED'}</span>
                                  </span>
                                  <span style={{ textAlign: 'right' }}>
                                    <span style={{ ...SKB, fontSize: 12.5, color: p.accruedUsd - p.unpaidUsd > 0.005 ? GREEN : 'rgba(229,225,219,0.75)', fontVariantNumeric: 'tabular-nums', display: 'block' }}>${p.accruedUsd.toFixed(2)}</span>
                                    {p.unpaidUsd > 0.005 && <span style={{ ...SKR, fontSize: 9, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }}>· ${p.unpaidUsd.toFixed(2)} PENDING</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </>
                        )
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ACTIVITY */}
            {tab === 'activity' && (
              <div style={{ paddingTop: 6 }}>
                {activityFailed ? (
                  <button onClick={() => { setActivity(null); setActivityFailed(false); }} style={{ ...SKB, fontSize: 11, color: RED, textTransform: 'uppercase', background: 'transparent', border: `1px solid ${HAIR}`, cursor: 'pointer', padding: '10px 16px', margin: '16px 0' }}>
                    COULDN’T LOAD ACTIVITY — RETRY
                  </button>
                ) : activity === null ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>LOADING…</p>
                ) : activity.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>NO ACTIVITY YET</p>
                ) : activity.map((row) => {
                  const title = row.kind === 'buy' ? `COLLECTED${row.ticker ? ` [ ${row.ticker} ]` : ''}`
                    : row.kind === 'sell' ? `SOLD${row.ticker ? ` [ ${row.ticker} ]` : ''}`
                    : row.kind === 'mint' ? `MINTED${row.ticker ? ` [ ${row.ticker} ]` : ''}`
                    : row.kind === 'send' ? `SENT${row.counterparty ? ` → ${row.counterparty}` : ''}`
                    : `RECEIVED${row.counterparty ? ` ← ${row.counterparty}` : ''}`;
                  const sub = [row.fragments ? `${row.fragments.toLocaleString()} FRAGMENTS` : null, row.date].filter(Boolean).join(' · ');
                  const amount = row.usd != null ? `$${row.usd.toFixed(2)}` : row.cashAmount != null ? `${row.cashAmount.toFixed(row.cashAsset === 'ETH' ? 5 : 2)} ${row.cashAsset ?? ''}` : '';
                  return (
                    <div key={row.hash} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${HAIR}` }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ ...SKB, fontSize: 11.5, color: '#E5E1DB', textTransform: 'uppercase', display: 'block' }}>{title}</span>
                        <span style={{ ...SKR, fontSize: 9.5, color: 'rgba(229,225,219,0.45)', display: 'block', marginTop: 2 }}>{sub}</span>
                      </span>
                      <span style={{ ...SKB, fontSize: 12.5, color: row.kind === 'receive' || row.kind === 'sell' ? GREEN : '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 3. SHEETS ═══ */}
      {showSwap && (
        <SwapSheet
          visible={showSwap}
          onClose={() => { setShowSwap(false); setSwapInitial(null); }}
          ethBalance={eth ?? 0}
          usdcBalance={usdc ?? 0}
          zoraBalance={zora ?? 0}
          onSwapped={refreshBalances}
          initial={swapInitial ?? undefined}
        />
      )}
      {earnOpen && earnings && <EarningsSheet data={earnings} onClose={() => setEarnOpen(false)} />}
      {sendOpen && walletAddress && (
        <SendModal
          walletAddress={walletAddress}
          eth={eth ?? 0}
          usdc={usdc ?? 0}
          rate={rate}
          wallets={wallets}
          onDone={() => { setSendOpen(false); refreshBalances(); }}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  );
}

// ── SEND — a small centered modal mirroring the mobile ops (viem validation,
// same tx primitives; receipt-true: balances re-read after confirmation). ──
function SendModal({
  walletAddress, eth, usdc, rate, wallets, onDone, onClose,
}: {
  walletAddress: string;
  eth: number; usdc: number; rate: number | null;
  wallets: ReturnType<typeof useWallets>['wallets'];
  onDone: () => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState<'ETH' | 'USDC'>('USDC');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const validAddr = useMemo(() => { try { getAddress(to); return true; } catch { return false; } }, [to]);
  const amt = parseFloat(amount);
  const max = token === 'ETH' ? Math.max(0, eth - GAS_FLOOR_ETH) : usdc;
  const validAmt = isFinite(amt) && amt > 0 && amt <= max;

  const send = async () => {
    if (!validAddr || !validAmt || state === 'sending') return;
    setState('sending'); setError(null);
    try {
      const w = wallets.find((x) => x.address.toLowerCase() === walletAddress.toLowerCase());
      if (!w) throw new Error('wallet unavailable');
      const provider = await w.getEthereumProvider();
      const client = createWalletClient({ chain: base, transport: custom(provider) });
      const dest = getAddress(to);
      const hash = token === 'ETH'
        ? await client.sendTransaction({ account: getAddress(walletAddress), to: dest, value: parseEther(amount) })
        : await client.sendTransaction({
            account: getAddress(walletAddress), to: getAddress(USDC),
            data: encodeFunctionData({
              abi: [{ type: 'function', name: 'transfer', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' }],
              functionName: 'transfer', args: [dest, BigInt(Math.round(amt * 1e6))],
            }),
          });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== 'success') throw new Error('transaction reverted');
      onDone();
    } catch (e) {
      setState('error');
      setError((e as Error).message?.slice(0, 80) ?? 'send failed');
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 620 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 480, background: '#080808', border: '1px solid rgba(229,225,219,0.14)', padding: 24 }}>
        <p style={{ ...SKB, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>SEND</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['USDC', 'ETH'] as const).map((t) => (
            <button key={t} onClick={() => setToken(t)} style={{ ...SKB, fontSize: 10.5, color: token === t ? '#000' : 'rgba(229,225,219,0.6)', background: token === t ? '#E5E1DB' : 'transparent', border: '1px solid rgba(229,225,219,0.2)', cursor: 'pointer', padding: '6px 14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t}</button>
          ))}
          <span style={{ marginLeft: 'auto', ...SKR, fontSize: 10, color: 'rgba(229,225,219,0.45)', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
            MAX {token === 'ETH' ? `${max.toFixed(5)} ETH` : `$${max.toFixed(2)}`}
          </span>
        </div>
        <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x RECIPIENT ADDRESS" style={{ ...SKR, fontSize: 12, color: validAddr || !to ? '#E5E1DB' : RED, background: 'rgba(229,225,219,0.04)', border: `1px solid ${to && !validAddr ? 'rgba(229,225,219,0.5)' : 'rgba(229,225,219,0.12)'}`, outline: 'none', padding: '10px 12px', width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={token === 'ETH' ? 'AMOUNT (ETH)' : 'AMOUNT (USDC)'} style={{ ...SKR, fontSize: 12, color: '#E5E1DB', background: 'rgba(229,225,219,0.04)', border: '1px solid rgba(229,225,219,0.12)', outline: 'none', padding: '10px 12px', width: '100%', boxSizing: 'border-box' }} />
        {token === 'ETH' && rate != null && isFinite(amt) && amt > 0 && (
          <p style={{ ...SKR, fontSize: 9.5, color: 'rgba(229,225,219,0.45)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }}>≈ ${(amt * rate).toFixed(2)}</p>
        )}
        {error && <p style={{ ...SKR, fontSize: 10, color: RED, textTransform: 'uppercase', margin: '10px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...SKB, flex: 1, fontSize: 11, color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid rgba(229,225,219,0.18)', cursor: 'pointer', padding: '11px 0' }}>CANCEL</button>
          <button onClick={send} disabled={!validAddr || !validAmt || state === 'sending'} style={{ ...SKB, flex: 1, fontSize: 11, color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#E5E1DB', border: 'none', cursor: validAddr && validAmt ? 'pointer' : 'default', padding: '11px 0', opacity: validAddr && validAmt ? 1 : 0.4 }}>
            {state === 'sending' ? 'SENDING…' : 'SEND'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
