// ── TrackArt — a track's face (uploaded cover OR the generated default) ──────
// Every track has a face so the library reads uniform. With a cover → the WebP.
// Without → a DETERMINISTIC placeholder (no randomness): a sine-wave mark on
// #0c0c0c whose phase/frequency derive from the track id, plus the title initial.
// Monochrome (on-brand: black/white), so a patchy library still looks intentional.
//
// CHOICE (reported): wave + initial over the bare wave — the initial gives each
// track a distinct FACE (identity) while the wave keeps the music language; a bare
// wave reads uniform-but-anonymous. Flip WITH_INITIAL to false for the bare wave.
"use client";

import React from "react";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const WITH_INITIAL = true;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export default function TrackArt({
  url, title, id, size = 40, radius = 0,
}: {
  url?: string | null;
  title?: string | null;
  id?: string | null;
  size?: number;
  radius?: number;
}) {
  const box: React.CSSProperties = { width: size, height: size, flexShrink: 0, borderRadius: radius, overflow: "hidden", background: "#0c0c0c" };

  if (url) {
    return <img src={url} alt={title ?? ""} style={{ ...box, objectFit: "cover", display: "block" }} />;
  }

  const seed = hash(String(id || title || "?"));
  const phase = (seed % 360) / 360 * Math.PI * 2;
  const freq = 1.5 + (seed % 3) * 0.5;      // 1.5 / 2.0 / 2.5 cycles across the box
  const amp = 12 + (seed % 3) * 3;          // 12 / 15 / 18
  const initial = (String(title || "?").trim()[0] || "?").toUpperCase();

  const W = 100, mid = 50;
  let d = `M0 ${mid.toFixed(1)}`;
  for (let x = 2; x <= W; x += 2) {
    const y = mid + amp * Math.sin((x / W) * freq * Math.PI * 2 + phase);
    d += ` L${x} ${y.toFixed(1)}`;
  }

  return (
    <div style={{ ...box, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {WITH_INITIAL && (
        <span style={{ ...SKB, position: "absolute", fontSize: size * 0.42, color: "rgba(229,225,219,0.14)", lineHeight: 1, userSelect: "none" }}>{initial}</span>
      )}
      <svg viewBox="0 0 100 100" width={size} height={size} preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <path d={d} fill="none" stroke="rgba(229,225,219,0.42)" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </div>
  );
}
