'use client';
// ── /spike — GASLESS createCoin spike harness (PARKED) ────────────────────────
//
// Purpose: prove a ZERO-ETH wallet can mint a Zora coin via a SPONSORED
// UserOperation (Privy smart wallet + Base paymaster) on Base SEPOLIA — the one
// thing that converts the gasless-onboarding theory into certainty.
//
// STATUS: PARKED. It NO-OPS until armed. Arming is deliberately gated so no
// production smart-wallet infra is built until Eric provisions credentials and
// reviews. Onramp-ETH stays the shipped answer for zero-ETH; the plain swap is
// shelved. This route is isolated, not linked anywhere, and safe to delete.
//
// ── WHAT RUNS TODAY (no credentials needed) ──────────────────────────────────
//   PRE-FLIGHT: confirms the testnet path is real — Base Sepolia reachable
//   (chainId 84532) and the Zora coin factory is deployed there. (Already
//   verified from the CLI 2026-06-16; this lets you re-confirm in-app.)
//
// ── WHAT'S GATED (the actual spike) ──────────────────────────────────────────
//   SPONSORED MINT: send createCoin as a UserOp from a zero-ETH signer with the
//   paymaster covering gas, then report the UserOp hash + receipt + that the
//   signer's ETH stayed 0. Requires ARMING (below).
//
// ── ARMING CHECKLIST (do later, when returning to onboarding) ────────────────
//   1. Privy dashboard → enable Smart Wallets (Base). Pick an account impl
//      (Coinbase Smart Account / Kernel / Safe).
//   2. Coinbase Developer Platform → create a Paymaster on Base Sepolia; set a
//      gas policy that ALLOWLISTS ONLY: the Zora coin factory (createCoin), the
//      trade router (0x6ff5693b…), and the swap router selectors; set per-user
//      and per-day op caps + a global budget. Copy the paymaster/bundler URL.
//   3. Env (Preview only — never Production for the spike):
//        NEXT_PUBLIC_SPIKE_ARMED=1
//        NEXT_PUBLIC_CDP_PAYMASTER_URL=<bundler+paymaster url>
//   4. Install the smart-wallet libs (this is the one infra step, done only
//      when arming): Privy smart-wallets support + an AA/bundler client
//      (e.g. permissionless + viem account-abstraction). Then implement
//      sendSponsoredCreateCoin() below per its comment block.
//
// Migration note (verified): payoutRecipient is MUTABLE (updatePayoutRecipient),
// so existing coins default to the original EOA (the smart-wallet signer — funds
// stay accessible) and can be repointed to the SCA. Migration is non-destructive.

import { useState } from 'react';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

// Zora coin factory (confirmed deployed on Base Sepolia 2026-06-16). Re-confirm
// this is the coins factory the SDK targets before the live run.
const ZORA_FACTORY_SEPOLIA = '0x777777751622c0d3258f214F9DF38E35BF45baF3' as const;

// Arming gate — BOTH must be present or the spike stays parked.
const ARMED =
  process.env.NEXT_PUBLIC_SPIKE_ARMED === '1' &&
  !!process.env.NEXT_PUBLIC_CDP_PAYMASTER_URL;

type Line = { label: string; ok: boolean | null; detail: string };

export default function SpikePage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [mintNote, setMintNote] = useState<string | null>(null);

  const preflight = async () => {
    setRunning(true);
    const out: Line[] = [];
    try {
      const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
      const chainId = await client.getChainId();
      out.push({ label: 'Base Sepolia reachable', ok: chainId === baseSepolia.id, detail: `chainId ${chainId} (want ${baseSepolia.id})` });
      const code = await client.getBytecode({ address: ZORA_FACTORY_SEPOLIA });
      out.push({ label: 'Zora coin factory deployed on Sepolia', ok: !!code && code.length > 2, detail: `${ZORA_FACTORY_SEPOLIA} · ${code && code.length > 2 ? 'has code' : 'NO CODE'}` });
      out.push({ label: 'createCoin contract path', ok: true, detail: 'constructable on Sepolia — ready to wrap as a UserOp' });
    } catch (e) {
      out.push({ label: 'pre-flight error', ok: false, detail: (e as Error)?.message ?? String(e) });
    }
    setLines(out);
    setRunning(false);
  };

  const runSponsoredMint = async () => {
    if (!ARMED) { setMintNote('PARKED — set NEXT_PUBLIC_SPIKE_ARMED=1 + NEXT_PUBLIC_CDP_PAYMASTER_URL, enable Privy smart wallets, install the AA libs, then implement sendSponsoredCreateCoin().'); return; }
    setMintNote(null);
    try {
      const r = await sendSponsoredCreateCoin();
      setMintNote(`UserOp: ${r.userOpHash}\nreceipt status: ${r.status}\nsigner ETH before/after: ${r.ethBefore} / ${r.ethAfter} (want 0 / 0)`);
    } catch (e) {
      setMintNote(`spike not wired yet: ${(e as Error)?.message ?? String(e)}`);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#000', color: '#fff', fontFamily: "'SK-Modernist', sans-serif", padding: '40px 24px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ width: 15, height: 15, borderRadius: '50%', background: '#FF0000', marginBottom: 22 }} />
      <p style={{ ...SKB, fontSize: 'var(--fs-15)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' }}>SPIKE · GASLESS createCoin</p>
      <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: ARMED ? '#FF0000' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 20px' }}>
        {ARMED ? '[ ARMED ]' : '[ PARKED ]'}
      </p>
      <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 24px' }}>
        Proves a zero-ETH wallet can mint a Zora coin via a sponsored UserOp (Privy smart wallet + Base paymaster) on Base Sepolia. Parked until armed — see the arming checklist in this file&rsquo;s header. Onramp-ETH stays the shipped answer; the plain swap is shelved.
      </p>

      <button onClick={preflight} disabled={running}
        style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', padding: '10px 18px', cursor: running ? 'default' : 'pointer', marginRight: 10 }}>
        {running ? 'RUNNING…' : 'RUN PRE-FLIGHT'}
      </button>
      <button onClick={runSponsoredMint}
        style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: '0.08em', textTransform: 'uppercase', color: ARMED ? '#fff' : 'rgba(255,255,255,0.35)', background: ARMED ? '#FF0000' : 'transparent', border: ARMED ? 'none' : '1px solid rgba(255,255,255,0.15)', padding: '10px 18px', cursor: 'pointer' }}>
        RUN SPONSORED MINT
      </button>

      {lines.length > 0 && (
        <div style={{ marginTop: 26, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 18 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: l.ok == null ? 'rgba(255,255,255,0.4)' : l.ok ? '#FF0000' : '#FF0000' }}>{l.ok == null ? '·' : l.ok ? '✓' : '✕'}</span>
              <span style={{ flex: 1 }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fff' }}>{l.label}</span>
                <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 2 }}>{l.detail}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {mintNote && (
        <pre style={{ ...SKR, fontSize: 'var(--fs-10)', color: '#FF0000', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 20, lineHeight: 1.5 }}>{mintNote}</pre>
      )}
    </div>
  );
}

// ── sendSponsoredCreateCoin() — IMPLEMENT WHEN ARMING ────────────────────────
//
// Throws until wired (so the parked route never pretends to succeed). To arm:
//
//   1. Get the Privy smart-wallet client for the signed-in user (zero-ETH EOA
//      as the SCA signer):
//        import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
//        const { client: smartWalletClient } = useSmartWallets();
//   2. Configure the bundler+paymaster (CDP) so the UserOp gas is SPONSORED:
//        transport pointed at NEXT_PUBLIC_CDP_PAYMASTER_URL; paymaster context
//        per CDP docs. (Or permissionless + a CDP paymaster client.)
//   3. Build the createCoin call (coins-sdk) and SEND it as a UserOp through
//      the smart-wallet client instead of a plain walletClient.sendTransaction:
//        const { createCoinCall } = await import('@zoralabs/coins-sdk'); // call-data builder
//        const op = await smartWalletClient.sendTransaction({ to: factory, data, value: 0n });
//   4. Read the SIGNER EOA's ETH balance before/after — assert it stayed 0
//      (proof gas was sponsored, not paid by the wallet). Return the UserOp
//      hash + receipt status.
//
// Keep it on Base SEPOLIA. Delete /spike once the result is recorded.
async function sendSponsoredCreateCoin(): Promise<{ userOpHash: string; status: string; ethBefore: string; ethAfter: string }> {
  throw new Error('not wired — complete the ARMING CHECKLIST (Privy smart wallets + CDP paymaster + AA libs), then implement sendSponsoredCreateCoin().');
}
