import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "top-left",
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "sharp", "pino"],
};

export default nextConfig;
