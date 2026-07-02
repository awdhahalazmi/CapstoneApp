import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "top-left",
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "sharp", "pino"],
  // Proxy /api/whatsapp/* to the persistent Railway server when deployed on Vercel
  async rewrites() {
    const waServer = process.env.WHATSAPP_SERVER_URL;
    if (!waServer) return [];
    return [
      {
        source: "/api/whatsapp/:path*",
        destination: `${waServer}/api/whatsapp/:path*`,
      },
    ];
  },
};

export default nextConfig;
