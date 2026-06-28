import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-only route indicator out of the bottom nav's way.
  devIndicators: {
    position: "top-left",
  },
};

export default nextConfig;
