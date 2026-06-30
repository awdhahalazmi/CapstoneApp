import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import BottomNav from "@/components/BottomNav";
import SideNav from "@/components/SideNav";
import AuthRedirector from "@/components/AuthRedirector";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beyond Kw — Plan outings with friends",
  description:
    "AI-powered social discovery for Kuwait. Plan outings, discover new places, and share trusted recommendations with your friends.",
};

export const viewport: Viewport = {
  themeColor: "#630ed4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-[100dvh] bg-surface md:bg-[radial-gradient(circle_at_top,#efe9fb_0%,#e9eaee_60%,#e1e3e7_100%)]">
        <AuthRedirector />

        {/* Mobile: full-screen app */}
        <div className="flex h-[100dvh] flex-col md:hidden">
          <main className="no-scrollbar flex-1 overflow-y-auto">{children}</main>
          <BottomNav />
        </div>

        {/* Desktop: sidebar + content */}
        <div className="hidden md:flex md:h-screen md:overflow-hidden">
          <SideNav />
          <main className="no-scrollbar flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
