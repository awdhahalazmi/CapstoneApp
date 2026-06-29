"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import {
  ArrowLeftIcon,
  PencilIcon,
  GlobeIcon,
  LockIcon,
  CalendarIcon,
  PinIcon,
} from "@/components/icons";
import { friends } from "@/lib/mock-data";
import { useGroups } from "@/lib/groups-store";

const friendById = Object.fromEntries(friends.map((f) => [f.id, f]));

// True only after client hydration — avoids a "not found" flash for groups
// that live in localStorage (and aren't in the server seed).
const noopSubscribe = () => () => {};
function useIsHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export default function GroupViewPage() {
  const params = useParams<{ id: string }>();
  const { groups } = useGroups();
  const hydrated = useIsHydrated();

  const group = groups.find((g) => g.id === params.id);

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

  const editHref = `/groups/${group.id}/edit`;
  const members = group.memberIds.map((id) => friendById[id]).filter(Boolean);

  return (
    <div className="pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-20 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <Link
          href="/groups"
          aria-label="Back"
          className="grid h-10 w-10 place-items-center text-primary"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-center text-lg font-bold text-primary">Group</h1>
        <Link
          href={editHref}
          aria-label="Edit group"
          className="grid h-10 w-10 place-items-center rounded-full text-primary active:scale-95"
        >
          <PencilIcon className="h-5 w-5" />
        </Link>
      </header>

      {/* Hero */}
      <div className="flex items-center gap-4 px-5 pt-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-secondary-container text-3xl">
          {group.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold">{group.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
              {group.isPublic ? (
                <GlobeIcon className="h-3 w-3" />
              ) : (
                <LockIcon className="h-3 w-3" />
              )}
              {group.isPublic ? "Public" : "Private"}
            </span>
            <span>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
      </div>

      {/* Upcoming plan */}
      {group.nextPlan && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-md bg-primary-fixed/60 px-3 py-2.5 text-sm font-semibold text-on-primary-fixed-variant">
          <CalendarIcon className="h-4 w-4" />
          {group.nextPlan}
        </div>
      )}

      {/* Activity */}
      <p className="px-5 pt-3 text-sm text-on-surface-variant">{group.lastActivity}</p>

      {/* Shared map */}
      <Link
        href={`/groups/${group.id}/map`}
        className="mx-5 mt-4 flex items-center gap-3 overflow-hidden rounded-lg bg-card p-4 shadow-soft transition active:scale-[0.99]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-primary-container text-on-primary">
          <PinIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Group map</p>
          <p className="text-[13px] text-on-surface-variant">
            Drop pins, save places & vote together
          </p>
        </div>
        <span className="text-on-surface-variant">›</span>
      </Link>

      {/* Members */}
      <section className="px-5 pt-6">
        <h3 className="text-sm font-bold">
          Members{" "}
          <span className="font-normal text-on-surface-variant">
            · {members.length}
          </span>
        </h3>
        {members.length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface-low py-6 text-center text-sm text-on-surface-variant">
            No members yet. Tap the pencil to add some.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-lg bg-card p-3 shadow-soft"
              >
                <Avatar
                  initials={m.initials}
                  gradient={m.gradient}
                  size="md"
                  online={m.online}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name}</p>
                  <p className="truncate text-[13px] text-on-surface-variant">
                    {m.tagline ?? (m.online ? "Online now" : `Active ${m.lastSeen}`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Edit CTA */}
      <div className="px-5 pt-6">
        <Link href={editHref} className="btn-primary flex h-[52px] w-full text-base">
          <PencilIcon className="h-5 w-5" />
          Edit group
        </Link>
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
