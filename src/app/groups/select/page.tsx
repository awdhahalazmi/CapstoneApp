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
        const { data: group } = await supabase
          .from("groups")
          .insert({
            name: waGroup.name,
            emoji: pickEmoji(jid),
            owner_id: userId,
            is_public: false,
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
            onClick={syncSelected}
            disabled={saving}
            className="btn-primary h-10 px-4 text-sm disabled:opacity-50"
          >
            {saving ? "Syncing…" : `Sync ${newSelections.length}`}
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
                    checked
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "bg-card shadow-soft"
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
                  <div
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      checked ? "bg-primary text-on-primary" : "border-2 border-outline-variant"
                    }`}
                  >
                    {checked && <CheckIcon className="h-3.5 w-3.5" />}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
