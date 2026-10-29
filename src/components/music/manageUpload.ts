// ── manageUpload — the manage page's file paths (Brief MUS-1 §4) ─────────────────────────────────
// Same mechanics as ContributeMusicFlow (direct-to-storage via /api/music/sign, client-decoded
// peaks + duration), reused for "Replace audio". The replacement object is signed under a FRESH
// id — never the live track's id — because /api/music/sign upserts `<user>/<id>.<ext>`: signing
// the live id would overwrite the approved audio before review. Covers are downscaled before the
// POST (the ~4.5MB function-body cap), then baked server-side by /api/music/manage/cover.
"use client";

import { supabase } from "@/lib/supabase/client";
import { peaksFromFile } from "@/lib/waveform";
import { AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, AUDIO_MIME_EXT } from "@/lib/musicTaxonomy";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => { const d = isFinite(el.duration) ? el.duration : 0; try { URL.revokeObjectURL(el.src); } catch {} resolve(d); };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}

/** Validate + upload a replacement audio file → { fileUrl, durationSeconds, waveformPeaks }. Throws a user-facing message. */
export async function uploadReplacementAudio(file: File, userId: string) {
  const ext = AUDIO_MIME_EXT[(file.type || "").toLowerCase()];
  if (!ext) throw new Error("Use MP3, AAC, or WAV files.");
  if (file.size > AUDIO_MAX_BYTES) throw new Error("Too large (max 15MB).");
  const dur = await readAudioDuration(file);
  if (dur > AUDIO_MAX_SECONDS + 5) throw new Error("Too long (max ~6 min).");
  const signRes = await fetch("/api/music/sign", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, trackId: newId(), ext }),
  });
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok || !sign.token || !sign.path || !sign.publicUrl) throw new Error("Upload couldn't start — try again.");
  const { error } = await supabase.storage.from("music").uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
  if (error) throw new Error("Upload failed — try again.");
  const peaks = await peaksFromFile(file).catch(() => [] as number[]);
  return { fileUrl: sign.publicUrl as string, durationSeconds: Math.round(dur), waveformPeaks: peaks.length ? peaks : null };
}

/** Downscale a picked cover before the (small-body) bake POST. Canvas sink only sees image data. */
export async function downscaleCover(file: File, maxDim = 1400): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1 && file.size < 3_500_000) { img.close?.(); return file; }
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { img.close?.(); return file; }
    ctx.drawImage(img, 0, 0, w, h);
    img.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch { return file; }
}
