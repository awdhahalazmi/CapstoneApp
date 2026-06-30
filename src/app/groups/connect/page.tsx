"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { useProfile } from "@/lib/supabase/use-session";

type Phase = "loading" | "qr" | "connected" | "timeout" | "error";

export default function ConnectWhatsAppPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startStatusPoll = useCallback((userId: string) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?userId=${userId}`);
        const { status } = await res.json();
        if (status === "connected") {
          stopPoll();
          esRef.current?.close();
          setPhase("connected");
          setTimeout(() => router.push("/groups/select"), 1200);
        }
      } catch { /* ignore */ }
    }, 2_000);
  }, [router, stopPoll]);

  useEffect(() => {
    if (!profile?.id || startedRef.current) return;
    startedRef.current = true;

    const userId = profile.id;

    async function init() {
      // Check if already connected (auto-reconnect may have finished)
      try {
        const res = await fetch(`/api/whatsapp/status?userId=${userId}`);
        const { status } = await res.json();
        if (status === "connected") {
          setPhase("connected");
          setTimeout(() => router.push("/groups/select"), 800);
          return;
        }
      } catch { /* fall through to QR */ }

      // Open QR SSE stream
      const es = new EventSource(`/api/whatsapp/qr?userId=${userId}`);
      esRef.current = es;

      // Polling as fallback — catches connection even if SSE event is missed
      startStatusPoll(userId);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "qr") {
          setQrImage(data.image);
          setPhase("qr");
        } else if (data.type === "connected") {
          stopPoll();
          es.close();
          setPhase("connected");
          setTimeout(() => router.push("/groups/select"), 1200);
        } else if (data.type === "timeout") {
          stopPoll();
          es.close();
          setPhase("timeout");
        }
      };

      es.onerror = () => { /* polling handles it */ };
    }

    init();

    return () => {
      esRef.current?.close();
      stopPoll();
    };
  }, [profile?.id, router, startStatusPoll, stopPoll]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      <header className="flex items-center gap-3 px-4 py-4">
        <Link href="/groups" className="grid h-10 w-10 shrink-0 place-items-center text-primary">
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-lg font-bold">Connect WhatsApp</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12">

        {phase === "loading" && (
          <>
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="text-sm text-on-surface-variant">Connecting to WhatsApp…</p>
            <p className="text-[11px] text-on-surface-variant/60">QR code will appear in a moment</p>
          </>
        )}

        {phase === "qr" && qrImage && (
          <>
            <div className="rounded-3xl bg-white p-4 shadow-float">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImage} alt="WhatsApp QR Code" width={256} height={256} />
            </div>
            <div className="max-w-xs text-center">
              <p className="font-semibold">Scan with WhatsApp</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Open WhatsApp → ⋮ or Settings → Linked Devices → Link a Device, then scan this code.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-low px-4 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
              <span className="text-[13px] text-on-surface-variant">Waiting for scan…</span>
            </div>
          </>
        )}

        {phase === "connected" && (
          <>
            <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/10 text-4xl">✅</div>
            <div className="text-center">
              <p className="text-xl font-bold text-primary">Connected!</p>
              <p className="mt-1 text-sm text-on-surface-variant">Redirecting to group selection…</p>
            </div>
          </>
        )}

        {(phase === "timeout" || phase === "error") && (
          <>
            <div className="grid h-20 w-20 place-items-center rounded-full bg-error/10 text-4xl">⏱️</div>
            <div className="text-center">
              <p className="font-semibold">
                {phase === "timeout" ? "QR Code Expired" : "Connection Error"}
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {phase === "timeout" ? "The QR code timed out. Please try again." : "Something went wrong. Please try again."}
              </p>
            </div>
            <button onClick={() => window.location.reload()} className="btn-primary h-12 px-8">
              Try Again
            </button>
          </>
        )}
      </div>

      <p className="px-6 pb-8 text-center text-[11px] text-on-surface-variant/60">
        Beyond Kw uses an open-source library to connect to WhatsApp Web. Your messages stay in WhatsApp — only group metadata and polls are accessed.
      </p>
    </div>
  );
}
