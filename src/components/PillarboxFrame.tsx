/**
 * PillarboxFrame — wraps 4:3 content in a 1.85:1 container with black side bars.
 * Used for `layout_id === 'legacy'` posts across the home feed, Mirage, lightbox,
 * and profile post viewer.
 *
 * `children`  — the media content (fills the inner 4:3 area, height 100%)
 * `overlays`  — optional absolutely-positioned elements in the outer 1.85:1 container
 * `onClick`   — forwarded to the outer container
 * `cursor`    — CSS cursor value for the outer container
 */
export default function PillarboxFrame({
  children,
  overlays,
  onClick,
  cursor,
}: {
  children: React.ReactNode;
  overlays?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  cursor?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1.85 / 1',
        backgroundColor: '#000000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        cursor: cursor,
      }}
    >
      {/* 4:3 inner content area — centered, fills full height */}
      <div style={{ height: '100%', aspectRatio: '4 / 3', flexShrink: 0 }}>
        {children}
      </div>
      {/* Absolutely-positioned overlays (avatar, MC, etc.) sit in the outer container */}
      {overlays}
    </div>
  );
}
