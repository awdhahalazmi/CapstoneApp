"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { PlusIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { useSession, useProfile } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";

type WAStatus = "idle" | "checking" | "connected" | "connecting" | "disconnected";

const TINTS: [string, string][] = [
  ["#ede9fe", "#6d28d9"],
  ["#d1fae5", "#059669"],
  ["#fef3c7", "#d97706"],
  ["#dbeafe", "#2563eb"],
  ["#fce7f3", "#db2777"],
  ["#dcfce7", "#16a34a"],
];
function tintFor(id: string): [string, string] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

type Group = ReturnType<typeof useGroups>["groups"][number];

function GroupCard({ group, waLinked }: { group: Group; waLinked: boolean }) {
  const [bg, accent] = tintFor(group.id);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_6px_rgba(0,0,0,0.08)] transition-all active:scale-[0.99]">
      {waLinked && <div className="h-0.5 w-full bg-[#25d366]" />}

      {/* Card header — tapping opens group detail */}
      <Link href={`/groups/${group.id}`} className="flex items-center gap-3.5 px-4 pt-4 pb-3">
        <div
          className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl"
          style={{ backgroundColor: bg }}
        >
          {group.emoji}
          {waLinked && (
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#25d366] shadow-sm">
              <WhatsAppIcon className="h-3 w-3 text-white" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span className="truncate text-[16px] font-semibold text-gray-900">
            {group.name}
          </span>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <p className="text-[13px] text-gray-400">
              {group.isPublic ? "Public" : "Private"} · {group.members.length}{" "}
              {group.members.length === 1 ? "member" : "members"}
            </p>
            {waLinked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#25d366]/10 px-2 py-0.5 text-[11px] font-semibold text-[#128c7e]">
                <WhatsAppIcon className="h-2.5 w-2.5" />
                Connected
              </span>
            )}
          </div>

          {group.members.length > 0 && (
            <div className="mt-2 flex -space-x-1.5">
              {group.members.slice(0, 5).map((m) => {
                const { gradient, initials } = avatarFor(m);
                return (
                  <div key={m.id} className="rounded-full ring-2 ring-white">
                    <Avatar initials={initials} gradient={gradient} size="sm" />
                  </div>
                );
              })}
              {group.members.length > 5 && (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-500 ring-2 ring-white">
                  +{group.members.length - 5}
                </div>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Divider */}
      <div className="mx-4 h-px bg-gray-100" />

      {/* Action row */}
      <div className="flex gap-2 px-4 py-3">
        <Link
          href={`/groups/${group.id}/plan`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition active:scale-[0.97]"
          style={{ backgroundColor: bg, color: accent }}
        >
          <span>📊</span> Polls
        </Link>
        {waLinked ? (
          <Link
            href={`/groups/${group.id}/whatsapp`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25d366]/10 py-2 text-[13px] font-medium text-[#128c7e] transition active:scale-[0.97]"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            WhatsApp
          </Link>
        ) : (
          <Link
            href={`/groups/${group.id}/chat`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-50 py-2 text-[13px] font-medium text-gray-500 transition active:scale-[0.97]"
          >
            <span>💬</span> Chat
          </Link>
        )}
      </div>
    </div>
  );
}

function GroupSkeleton() {
  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-3.5 px-4 py-4">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
          <div className="mt-2 flex gap-1.5">
            <div className="h-6 w-6 animate-pulse rounded-full bg-gray-100" />
            <div className="h-6 w-6 animate-pulse rounded-full bg-gray-100" />
            <div className="h-6 w-6 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-2 mt-1 px-1 text-[12px] font-semibold uppercase tracking-widest text-gray-400">
      {label}
    </p>
  );
}

export default function GroupsPage() {
  const session = useSession();
  const { profile } = useProfile();
  const { groups, loading } = useGroups();
  const [waStatus, setWaStatus] = useState<WAStatus>("idle");
  const [waLinkedJids, setWaLinkedJids] = useState<Set<string>>(new Set());

  const checkWAStatus = useCallback(async () => {
    if (!profile?.id) return;
    setWaStatus("checking");
    try {
      const res = await fetch(`/api/whatsapp/status?userId=${profile.id}`);
      const { status } = await res.json();
      setWaStatus(
        status === "connected"
          ? "connected"
          : status === "connecting" || status === "qr"
            ? "connecting"
            : "disconnected"
      );
      const { data } = await supabase
        .from("whatsapp_group_links")
        .select("group_id")
        .eq("user_id", profile.id);
      setWaLinkedJids(
        new Set((data ?? []).map((r: { group_id: string }) => r.group_id))
      );
    } catch {
      setWaStatus("disconnected");
    }
  }, [profile?.id]);

  useEffect(() => {
    checkWAStatus();
  }, [checkWAStatus]);

  async function handleDisconnect() {
    if (!profile?.id) return;
    await fetch(`/api/whatsapp/disconnect?userId=${profile.id}`, {
      method: "DELETE",
    });
    setWaStatus("disconnected");
    setWaLinkedJids(new Set());
  }

  // Sort: WA-connected groups first, then others
  const waGroups = groups.filter((g) => waLinkedJids.has(g.id));
  const otherGroups = groups.filter((g) => !waLinkedJids.has(g.id));
  const showSections = waGroups.length > 0 && otherGroups.length > 0;

  return (
    <div className="min-h-[100dvh] bg-[#f5f5f7] pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-[#f5f5f7]/90 px-5 pb-2 pt-5 backdrop-blur-md">
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900">
          Groups
        </h1>
        {session && (
          <Link
            href="/groups/new"
            className="grid h-9 w-9 place-items-center rounded-full bg-gray-900 text-white shadow-sm transition active:scale-95"
          >
            <PlusIcon className="h-4 w-4" />
          </Link>
        )}
      </header>

      {!session ? (
        <div className="mx-5 mt-8 rounded-2xl bg-white p-8 text-center shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gray-100 text-4xl">
            👥
          </div>
          <p className="text-[18px] font-semibold text-gray-900">
            Sign in to see your groups
          </p>
          <p className="mt-1.5 text-[14px] text-gray-400">
            Create groups and run polls with friends.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-full bg-gray-900 px-7 py-2.5 text-[14px] font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="px-4 pt-3">
          {/* WhatsApp status */}
          {waStatus !== "checking" && waStatus !== "idle" && (
            <div className="mb-4">
              {waStatus === "connected" ? (
                <div className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <WhatsAppIcon className="h-4 w-4 text-[#25d366]" />
                  <span className="flex-1 whitespace-nowrap text-[13px] font-medium text-gray-700">
                    WhatsApp connected
                  </span>
                  <Link
                    href="/groups/select"
                    className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-[#25d366]"
                  >
                    + Add group
                  </Link>
                  <span className="shrink-0 text-gray-200">|</span>
                  <button
                    onClick={handleDisconnect}
                    className="shrink-0 whitespace-nowrap text-[12px] text-gray-400"
                  >
                    Disconnect
                  </button>
                </div>
              ) : waStatus === "connecting" ? (
                <div className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-[#25d366]" />
                  <span className="text-[13px] text-gray-400">
                    Reconnecting WhatsApp…
                  </span>
                </div>
              ) : (
                <Link
                  href="/groups/connect"
                  className="flex items-center gap-3 rounded-2xl bg-[#25d366] px-4 py-3.5 transition active:scale-[0.99]"
                >
                  <WhatsAppIcon className="h-5 w-5 shrink-0 text-white" />
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-white">
                      Connect WhatsApp
                    </p>
                    <p className="text-[11px] text-white/75">
                      Sync groups and run polls
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-white/60">
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                  </svg>
                </Link>
              )}
            </div>
          )}

          {/* Group list */}
          {loading ? (
            <div className="space-y-3">
              <GroupSkeleton />
              <GroupSkeleton />
              <GroupSkeleton />
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl bg-white px-6 py-14 text-center shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
              <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gray-100 text-4xl">
                👥
              </div>
              <p className="text-[18px] font-semibold text-gray-900">
                No groups yet
              </p>
              <p className="mt-1.5 text-[13px] text-gray-400">
                Create a group to start polling and chatting with friends.
              </p>
              <Link
                href="/groups/new"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-6 py-2.5 text-[13px] font-semibold text-white"
              >
                <PlusIcon className="h-4 w-4" />
                Create a group
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* WhatsApp-connected groups first */}
              {waGroups.length > 0 && (
                <>
                  {showSections && (
                    <SectionLabel label="WhatsApp Groups" />
                  )}
                  {waGroups.map((g) => (
                    <GroupCard key={g.id} group={g} waLinked={true} />
                  ))}
                </>
              )}

              {/* Other groups */}
              {otherGroups.length > 0 && (
                <>
                  {showSections && (
                    <SectionLabel label="Other Groups" />
                  )}
                  {otherGroups.map((g) => (
                    <GroupCard key={g.id} group={g} waLinked={false} />
                  ))}
                </>
              )}

              {/* Create new group */}
              <Link
                href="/groups/new"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white py-4 text-[13px] font-medium text-gray-400 transition active:scale-[0.99]"
              >
                <PlusIcon className="h-4 w-4" />
                New group
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
