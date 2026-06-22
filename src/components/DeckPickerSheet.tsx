"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  getUserDecks, createDeck, addPostToDeck,
  getUserByPrivyId, getProfile,
  type Deck,
} from "@/lib/userService";
import { getScopeLimitType } from '@/lib/limits';
import { useUpsell } from '@/components/UpsellProvider';
import FrameLoader from '@/components/FrameLoader';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  postId: string;
  onClose: () => void;
  onAdded: (deckTitle: string) => void;
}

export default function DeckPickerSheet({ postId, onClose, onAdded }: Props) {
  const { user } = usePrivy();
  const { showUpsell } = useUpsell();
  const [decks, setDecks] = useState<(Deck & { item_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    if (!user) { setLoading(false); return () => cancelAnimationFrame(id); }
    const load = async () => {
      try {
        const [fetchedDecks, sbUser] = await Promise.all([
          getUserDecks(user.id),
          getUserByPrivyId(user.id),
        ]);
        setDecks(fetchedDecks);
        if (sbUser) {
          const profile = await getProfile(sbUser.id);
          if (profile?.username) setUsername(profile.username);
        }
      } catch (e) {
        console.error("DeckPickerSheet load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => cancelAnimationFrame(id);
  }, [user?.id]);

  const handleAdd = async (deckId: string, deckTitle: string) => {
    setAdding(deckId);
    try {
      await addPostToDeck(deckId, postId);
      onAdded(deckTitle);
    } catch (e) {
      console.error("addPostToDeck error:", e);
      setAdding(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newTitle.trim() || !user) return;
    setCreating(true);
    try {
      const deck = await createDeck(user.id, username, newTitle.trim(), "");
      await addPostToDeck(deck.id, postId);
      onAdded(deck.title);
    } catch (e: any) {
      const lt = getScopeLimitType(e);
      if (lt) { setCreating(false); showUpsell(lt); return; }
      console.error("createDeck error:", e);
      setCreating(false);
    }
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="bg-black"
        style={{
          position: "fixed", inset: 0, zIndex: 120,
          background: "rgba(0,0,0,0.6)",
          opacity: visible ? 1 : 0,
          transition: "opacity 250ms ease",
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className="bg-black"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 121,
          maxWidth: '30rem', margin: "0 auto",
          background: "#000",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "16px 0 40px",
          maxHeight: "60vh",
          overflowY: "auto",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 250ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", letterSpacing: "-0.18px" }}>ADD TO DECK</span>
          <button
            onClick={handleClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", ...SKB, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.5)", padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
            <FrameLoader />
          </div>
        ) : (
          <>
            {decks.length === 0 && !showNewDeck && (
              <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.35)", padding: "14px 12px 0" }}>
                No decks yet — create one below
              </p>
            )}

            {decks.map(deck => (
              <button
                key={deck.id}
                onClick={() => handleAdd(deck.id, deck.title)}
                disabled={!!adding}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", background: "transparent", border: "none", cursor: "pointer",
                  padding: "10px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  opacity: adding && adding !== deck.id ? 0.4 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: "#1a1a1a", flexShrink: 0, overflow: "hidden" }}>
                    {deck.cover_image_url && (
                      <img src={deck.cover_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", margin: 0 }}>{deck.title}</p>
                    <p style={{ ...SKR, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                      {deck.item_count} frames
                    </p>
                  </div>
                </div>
                {adding === deck.id && (
                  <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.45)" }}>adding…</span>
                )}
              </button>
            ))}

            {!showNewDeck ? (
              <button
                onClick={() => setShowNewDeck(true)}
                style={{ display: "block", width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "14px 12px", textAlign: "left" }}
              >
                <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.5)" }}>+ Create new deck</span>
              </button>
            ) : (
              <div style={{ padding: "14px 12px" }}>
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCreateAndAdd()}
                  placeholder="Deck title…"
                  style={{
                    width: "100%", background: "transparent",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)",
                    outline: "none", ...SKR, fontSize: 'var(--fs-10)', color: "white",
                    padding: "4px 0", boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                  <button
                    onClick={handleCreateAndAdd}
                    disabled={!newTitle.trim() || creating}
                    style={{ background: "transparent", border: "none", cursor: "pointer", ...SKB, fontSize: 'var(--fs-9)', color: newTitle.trim() ? "white" : "rgba(255,255,255,0.3)", padding: 0 }}
                  >
                    {creating ? "Creating…" : "Create & add"}
                  </button>
                  <button
                    onClick={() => { setShowNewDeck(false); setNewTitle(""); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", ...SKR, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.4)", padding: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
