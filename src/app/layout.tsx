import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
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
      <body className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#efe9fb_0%,#e9eaee_60%,#e1e3e7_100%)] sm:grid sm:place-items-center sm:py-6">
        {/* Mobile-first phone frame — fills the screen on mobile, floats on desktop */}
        <div className="relative flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-surface sm:h-[880px] sm:max-h-[94vh] sm:rounded-[2.25rem] sm:border sm:border-white/60 sm:shadow-[0_24px_70px_rgba(99,14,212,0.18)]">
          <AuthRedirector />
          <main className="no-scrollbar flex-1 overflow-y-auto">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
