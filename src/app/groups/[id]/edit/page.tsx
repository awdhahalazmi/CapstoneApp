"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Toggle from "@/components/Toggle";
import {
  ArrowLeftIcon,
  SearchIcon,
  CheckIcon,
  PlusIcon,
  GlobeIcon,
  LockIcon,
  TrashIcon,
} from "@/components/icons";
import { friends } from "@/lib/mock-data";
import { useGroups } from "@/lib/groups-store";

// True only after client hydration — avoids rendering "not found" for groups
// that live in localStorage (and aren't in the server seed) during hydration.
const noopSubscribe = () => () => {};
function useIsHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export default function EditGroupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { groups, updateGroup, deleteGroup } = useGroups();
  const hydrated = useIsHydrated();

  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const group = groups.find((g) => g.id === params.id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || f.tagline?.toLowerCase().includes(q),
    );
  }, [query]);

  if (!hydrated) {
    return <CenteredNote text="Loading…" />;
  }

  if (!group) {
    return (
      <CenteredNote text="This group is no longer available.">
        <Link href="/groups" className="btn-primary mt-4 h-11 px-5">
          Back to groups
        </Link>
      </CenteredNote>
    );
  }

  const viewHref = `/groups/${group.id}`;
  const memberIds = group.memberIds;
  const memberCount = memberIds.length;

  function toggleMember(friendId: string) {
    if (!group) return;
    const next = memberIds.includes(friendId)
      ? memberIds.filter((id) => id !== friendId)
      : [...memberIds, friendId];
    updateGroup(group.id, { memberIds: next });
  }

  function handleDelete() {
    if (!group) return;
    deleteGroup(group.id);
    router.push("/groups");
  }

  return (
    <div className="pb-28">
      {/* Top bar */}
      <header className="sticky top-0 z-20 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <Link
          href={viewHref}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center text-primary"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-center text-lg font-bold text-primary">Edit Group</h1>
        <div className="grid h-10 w-10 place-items-center rounded-md bg-secondary-container text-xl">
          {group.emoji}
        </div>
      </header>

      <div className="px-5 pt-4">
        {/* Group name — saved live */}
        <label htmlFor="group-name" className="text-sm font-bold">
          Group Name
        </label>
        <input
          id="group-name"
          value={group.name}
          onChange={(e) => updateGroup(group.id, { name: e.target.value })}
          className="input mt-2"
          placeholder="Group name"
        />

        {/* Members */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-sm font-bold">Members</h2>
          <span className="text-sm font-semibold text-primary">
            {memberCount} {memberCount === 1 ? "member" : "members"}
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

        <ul className="mt-3 space-y-3">
          {filtered.map((f) => {
            const isMember = memberIds.includes(f.id);
            const subtitle =
              f.tagline ?? (f.online ? "Online now" : `Active ${f.lastSeen}`);
            return (
              <li key={f.id}>
                <button
                  onClick={() => toggleMember(f.id)}
                  aria-pressed={isMember}
                  className="flex w-full items-center gap-3 rounded-lg bg-card p-3 text-left shadow-soft transition active:scale-[0.99]"
                >
                  <Avatar initials={f.initials} gradient={f.gradient} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{f.name}</p>
                    <p className="truncate text-[13px] text-on-surface-variant">
                      {subtitle}
                    </p>
                  </div>
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
                      isMember
                        ? "bg-primary text-on-primary"
                        : "bg-surface-high text-on-surface-variant"
                    }`}
                  >
                    {isMember ? (
                      <CheckIcon className="h-5 w-5" />
                    ) : (
                      <PlusIcon className="h-5 w-5" />
                    )}
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

        {/* Public / private */}
        <div className="mt-5 flex items-center gap-3 rounded-lg bg-surface-low p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-secondary-container text-primary">
            {group.isPublic ? (
              <GlobeIcon className="h-5 w-5" />
            ) : (
              <LockIcon className="h-5 w-5" />
            )}
          </span>
          <div className="flex-1">
            <p className="font-semibold">
              {group.isPublic ? "Public Group" : "Private Group"}
            </p>
            <p className="text-[13px] text-on-surface-variant">
              {group.isPublic
                ? "Anyone can join your group"
                : "Only invited friends can join"}
            </p>
          </div>
          <Toggle
            on={!!group.isPublic}
            onChange={() => updateGroup(group.id, { isPublic: !group.isPublic })}
            label="Public group"
          />
        </div>

        {/* Done */}
        <Link href={viewHref} className="btn-primary mt-6 flex h-[52px] w-full text-base">
          Done
        </Link>

        {/* Delete — two-step confirm */}
        {confirmDelete ? (
          <div className="mt-3 rounded-lg bg-error-container/60 p-3 text-center">
            <p className="text-sm font-semibold text-on-error-container">
              Delete “{group.name}”? This can’t be undone.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary h-11 flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-error text-[15px] font-semibold text-on-error transition active:scale-[0.98]"
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-error transition active:scale-[0.99]"
          >
            <TrashIcon className="h-4 w-4" />
            Delete group
          </button>
        )}
      </div>
    </div>
  );
}

function CenteredNote({
  text,
  children,
}: {
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <p className="text-on-surface-variant">{text}</p>
      {children}
    </div>
  );
}
