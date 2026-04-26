"use client";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

interface Props {
  imageUrls: string[];
  title?: string;
}

export default function DeckThumbnail({ imageUrls, title }: Props) {
  const imgs = imageUrls.filter(Boolean);
  const n = imgs.length;

  const wrap: React.CSSProperties = {
    width: '100%',
    aspectRatio: '2.4 / 1',
    overflow: 'hidden',
    background: '#111',
    position: 'relative',
    display: 'block',
  };

  if (n === 0) {
    return (
      <div style={wrap}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ ...MONO, fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>{title ?? ''}</span>
        </div>
      </div>
    );
  }

  if (n === 1) {
    return (
      <div style={wrap}>
        <img src={imgs[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div style={{ ...wrap, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {imgs.map((u, i) => <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />)}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div style={wrap}>
        <img src={imgs[0]} alt="" style={{ position: 'absolute', left: 0, top: 0, width: '66%', height: '100%', objectFit: 'cover' }} />
        <img src={imgs[1]} alt="" style={{ position: 'absolute', right: 0, top: 0, width: '33%', height: '50%', objectFit: 'cover' }} />
        <img src={imgs[2]} alt="" style={{ position: 'absolute', right: 0, bottom: 0, width: '33%', height: '50%', objectFit: 'cover' }} />
      </div>
    );
  }

  // 4-5 → 2×2, 6-8 → 3×2, 9+ → 3×3
  let cols: number, rows: number;
  if (n >= 9) { cols = 3; rows = 3; }
  else if (n >= 6) { cols = 3; rows = 2; }
  else { cols = 2; rows = 2; }

  const cells = imgs.slice(0, cols * rows);

  return (
    <div style={{
      ...wrap,
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: 1,
    }}>
      {cells.map((u, i) => (
        <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ))}
    </div>
  );
}
