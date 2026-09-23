// ── DESKTOP LAYOUT MATRIX — aspect × count ────────────────────────────────────
//
// profiles.desktop_layout jsonb: {"aspect":"scope","count":4} | NULL.
// NULL = DERIVE from the mobile pref (profiles.grid_layout): same aspect at
// count 4; mobile collage → scope/4. THE derive lives HERE and only here.
// Explicit choices never overwrite the other surface's explicit choice; a
// desktop-first choice seeds mobile's aspect ONLY while mobile is unset.

import { supabase } from '@/lib/supabase/client';
import { invalidateProfileCache } from '@/lib/userService';
import { AR_CHIPS, chipForLayout, type ArChip } from '@/lib/aspectRatio';

export type DesktopAspect = 'pana-wide' | 'scope' | 'cine-wide' | 'legacy';
export type DesktopCount = 3 | 4 | 5;
export interface DesktopLayout { aspect: DesktopAspect; count: DesktopCount; }

/** The offered set = the four canonical AR chips (mobile's picker minus
 *  collage; 16:9 exists only as legacy layout ids, not a canonical chip). */
export const DESKTOP_ASPECTS: ArChip[] = AR_CHIPS;
export const DESKTOP_COUNTS: DesktopCount[] = [3, 4, 5];

export function chipFor(aspect: DesktopAspect): ArChip {
  return AR_CHIPS.find((c) => c.id === aspect) ?? AR_CHIPS[1];
}

/** THE derive: explicit desktop_layout wins; else mobile's aspect at 4-across;
 *  mobile collage (or nothing) → scope/4. */
export function deriveDesktopLayout(
  desktopLayout: unknown,
  mobileGridLayout: string | null | undefined,
): DesktopLayout {
  const d = desktopLayout as { aspect?: string; count?: number } | null;
  if (d && typeof d.aspect === 'string' && AR_CHIPS.some((c) => c.id === d.aspect)) {
    const count = d.count === 3 || d.count === 5 ? d.count : 4;
    return { aspect: d.aspect as DesktopAspect, count };
  }
  if (mobileGridLayout && mobileGridLayout !== 'collage') {
    const chip = chipForLayout(mobileGridLayout);
    return { aspect: chip.id as DesktopAspect, count: 4 };
  }
  return { aspect: 'scope', count: 4 };
}

/** Persist the desktop choice. Seeds mobile's aspect ONLY while mobile is
 *  unset (never overwrites an explicit mobile choice). Tolerant pre-migration. */
export async function saveDesktopLayout(userId: string, layout: DesktopLayout): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ desktop_layout: layout }).eq('user_id', userId);
  if (error) { console.warn('[desktop-layout] save failed (migration pending?):', error.message); return false; }
  // the profileCache lesson: without this, the profile re-reads STALE and the
  // new grid never shows even on a successful write.
  invalidateProfileCache(userId);
  // C1c — the grid_layout mirror is retired; desktop no longer seeds it. resolveLayout derives
  // the mobile aspect from desktop_layout when mobile is unset.
  return true;
}
