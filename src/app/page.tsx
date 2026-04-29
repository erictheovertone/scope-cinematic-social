"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getAllPosts } from "@/lib/postsService";
import PostItem from "@/components/PostItem";
import PostModal from "@/components/PostModal";
import MirageView from "@/components/MirageView";

type FeedState = "normal" | "exiting" | "entering";

export default function Home() {
  const { authenticated } = usePrivy();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [lightboxPost, setLightboxPost] = useState<any>(null);
  const [mirageActive, setMirageActive] = useState(false);
  const [feedState, setFeedState] = useState<FeedState>("normal");
  const transitioningRef = useRef(false);

  useEffect(() => {
    if (!authenticated) router.push("/welcome");
  }, [authenticated, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await getAllPosts();
        console.log('First post media_urls:', all[0]?.media_urls);
        if (all.length === 0) {
          setPosts([
            { id: "mock1", username: "creator1",    caption: "Cinematic shot from my latest project", media_urls: [], created_at: new Date().toISOString() },
            { id: "mock2", username: "filmmaker2",   caption: "Ultra-wide landscape composition",      media_urls: [], created_at: new Date().toISOString() },
            { id: "mock3", username: "visualartist", caption: "Experimental grid layout design",       media_urls: [], created_at: new Date().toISOString() },
          ]);
        } else {
          setPosts(all);
        }
      } catch (e) {
        console.error("Error loading posts:", e);
      }
    };
    load();
  }, []);

  const enterMirage = () => {
    if (transitioningRef.current) return;
    console.log("Mirage toggle clicked — current state:", mirageActive);
    transitioningRef.current = true;
    setFeedState("exiting");
    console.log("Animation started");
    setTimeout(() => {
      console.log("Animation complete — switching to grid");
      setMirageActive(true);
      // feedState stays "exiting" — feed items held at opacity 0 under MirageView.
      // exitMirage() transitions them back in when closing.
      transitioningRef.current = false;
    }, 450);
  };

  const exitMirage = () => {
    setMirageActive(false);
    setFeedState("entering");
    setTimeout(() => setFeedState("normal"), 450);
  };

  const getPostAnimStyle = (index: number): React.CSSProperties => {
    const delay = `${Math.min(index, 8) * 30}ms`;
    if (feedState === "exiting") {
      return { animation: `feed-item-out 400ms ease-in ${delay} both` };
    }
    if (feedState === "entering") {
      return { animation: `feed-item-in 350ms ease-out ${delay} both` };
    }
    return {};
  };

  return (
    <div className="bg-black relative w-[375px] min-h-screen mx-auto">
      <style>{`
        @keyframes feed-item-out {
          from { transform: scale(1)    translateY(0);    opacity: 1; }
          to   { transform: scale(0.85) translateY(-12px); opacity: 0; }
        }
        @keyframes feed-item-in {
          from { transform: scale(0.85) translateY(12px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Red dot */}
      <Link href="/">
        <div className="absolute left-[2px] top-[4px] w-[11px] h-[11px] cursor-pointer">
          <div className="w-[11px] h-[11px] bg-[#FF0000] rounded-full" />
        </div>
      </Link>

      {/* Mirage logo — top right, replaces SCREENING ROOM */}
      <button
        onClick={enterMirage}
        aria-label="Toggle Mirage View"
        className="absolute"
        style={{
          right: "4px",
          top: "2px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          lineHeight: 0,
        }}
      >
        <img
          src="/mirage-logo.png"
          alt="Mirage"
          width={28}
          height={28}
          style={{
            opacity: mirageActive ? 1 : 0.5,
            filter: mirageActive
              ? "brightness(0) invert(1) drop-shadow(0 0 4px rgba(255,255,255,0.7))"
              : "brightness(0) invert(1)",
            transition: "opacity 300ms ease, filter 300ms ease",
          }}
        />
      </button>

      {/* Feed */}
      <div className="absolute left-[2px] right-[2px] top-[30px] bottom-0 overflow-y-auto">
        <div style={{ paddingTop: 16, paddingBottom: 60 }}>
          {posts.map((post, index) => (
            <div key={post.id} style={getPostAnimStyle(index)}>
              <PostItem
                post={post}
                onImageClick={() => setLightboxPost(post)}
              />
            </div>
          ))}
        </div>
      </div>

      {lightboxPost && (
        <PostModal
          post={lightboxPost}
          onClose={() => setLightboxPost(null)}
        />
      )}

      {/* Mirage View — mounts as fixed overlay above the feed */}
      {mirageActive && <MirageView onClose={exitMirage} />}
    </div>
  );
}
