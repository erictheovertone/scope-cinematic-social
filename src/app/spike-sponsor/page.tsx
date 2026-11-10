'use client';

// ── /spike-sponsor — BAL-0 gas-gate spike (NATIVE Privy sponsorship, App-pays, mainnet) ───────────
// Separate from /spike (the PARKED smart-wallet + CDP-paymaster Sepolia harness, left untouched).
// Prove/disprove that Privy native sponsorship (App-pays, EIP-7702, TEE) covers Scope's trades from a
// ZERO-ETH wallet, and that a USDC fee transfer to a recovery address can batch atomically with the
// trade — recording the real per-transaction cost. @privy-io/react-auth 2.25.0 exposes
// sendTransaction(input, { sponsor: true }) (verified in its d.ts) — no upgrade, no workaround.
//
// GATED THREE WAYS: (1) ?debug=spike; (2) EBERT / OVERTONE only; (3) inert until a button is pressed.
// Mainnet, real money, tiny amounts. No product code touched — this route reuses the shipped trade libs.
import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { createWalletClient, custom, getAddress, parseUnits, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { getUserByPrivyId, getProfile } from '@/lib/userService';
import { getEmbeddedAddress } from '@/lib/embeddedWallet';
import { getEthBalance, getUsdcBalance } from '@/lib/wallet';
import { buyCoin, sellCoin, readPieces, publicClient } from '@/lib/zoraCoins';

const ALLOWED = ['ebert', 'overtone'];
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const COIN = '0x084A7914CC184b2D200D722943304086c9919f26'; // OVERTONE coin (buy target)
const BUY_USD = 0.85;       // ~$1 per the brief, trimmed so A+B+C stay inside $3
const FEE_USDC = 0.05;      // the recovery fee transfer (test C)
const RECOVERY = '';        // FC payout wallet — FC_PAYOUT_PRIVATE_KEY is not in local .env.local; Eric supplies
const USDC_ABI = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }, { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }, { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const;

function debugGated(): boolean {
  if (typeof window === 'undefined') return false;
  return /(?:^|[?&])debug=spike(?:&|$)/.test(window.location.search);
}
async function ethUsd(): Promise<number | null> {
  try { const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot'); const j = await r.json(); return parseFloat(j?.data?.amount) || null; } catch { return null; }
}
const coinPieces = async (addr: string): Promise<string> => {
  try { const b = await publicClient.readContract({ address: getAddress(COIN), abi: USDC_ABI, functionName: 'balanceOf', args: [getAddress(addr)] }); return (Number(b) / 1e18).toString(); } catch { return '?'; }
};

export default function SpikeSponsor() {
  const [mounted, setMounted] = useState(false);
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const [username, setUsername] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!authenticated || !user) { setChecked(true); return; }
    let alive = true;
    (async () => { try { const u = await getUserByPrivyId(user.id); if (u && alive) { const p = await getProfile(u.id); if (alive) setUsername(p?.username ?? null); } } finally { if (alive) setChecked(true); } })();
    return () => { alive = false; };
  }, [authenticated, user]);

  const addr = getEmbeddedAddress(user, wallets);
  const say = useCallback((s: string) => { setLog((l) => [...l, s]); console.log('[spike-sponsor]', s); }, []);

  // Shared: snapshot balances, run fn, measure gas + sponsorship (ETH unchanged ⇒ sponsored).
  const measure = useCallback(async (label: string, run: () => Promise<`0x${string}`>) => {
    if (!addr) { say(`${label}: no embedded wallet`); return; }
    setBusy(label); say(`── ${label} ──`);
    const sender = getAddress(addr);
    const [ethB, usdcB, coinB, rate] = await Promise.all([getEthBalance(sender), getUsdcBalance(sender), coinPieces(sender), ethUsd()]);
    say(`before: ETH ${ethB} · USDC ${usdcB} · coin ${coinB}`);
    const t0 = performance.now();
    try {
      const hash = await run();
      const ms = Math.round(performance.now() - t0);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [ethA, usdcA, coinA] = await Promise.all([getEthBalance(sender), getUsdcBalance(sender), coinPieces(sender)]);
      const gasWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? BigInt(0));
      const gasEth = Number(gasWei) / 1e18;
      const sponsored = parseFloat(ethA) >= parseFloat(ethB); // EBERT's ETH did not drop ⇒ someone else paid gas
      say(`hash: ${hash}`);
      say(`status: ${receipt.status} · ${ms}ms · gasUsed ${receipt.gasUsed} × ${receipt.effectiveGasPrice} = ${gasEth.toExponential(4)} ETH${rate ? ` ($${(gasEth * rate).toFixed(4)})` : ''}`);
      say(`SPONSORED: ${sponsored ? 'YES ✓ (EBERT ETH unchanged)' : 'NO — EBERT paid gas'} · ETH ${ethB}→${ethA}`);
      say(`after: USDC ${usdcB}→${usdcA} · coin ${coinB}→${coinA}`);
    } catch (e) {
      say(`✗ ${label} FAILED: ${(e as Error)?.message?.slice(0, 220) ?? String(e)}`);
    } finally { setBusy(null); }
  }, [addr, say]);

  // Build the embedded viem walletClient (the shipped path, unsponsored).
  const walletClientOf = useCallback(async () => {
    const embedded = wallets.find((w) => w.walletClientType === 'privy');
    if (!embedded) throw new Error('embedded wallet not ready');
    await embedded.switchChain(base.id);
    const provider = await embedded.getEthereumProvider();
    return createWalletClient({ account: getAddress(addr!), chain: base, transport: custom(provider) });
  }, [wallets, addr]);

  // Build the trade calldata via the SDK's createTradeCall (sell USDC → buy coin).
  const quoteCall = useCallback(async () => {
    const { createTradeCall } = await import('@zoralabs/coins-sdk');
    const q: any = await createTradeCall({
      sell: { type: 'erc20', address: USDC }, buy: { type: 'erc20', address: getAddress(COIN) },
      amountIn: parseUnits(BUY_USD.toString(), 6), slippage: 0.05, sender: getAddress(addr!), recipient: getAddress(addr!),
    });
    return { to: getAddress(q.call.target), data: q.call.data as `0x${string}`, value: BigInt(q.call.value) };
  }, [addr]);

  // ── TESTS ──
  const testA = useCallback(() => measure('A · control (shipped buyCoin, unsponsored)', async () => {
    const walletClient = await walletClientOf();
    const r = await buyCoin({ walletClient, sender: getAddress(addr!), coinAddress: COIN, usdAmount: BUY_USD, currency: 'USDC' });
    return r.hash;
  }), [measure, walletClientOf, addr]);

  const testB = useCallback(() => measure('B · sponsored single (createTradeCall → useSendTransaction sponsor:true)', async () => {
    const call = await quoteCall();
    const res: any = await sendTransaction({ to: call.to, data: call.data, value: call.value }, { sponsor: true } as any);
    return (res?.hash ?? res?.transactionHash ?? res) as `0x${string}`;
  }), [measure, quoteCall, sendTransaction]);

  const testC = useCallback(async () => {
    if (!RECOVERY) { say('C · BLOCKED — recovery address not set (FC_PAYOUT_PRIVATE_KEY absent from local .env.local; Eric supplies the FC payout address)'); return; }
    // wallet_sendCalls batch: [USDC fee → recovery, USDC approve router, trade], sponsor:true.
    say('C · attempting wallet_sendCalls batch (sponsor:true)…');
    // implemented once RECOVERY is known
  }, [say]);

  const testD = useCallback(() => measure('D · sell leg (shipped sellCoin → USDC)', async () => {
    const walletClient = await walletClientOf();
    const pieces = await readPieces(COIN, getAddress(addr!));
    if (!pieces || pieces <= 0) throw new Error('nothing to sell (0 pieces held)');
    const r = await sellCoin({ walletClient, sender: getAddress(addr!), coinAddress: COIN, pieces, currency: 'USDC', slippage: 0.05 });
    return r.hash;
  }), [measure, walletClientOf, addr]);

  // ── gates ──
  if (!mounted) return <div style={{ minHeight: '100dvh', background: '#000' }} />;
  const shell = (children: React.ReactNode) => <div style={{ minHeight: '100dvh', background: '#000', color: '#fff', padding: 20, ...MONO }}>{children}</div>;
  if (!debugGated()) return shell(<>Append <b>?debug=spike</b> to open the gas-gate spike.</>);
  if (!authenticated) return shell(<>Sign in as EBERT to run the spike.</>);
  if (!checked) return shell(<>Resolving identity…</>);
  if (!username || !ALLOWED.includes(username.toLowerCase())) return shell(<><b style={{ color: '#f55' }}>Not permitted.</b> EBERT / OVERTONE only (you are {username ?? 'unknown'}).</>);

  const btn = (label: string, on: () => void) => (
    <button onClick={on} disabled={!!busy} style={{ padding: '12px 14px', background: busy ? '#222' : '#fff', color: busy ? '#888' : '#000', border: 'none', fontWeight: 700, cursor: busy ? 'default' : 'pointer', ...MONO, fontSize: 13, textAlign: 'left' }}>{label}</button>
  );

  return shell(
    <div style={{ maxWidth: 820 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>BAL-0 · gas-gate spike · {username.toUpperCase()}</div>
      <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 14 }}>embedded {addr} · buy {COIN.slice(0, 10)}… · ${BUY_USD}/trade</div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {btn('A · control — shipped buyCoin (unsponsored)', testA)}
        {btn('B · sponsored single — useSendTransaction({ sponsor:true })', testB)}
        {btn('C · sponsored batch — wallet_sendCalls [fee, approve, trade]', testC)}
        {btn('D · sell leg — shipped sellCoin', testD)}
      </div>
      <pre style={{ fontSize: 12, color: '#9f9', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7, borderTop: '1px solid #333', paddingTop: 12 }}>{log.join('\n') || '(press a test — inert until then)'}</pre>
    </div>,
  );
}
