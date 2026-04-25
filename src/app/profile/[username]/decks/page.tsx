"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getProfileByUsername, getUserById, getUserDecks, getDecksByUsername,
  createDeck, type Deck,
} from "@/lib/userService";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

export default function DecksPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const username = params?.username as string;

  const [decks, setDecks] = useState<(Deck & { item_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwn, setIsOwn] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Create deck overlay state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [ownerUsername, setOwnerUsername] = useState("");

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const profile = await getProfileByUsername(username);
        if (!profile) { setNotFound(true); setLoading(false); return; }
        setOwnerUsername(profile.username || username);

        const sbUser = await getUserById(profile.user_id);
        const own = !!(sbUser && user?.id === sbUser.privy_id);
        setIsOwn(own);

        const d = own && user
          ? await getUserDecks(user.id)
          : await getDecksByUsername(username);
        setDecks(d);
      } catch (e) {
        console.error("DecksPage load error:", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [username, user?.id]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !user) return;
    setCreating(true);
    try {
      const deck = await createDeck(user.id, ownerUsername, newTitle.trim(), newDesc.trim());
      setDecks(prev => [{ ...deck, item_count: 0 }, ...prev]);
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
    } catch (e) {
      console.error("createDeck error:", e);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
        <div style={{ width: 11, height: 11, background: "#FF0000", borderRadius: "50%" }} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
        <p style={{ ...MONO, fontSize: 10, color: "white" }}>Profile not found</p>
      </div>
    );
  }

  return (
    <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto pb-[80px]">

      {/* Red dot */}
      <div
        className="absolute cursor-pointer"
        onClick={() => router.push("/")}
        style={{ left: 0, top: 0, width: 28, height: 28, padding: "3px 0 0 2px", zIndex: 10 }}
      >
        <div className="w-[11px] h-[11px] bg-[#FF0000] rounded-full" />
      </div>

      {/* Header */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "12px 4px 10px" }}>
        <button
          onClick={() => router.back()}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>← Back</span>
        </button>
        <span
          style={{
            ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px",
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          @{username} DECKS
        </span>
        {isOwn && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ marginLeft: "auto", background: "transparent", border: "1px solid rgba(255,255,255,0.35)", cursor: "pointer", padding: "3px 8px" }}
          >
            <span style={{ ...MONO, fontSize: 8, color: "white" }}>+ NEW DECK</span>
          </button>
        )}
      </div>

      {/* Deck list */}
      {decks.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>No decks yet</p>
        </div>
      ) : (
        <div style={{ padding: "0 0 8px" }}>
          {decks.map(deck => (
            <div
              key={deck.id}
              onClick={() => router.push(`/profile/${username}/decks/${deck.id}`)}
              style={{ cursor: "pointer", marginBottom: 1 }}
            >
              {/* Cover image — 2.4:1 */}
              <div style={{ width: "100%", aspectRatio: "2.4 / 1", background: "#111", overflow: "hidden" }}>
                {deck.cover_image_url ? (
                  <img
                    src={deck.cover_image_url}
                    alt={deck.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
                      <rect width="24" height="3.5" fill="rgba(255,255,255,0.15)" />
                      <rect y="6.25" width="24" height="3.5" fill="rgba(255,255,255,0.15)" />
                      <rect y="12.5" width="24" height="3.5" fill="rgba(255,255,255,0.15)" />
                    </svg>
                  </div>
                )}
              </div>
              {/* Meta */}
              <div style={{ padding: "6px 4px 10px" }}>
                <p style={{ ...MONO, fontSize: 9, color: "white", margin: 0, letterSpacing: "-0.18px" }}>
                  {deck.title}
                </p>
                <p style={{ ...MONO, fontSize: 7, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                  {deck.item_count} {deck.item_count === 1 ? "frame" : "frames"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create deck overlay */}
      {showCreate && (
        <>
          <div
            className="bg-black"
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowCreate(false)}
          />
          <div
            className="bg-black"
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
              maxWidth: 375, margin: "0 auto",
              background: "#000",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              padding: "20px 16px 48px",
            }}
          >
            <p style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px", marginBottom: 16 }}>
              NEW DECK
            </p>
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Title"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)",
                outline: "none", ...MONO, fontSize: 11, color: "white",
                padding: "4px 0", marginBottom: 14, boxSizing: "border-box",
              }}
            />
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.12)",
                outline: "none", ...MONO, fontSize: 9, color: "white",
                padding: "4px 0", marginBottom: 20, boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 20 }}>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                style={{ background: "transparent", border: "none", cursor: "pointer", ...MONO, fontSize: 9, color: newTitle.trim() ? "white" : "rgba(255,255,255,0.3)", padding: 0 }}
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewTitle(""); setNewDesc(""); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", padding: 0 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
