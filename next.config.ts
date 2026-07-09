import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Dev-only cosmetic: hide the Next dev-tools indicator so it never overlaps
  // editor UI (e.g. the active tool tile on /finishing-dev). No prod effect.
  devIndicators: false,
  // Stage 2.3 enablement — allow next/image to optimize Supabase Storage media
  // when raw <img> tags are migrated. Inert until an <Image> references the host.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "brevfwazpoibobuqglxk.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  // Legal routes consolidated to top-level /terms + /privacy (Privy modal links
  // there; must be logged-out reachable). The old locations 308 → canonical so
  // existing links/bookmarks and the #dmca anchor keep working.
  async redirects() {
    return [
      { source: "/legal/terms", destination: "/terms", permanent: true },
      { source: "/legal/privacy", destination: "/privacy", permanent: true },
      { source: "/profile/terms", destination: "/terms", permanent: true },
    ];
  },
};

export default nextConfig;
