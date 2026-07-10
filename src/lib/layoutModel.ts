// ── LAYOUT MODEL — AR is ONE shared value; COUNT is per-surface ──────────────
// Replaces the desktop_layout blob. THE single resolver both platforms read.
//
// Storage (new columns; nullable → legacy fallback preserves existing choices):
//   profiles.aspect_ratio  text  — SHARED: scope | pana-wide | cine-wide | legacy | collage
//   profiles.mobile_count  int   — 1 or 2
//   profiles.desktop_count int   — 3, 4, or 5
//
// COUNT MATRIX (derive the unset surface from the set one; an explicit write
// pins a surface so the other never overwrites it — symmetric override):
//   mobile 1 → desktop 3 · mobile 2 → desktop 4
//   desktop 3 → mobile 1 · desktop 4|5 → mobile 2
// AR has NO matrix — it is simply shared.

import { chipForLayout, AR_CHIPS } from '@/lib/aspectRatio';
import { updateProfileFields } from '@/lib/userService';

export type AspectId = 'scope' | 'pana-wide' | 'cine-wide' | 'legacy' | 'collage';
export const ASPECTS: AspectId[] = ['scope', 'pana-wide', 'cine-wide', 'legacy', 'collage'];
export const MOBILE_COUNTS = [1, 2] as const;
export const DESKTOP_COUNTS = [3, 4, 5] as const;

export interface ResolvedLayout {
  aspect: AspectId;
  mobileCount: number;  // 1 | 2
  desktopCount: number; // 3 | 4 | 5
}

type ProfileLike = {
  aspect_ratio?: string | null;
  mobile_count?: number | null;
  desktop_count?: number | null;
  // legacy fallback sources (pre-migration):
  grid_layout?: string | null;
  desktop_layout?: unknown;
} | null | undefined;

const isAspect = (v: unknown): v is AspectId => typeof v === 'string' && (ASPECTS as string[]).includes(v);
const numOr = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

// THE COUNT MATRIX.
export const desktopFromMobile = (m: number): number => (m === 1 ? 3 : 4);
export const mobileFromDesktop = (d: number): number => (d === 3 ? 1 : 2);

/** Canonical legacy grid_layout id for a shared aspect × mobile count — the
 *  bridge for the many mobile readers still on grid_layout (public profile,
 *  PostItem, create). Both pickers write this as the "legacy mirror". */
export function legacyLayoutId(aspect: AspectId, mobileCount: number): string {
  if (aspect === 'collage') return 'collage';
  if (aspect === 'legacy') return 'legacy';
  const short = aspect === 'pana-wide' ? 'pana' : aspect === 'cine-wide' ? 'cine' : aspect;
  return `${mobileCount}x-${short}`;
}

/** Numeric W/H ratio for the SHARED aspect — used by the uniform profile grids.
 *  collage has no single ratio (mixed) → falls back to scope for uniform tiles. */
export function ratioForAspect(a: AspectId): number {
  if (a === 'collage') return 2.39;
  const chip = AR_CHIPS.find((c) => c.id === a);
  return chip ? chip.ratio : 2.39;
}

// Legacy mobile grid_layout string → { aspect, count }. Preserves the pre-model choice.
function parseLegacyMobile(gl: string | null | undefined): { aspect: AspectId | null; count: number | null } {
  if (!gl) return { aspect: null, count: null };
  if (gl === 'collage') return { aspect: 'collage', count: 2 };
  const g = gl.toLowerCase();
  const count = g.startsWith('1x') ? 1
    : (g.startsWith('2x') || g.startsWith('3x') || g.includes('2col') || g.includes('-2x')) ? 2
    : null;
  const id = chipForLayout(gl).id;
  const aspect = (ASPECTS as string[]).includes(id) ? (id as AspectId) : null;
  return { aspect, count };
}

// Legacy desktop_layout blob → { aspect, count }.
function parseLegacyDesktop(dl: unknown): { aspect: AspectId | null; count: number | null } {
  const d = dl as { aspect?: string; count?: number } | null;
  if (!d) return { aspect: null, count: null };
  const aspect = isAspect(d.aspect) ? d.aspect : null;
  const count = d.count === 3 || d.count === 4 || d.count === 5 ? d.count : null;
  return { aspect, count };
}

/** THE resolver — both surfaces read through this. New fields win; else legacy;
 *  else the count matrix; else the platform default. */
export function resolveLayout(profile: ProfileLike): ResolvedLayout {
  const p = profile ?? {};
  const legM = parseLegacyMobile(p.grid_layout);
  const legD = parseLegacyDesktop(p.desktop_layout);

  // SHARED AR — explicit shared field, else the legacy MOBILE aspect (the older
  // primary surface most users have), else the legacy desktop aspect, else scope.
  const aspect: AspectId = (isAspect(p.aspect_ratio) ? p.aspect_ratio : null)
    ?? legM.aspect ?? legD.aspect ?? 'scope';

  // COUNTS — explicit new field ?? legacy ?? matrix ?? default.
  let m = numOr(p.mobile_count) ?? legM.count ?? null;
  let d = numOr(p.desktop_count) ?? legD.count ?? null;
  if (m == null && d == null) { m = 2; d = 4; }
  else if (m == null) m = mobileFromDesktop(d as number);
  else if (d == null) d = desktopFromMobile(m as number);

  return { aspect, mobileCount: m as number, desktopCount: d as number };
}

// ── WRITERS — AR writes the shared field; COUNT writes only that surface (an
//    explicit write, so that surface no longer derives). Each invalidates the
//    profile cache (via updateProfileFields) and broadcasts so mounted grids
//    re-read live. Tolerant pre-migration (updateProfileFields throws → caught). ──
function broadcast() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('scope:layout-changed'));
}
export async function setSharedAspect(userId: string, aspect: AspectId): Promise<boolean> {
  try { await updateProfileFields(userId, { aspect_ratio: aspect }); broadcast(); return true; }
  catch (e) { console.warn('[layout] aspect save (migration pending?):', (e as Error)?.message); return false; }
}
export async function setMobileCount(userId: string, count: number): Promise<boolean> {
  try { await updateProfileFields(userId, { mobile_count: count }); broadcast(); return true; }
  catch (e) { console.warn('[layout] mobile_count save (migration pending?):', (e as Error)?.message); return false; }
}
export async function setDesktopCount(userId: string, count: number): Promise<boolean> {
  try { await updateProfileFields(userId, { desktop_count: count }); broadcast(); return true; }
  catch (e) { console.warn('[layout] desktop_count save (migration pending?):', (e as Error)?.message); return false; }
}
