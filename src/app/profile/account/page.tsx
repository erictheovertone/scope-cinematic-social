"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, saveProfile } from "@/lib/userService";

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
        }
      } catch (e) {
        console.error("AccountSettings load error:", e);
      }
    };
    load();
  }, [user?.id]);

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
            onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
            style={INPUT}
            placeholder="Your name"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>USERNAME</label>
          <input
            className="edit-input"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
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
