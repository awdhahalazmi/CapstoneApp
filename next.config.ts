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
    // beforeFiles runs BEFORE filesystem routes — prevents Vercel from running
    // local whatsapp route.ts files and instead proxies all /api/whatsapp/* to Railway
    return {
      beforeFiles: [
        {
          source: "/api/whatsapp/:path*",
          destination: `${waServer}/api/whatsapp/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
