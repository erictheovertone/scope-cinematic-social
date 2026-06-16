"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, saveProfile, updateProfileFields, isProMember } from "@/lib/userService";
import { useEconomy } from "@/components/EconomyProvider";
import { economyPreviewEnabled } from "@/lib/economy/flag";
import { DIVIDER_ORDER, DIVIDER_LINES, dividerTier, isDividerUnlocked, TIER_UNLOCK_LABEL, type DividerLineKey } from "@/lib/economy/dividerLines";

const MONO: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.8)',
  color: '#fff',
  fontFamily: "'SK-Modernist', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function AccountSettings() {
  const router = useRouter();
  const { user } = usePrivy();
  const [sbUserId, setSbUserId] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    bio: "",
    websiteUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dividing-line picker (Piece 2) — tier from held badges; chosen line persists
  // immediately and drives the divider on both profiles.
  const economy = useEconomy();
  const [firstCutCount, setFirstCutCount] = useState(0);
  const [lineFlags, setLineFlags] = useState({ isPaidMember: false, isFoundingMember: false, isTopCollector: false, isInHouseCreator: false });
  const [selectedLine, setSelectedLine] = useState<DividerLineKey>('default');

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setSbUserId(sbUser.id);
        const profile = await getProfile(sbUser.id);
        if (profile) {
          setForm({
            displayName: profile.display_name || "",
            username: profile.username || "",
            bio: profile.bio || "",
            websiteUrl: (profile as any).website_url || "",
          });
          setLineFlags({
            isPaidMember: isProMember(profile as any),
            isFoundingMember: !!(profile as any).is_founding_member,
            isTopCollector: !!(profile as any).is_top_collector,
            isInHouseCreator: !!(profile as any).is_in_house_creator,
          });
          setSelectedLine(((profile as any).divider_line as DividerLineKey) || 'default');
        }
      } catch (e) {
        console.error("AccountSettings load error:", e);
      }
    };
    load();
  }, [user?.id]);

  // First Cut count (gated economy boundary) — completes the tier computation.
  useEffect(() => {
    if (!economyPreviewEnabled() || !sbUserId) { setFirstCutCount(0); return; }
    let cancelled = false;
    economy.getBadges(sbUserId).then((b) => { if (!cancelled) setFirstCutCount(b.firstCutCount ?? 0); }).catch(() => {});
    return () => { cancelled = true; };
  }, [economy, sbUserId]);

  const lineTier = dividerTier({ ...lineFlags, firstCutCount });

  const selectLine = async (key: DividerLineKey) => {
    if (!isDividerUnlocked(key, lineTier) || !sbUserId) return;
    setSelectedLine(key); // instant feedback + drives the profile on next render
    try {
      await updateProfileFields(sbUserId, { divider_line: key === 'default' ? null : key });
    } catch (e) {
      console.error("divider_line save error:", e);
    }
  };

  const handleSave = async () => {
    if (!sbUserId) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(sbUserId, {
        displayName: form.displayName,
        username: form.username,
        bio: form.bio,
        websiteUrl: form.websiteUrl,
      });
      setSaved(true);
      setTimeout(() => router.push('/profile'), 1000);
    } catch (e) {
      console.error("Save error:", e);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-black" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <style>{`
        .edit-input::placeholder { color: #666; }
        .edit-input:focus { border-color: white; }
      `}</style>

      {/* Header */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FF0000', flexShrink: 0, marginRight: 10 }} />
        <button
          onClick={() => router.back()}
          style={{ ...MONO, fontSize: 11, color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          ← Back
        </button>
        <span style={{ ...MONO, fontSize: 11, color: 'white', position: 'absolute', left: '50%', transform: 'translateX(-50%)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          EDIT PROFILE
        </span>
      </div>
      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />

      <div style={{ padding: '24px 20px' }}>

        <div style={{ marginBottom: 20 }}>
          <label style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>DISPLAY NAME</label>
          <input
            className="edit-input"
            value={form.displayName}
            onChange={e => setForm(p => ({ ...p, displayName: e.target.value.toUpperCase() }))}
            style={INPUT}
            placeholder="Your name"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>USERNAME</label>
          <input
            className="edit-input"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value.toUpperCase() }))}
            style={INPUT}
            placeholder="username"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>BIO</label>
          <textarea
            className="edit-input"
            value={form.bio}
            onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
            rows={4}
            style={{ ...INPUT, resize: 'none' }}
            placeholder="Tell your story"
          />
        </div>

        <div style={{ marginBottom: 32 }}>
          <label style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>WEBSITE</label>
          <input
            className="edit-input"
            value={form.websiteUrl}
            onChange={e => setForm(p => ({ ...p, websiteUrl: e.target.value }))}
            style={INPUT}
            placeholder="https://yoursite.com"
            type="url"
          />
        </div>

        {/* DIVIDING LINE — Piece 2. The line between your badges and photo; tier
            unlocks the gradients. THICK swatches so the gradient is legible;
            locked lines shown dimmed with the tier needed. Persists on select. */}
        <div style={{ marginBottom: 32 }}>
          <label style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 12 }}>DIVIDING LINE</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {DIVIDER_ORDER.map((key) => {
              const line = DIVIDER_LINES[key];
              const unlocked = isDividerUnlocked(key, lineTier);
              const selected = selectedLine === key;
              return (
                <button
                  key={key}
                  onClick={() => selectLine(key)}
                  disabled={!unlocked}
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: unlocked ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: unlocked ? 1 : 0.32 }}
                >
                  {/* THICK swatch — the gradient preview (the real divider is 0.5px). */}
                  <div style={{ width: 20, height: 60, background: line.gradient, border: selected ? '1.5px solid #FF0000' : '1px solid rgba(255,255,255,0.18)', boxSizing: 'border-box' }} />
                  <span style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.05em', color: selected ? '#FF0000' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{line.name}</span>
                  {!unlocked && line.tier > 0 && (
                    <span style={{ ...MONO, fontWeight: 400, fontSize: 6, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{TIER_UNLOCK_LABEL[line.tier as 1 | 2 | 3]}</span>
                  )}
                </button>
              );
            })}
          </div>
          <p style={{ ...MONO, fontWeight: 400, fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginTop: 12 }}>
            The line between your badges and your photo. Default is invisible — climb tiers to unlock colours. Saves instantly.
          </p>
        </div>

        {error && (
          <p style={{ ...MONO, fontSize: 11, color: '#FF0000', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            ...MONO, fontSize: 12,
            color: saved ? '#4CAF50' : 'white',
            background: 'transparent',
            border: `1px solid ${saved ? '#4CAF50' : 'white'}`,
            padding: '12px',
            width: '100%',
            cursor: saving || saved ? 'default' : 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {saving ? 'Saving…' : saved ? 'Profile updated' : 'Save'}
        </button>

      </div>
    </div>
  );
}
