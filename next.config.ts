import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Dev-only cosmetic: hide the Next dev-tools indicator so it never overlaps
  // editor UI (e.g. the active tool tile on /finishing-dev). No prod effect.
  devIndicators: false,
};

export default nextConfig;
