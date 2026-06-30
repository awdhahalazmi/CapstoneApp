"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Toggle from "@/components/Toggle";
import {
  ArrowLeftIcon,
  SearchIcon,
  CheckIcon,
  PlusIcon,
  GlobeIcon,
  LockIcon,
  TrashIcon,
  CameraIcon,
} from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { useProfile } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";
import type { GroupMember } from "@/lib/types";

export default function EditGroupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { profile } = useProfile();
  const { groups, loading, updateGroup, deleteGroup, addMember, removeMember } = useGroups();

  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = groups.find((g) => g.id === params.id);
  const myAv = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });

  // Search profiles by username
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, username")
        .ilike("username", `%${q}%`)
        .limit(8);
      setResults((data ?? []) as GroupMember[]);
      setSearching(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  if (loading) return <CenteredNote text="Loading…" />;
  if (!group) {
    return (
      <CenteredNote text="This group is no longer available.">
        <Link href="/groups" className="btn-primary mt-4 h-11 px-5">Back to groups</Link>
      </CenteredNote>
    );
  }

  const viewHref = `/groups/${group.id}`;
  const nameValue = nameOverride ?? group.name;
  const memberIds = new Set(group.members.map((m) => m.id));

  async function saveName() {
    if (!group || !nameValue.trim() || nameValue === group.name) return;
    setSaving(true);
    await updateGroup(group.id, { name: nameValue.trim() });
    setSaving(false);
    setNameOverride(null);
  }

  async function handleDelete() {
    if (!group) return;
    await deleteGroup(group.id);
    router.push("/groups");
  }

  // Avatar row: current members + search results merged
  const displayPeople: (GroupMember & { isMember: boolean })[] = query.trim()
    ? results.map((r) => ({ ...r, isMember: memberIds.has(r.id) }))
    : group.members.map((m) => ({ ...m, isMember: true }));

  return (
    <div className="flex h-full flex-col">
      {/* Floating header over hero */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3.5">
        <Link href={viewHref} aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold text-white drop-shadow">Edit Group</h1>
        <div className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-white/60">
          <div className={`h-full w-full bg-gradient-to-br ${myAv.gradient} grid place-items-center text-[11px] font-bold text-white`}>
            {myAv.initials}
          </div>
        </div>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto">

        {/* Cover photo + name */}
        <div className="relative h-48 bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 flex flex-col items-center justify-center">
          <button className="flex flex-col items-center gap-1.5 text-white/80 active:text-white transition">
            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-white/50 bg-white/10">
              <CameraIcon className="h-5 w-5" />
            </span>
            <span className="text-[12px] font-medium">Change Cover Photo</span>
          </button>
          <input
            value={nameValue}
            onChange={(e) => setNameOverride(e.target.value)}
            onBlur={saveName}
            className="absolute bottom-0 inset-x-0 bg-transparent px-5 py-3 text-2xl font-bold text-white placeholder-white/50 outline-none"
            placeholder="Group Name..."
          />
          {saving && (
            <span className="absolute bottom-3 right-4 text-[12px] text-white/70">Saving…</span>
          )}
        </div>

        <div className="space-y-4 px-4 pb-36 pt-4">

          {/* Members card */}
          <div className="rounded-2xl bg-card shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="font-bold">Members</p>
              <span className="rounded-full bg-primary px-3 py-0.5 text-[12px] font-bold text-on-primary">
                {group.members.length} {group.members.length === 1 ? "member" : "members"}
              </span>
            </div>

            {/* Search */}
            <div className="relative mx-4 mb-3">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-full bg-surface-low py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-outline"
                placeholder="Search by username to add..."
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            {/* Avatar row */}
            {searching ? (
              <p className="px-4 pb-4 text-sm text-on-surface-variant">Searching…</p>
            ) : displayPeople.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-on-surface-variant">
                {query.trim() ? `No users found for @${query.trim()}` : "No members yet."}
              </p>
            ) : (
              <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4">
                {displayPeople.map((person) => {
                  const av = avatarFor(person);
                  return (
                    <button key={person.id}
                      onClick={() => person.isMember ? removeMember(group.id, person.id) : addMember(group.id, person.id)}
                      className="flex flex-col items-center gap-1 transition active:scale-95">
                      <div className="relative">
                        <div className={`h-14 w-14 rounded-full bg-gradient-to-br ${av.gradient} grid place-items-center text-sm font-bold text-white`}>
                          {av.initials}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card transition-colors ${person.isMember ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant"}`}>
                          {person.isMember ? <CheckIcon className="h-3 w-3" /> : <PlusIcon className="h-3 w-3" />}
                        </span>
                      </div>
                      <span className="max-w-[56px] truncate text-[11px] font-medium text-on-surface">
                        {person.name || person.username}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary-container text-primary">
              {group.isPublic ? <GlobeIcon className="h-5 w-5" /> : <LockIcon className="h-5 w-5" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Public Visibility</p>
              <p className="text-[13px] text-on-surface-variant">Anyone can discover &amp; join</p>
            </div>
            <Toggle on={group.isPublic} onChange={() => updateGroup(group.id, { isPublic: !group.isPublic })} label="Public" />
          </div>

          {/* Delete */}
          {confirmDelete ? (
            <div className="rounded-2xl bg-error-container/60 p-4 text-center">
              <p className="text-sm font-semibold text-on-error-container">
                Delete "{group.name}"? This can't be undone.
              </p>
              <div className="mt-3 flex gap-3">
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary h-11 flex-1">Cancel</button>
                <button onClick={handleDelete}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-error text-[15px] font-semibold text-on-error transition active:scale-[0.98]">
                  <TrashIcon className="h-4 w-4" /> Delete
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-error transition active:scale-[0.99]">
              <TrashIcon className="h-4 w-4" /> Delete group
            </button>
          )}
        </div>
      </div>

      {/* Sticky Done */}
      <div className="sticky bottom-0 border-t border-outline-variant/20 bg-surface/90 px-4 py-4 backdrop-blur-md">
        <Link href={viewHref}
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-gradient-to-r from-primary to-primary-container text-base font-semibold text-on-primary shadow-[0_10px_25px_rgba(124,58,237,0.35)] transition active:scale-[0.98]">
          Done
        </Link>
      </div>
    </div>
  );
}

function CenteredNote({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <p className="text-on-surface-variant">{text}</p>
      {children}
    </div>
  );
}
