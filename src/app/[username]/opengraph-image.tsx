// ── OG image for /[username] — the link unfurl (Brief ARR-1) ───────────────────────────────────
// Server-generated 1200×630: a strip of the first three frames over the name + avatar, on the brand
// ground. LITERAL colours only — satori can't resolve var(--…) (CLAUDE.md canvas-token rule).
// Satori can't decode WebP (avatars + post renditions are WebP) — it silently drops the image — so
// every image is fetched and re-encoded to a JPEG data URI with sharp first.
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { publicProfilesEnabled } from '@/lib/arrival/flag';
import { getPublicProfile } from '@/lib/arrival/publicProfile';
import { feedImage } from '@/lib/mediaUrl';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Scope profile';

async function jpeg(url: string | null | undefined, w: number, h: number): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize(w, h, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const profile = publicProfilesEnabled() ? await getPublicProfile((await params).username) : null;
  const name = profile ? profile.username.toLowerCase() : 'Scope';
  const frames = (profile?.frames ?? []).slice(0, 3);
  const stripH = Math.round(400 / 2.39);
  const [avatar, ...strip] = await Promise.all([
    jpeg(profile?.avatarUrl, 192, 192),
    ...[0, 1, 2].map((i) => jpeg(frames[i] ? feedImage(frames[i].image, 600) : null, 796, stripH * 2)),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#050505', color: '#E5E1DB' }}>
        <div style={{ display: 'flex', gap: 2, background: '#000', marginTop: 120 }}>
          {[0, 1, 2].map((i) => (
            strip[i]
              ? <img key={i} src={strip[i]!} width={398} height={stripH} style={{ objectFit: 'cover' }} />
              : <div key={i} style={{ width: 398, height: stripH, background: '#0A0A0A' }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '48px 56px' }}>
          {avatar && <img src={avatar} width={96} height={96} style={{ borderRadius: 48, objectFit: 'cover' }} />}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: -1 }}>{`${name} on Scope`}</div>
            {profile && <div style={{ fontSize: 28, color: 'rgba(229,225,219,0.55)', marginTop: 8 }}>{`${profile.framesCount} frames · scopeapp.world`}</div>}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
