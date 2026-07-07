// ── Cron · FIRST CUT REWARDS — WEEKLY payout (Mondays 00:15 UTC) ─────────────
//
// Accruals are REAL-TIME (in-app hook per trade; the sweep below catches
// third-party trades) — the cadence governs SETTLEMENT only.
//
// Per run: (1) SWEEP — third-party trades on FC coins accrue into the ledger
// (the in-app hook catches in-app trades; idempotency makes overlap harmless);
// (2) PAY — unpaid accruals aggregate per holder; holders at ≥ $1 get ONE ZORA
// transfer from the DEDICATED payout wallet (env key — NEVER the referrer
// wallet's); receipt-true marking (paid_at + payout_tx AFTER status success).
// Sub-$1 accruals roll forward — the THRESHOLD controls transfer count.
//
// GUARDS:
//  · KILL-SWITCH: FC_PAYOUTS_ENABLED !== 'true' → payouts pause, sweep/accruals
//    continue (the brake, no deploy). FC_REWARD_RATE env = the dial.
//  · GAS GUARD: estimated batch gas > 2% of batch value → skip payouts, roll.
//  · FLOAT GUARD: wallet can't cover the run → pay OLDEST accruals first, log
//    [fc-payout] FLOAT LOW loudly + notify the admin account, roll the rest.
//  · Chunked reads (pagination-ready); one failed transfer logs, leaves its
//    rows unpaid for the next run, never blocks other holders.
//  · RUN REPORT: holders paid, total USD, total gas, float remaining.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWalletClient, createPublicClient, http, parseAbi, getAddress, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { accrueFcTrade, zoraSpotUsd, erc20BalanceOf, ZORA_BASE } from '@/lib/economy/fcRewards';
import { swapUsd } from '@/lib/economy/firstCut';
import { GAS_FLOOR_ETH } from '@/lib/economy/preflight';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ERC20_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
// The transfer threshold — rolls sub-threshold accruals forward. Env-tunable
// (FC_PAYOUT_MIN_USD) so a live ≥$1 verification can run one lowered pass
// without a code change.
const PAYOUT_MIN_USD = Number(process.env.FC_PAYOUT_MIN_USD ?? '1');
const GAS_GUARD_FRACTION = 0.02; // skip the run if est. gas > 2% of batch value
const SWEEP_PAGES = 3;           // recent swaps per coin per run
// The sweep exists to catch trades BETWEEN runs (third-party). It is NOT the
// historical backfill (a separate, Eric-gated decision): the accrual core
// checks eligibility NOW, so accruing old trades would misattribute them to
// current holders. 26h = daily cadence + slack.
const SWEEP_WINDOW_MS = 26 * 3_600_000;
const CHUNK = 500;               // ledger read page size (holder growth never breaks a run)

/** Persist the run report — log retention (Vercel Hobby) never matters again;
 *  run history lives in the DB. Tolerant: a missing table logs and moves on. */
async function persistRun(supabase: import('@supabase/supabase-js').SupabaseClient, summary: Record<string, unknown>) {
  const { error } = await supabase.from('fc_payout_runs').insert({
    holders_paid: (summary.holdersPaid as number) ?? 0,
    total_usd: (summary.paidUsd as number) ?? 0,
    total_gas: (summary.gasEth as number) ?? 0,
    zora_float: (summary.zora_float_remaining as number | null) ?? null,
    eth_float: (summary.eth_gas_remaining as number | null) ?? null,
    skipped_reason: (summary.skipped as string) ?? (summary.payouts as string) ?? (summary.note as string) ?? null,
    swept_trades: (summary.sweptTrades as number) ?? 0,
  });
  if (error) console.warn('[fc-payout] run-row write failed (migration pending?):', error.message);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const t0 = Date.now();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // ── 1. SWEEP — accrue third-party trades on coins with active FC awards ────
  let sweptTrades = 0, sweptRows = 0;
  try {
    const { data: activeAwards } = await supabase.from('first_cut_awards').select('coin_address').is('expired_at', null);
    const coins = [...new Set((activeAwards ?? []).map((a) => a.coin_address as string))];
    if (coins.length) {
      const { data: posts } = await supabase.from('posts').select('id, coin_address').in('coin_address', coins);
      const postOf = new Map((posts ?? []).map((p) => [(p.coin_address as string), p.id as string]));
      const sdk = await import('@zoralabs/coins-sdk');
      if (process.env.ZORA_API_KEY) sdk.setApiKey(process.env.ZORA_API_KEY);
      const spot = await zoraSpotUsd();
      for (const coin of coins) {
        const postId = postOf.get(coin);
        if (!postId) continue;
        let after: string | undefined;
        for (let page = 0; page < SWEEP_PAGES; page++) {
          let res: { data?: { zora20Token?: { swapActivities?: { edges?: { node: Record<string, unknown> }[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } } } };
          try { res = await sdk.getCoinSwaps({ address: coin as `0x${string}`, chain: base.id, first: 50, after }) as typeof res; } catch { break; }
          const edges = res?.data?.zora20Token?.swapActivities?.edges ?? [];
          let sawOld = false;
          for (const e of edges) {
            const n = e.node as { transactionHash?: string; timestamp?: string; blockTimestamp?: string };
            const tx = n?.transactionHash;
            const usd = swapUsd(n);
            const ts = new Date(n?.timestamp ?? n?.blockTimestamp ?? 0).getTime() || 0;
            if (ts && Date.now() - ts > SWEEP_WINDOW_MS) { sawOld = true; continue; }
            if (!tx || usd <= 0) continue;
            try {
              const r = await accrueFcTrade(supabase, { postId, coinAddress: coin, txHash: tx, volumeUsd: usd, spotUsdPerZora: spot });
              if (r.accrued) { sweptTrades++; sweptRows += r.accrued; }
            } catch (err) { console.warn('[fc-payout] sweep accrue failed:', (err as Error).message); }
          }
          const pi = res?.data?.zora20Token?.swapActivities?.pageInfo;
          if (sawOld || !pi?.hasNextPage) break; // swaps are newest-first — stop at the window edge
          after = pi.endCursor;
        }
      }
    }
  } catch (e) { console.warn('[fc-payout] sweep failed (payouts continue):', (e as Error).message); }

  // ── 2. KILL-SWITCH ──────────────────────────────────────────────────────────
  if (process.env.FC_PAYOUTS_ENABLED !== 'true') {
    // Print the funding address even while paused (key present, payouts off) —
    // Eric funds BEFORE flipping the flag. Address only, never the key.
    let payoutAddress: string | null = null;
    try { if (process.env.FC_PAYOUT_PRIVATE_KEY) payoutAddress = privateKeyToAccount(process.env.FC_PAYOUT_PRIVATE_KEY as `0x${string}`).address; } catch { /* bad key format — leave null */ }
    const summary = { ok: true, ms: Date.now() - t0, sweptTrades, sweptRows, payouts: 'DISABLED (FC_PAYOUTS_ENABLED)', payoutAddress };
    console.log('[fc-payout] run (payouts off)', JSON.stringify(summary));
    await persistRun(supabase, summary);
    return NextResponse.json(summary);
  }
  const pk = process.env.FC_PAYOUT_PRIVATE_KEY;
  if (!pk) {
    console.warn('[fc-payout] FC_PAYOUT_PRIVATE_KEY unset — accruals continue, payouts skipped');
    const summary = { ok: true, ms: Date.now() - t0, sweptTrades, sweptRows, payouts: 'NO KEY' };
    await persistRun(supabase, summary);
    return NextResponse.json(summary);
  }
  // Address derived ONCE here so every response (incl. nothing-due) prints the
  // funding target. Address only — the key never leaves the env.
  const account = privateKeyToAccount(pk as `0x${string}`);

  // ── 3. AGGREGATE unpaid per holder (chunked; oldest-first within holder) ───
  type Row = { id: string; holder_user_id: string; holder_wallet: string; reward_usd: number; reward_zora: number | null; accrued_at: string };
  const unpaid: Row[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from('fc_rewards')
      .select('id, holder_user_id, holder_wallet, reward_usd, reward_zora, accrued_at')
      .is('paid_at', null)
      .order('accrued_at', { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) return NextResponse.json({ error: 'ledger read failed', detail: error.message }, { status: 500 });
    unpaid.push(...((data ?? []) as Row[]));
    if (!data || data.length < CHUNK) break;
  }
  const spotNow = await zoraSpotUsd();
  const byHolder = new Map<string, { wallet: string; usd: number; zora: number; rows: Row[]; oldest: string }>();
  for (const r of unpaid) {
    const e = byHolder.get(r.holder_user_id) ?? { wallet: r.holder_wallet, usd: 0, zora: 0, rows: [], oldest: r.accrued_at };
    e.usd += Number(r.reward_usd) || 0;
    // ZORA amount: trade-time valuation when recorded; current spot as fallback.
    e.zora += r.reward_zora != null ? Number(r.reward_zora) : (spotNow ? (Number(r.reward_usd) || 0) / spotNow : 0);
    e.rows.push(r);
    byHolder.set(r.holder_user_id, e);
  }
  // Oldest-first ordering ACROSS holders (the float guard's fairness rule).
  const due = [...byHolder.entries()].filter(([, e]) => e.usd >= PAYOUT_MIN_USD && e.zora > 0)
    .sort((a, b) => a[1].oldest.localeCompare(b[1].oldest));
  if (!due.length) {
    const summary = { ok: true, ms: Date.now() - t0, sweptTrades, sweptRows, holdersPaid: 0, note: `nothing ≥ $${PAYOUT_MIN_USD}` , payoutAddress: account.address, zora_float_remaining: null as number | null, eth_gas_remaining: null as number | null };
    console.log('[fc-payout] run', JSON.stringify(summary));
    await persistRun(supabase, summary);
    return NextResponse.json(summary);
  }

  // ── 4. GUARDS: gas + float ──────────────────────────────────────────────────
  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const walletClient = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') });

  const batchUsd = due.reduce((s, [, e]) => s + e.usd, 0);
  const gasPrice = await publicClient.getGasPrice().catch(() => null);
  // ERC-20 transfer ≈ 60k gas; ETH ≈ $2500 conservative if no oracle — the
  // guard only needs the ORDER OF MAGNITUDE (Base gas ≈ cents).
  const ETH_USD_CONSERVATIVE = 4000;
  const estGasUsd = gasPrice ? Number(gasPrice) * 60_000 * due.length / 1e18 * ETH_USD_CONSERVATIVE : 0;
  if (estGasUsd > batchUsd * GAS_GUARD_FRACTION) {
    console.warn(`[fc-payout] GAS HIGH — est $${estGasUsd.toFixed(4)} > 2% of batch $${batchUsd.toFixed(2)} — accruals roll`);
    const summary = { ok: true, ms: Date.now() - t0, sweptTrades, sweptRows, holdersPaid: 0, skipped: 'GAS HIGH', estGasUsd, batchUsd };
    await persistRun(supabase, summary);
    return NextResponse.json(summary);
  }
  // DUAL-ASSET FLOAT: the wallet holds the ZORA payload AND the ETH gas —
  // an ERC-20 transfer can't pay its own gas. Check BOTH before transferring.
  const floatRaw = await erc20BalanceOf(ZORA_BASE, account.address);
  const floatZora = floatRaw != null ? Number(floatRaw) / 1e18 : null;
  const ethRaw = await publicClient.getBalance({ address: account.address }).catch(() => null);
  const ethGas = ethRaw != null ? Number(ethRaw) / 1e18 : null;
  // Gas need: the shared floor (imported, never inlined) or the batch estimate,
  // whichever is larger for the planned transfer count.
  const gasNeedEth = Math.max(GAS_FLOOR_ETH, gasPrice ? Number(gasPrice) * 60_000 * due.length / 1e18 : 0);
  if (ethGas != null && ethGas < gasNeedEth) {
    console.warn(`[fc-payout] FLOAT LOW — ETH (gas): wallet ${ethGas.toFixed(6)} ETH < needed ${gasNeedEth.toFixed(6)} — skipping payouts, accruals roll`);
    const admin = process.env.SCOPE_ADMIN_USER_ID;
    if (admin) {
      await supabase.from('notifications').insert({
        recipient_id: admin, sender_id: admin, sender_username: 'SCOPE',
        type: 'market', message: `FC PAYOUT FLOAT LOW — ETH gas: ${ethGas.toFixed(5)} held, ${gasNeedEth.toFixed(5)} needed. Top up the payout wallet.`,
      }).then(({ error }) => { if (error) console.warn('[fc-payout] admin notify failed:', error.message); });
    }
    const summary = { ok: true, ms: Date.now() - t0, sweptTrades, sweptRows, holdersPaid: 0, skipped: 'FLOAT LOW (ETH gas)', eth_gas_remaining: ethGas, zora_float_remaining: floatZora, payoutAddress: account.address };
    await persistRun(supabase, summary);
    return NextResponse.json(summary);
  }
  const totalZoraDue = due.reduce((s, [, e]) => s + e.zora, 0);
  let payList = due;
  if (floatZora != null && floatZora < totalZoraDue) {
    console.warn(`[fc-payout] FLOAT LOW — ZORA (payload): wallet ${floatZora.toFixed(2)} ZORA < due ${totalZoraDue.toFixed(2)} — paying oldest first, notifying admin`);
    // fit oldest-first within the float
    let budget = floatZora;
    payList = due.filter(([, e]) => { if (e.zora <= budget) { budget -= e.zora; return true; } return false; });
    const admin = process.env.SCOPE_ADMIN_USER_ID;
    if (admin) {
      await supabase.from('notifications').insert({
        recipient_id: admin, sender_id: admin, sender_username: 'SCOPE',
        type: 'market', message: `FC PAYOUT FLOAT LOW — ZORA payload: ${floatZora.toFixed(0)} held, ${totalZoraDue.toFixed(0)} due. Top up the payout wallet.`,
      }).then(({ error }) => { if (error) console.warn('[fc-payout] admin notify failed:', error.message); });
    }
  }

  // ── 5. TRANSFERS — receipt-true, isolated per holder ───────────────────────
  let holdersPaid = 0, paidUsd = 0, gasEthTotal = 0;
  for (const [userId, e] of payList) {
    try {
      const amountRaw = BigInt(Math.floor(e.zora * 1e18));
      if (amountRaw <= BigInt(0)) continue;
      const hash = await walletClient.writeContract({
        address: ZORA_BASE as `0x${string}`, abi: ERC20_ABI, functionName: 'transfer',
        args: [getAddress(e.wallet), amountRaw],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== 'success') throw new Error(`receipt status ${receipt.status}`);
      gasEthTotal += Number(formatEther(receipt.gasUsed * (receipt.effectiveGasPrice ?? BigInt(0))));
      // Mark ONLY this holder's snapshot rows, ONLY after the receipt.
      const ids = e.rows.map((r) => r.id);
      const { error } = await supabase.from('fc_rewards')
        .update({ paid_at: new Date().toISOString(), payout_tx: hash })
        .in('id', ids).is('paid_at', null);
      if (error) console.error('[fc-payout] CRITICAL — paid but mark failed (ids):', ids.join(','), error.message);
      holdersPaid++; paidUsd += e.usd;
      // Market notification — "you got paid".
      await supabase.from('notifications').insert({
        recipient_id: userId, sender_id: userId, sender_username: 'SCOPE',
        type: 'market', message: `FIRST CUT REWARDS · $${e.usd.toFixed(2)}`,
      }).then(({ error: ne }) => { if (ne) console.warn('[fc-payout] notify failed:', ne.message); });
    } catch (err) {
      console.error(`[fc-payout] transfer FAILED for holder ${userId} (rows stay unpaid, next run retries):`, (err as Error).message);
    }
  }

  const floatAfterRaw = await erc20BalanceOf(ZORA_BASE, account.address);
  const ethAfterRaw = await publicClient.getBalance({ address: account.address }).catch(() => null);
  const summary = {
    ok: true, ms: Date.now() - t0, sweptTrades, sweptRows,
    holdersDue: due.length, holdersPaid, paidUsd: +paidUsd.toFixed(2),
    gasEth: +gasEthTotal.toFixed(6),
    zora_float_remaining: floatAfterRaw != null ? +(Number(floatAfterRaw) / 1e18).toFixed(2) : null,
    eth_gas_remaining: ethAfterRaw != null ? +(Number(ethAfterRaw) / 1e18).toFixed(6) : null,
    payoutAddress: account.address, // address ONLY — the funding target
  };
  console.log('[fc-payout] RUN REPORT', JSON.stringify(summary));
  await persistRun(supabase, summary);
  return NextResponse.json(summary);
}
