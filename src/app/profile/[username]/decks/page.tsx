"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getProfileByUsername, getUserById, getUserDecks, getDecksByUsername,
  createDeck, type Deck,
} from "@/lib/userService";
import { getScopeLimitType } from "@/lib/limits";
import { useUpsell } from "@/components/UpsellProvider";
import FrameLoader from "@/components/FrameLoader";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function DecksPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const { showUpsell } = useUpsell();
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
      router.push(`/profile/${username}/decks/${deck.id}`);
    } catch (e: any) {
      const lt = getScopeLimitType(e);
      if (lt) { setCreating(false); showUpsell(lt); return; }
      console.error("createDeck error:", e);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-black w-full app-shell screen-min mx-auto flex items-center justify-center">
        <FrameLoader variant="page" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="bg-black w-full app-shell screen-min mx-auto flex items-center justify-center">
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white" }}>Profile not found</p>
      </div>
    );
  }

  return (
    <div className="bg-black w-full app-shell screen-min mx-auto pb-[80px]">

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
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", letterSpacing: "-0.18px" }}>← Back</span>
        </button>
        <span
          style={{
            ...SKB, fontSize: 'var(--fs-9)', color: "white", letterSpacing: "-0.18px",
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
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "white" }}>+ NEW DECK</span>
          </button>
        )}
      </div>

      {/* Deck list */}
      {decks.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.4)" }}>No decks yet</p>
        </div>
      ) : (
        <div style={{ padding: "0 0 8px" }}>
          {decks.map(deck => (
            <div
              key={deck.id}
              onClick={() => router.push(`/profile/${username}/decks/${deck.id}`)}
              style={{ cursor: "pointer", marginBottom: 1 }}
            >
              {/* Cover image */}
              <div style={{ width: "100%", aspectRatio: "2.4 / 1", background: "#111", overflow: "hidden" }}>
                {deck.cover_image_url ? (
                  <img
                    src={deck.cover_image_url}
                    alt={deck.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="25.5" height="17.5" viewBox="0 0 24 16" fill="none">
                      <rect width="24" height="3.5" fill="rgba(255,255,255,0.15)" />
                      <rect y="6.25" width="24" height="3.5" fill="rgba(255,255,255,0.15)" />
                      <rect y="12.5" width="24" height="3.5" fill="rgba(255,255,255,0.15)" />
                    </svg>
                  </div>
                )}
              </div>
              {/* Meta */}
              <div style={{ padding: "6px 4px 10px" }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", margin: 0, letterSpacing: "-0.18px" }}>
                  {deck.title}
                </p>
                <p style={{ ...SKR, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
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
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowCreate(false)}
          />
          <div
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
              maxWidth: '30rem', margin: "0 auto",
              background: "#080808",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              padding: "20px 20px 36px",
            }}
          >
            {/* Sheet title */}
            <p style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 8px" }}>
              NEW DECK
            </p>

            {/* Deck name input */}
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Deck name"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)",
                outline: "none",
                ...SKB, fontSize: 'var(--fs-24)', letterSpacing: "0.02em", color: "white",
                textTransform: "uppercase",
                padding: "4px 0", marginBottom: 16, boxSizing: "border-box",
              }}
            />

            {/* Description input */}
            <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
              DESCRIPTION
            </p>
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Optional"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.12)",
                outline: "none",
                ...SKR, fontSize: 'max(16px, var(--fs-14))', color: "white",
                padding: "4px 0", marginBottom: 24, boxSizing: "border-box",
              }}
            />

            {/* Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                style={{ width: "100%", padding: "14px 0", background: "#FF0000", border: "none", cursor: newTitle.trim() && !creating ? "pointer" : "default", opacity: newTitle.trim() ? 1 : 0.5 }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {creating ? "CREATING…" : "CREATE DECK"}
                </span>
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewTitle(""); setNewDesc(""); }}
                style={{ width: "100%", padding: "14px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  CANCEL
                </span>
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
