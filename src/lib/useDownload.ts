// ── useDownload — the ONE Download action (Brief AUG-1 §3) ───────────────────────────────────────
// Download is VISIBLE to everyone (post actions, theatre, track view). Tapping it asks the server
// (/api/download/{post,track}) with the viewer's Privy token; the server decides — the client
// never gates on its own idea of the tier:
//   signed out          → Privy login
//   403 (not Augmented) → the Augmented upsell sheet
//   200                 → the 60-second signed URL is opened (attachment), and for music the sync
//                         license is surfaced alongside (onLicense)
"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useUpsell } from "@/components/UpsellProvider";

export type DownloadKind = "post" | "track";

export function useDownload() {
  const { ready, user, login, getAccessToken } = usePrivy();
  const { showAugmented } = useUpsell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(ready); readyRef.current = ready;
  const userRef = useRef(user); userRef.current = user;

  const download = useCallback(async (kind: DownloadKind, id: string): Promise<"ok" | "upsell" | "login" | "error"> => {
    // Privy still restoring the session: a signed-in viewer must not be bounced to login (or
    // lose the tap). Wait for it, briefly, then decide.
    for (let i = 0; i < 40 && !readyRef.current; i++) await new Promise((r) => setTimeout(r, 100));
    if (!userRef.current) { login(); return "login"; }
    setBusy(true); setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/download/${kind}?id=${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      if (res.status === 403) { showAugmented(); return "upsell"; }
      if (res.status === 401) { login(); return "login"; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) { setError(j.error || "Download failed"); return "error"; }
      // The signed URL carries Content-Disposition: attachment — a plain navigation downloads it.
      const a = document.createElement("a");
      a.href = j.url; a.rel = "noopener"; a.download = "";
      document.body.appendChild(a); a.click(); a.remove();
      return "ok";
    } catch (e) {
      setError((e as Error).message || "Download failed");
      return "error";
    } finally {
      setBusy(false);
    }
  }, [login, getAccessToken, showAugmented]);

  return { download, busy, error };
}
