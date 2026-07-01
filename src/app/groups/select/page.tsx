"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon } from "@/components/icons";
import { useProfile } from "@/lib/supabase/use-session";
import { supabase } from "@/lib/supabase/client";
import type { WAGroup } from "@/lib/whatsapp/manager";

// emoji options for auto-assigned group icon
const GROUP_EMOJIS = ["🗺️", "✈️", "🏖️", "🌴", "🎉", "☕", "🍕", "🎶", "🏋️", "🛍️"];
function pickEmoji(jid: string) {
  let h = 0;
  for (let i = 0; i < jid.length; i++) h = (h * 31 + jid.charCodeAt(i)) >>> 0;
  return GROUP_EMOJIS[h % GROUP_EMOJIS.length];
}

export default function SelectGroupsPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const userId = profile?.id;

  const [waGroups, setWaGroups] = useState<WAGroup[]>([]);
  const [alreadyLinked, setAlreadyLinked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [showInterests, setShowInterests] = useState(false);

  const INTEREST_OPTIONS = [
    { key: "Cafés", emoji: "☕" },
    { key: "Restaurants", emoji: "🍽️" },
    { key: "Cinema", emoji: "🎬" },
    { key: "Outdoors", emoji: "🏖️" },
    { key: "Gaming", emoji: "🎮" },
    { key: "Shopping", emoji: "🛍️" },
    { key: "Nightlife", emoji: "🎵" },
    { key: "Sports", emoji: "⚽" },
    { key: "Culture", emoji: "🎨" },
    { key: "Fast Food", emoji: "🍕" },
  ];

  function toggleInterest(key: string) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Fetch WA groups from Baileys backend
      const res = await fetch(`/api/whatsapp/groups?userId=${userId}`);
      if (!res.ok) {
        const e = await res.json();
        setError(e.error ?? "Failed to load groups");
        return;
      }
      const { groups } = await res.json();
      setWaGroups(groups ?? []);

      // Fetch already-linked groups from Supabase
      const { data: links } = await supabase
        .from("whatsapp_group_links")
        .select("wa_jid")
        .eq("user_id", userId);
      setAlreadyLinked(new Set((links ?? []).map((l: { wa_jid: string }) => l.wa_jid)));
    } catch {
      setError("Network error. Make sure the dev server is running.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function toggle(jid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) next.delete(jid);
      else next.add(jid);
      return next;
    });
  }

  async function syncSelected() {
    if (!userId || !profile) return;
    setSaving(true);
    try {
      for (const jid of selected) {
        if (alreadyLinked.has(jid)) continue;
        const waGroup = waGroups.find((g) => g.id === jid);
        if (!waGroup) continue;

        // 1. Create app group
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: group } = await (supabase.from("groups") as any)
          .insert({
            name: waGroup.name,
            emoji: pickEmoji(jid),
            owner_id: userId,
            is_public: false,
            interests: [...interests],
          })
          .select()
          .single();
        if (!group) continue;

        // 2. Add user as member
        await supabase.from("group_members").insert({
          group_id: group.id,
          member_id: userId,
        });

        // 3. Save WA link
        await supabase.from("whatsapp_group_links").upsert({
          user_id: userId,
          wa_jid: jid,
          wa_name: waGroup.name,
          wa_participant_count: waGroup.participantCount,
          group_id: group.id,
        });

        // 4. Send announcement in WA group
        await fetch("/api/whatsapp/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            waJid: jid,
            question: "🗺️ Trip planning is now connected!",
            options: ["Ready to plan!", "Let's go!"],
            announcementText: `🗺️ *Beyond Kw — Trip Planning*\nThis group is now connected. Use the app to pin places, plan outings, and send polls for group decisions!`,
          }),
        }).catch(() => {/* non-fatal */});
      }

      router.push("/groups");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const newSelections = [...selected].filter((j) => !alreadyLinked.has(j));

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-outline-variant/40 bg-surface/90 px-4 py-3.5 backdrop-blur-md">
        <Link
          href="/groups"
          className="grid h-10 w-10 shrink-0 place-items-center text-primary"
        >
          <ArrowLeftIcon />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold">Choose Groups</h1>
          <p className="text-[12px] text-on-surface-variant">Select WhatsApp groups to sync</p>
        </div>
        {newSelections.length > 0 && (
          <button
            onClick={() => setShowInterests(true)}
            disabled={saving}
            className="btn-primary h-10 px-4 text-sm disabled:opacity-50"
          >
            Next →
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {!loading && !error && waGroups.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl">💬</span>
            <p className="font-semibold">No WhatsApp groups found</p>
            <p className="text-sm text-on-surface-variant">
              You need to be in at least one WhatsApp group.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {waGroups.map((g) => {
            const linked = alreadyLinked.has(g.id);
            const checked = linked || selected.has(g.id);
            return (
              <li key={g.id}>
                <button
                  onClick={() => !linked && toggle(g.id)}
                  disabled={linked}
                  className={`flex w-full items-center gap-3 rounded-2xl p-4 transition active:scale-[0.99] ${
                    checked ? "bg-primary/10 ring-1 ring-primary/30" : "bg-card shadow-soft"
                  } ${linked ? "cursor-default opacity-70" : ""}`}
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#25d366]/10 text-2xl">
                    💬
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-semibold">{g.name}</p>
                    <p className="text-[12px] text-on-surface-variant">
                      {g.participantCount} participant{g.participantCount !== 1 ? "s" : ""}
                      {linked && " · Already synced"}
                    </p>
                  </div>
                  <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${checked ? "bg-primary text-on-primary" : "border-2 border-outline-variant"}`}>
                    {checked && <CheckIcon className="h-3.5 w-3.5" />}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Interests bottom sheet ── */}
      {showInterests && (
        <>
          <div onClick={() => setShowInterests(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-surface-container pb-safe">
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-8 rounded-full bg-on-surface-variant/30" />
            </div>
            <div className="px-6 pb-8 pt-4">
              <h2 className="text-[20px] font-semibold text-on-surface">What does this group enjoy?</h2>
              <p className="mt-1 text-[13px] text-on-surface-variant">
                AI uses these to suggest the perfect places for your outings.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map(({ key, emoji }) => {
                  const active = interests.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleInterest(key)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium transition-all active:scale-95 ${
                        active ? "bg-primary text-on-primary shadow-sm" : "bg-surface-high text-on-surface-variant"
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{key}</span>
                    </button>
                  );
                })}
              </div>

              {interests.size === 0 && (
                <p className="mt-3 text-[12px] text-amber-600">Pick at least one so AI can suggest places.</p>
              )}

              <button
                onClick={syncSelected}
                disabled={saving || interests.size === 0}
                className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 text-[16px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.3)] transition active:scale-[0.97] disabled:opacity-50"
              >
                {saving ? "Syncing…" : `Sync ${newSelections.length} group${newSelections.length !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => setShowInterests(false)}
                className="mt-3 w-full py-2 text-center text-[14px] text-on-surface-variant"
              >
                Back
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
