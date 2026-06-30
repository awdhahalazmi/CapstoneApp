"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Toggle from "@/components/Toggle";
import { ArrowLeftIcon } from "@/components/icons";
import { notifications as seedNotifications } from "@/lib/mock-data";

const prefMeta = [
  { key: "pings", label: "Pings nearby", desc: "When a friend is close by" },
  { key: "plans", label: "Plan invites", desc: "When you're invited to an outing" },
  { key: "recs", label: "AI recommendations", desc: "New picks for your groups" },
  { key: "reminders", label: "Booking reminders", desc: "Before a planned outing" },
] as const;

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs] = useState(seedNotifications);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    pings: true,
    plans: true,
    recs: true,
    reminders: false,
  });

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center text-primary"
        >
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
            <button
              className="text-sm font-semibold text-primary"
              onClick={() => setNotifs((ns) => ns.map((n) => ({ ...n, read: true })))}
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="mt-3 divide-y divide-outline-variant/30 overflow-hidden rounded-lg bg-card shadow-soft">
          {notifs.map((n) => (
            <button
              key={n.id}
              onClick={() =>
                setNotifs((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
              }
              className="flex w-full items-start gap-3 p-3.5 text-left transition active:bg-surface-low"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${n.read ? "text-on-surface-variant" : "font-medium text-on-surface"}`}
                >
                  {n.message}
                </p>
                <p className="mt-0.5 text-[12px] text-outline">{n.time}</p>
              </div>
            </button>
          ))}
        </div>
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
              <Toggle
                on={prefs[p.key]}
                onChange={() => setPrefs((s) => ({ ...s, [p.key]: !s[p.key] }))}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
