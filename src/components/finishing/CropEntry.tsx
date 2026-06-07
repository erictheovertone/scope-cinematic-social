"use client";

/**
 * CropEntry — the in-suite adapter around the SHARED CropTool.
 *
 * This is the ONE place that encodes THE RULE for in-suite re-cropping. It does
 * not fork CropTool — it only translates the post context into CropTool's props
 * (geometry in) and translates CropTool's output back (geometry out):
 *
 *   • AR gating mirrors creation EXACTLY, driven by the user's grid_layout:
 *       standard → AR LOCKED to the post's current layout_id AR (allowArChoice=false)
 *       collage  → AR UNLOCKED, all four chips selectable (allowArChoice=true)
 *     Pan / straighten / rotate are always available (CropTool handles those
 *     regardless of allowArChoice).
 *
 *   • Seeds CropTool with the post's current edit_geometry so it opens as an
 *     ADJUSTMENT (shows the existing crop), not a fresh crop.
 *
 *   • On confirm, CropTool emits (geometry, layoutId). At CREATION that layoutId
 *     becomes posts.layout_id. IN-SUITE WE DROP IT — layout_id is immutable and
 *     must NEVER be written from the finishing suite. We persist geometry only.
 *
 * Video is never canvas-baked here (CropTool itself never bakes — image baking
 * lives in editGeometry.bakeImageGeometry and is unchanged); both image and
 * video crops simply store geometry for playback/bake-time transform.
 */

import CropTool from '@/components/CropTool';
import { chipForLayout } from '@/lib/aspectRatio';
import type { EditGeometry } from '@/lib/editGeometry';

interface CropEntryProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  /** the post's current edit_geometry — the re-edit seed */
  geometry: EditGeometry;
  /** drives AR gating per THE RULE */
  gridLayout: 'standard' | 'collage';
  /** the post's immutable canonical AR. standard locks to this; NEVER written here. */
  layoutId: string;
  /** persists the adjusted geometry to edit_geometry ONLY */
  onCommit: (geometry: EditGeometry) => void;
  onCancel: () => void;
}

export default function CropEntry({
  mediaUrl, mediaType, geometry, gridLayout, layoutId, onCommit, onCancel,
}: CropEntryProps) {
  const allowArChoice = gridLayout === 'collage';
  // standard: locked to the post's layout_id AR. collage: open on the post's
  // currently-chosen per-post AR (fall back to the layout AR if unset).
  const lockedAr = chipForLayout(layoutId).id;
  const initialAr = allowArChoice ? (geometry.ar || lockedAr) : lockedAr;

  return (
    <CropTool
      mediaUrl={mediaUrl}
      mediaType={mediaType}
      allowArChoice={allowArChoice}
      initialAr={initialAr}
      initialGeometry={geometry}
      onCancel={onCancel}
      // Drop CropTool's layoutId arg on purpose — layout_id is immutable in-suite.
      onConfirm={(geom) => onCommit(geom)}
    />
  );
}
