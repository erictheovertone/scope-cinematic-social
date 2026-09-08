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
import { openPostLightbox } from '@/lib/postLightbox';
import { getEmbeddedAddress } from '@/lib/embeddedWallet';
import PageTitle from '@/components/PageTitle';
import { LedgerCard, DottedLeader } from '@/components/Ledger';
import ImportAssetSheet from '@/components/ImportAssetSheet';

// Brief D17 — the ledger design's type tokens (75 Bold / 65 Medium / 55 Roman via the house
// font vars), replacing the desktop wallet's hardcoded SK-Modernist. SKB/SKR remain for the
// SEND modal only.
const FD: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 700 };
const FM: React.CSSProperties = { fontFamily: 'var(--font-medium)', fontWeight: 500 };
const FB: React.CSSProperties = { fontFamily: 'var(--font-body)', fontWeight: 400 };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'var(--hairline)';
const RED = '#E5E1DB';
const GREEN = '#00E08A';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TICON = '/design-updates-071526/token-icons';

// Brief D17 — action-card arrows: inline SVG (W2 §4 — centered + sized ~25% larger).
const ARROWS: Record<string, React.ReactNode> = {
  DEPOSIT: <svg width="28" height="28" viewBox="0 0 22 22" fill="none" stroke="rgba(229,225,219,0.82)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><line x1="11" y1="3" x2="11" y2="18" /><path d="M5 12 L11 18 L17 12" /></svg>,
  SWAP: <svg width="33" height="23" viewBox="0 0 26 18" fill="none" stroke="rgba(229,225,219,0.82)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6 H21 M17 2 L21 6 L17 10" /><path d="M23 12 H5 M9 8 L5 12 L9 16" /></svg>,
  SEND: <svg width="25" height="25" viewBox="0 0 20 20" fill="none" stroke="rgba(229,225,219,0.82)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="16" x2="15" y2="5" /><path d="M6 5 H15 V14" /></svg>,
};

// Brief D17 — the ledger right-aligned fiat value: 65 Medium "$" (0.14em gap) + 75 Bold tabular number.
const Fiat = ({ n, o = 0.9 }: { n: number | null; o?: number }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', flexShrink: 0 }}>
    <span style={{ ...FM, fontSize: 13, color: `rgba(229,225,219,${o})`, marginRight: '0.14em' }}>$</span>
    <span style={{ ...FD, fontSize: 13, color: `rgba(229,225,219,${o})`, fontVariantNumeric: 'tabular-nums' }}>{n != null ? n.toFixed(2) : '—'}</span>
  </span>
);
const TROW: React.CSSProperties = { display: 'flex', alignItems: 'center', height: 62, padding: '0 14px', boxSizing: 'border-box', borderBottom: '1px solid var(--hairline)', width: '100%' };

const usd = (n: number | null) => (n == null ? '$—' : `$${n.toFixed(2)}`);

type Tab = 'balances' | 'holdings' | 'earnings' | 'activity';
type FcRewardPost = { postId: string; coinAddress: string; accruedUsd: number; unpaidUsd: number; ticker: string | null; thumb: string | null };

export default function DesktopWallet() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const economy = useEconomy();
  // Brief W10/W10a — scope the wallet DISPLAY to the EMBEDDED wallet via the shared helper.
  const walletAddress = getEmbeddedAddress(user, wallets);

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
  const [tab, setTab] = useState<Tab>('balances');
  const [openCat, setOpenCat] = useState<'portfolio' | 'collected' | null>('portfolio');
  const [uuid, setUuid] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

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
    <div className="bg-black" style={{ position: 'fixed', inset: 0, left: 'var(--rail-w)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 'var(--shell-narrow)', margin: '0 auto', padding: '40px 24px 80px' }}/* Brief R1a §2 — capped reading surface (--shell-narrow) */>

        {/* ═══ 1. HEADER — Brief D17: PageTitle (32px, return-home logomark top-right, no bell)
            + truncated address & copy control beneath (parity with the mobile ledger header). ═══ */}
        <PageTitle title="Wallet" paddingBottom={20}>
          {walletAddress && (
            <button
              onClick={() => { navigator.clipboard?.writeText(walletAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}
              aria-label="Copy wallet address"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '6px 0 0', margin: 0, cursor: 'pointer' }}
            >
              <span style={{ ...FM, fontSize: 11, letterSpacing: 'var(--track-body)', color: copied ? GREEN : 'rgba(229,225,219,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                {copied ? 'ADDRESS COPIED ✓' : <>{walletAddress.slice(0, 6)}<span style={{ letterSpacing: '0.18em' }}>…</span>{walletAddress.slice(-4)}</>}
              </span>
              {!copied && (
                <span style={{ position: 'relative', width: 11, height: 11, flexShrink: 0, display: 'block' }}>
                  <span style={{ position: 'absolute', top: 0, left: 0, width: 7, height: 7, border: '0.5px solid rgba(229,225,219,0.5)' }} />
                  <span style={{ position: 'absolute', top: 3, left: 3, width: 7, height: 7, border: '0.5px solid rgba(229,225,219,0.5)' }} />
                </span>
              )}
            </button>
          )}
        </PageTitle>

        {/* ═══ 2. TWO COLUMNS ═══ */}
        <div style={{ display: 'flex', gap: 40, marginTop: 28 }}>
          {/* ── LEFT: money ── */}
          <div style={{ width: 420, flexShrink: 0 }}>
            {/* Brief D17 — TOTAL BALANCE ledger card (border variant): the 36px "$ 86.40" amount
                (65 Medium, space after $) over Available / Holdings / Earnings DottedLeader rows. */}
            <LedgerCard variant="border" radius={10} style={{ padding: '18px 24px 22px' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ ...FD, fontSize: 14, color: 'rgba(229,225,219,0.6)', letterSpacing: 'var(--track-body)', margin: 0 }}>Total Balance</p>
                <p style={{ margin: '8px 0 0', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  <span style={{ ...FM, fontSize: 36, color: 'var(--ink-100)', letterSpacing: '-1.8px', marginRight: '0.12em' }}>$</span>
                  <span style={{ ...FM, fontSize: 36, color: 'var(--ink-100)', letterSpacing: '-1.8px', fontVariantNumeric: 'tabular-nums' }}>{animatedTotal != null ? animatedTotal.toFixed(2) : '…'}</span>
                </p>
                <div style={{ width: 107, height: 1, background: 'var(--hairline)', margin: '12px auto 0' }} />
              </div>
              <div style={{ margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: 22 }}>
                {([
                  ['Available', availableUsd, () => setTab('balances'), false] as const,
                  ['Holdings', holdingsUsd, () => setTab('holdings'), false] as const,
                  ['Earnings', earnedUsd, () => { earnings ? setEarnOpen(true) : setTab('earnings'); }, true] as const,
                ]).map(([label, value, onClick, info]) => (
                  <button key={label} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
                      <span style={{ ...FM, fontSize: 11.8, color: 'rgba(229,225,219,0.75)', letterSpacing: 'var(--track-body)', whiteSpace: 'nowrap' }}>{label}</span>
                      {info && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 8, height: 8, border: '0.5px solid rgba(229,225,219,0.5)', transform: 'translateY(-2px)', ...FM, fontSize: 6, color: 'rgba(229,225,219,0.5)' }}>i</span>}
                    </span>
                    <DottedLeader />
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', flexShrink: 0 }}>
                      <span style={{ ...FM, fontSize: 13, color: 'rgba(229,225,219,0.79)', marginRight: '0.14em' }}>$</span>
                      <span style={{ ...FD, fontSize: 13, color: 'rgba(229,225,219,0.79)', fontVariantNumeric: 'tabular-nums' }}>{value != null ? value.toFixed(2) : '—'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </LedgerCard>

            {/* Brief D17 — action cards (gradient variant), inline-SVG arrows centered (W2 §4). */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {([
                { label: 'DEPOSIT', sub: 'Add funds to your wallet', onClick: () => walletAddress && fundWallet(walletAddress, { chain: base }) },
                { label: 'SWAP', sub: 'Convert money on scope', onClick: () => { setSwapInitial(null); setShowSwap(true); } },
                { label: 'SEND', sub: 'Send to any address', onClick: () => setSendOpen(true) },
              ] as const).map((card) => (
                <LedgerCard key={card.label} variant="gradient" radius={6} role="button" tabIndex={0} onClick={card.onClick} style={{ flex: 1, aspectRatio: '112 / 105', cursor: 'pointer', display: 'flex', flexDirection: 'column', padding: '12px 11px', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <span style={{ ...FD, fontSize: 14, letterSpacing: 'var(--track-display)', color: 'rgba(229,225,219,0.67)', textTransform: 'uppercase' }}>{card.label}</span>
                  <span style={{ ...FM, fontSize: 9.5, color: 'rgba(229,225,219,0.43)', letterSpacing: 'var(--track-body)', marginTop: 3, lineHeight: 1.2 }}>{card.sub}</span>
                  <span style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>{ARROWS[card.label]}</span>
                </LedgerCard>
              ))}
            </div>

            {/* Brief D17 — the ASSETS token rows moved to the RIGHT column's BALANCES segment
                (the ledger panel); the address + copy moved into the header (PageTitle child). */}
          </div>

          {/* ── RIGHT: depth ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Brief D17 — SEGMENT ROW (dot indicator + faint band): Balances · Holdings · Earnings · Activity. */}
            <div style={{ background: 'rgba(229,225,219,0.035)', borderRadius: 6, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 26 }}>
              {(['balances', 'holdings', 'earnings', 'activity'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: tab === t ? 'var(--ink-100)' : 'transparent', flexShrink: 0 }} />
                  <span style={{ ...FM, fontSize: 12, letterSpacing: 'var(--track-body)', color: tab === t ? 'var(--ink-100)' : 'rgba(229,225,219,0.67)' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                </button>
              ))}
            </div>

            {/* Brief D17 — the large ledger PANEL (border variant, padding 0 so the .ledger-row
                hover runs edge-to-edge). The active segment renders inside it. */}
            <LedgerCard variant="border" radius={10} style={{ marginTop: 14, padding: 0, overflow: 'hidden' }}>

            {/* BALANCES — token rows (monochrome token-icons) + empty ruled rows + ADD/IMPORT. */}
            {tab === 'balances' && (
              <>
                <div className="ledger-row" style={TROW}>
                  <img src={`${TICON}/ethereum.png`} alt="" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, marginRight: 12 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...FD, fontSize: 12, color: 'rgba(229,225,219,0.74)', margin: 0, letterSpacing: 'var(--track-body)' }}>ETHEREUM</p>
                    <p style={{ ...FB, fontSize: 10, color: 'rgba(229,225,219,0.74)', letterSpacing: '1.1px', margin: '2px 0 0' }}>{eth != null ? `${eth.toFixed(4)} ETH` : '…'}</p>
                  </div>
                  <Fiat n={eth != null && rate != null ? eth * rate : null} />
                </div>
                <div className="ledger-row" style={TROW}>
                  <img src={`${TICON}/usdc.png`} alt="" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, marginRight: 12 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...FD, fontSize: 12, color: 'rgba(229,225,219,0.74)', margin: 0, letterSpacing: 'var(--track-body)' }}>USDC</p>
                    <p style={{ ...FB, fontSize: 10, color: 'rgba(229,225,219,0.74)', letterSpacing: '1.1px', margin: '2px 0 0' }}>{usdc != null ? `${usdc.toFixed(2)} USDC` : '…'}</p>
                  </div>
                  <Fiat n={usdc} />
                </div>
                {zora != null && zora > 0 && (
                  <button
                    className="ledger-row"
                    onClick={() => { setSwapInitial({ sell: 'ZORA', buy: 'USDC', amount: (Math.floor(zora * 100) / 100).toFixed(2), cashOut: true }); setShowSwap(true); }}
                    style={{ ...TROW, background: 'transparent', border: 'none', borderBottom: '1px solid var(--hairline)', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <img src={`${TICON}/creator.png`} alt="" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, marginRight: 12 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...FD, fontSize: 12, color: 'rgba(229,225,219,0.74)', margin: 0, letterSpacing: 'var(--track-body)', textTransform: 'uppercase' }}>Creator Earnings</p>
                      <p style={{ ...FB, fontSize: 10, color: 'rgba(229,225,219,0.74)', letterSpacing: '1.1px', margin: '2px 0 0' }}>{zora >= 1000 ? Math.round(zora).toLocaleString() : zora.toFixed(2)} ZORA</p>
                    </div>
                    <Fiat n={zoraUsd} />
                  </button>
                )}
                {[0, 1].map((i) => <div key={`empty-${i}`} style={{ height: 62, borderBottom: '1px solid var(--hairline)' }} />)}
                {/* ADD / IMPORT — the final ruled row (D11's interim treatment). */}
                <button className="ledger-row" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: 62, padding: '0 14px', boxSizing: 'border-box', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ ...FM, fontSize: 10, color: 'rgba(229,225,219,0.45)', letterSpacing: 'var(--track-body)', textTransform: 'uppercase' }}>+ ADD / IMPORT ASSET</span>
                </button>
              </>
            )}

            {/* HOLDINGS — larger thumbs (feedImage 600) */}
            {tab === 'holdings' && (
              <div style={{ padding: '4px 14px' }}>
                {holdings === null ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>LOADING…</p>
                ) : holdings.length === 0 ? (
                  <p style={{ ...SKR, fontSize: 11, color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', padding: '18px 0' }}>NO POSITIONS YET</p>
                ) : holdings.map((h) => (
                  /* Brief D5 §2 — the row navigates to the held post's canonical view. The
                     holdings payload already carries postId (Holding.postId), so no query
                     addition/per-row fetch is needed. openPostLightbox is the app-wide
                     open-post-by-id path (PostLightboxHost, mounted in Providers). */
                  <button key={h.postId} onClick={() => openPostLightbox(h.postId)} className="tappable ledger-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, cursor: 'pointer' }}>
                    {h.thumbUrl ? (
                      <img src={feedImage(h.thumbUrl, 600)} alt="" style={{ width: 108, height: 62, objectFit: 'cover', display: 'block', background: '#111', flexShrink: 0 }} />
                    ) : <div style={{ width: 108, height: 62, background: '#111', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...SKB, fontSize: 12.5, color: '#E5E1DB', textTransform: 'uppercase', display: 'block' }}>{h.ticker ? `[ ${h.ticker} ]` : '—'}</span>
                      <span style={{ ...SKR, fontSize: 10.5, color: 'rgba(229,225,219,0.5)', display: 'block', marginTop: 3 }}>{h.pieces.toLocaleString()} FRAGMENTS · MC {h.priceUsd != null ? usd(h.priceUsd * 10_000) : '$—'}</span>
                    </span>
                    <span style={{ ...SKB, fontSize: 13.5, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{usd(h.valueUsd)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* EARNINGS — the mobile pane's content at width; the chart lives in
                the earnings modal (the ⓘ stat), full column width here */}
            {tab === 'earnings' && (
              <div style={{ padding: '4px 14px' }}>
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
              <div style={{ padding: '4px 14px' }}>
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
            </LedgerCard>{/* Brief D17 — close the ledger panel */}
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
      {/* Brief D17 — ADD / IMPORT ASSET sheet (the interim treatment). Presentation only — the
          persistent imported-asset LIST with live balances is the mobile's own data path; not
          re-plumbed here (flagged), so the desktop row imports via the sheet without the list. */}
      {showImport && <ImportAssetSheet visible={showImport} onClose={() => setShowImport(false)} userUuid={uuid} onAdded={() => refreshBalances()} />}
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
