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
};

export default nextConfig;
