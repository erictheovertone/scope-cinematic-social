// ── Membership tier — the ONE client read of 'free' | 'pro' | 'augmented' (Brief AUG-1) ──────────
// The webhook writes profiles.membership_tier; access is still bounded by paid_member_until (a
// lapsed period is free whatever the column says). Augmented INCLUDES Pro: every existing Pro
// gate keeps reading isProMember, which an Augmented member passes.
//
// useAugmented(userIds) is the brass-treatment read for OTHER people (post rows, comments,
// Arrival): one batched, module-cached profiles query per set of new ids, never one per row.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { isProMember } from "@/lib/userService";

export type Tier = "free" | "pro" | "augmented";

type TierRow = { membership_tier?: string | null; paid_member_until?: string | null } | null | undefined;

export function tierOf(p: TierRow): Tier {
  if (!isProMember(p ?? undefined)) return "free";
  return p?.membership_tier === "augmented" ? "augmented" : "pro";
}

// ── batched lookup for other users ──
const known = new Map<string, boolean>();        // user_id → is augmented (active)
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function flush() {
  flushTimer = null;
  const ids = [...pending];
  pending.clear();
  if (!ids.length) return;
  supabase
    .from("profiles").select("user_id, membership_tier, paid_member_until")
    .in("user_id", ids)
    .then(({ data, error }) => {
      // Pre-migration (no membership_tier column) → everyone reads as not-augmented, quietly.
      for (const id of ids) known.set(id, false);
      if (!error) for (const r of (data ?? []) as { user_id: string }[]) known.set(r.user_id, tierOf(r as TierRow) === "augmented");
      listeners.forEach((l) => l());
    });
}

function request(ids: string[]) {
  let added = false;
  for (const id of ids) if (id && !known.has(id) && !pending.has(id)) { pending.add(id); added = true; }
  if (added && !flushTimer) flushTimer = setTimeout(flush, 16); // coalesce one render's worth of rows
}

/** Is this user an active Augmented member? (false until resolved — no flash of brass.) */
export function isAugmentedCached(userId: string | null | undefined): boolean {
  return !!userId && known.get(userId) === true;
}

/** Subscribe a component to the augmented status of these users. */
export function useAugmented(userIds: (string | null | undefined)[]): (userId: string | null | undefined) => boolean {
  const [, bump] = useState(0);
  const key = userIds.filter(Boolean).join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    request(ids);
    return () => { listeners.delete(l); };
  }, [key]);
  return isAugmentedCached;
}

/** Drop a cached answer (after the viewer's own purchase). */
export function forgetTier(userId: string) { known.delete(userId); }
