"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Toggle from "@/components/Toggle";
import { ArrowLeftIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/use-session";

type Notification = {
  id: string;
  message: string;
  kind: string;
  read: boolean;
  created_at: string;
};

const prefMeta = [
  { key: "pings", label: "Pings nearby", desc: "When a friend is close by" },
  { key: "plans", label: "Plan invites", desc: "When you're invited to an outing" },
  { key: "recs", label: "AI recommendations", desc: "New picks for your groups" },
  { key: "reminders", label: "Booking reminders", desc: "Before a planned outing" },
] as const;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    pings: true,
    plans: true,
    recs: true,
    reminders: false,
  });

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("notifications")
      .select("id, message, kind, read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setNotifs((data ?? []) as Notification[]));
  }, [profile?.id]);

  const unread = notifs.filter((n) => !n.read).length;

  async function markAllRead() {
    if (!profile?.id) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", profile.id).eq("read", false);
    setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
  }

  async function markOneRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifs((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <button onClick={() => router.back()} aria-label="Back" className="grid h-10 w-10 place-items-center text-primary">
          <ArrowLeftIcon />
        </button>
        <h1 className="text-center text-lg font-bold text-primary">Notifications</h1>
        <span />
      </header>

      <section className="px-5 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Recent{" "}
            {unread > 0 && (
              <span className="ml-1 rounded-full bg-error px-2 py-0.5 align-middle text-[11px] font-bold text-on-error">
                {unread}
              </span>
            )}
          </h2>
          {unread > 0 && (
            <button className="text-sm font-semibold text-primary" onClick={markAllRead}>
              Mark all read
            </button>
          )}
        </div>

        {notifs.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl bg-card py-12 text-center shadow-soft">
            <span className="text-4xl">🔔</span>
            <p className="mt-3 font-semibold">No notifications yet</p>
            <p className="mt-1 text-sm text-on-surface-variant">We&apos;ll let you know when something happens.</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-outline-variant/30 overflow-hidden rounded-lg bg-card shadow-soft">
            {notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => markOneRead(n.id)}
                className="flex w-full items-start gap-3 p-3.5 text-left transition active:bg-surface-low"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read ? "text-on-surface-variant" : "font-medium text-on-surface"}`}>
                    {n.message}
                  </p>
                  <p className="mt-0.5 text-[12px] text-outline">{timeAgo(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="px-5 pt-6">
        <h2 className="text-lg font-bold">Preferences</h2>
        <div className="mt-3 divide-y divide-outline-variant/30 overflow-hidden rounded-lg bg-card shadow-soft">
          {prefMeta.map((p) => (
            <div key={p.key} className="flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-[12px] text-on-surface-variant">{p.desc}</p>
              </div>
              <Toggle on={prefs[p.key]} onChange={() => setPrefs((s) => ({ ...s, [p.key]: !s[p.key] }))} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
