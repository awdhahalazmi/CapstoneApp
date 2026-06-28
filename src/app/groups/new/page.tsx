"use client";

import { useMemo, useState } from "react";
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
  UserPlusIcon,
} from "@/components/icons";
import { friends, currentUser } from "@/lib/mock-data";
import { useGroups } from "@/lib/groups-store";

export default function NewGroupPage() {
  const router = useRouter();
  const { addGroup } = useGroups();
  const [groupName, setGroupName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPublic, setIsPublic] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.tagline?.toLowerCase().includes(q),
    );
  }, [query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canCreate = groupName.trim().length > 0 && selected.size > 0;

  function handleCreate() {
    if (!canCreate) return;
    // Persist via the client-side store (localStorage). When the backend lands,
    // swap this for a Supabase insert.
    addGroup({
      name: groupName,
      memberIds: [...selected],
      isPublic,
    });
    router.push("/groups");
  }

  return (
    <div className="pb-28">
      {/* Top bar */}
      <header className="sticky top-0 z-20 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <Link
          href="/groups"
          aria-label="Back"
          className="grid h-10 w-10 place-items-center text-primary"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-center text-lg font-bold text-primary">
          Create New Group
        </h1>
        <Avatar initials={currentUser.initials} gradient={currentUser.gradient} size="sm" />
      </header>

      <div className="px-5 pt-4">
        {/* Group name */}
        <label htmlFor="group-name" className="text-sm font-bold">
          Group Name
        </label>
        <input
          id="group-name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="input mt-2"
          placeholder="e.g., Weekend Explorers"
        />

        {/* Invite friends */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-sm font-bold">Invite Friends</h2>
          <span className="text-sm font-semibold text-primary">
            {selected.size} Selected
          </span>
        </div>

        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-11"
            placeholder="Search friends..."
          />
        </div>

        {/* Friend list */}
        <ul className="mt-3 space-y-3">
          {filtered.map((f) => {
            const isSel = selected.has(f.id);
            const subtitle = f.tagline ?? (f.online ? "Online now" : `Active ${f.lastSeen}`);
            return (
              <li key={f.id}>
                <button
                  onClick={() => toggle(f.id)}
                  aria-pressed={isSel}
                  className="flex w-full items-center gap-3 rounded-lg bg-card p-3 text-left shadow-soft transition active:scale-[0.99]"
                >
                  <Avatar initials={f.initials} gradient={f.gradient} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{f.name}</p>
                    <p className="truncate text-[13px] text-on-surface-variant">{subtitle}</p>
                  </div>
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
                      isSel ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant"
                    }`}
                  >
                    {isSel ? <CheckIcon className="h-5 w-5" /> : <PlusIcon className="h-5 w-5" />}
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-lg bg-surface-low py-6 text-center text-sm text-on-surface-variant">
              No friends match “{query}”.
            </li>
          )}
        </ul>

        {/* Public / private toggle */}
        <div className="mt-5 flex items-center gap-3 rounded-lg bg-surface-low p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-secondary-container text-primary">
            {isPublic ? <GlobeIcon className="h-5 w-5" /> : <LockIcon className="h-5 w-5" />}
          </span>
          <div className="flex-1">
            <p className="font-semibold">{isPublic ? "Public Group" : "Private Group"}</p>
            <p className="text-[13px] text-on-surface-variant">
              {isPublic ? "Anyone can join your group" : "Only invited friends can join"}
            </p>
          </div>
          <Toggle on={isPublic} onChange={() => setIsPublic((v) => !v)} label="Public group" />
        </div>

        {/* Create */}
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="btn-primary mt-6 h-[52px] w-full text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create Group
          <UserPlusIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
