"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import Toggle from "@/components/Toggle";
import { XIcon, PlusIcon } from "@/components/icons";
import {
  currentUser,
  notifications as seedNotifications,
  SUGGESTED_INTERESTS,
} from "@/lib/mock-data";
import { useUser } from "@/lib/user-store";

const stats = [
  { label: "Outings", value: 24 },
  { label: "Places", value: 18 },
  { label: "Friends", value: 7 },
];

const prefMeta = [
  { key: "pings", label: "Pings nearby", desc: "When a friend is close by" },
  { key: "plans", label: "Plan invites", desc: "When you're invited to an outing" },
  { key: "recs", label: "AI recommendations", desc: "New picks for your groups" },
  { key: "reminders", label: "Booking reminders", desc: "Before a planned outing" },
] as const;

export default function ProfilePage() {
  const { interests, addInterest, removeInterest } = useUser();
  const [editingInterests, setEditingInterests] = useState(false);
  const [newInterest, setNewInterest] = useState("");

  const [notifs, setNotifs] = useState(seedNotifications);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    pings: true,
    plans: true,
    recs: true,
    reminders: false,
  });

  const unread = notifs.filter((n) => !n.read).length;
  const suggestions = SUGGESTED_INTERESTS.filter(
    (s) => !interests.some((i) => i.toLowerCase() === s.toLowerCase()),
  );

  function submitInterest(e: React.FormEvent) {
    e.preventDefault();
    addInterest(newInterest);
    setNewInterest("");
  }

  return (
    <div className="pb-24">
      {/* Banner + identity */}
      <header className="relative">
        <div className="h-32 bg-gradient-to-br from-primary to-primary-container" />
        <div className="px-5">
          <div className="-mt-10 flex items-end justify-between">
            <div className="rounded-full ring-4 ring-surface">
              <Avatar initials={currentUser.initials} gradient={currentUser.gradient} size="lg" />
            </div>
            <button className="btn-secondary mb-1 h-9 px-4 text-sm">Edit profile</button>
          </div>
          <h1 className="mt-3 text-2xl font-bold">{currentUser.name}</h1>
          <p className="text-sm text-on-surface-variant">📍 {currentUser.city}</p>
        </div>
      </header>

      {/* Stats */}
      <div className="mx-5 mt-4 grid grid-cols-3 divide-x divide-outline-variant/40 rounded-lg bg-card py-3 shadow-soft">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-[12px] text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Interests */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Interests</h2>
          <button
            className="text-sm font-semibold text-primary"
            onClick={() => setEditingInterests((v) => !v)}
          >
            {editingInterests ? "Done" : "Edit"}
          </button>
        </div>

        {interests.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            No interests yet — tap Edit to add some. They help the AI plan better
            outings for you.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-3 py-1.5 text-[13px] font-semibold text-on-primary-fixed-variant"
              >
                {interest}
                {editingInterests && (
                  <button
                    onClick={() => removeInterest(interest)}
                    aria-label={`Remove ${interest}`}
                    className="-mr-1 grid h-4 w-4 place-items-center rounded-full bg-on-primary-fixed-variant/15"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {editingInterests && (
          <div className="mt-4">
            {/* Add a custom interest */}
            <form onSubmit={submitInterest} className="flex items-center gap-2">
              <input
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                className="input"
                placeholder="Add an interest…"
                maxLength={24}
              />
              <button
                type="submit"
                disabled={!newInterest.trim()}
                className="btn-primary h-12 shrink-0 px-4 text-sm disabled:opacity-40"
              >
                Add
              </button>
            </form>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <>
                <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  Suggestions
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => addInterest(s)}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-1.5 text-[13px] font-semibold text-on-surface-variant transition active:scale-95"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Notifications */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Notifications{" "}
            {unread > 0 && (
              <span className="ml-1 rounded-full bg-error px-2 py-0.5 text-[11px] font-bold text-on-error align-middle">
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
                <p className={`text-sm ${n.read ? "text-on-surface-variant" : "font-medium text-on-surface"}`}>
                  {n.message}
                </p>
                <p className="mt-0.5 text-[12px] text-outline">{n.time}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Notification preferences */}
      <section className="px-5 pt-6">
        <h2 className="text-lg font-bold">Notification preferences</h2>
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

      <div className="px-5 pt-6">
        <button className="w-full rounded-full bg-error-container py-3 text-sm font-semibold text-on-error-container transition active:scale-[0.99]">
          Sign out
        </button>
      </div>
    </div>
  );
}
