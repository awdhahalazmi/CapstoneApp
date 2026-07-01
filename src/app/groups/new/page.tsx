"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Toggle from "@/components/Toggle";
import {
  ArrowLeftIcon,
  SearchIcon,
  CheckIcon,
  PlusIcon,
  LockIcon,
  GlobeIcon,
  CameraIcon,
} from "@/components/icons";
import { useSession, useProfile } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { useFriends } from "@/lib/friends-store";
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";
import type { GroupMember } from "@/lib/types";

export default function NewGroupPage() {
  const router = useRouter();
  const session = useSession();
  const { profile } = useProfile();
  const { createGroup } = useGroups();
  const { friends } = useFriends();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Map<string, GroupMember>>(new Map());
  const [isPublic, setIsPublic] = useState(true);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

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
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myAv = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });
  const friendIds = new Set(friends.map((f) => f.id));

  // Load already-pending invites I've sent
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", uid)
      .eq("status", "pending")
      .then(({ data }) => {
        if (data) setPendingIds(new Set(data.map((r) => r.friend_id)));
      });
  }, [session]);
  const [allResults, setAllResults] = useState<GroupMember[]>([]);
  const [searching, setSearching] = useState(false);

  // Search all users when query is typed
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setAllResults([]); setSearching(false); return; }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const uid = session?.user?.id;
      const { data } = await supabase
        .from("profiles")
        .select("id, name, username")
        .ilike("username", `%${q}%`)
        .neq("id", uid ?? "")
        .limit(10);
      setAllResults((data ?? []) as GroupMember[]);
      setSearching(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, session]);

  // When no query, show accepted friends
  const results: GroupMember[] = query.trim() ? allResults : friends;

  async function sendFriendInvite(personId: string) {
    if (!session?.user?.id) return;
    await supabase.from("friendships").insert({
      user_id: session.user.id, friend_id: personId, status: "pending",
    });
    setInviteSent((prev) => new Set(prev).add(personId));
  }

  function toggle(person: GroupMember) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(person.id)) next.delete(person.id);
      else next.set(person.id, person);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim() || interests.size === 0 || creating) return;
    setCreating(true);
    const id = await createGroup({ name, isPublic, memberIds: [...selected.keys()], interests: [...interests] });
    if (id) router.replace(`/groups/${id}`);
    else setCreating(false);
  }

  const selectedList = [...selected.values()];
  const selectedCount = selectedList.length;

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="font-semibold">Sign in to create a group</p>
        <Link href="/login" className="btn-primary mt-4 h-11 px-6">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3.5">
        <Link href="/groups" aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold text-white drop-shadow">Create Group</h1>
        <div className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-white/60">
          <div className={`h-full w-full bg-gradient-to-br ${myAv.gradient} grid place-items-center text-[11px] font-bold text-white`}>
            {myAv.initials}
          </div>
        </div>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto">

        {/* Cover photo + Group Name */}
        <div className="relative h-48 bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 flex flex-col items-center justify-center">
          {/* Camera button */}
          <button className="flex flex-col items-center gap-1.5 text-white/80 active:text-white transition">
            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-white/50 bg-white/10">
              <CameraIcon className="h-5 w-5" />
            </span>
            <span className="text-[12px] font-medium">Add Cover Photo</span>
          </button>

          {/* Group name overlay input */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="absolute bottom-0 inset-x-0 bg-transparent px-5 py-3 text-2xl font-bold text-white placeholder-white/50 outline-none"
            placeholder="Group Name..."
          />
        </div>

        <div className="space-y-4 px-4 pb-36 pt-4">

          {/* Invite Friends card */}
          <div className="rounded-2xl bg-card shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <p className="font-bold">Invite Friends</p>
              {selectedCount > 0 && (
                <span className="rounded-full bg-primary px-3 py-0.5 text-[12px] font-bold text-on-primary">
                  {selectedCount} Selected
                </span>
              )}
            </div>

            {/* Search */}
            <div className="relative mx-4 mb-3">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-full bg-surface-low py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-outline"
                placeholder="Search..."
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            {/* Avatar row */}
            {searching ? (
              <p className="px-4 pb-4 text-[13px] text-on-surface-variant">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-on-surface-variant">
                {query.trim() ? "No users found." : "You have no friends yet."}
              </p>
            ) : (
              <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-4">
                {results.map((person) => {
                  const isFriend = friendIds.has(person.id);
                  const isSel = selected.has(person.id);
                  const isPending = pendingIds.has(person.id) || inviteSent.has(person.id);
                  const av = avatarFor(person);
                  return (
                    <div key={person.id} className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <div className={`h-14 w-14 rounded-full bg-gradient-to-br ${av.gradient} grid place-items-center text-sm font-bold text-white`}>
                          {av.initials}
                        </div>
                        {isFriend && (
                          <button onClick={() => toggle(person)}
                            className={`absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card transition-colors ${isSel ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant"}`}>
                            {isSel ? <CheckIcon className="h-3 w-3" /> : <PlusIcon className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                      <span className="max-w-[60px] truncate text-[11px] font-medium text-on-surface">
                        {person.name || person.username}
                      </span>
                      {!isFriend && (
                        isPending ? (
                          <span className="rounded-full bg-surface-low px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">Pending</span>
                        ) : (
                          <button onClick={() => sendFriendInvite(person.id)}
                            className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary active:scale-95 transition">
                            + Add
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Interests */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Group Interests</p>
              {interests.size === 0 && (
                <span className="text-[12px] text-red-500 font-medium">Pick at least one</span>
              )}
            </div>
            <p className="mb-3 text-[13px] text-on-surface-variant">
              The AI uses these to suggest the perfect places for your outings.
            </p>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(({ key, emoji }) => {
                const active = interests.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleInterest(key)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all active:scale-95 ${
                      active
                        ? "bg-primary text-on-primary shadow-sm"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    <span>{emoji}</span>
                    <span>{key}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary-container text-primary">
              {isPublic ? <GlobeIcon className="h-5 w-5" /> : <LockIcon className="h-5 w-5" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Public Visibility</p>
              <p className="text-[13px] text-on-surface-variant">Anyone can discover &amp; join</p>
            </div>
            <Toggle on={isPublic} onChange={() => setIsPublic((v) => !v)} label="Public" />
          </div>

          {/* Description */}
          <div>
            <p className="mb-2 text-sm font-bold">Group Description <span className="font-normal text-on-surface-variant">(Optional)</span></p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-2xl bg-card px-4 py-3 text-sm shadow-soft outline-none placeholder:text-outline resize-none"
              placeholder="Tell people what this group is about..."
            />
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-0 border-t border-outline-variant/20 bg-surface/90 px-4 py-4 backdrop-blur-md">
        <button
          onClick={handleCreate}
          disabled={!name.trim() || interests.size === 0 || creating}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-container text-base font-semibold text-on-primary shadow-[0_10px_25px_rgba(124,58,237,0.35)] transition disabled:opacity-50 active:scale-[0.98]"
        >
          {creating ? "Creating…" : (
            <>
              Create Group
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
                <path d="M18 8v6M21 11h-6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
