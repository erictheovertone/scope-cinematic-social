// ── /track/[id] — the track view route (Brief MUS-1 §1) ─────────────────────────────────────────
// Shared door for the main library, composer page and the bio-sheet MUSIC covers. Renders the ONE
// TrackView inside the page's single scroller (scroll-trap rule). Switching tracks inside the view
// keeps the URL in step (replace — back still leaves the track view in one step).
"use client";

import { useParams, useRouter } from "next/navigation";
import PageScroller from "@/components/PageScroller";
import TrackView from "@/components/music/TrackView";

export default function TrackPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const router = useRouter();

  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/library");
  };

  return (
    <PageScroller style={{ background: "var(--canvas)", paddingTop: "var(--safe-top)" }}>
      {id && (
        <TrackView
          trackId={id}
          onClose={back}
          onNavigateTrack={(next) => router.replace(`/track/${next}`, { scroll: false })}
        />
      )}
    </PageScroller>
  );
}
