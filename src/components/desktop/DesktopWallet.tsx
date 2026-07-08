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
const HAIR = 'rgba(255,255,255,0.12)';
const RED = '#f20d0d';
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
            <h1 style={{ ...SKB, fontSize: 22, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>WALLET</h1>
            <p style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 4px' }}>TOTAL BALANCE</p>
            <p style={{ ...SKB, fontSize: 40, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(animatedTotal)}</p>
          </div>
          <div style={{ display: 'flex', gap: 44 }}>
            <div>
              <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>AVAILABLE</p>
              <p style={{ ...SKB, fontSize: 15, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(availableUsd)}</p>
            </div>
            <div>
              <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>HOLDINGS</p>
              <p style={{ ...SKB, fontSize: 15, color: RED, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(holdingsUsd)}</p>
            </div>
            <button onClick={() => earnings && setEarnOpen(true)} style={{ background: 'transparent', border: 'none', cursor: earnings ? 'pointer' : 'default', textAlign: 'left', padding: 0 }}>
              <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>SCOPE EARNINGS ⓘ</p>
              <p style={{ ...SKB, fontSize: 15, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{usd(earnedUsd)}</p>
            </button>
          </div>
        </div>
        <div style={{ height: 1, background: HAIR }} />

        {/* ═══ 2. TWO COLUMNS ═══ */}
        <div style={{ display: 'flex', gap: 40, marginTop: 28 }}>
          {/* ── LEFT: money ── */}
          <div style={{ width: 420, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {([
                ['DEPOSIT', () => walletAddress && fundWallet(walletAddress, { chain: base })],
                ['SWAP', () => { setSwapInitial(null); setShowSwap(true); }],
                ['SEND', () => setSendOpen(true)],
              ] as [string, () => void][]).map(([label, action]) => (
                <button key={label} onClick={action} style={{ position: 'relative', flex: 1, aspectRatio: '111 / 83', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <img src="/wallet-redux/action-card-chrome.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
                  <span style={{ position: 'relative', ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
                </button>
              ))}
            </div>

            {/* ASSETS */}
            <p style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '26px 0 6px' }}>ASSETS</p>
            <div style={{ borderTop: `1px solid ${HAIR}` }}>
              {[
                { name: 'ETHEREUM', sub: `${eth?.toFixed(5) ?? '—'} ETH`, value: eth != null && rate != null ? eth * rate : null, icon: '/wallet-redux/eth-logo.png' },
                { name: 'USDC', sub: `${usdc?.toFixed(2) ?? '—'} USDC`, value: usdc, icon: null },
                { name: 'CREATOR EARNINGS', sub: `${zora != null ? Math.round(zora).toLocaleString() : '—'} ZORA`, value: zoraUsd, icon: '/scope-earnings-icon.png', cashout: true },
              ].map((a) => (
                <button
                  key={a.name}
                  onClick={a.cashout && zora && zora > 0.01 ? () => { setSwapInitial({ sell: 'ZORA', buy: 'USDC', amount: (Math.floor((zora ?? 0) * 100) / 100).toFixed(2), cashOut: true }); setShowSwap(true); } : undefined}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '13px 4px', borderBottom: `1px solid ${HAIR}`, background: 'transparent', border: 'none', borderBottomStyle: 'solid', cursor: a.cashout ? 'pointer' : 'default', textAlign: 'left' }}
                >
                  {a.icon ? (
                    <img src={a.icon} alt="" style={{ width: 30, height: 30, objectFit: 'contain', display: 'block' }} />
                  ) : (
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#2775CA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...SKB, fontSize: 12, color: '#FFF' }}>$</span>
                  )}
                  <span style={{ flex: 1 }}>
                    <span style={{ ...SKB, fontSize: 12.5, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>{a.name}</span>
                    <span style={{ ...SKR, fontSize: 10.5, color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: 2 }}>{a.sub}</span>
                  </span>
                  <span style={{ ...SKB, fontSize: 13, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>{usd(a.value)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── RIGHT: depth ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 40, borderBottom: `1px solid ${HAIR}` }}>
              {(['holdings', 'earnings', 'activity'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 9px', ...SKB, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: tab === t ? '#FFF' : 'rgba(255,255,255,0.5)' }}>
                  {t.toUpperCase()}
                  {tab === t && <span style={{ position: 'absolute', left: 0, bottom: -1, width: 45, height: 1, background: `linear-gradient(90deg, ${RED} 0%, #FFF 55%, ${RED} 100%)` }} />}
                </button>
              ))}
            </div>

            {/* HOLDINGS — larger thumbs (feedImage 600) */}
            {tab === 'holdings' && (
              <div style={{ paddingTop: 6 }}>
                {holdings === null ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>LOADING…</p>
                ) : holdings.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>NO POSITIONS YET</p>
                ) : holdings.map((h) => (
                  <div key={h.postId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: `1px solid ${HAIR}` }}>
                    {h.thumbUrl ? (
                      <img src={feedImage(h.thumbUrl, 600)} alt="" style={{ width: 108, height: 62, objectFit: 'cover', display: 'block', background: '#111', flexShrink: 0 }} />
                    ) : <div style={{ width: 108, height: 62, background: '#111', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...SKB, fontSize: 12.5, color: '#FFF', textTransform: 'uppercase', display: 'block' }}>{h.ticker ? `[ ${h.ticker} ]` : '—'}</span>
                      <span style={{ ...SKR, fontSize: 10.5, color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: 3 }}>{h.pieces.toLocaleString()} FRAGMENTS · MC {h.priceUsd != null ? usd(h.priceUsd * 10_000) : '$—'}</span>
                    </span>
                    <span style={{ ...SKB, fontSize: 13.5, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>{usd(h.valueUsd)}</span>
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
                      <span style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ ...SKR, fontSize: 9.5, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sub}</span>
                        <span style={{ ...SKB, fontSize: 14, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>{total != null ? `$${total.toFixed(2)}` : '…'}</span>
                        <span style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{openCat === key ? '−' : '+'}</span>
                      </span>
                    </button>
                    <div style={{ height: 1, background: HAIR }} />
                    {openCat === key && key === 'portfolio' && (
                      byPost.length === 0
                        ? <p style={{ ...SKR, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '12px 2px' }}>{earnings ? 'NO CREATOR FEES YET' : 'LOADING…'}</p>
                        : byPost.map((p) => (
                          <div key={p.postId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                            {p.thumb ? <img src={feedImage(p.thumb, 96)} alt="" style={{ width: 62, height: 38, objectFit: 'cover', background: '#111', flexShrink: 0 }} /> : <div style={{ width: 62, height: 38, background: '#111', flexShrink: 0 }} />}
                            <span style={{ ...SKB, fontSize: 11.5, color: '#FFF', textTransform: 'uppercase', flex: 1 }}>{p.ticker ? `[ ${p.ticker} ]` : '—'}</span>
                            <span style={{ ...SKB, fontSize: 12.5, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>${p.usd.toFixed(2)}</span>
                          </div>
                        ))
                    )}
                    {openCat === key && key === 'collected' && (
                      !fcRewards || fcRewards.posts.length === 0
                        ? <p style={{ ...SKR, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '12px 2px' }}>{fcRewards ? 'NO FIRST CUT REWARDS YET' : 'LOADING…'}</p>
                        : (
                          <>
                            {fcRewards.unpaidUsd > 0.005 && (
                              <p style={{ ...SKR, fontSize: 9.5, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 2px 0' }}>
                                ${fcRewards.unpaidUsd.toFixed(2)} ACCRUED · PAYS OUT WEEKLY
                              </p>
                            )}
                            {fcRewards.posts.map((p) => {
                              const pos = heldMap.get(p.postId);
                              return (
                                <div key={p.postId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                                  {p.thumb ? <img src={feedImage(p.thumb, 96)} alt="" style={{ width: 62, height: 38, objectFit: 'cover', background: '#111', flexShrink: 0 }} /> : <div style={{ width: 62, height: 38, background: '#111', flexShrink: 0 }} />}
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ ...SKB, fontSize: 11.5, color: '#FFF', textTransform: 'uppercase', display: 'block' }}>{p.ticker ? `[ ${p.ticker} ]` : '—'}</span>
                                    <span style={{ ...SKR, fontSize: 9.5, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{pos ? `POSITION $${pos.valueUsd.toFixed(2)}` : 'POSITION EXITED'}</span>
                                  </span>
                                  <span style={{ textAlign: 'right' }}>
                                    <span style={{ ...SKB, fontSize: 12.5, color: p.accruedUsd - p.unpaidUsd > 0.005 ? GREEN : 'rgba(255,255,255,0.75)', fontVariantNumeric: 'tabular-nums', display: 'block' }}>${p.accruedUsd.toFixed(2)}</span>
                                    {p.unpaidUsd > 0.005 && <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }}>· ${p.unpaidUsd.toFixed(2)} PENDING</span>}
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
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>LOADING…</p>
                ) : activity.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>NO ACTIVITY YET</p>
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
                        <span style={{ ...SKB, fontSize: 11.5, color: '#FFF', textTransform: 'uppercase', display: 'block' }}>{title}</span>
                        <span style={{ ...SKR, fontSize: 9.5, color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 2 }}>{sub}</span>
                      </span>
                      <span style={{ ...SKB, fontSize: 12.5, color: row.kind === 'receive' || row.kind === 'sell' ? GREEN : '#FFF', fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
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
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 480, background: '#080808', border: '1px solid rgba(255,255,255,0.14)', padding: 24 }}>
        <p style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>SEND</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['USDC', 'ETH'] as const).map((t) => (
            <button key={t} onClick={() => setToken(t)} style={{ ...SKB, fontSize: 10.5, color: token === t ? '#000' : 'rgba(255,255,255,0.6)', background: token === t ? '#FFF' : 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '6px 14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t}</button>
          ))}
          <span style={{ marginLeft: 'auto', ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.45)', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
            MAX {token === 'ETH' ? `${max.toFixed(5)} ETH` : `$${max.toFixed(2)}`}
          </span>
        </div>
        <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x RECIPIENT ADDRESS" style={{ ...SKR, fontSize: 12, color: validAddr || !to ? '#FFF' : RED, background: 'rgba(255,255,255,0.04)', border: `1px solid ${to && !validAddr ? 'rgba(242,13,13,0.5)' : 'rgba(255,255,255,0.12)'}`, outline: 'none', padding: '10px 12px', width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={token === 'ETH' ? 'AMOUNT (ETH)' : 'AMOUNT (USDC)'} style={{ ...SKR, fontSize: 12, color: '#FFF', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none', padding: '10px 12px', width: '100%', boxSizing: 'border-box' }} />
        {token === 'ETH' && rate != null && isFinite(amt) && amt > 0 && (
          <p style={{ ...SKR, fontSize: 9.5, color: 'rgba(255,255,255,0.45)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }}>≈ ${(amt * rate).toFixed(2)}</p>
        )}
        {error && <p style={{ ...SKR, fontSize: 10, color: RED, textTransform: 'uppercase', margin: '10px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...SKB, flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', padding: '11px 0' }}>CANCEL</button>
          <button onClick={send} disabled={!validAddr || !validAmt || state === 'sending'} style={{ ...SKB, flex: 1, fontSize: 11, color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#FFF', border: 'none', cursor: validAddr && validAmt ? 'pointer' : 'default', padding: '11px 0', opacity: validAddr && validAmt ? 1 : 0.4 }}>
            {state === 'sending' ? 'SENDING…' : 'SEND'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
