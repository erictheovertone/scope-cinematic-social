// ── /music/add — the composer contribution page (Brief MUS-2 §1) ─────────────────────────────────
// Every "contribute" door lands here (composer page "Add music", library, settings, track sheet);
// ?album=<id> opens it on "Add to existing album" with that album chosen (Manage music).
"use client";

import { Suspense } from "react";
import ContributePage from "@/components/music/ContributePage";

export default function MusicAddPage() {
  return <Suspense fallback={null}><ContributePage /></Suspense>;
}
