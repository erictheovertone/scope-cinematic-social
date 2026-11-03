"use client";

// ── /debug/graded — VID-2 smoke: render the REAL GradedVideo (forcePlay) on a live HLS post with a
// strong look, so the graded WebGL path can be eyeballed + the gfx crumb read, without the authed
// feed. Debug-gated (?debug=video). Needs NEXT_PUBLIC_GRADED_PLAYBACK=1 for the graded branch (else
// GradedVideo shows the CSS fallback — which is exactly what this route also lets you compare).
import { useEffect, useState } from "react";
import GradedVideo from "@/components/finishing/GradedVideo";
import { getAllPosts } from "@/lib/postsService";
import { streamGradedProps } from "@/lib/editor/videoGrade";
import { gfxSummary } from "@/lib/videoGfx";
import { gradedPlaybackEnabled } from "@/lib/gradedPlayback";
import { DEFAULT_PARAMS, type EditParams } from "@/lib/editor/params";
import { isVideoDebug } from "@/lib/debugFlags";

const LOOK: EditParams = { ...DEFAULT_PARAMS, saturation: 3, contrast: 2, splitTone: { shadowsHue: "blue", shadowsStrength: 6, highlightsHue: "orange", highlightsStrength: 6 } };

export default function GradedSmoke() {
  const [mounted, setMounted] = useState(false);
  const [post, setPost] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("loading…");
  const [gfx, setGfx] = useState("none");

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || !isVideoDebug()) return;
    let dead = false;
    (async () => {
      for (let p = 0; p < 4 && !dead; p++) {
        const posts = await getAllPosts(p, 24);
        if (!posts.length) break;
        const m = posts.find((x) => streamGradedProps(x as unknown as Record<string, unknown>).hlsUrl);
        if (m) { if (!dead) { setPost(m as unknown as Record<string, unknown>); setStatus(`post ${(m as { id?: string }).id}`); } return; }
      }
      if (!dead) setStatus("no ready HLS post found");
    })();
    const t = setInterval(() => setGfx(gfxSummary()), 1000);
    return () => { dead = true; clearInterval(t); };
  }, [mounted]);

  if (!mounted) return <div style={{ minHeight: "100dvh", background: "#000" }} />;
  if (!isVideoDebug()) return <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", fontFamily: "monospace", padding: 24 }}>Append <b>?debug=video</b> to run /debug/graded.</div>;

  const hls = post ? streamGradedProps(post).hlsUrl : null;
  const poster = (post?.stream_poster_url as string) ?? (post?.poster_url as string) ?? null;

  return (
    <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", fontFamily: "monospace", padding: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>VID-2 · GradedVideo smoke — {status}</div>
      <div style={{ marginBottom: 8, fontSize: 14 }}>flag NEXT_PUBLIC_GRADED_PLAYBACK: <b style={{ color: gradedPlaybackEnabled() ? "#3f8" : "#f55" }}>{String(gradedPlaybackEnabled())}</b> · gfx: <b style={{ color: "#4af" }}>{gfx}</b></div>
      {post && hls ? (
        <div style={{ width: "100%", maxWidth: 520, aspectRatio: "16 / 9", position: "relative", background: "#111" }}>
          <GradedVideo
            url={hls}
            hlsUrl={hls}
            posterUrl={poster}
            editParams={LOOK}
            forcePlay
            showSoundToggle
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      ) : <div style={{ opacity: 0.6 }}>{status}</div>}
      <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>Strong teal/orange look. gfx &quot;graded&quot; = the WebGL pipeline is driving it; &quot;fallback&quot; = CSS approximation.</p>
    </div>
  );
}
