"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import {
  PlusIcon,
  CalendarIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
} from "@/components/icons";
import { friends } from "@/lib/mock-data";
import { useGroups } from "@/lib/groups-store";

const friendById = Object.fromEntries(friends.map((f) => [f.id, f]));

export default function GroupsPage() {
  const { groups } = useGroups();

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-surface/80 px-5 py-4 backdrop-blur-md">
        <h1 className="text-2xl font-bold">Groups</h1>
        <Link href="/groups/new" className="btn-primary h-10 px-4 text-sm">
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </header>

      <div className="space-y-4 px-5 pt-2">
        {groups.map((g) => {
          const members = g.memberIds.map((id) => friendById[id]).filter(Boolean);
          return (
            <article key={g.id} className="card relative p-4">
              {/* Tap the card to view the group */}
              <Link
                href={`/groups/${g.id}`}
                aria-label={`View ${g.name}`}
                className="block transition active:scale-[0.99]"
              >
                <div className="flex items-start gap-3 pr-10">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-secondary-container text-2xl">
                    {g.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold">{g.name}</h2>

                    {/* Member avatars — above the label */}
                    {members.length > 0 && (
                      <div className="mt-1.5 flex -space-x-2.5">
                        {members.slice(0, 4).map((m) => (
                          <div key={m.id} className="rounded-full ring-2 ring-card">
                            <Avatar
                              initials={m.initials}
                              gradient={m.gradient}
                              size="sm"
                            />
                          </div>
                        ))}
                        {members.length > 4 && (
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-surface-high text-[11px] font-bold text-on-surface-variant ring-2 ring-card">
                            +{members.length - 4}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Label: count + public/private */}
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-on-surface-variant">
                      <span>
                        {members.length}{" "}
                        {members.length === 1 ? "member" : "members"}
                      </span>
                      {g.isPublic !== undefined && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {g.isPublic ? (
                            <GlobeIcon className="h-3 w-3" />
                          ) : (
                            <LockIcon className="h-3 w-3" />
                          )}
                          {g.isPublic ? "Public" : "Private"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <p className="mt-3 truncate text-sm text-on-surface-variant">
                  {g.lastActivity}
                </p>

                {g.nextPlan && (
                  <div className="mt-3 flex items-center gap-2 rounded-md bg-primary-fixed/60 px-3 py-2 text-sm font-semibold text-on-primary-fixed-variant">
                    <CalendarIcon className="h-4 w-4" />
                    {g.nextPlan}
                  </div>
                )}
              </Link>

              {/* Tap the pencil to edit — separate target, sits above the card link */}
              <Link
                href={`/groups/${g.id}/edit`}
                aria-label={`Edit ${g.name}`}
                className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-primary-fixed text-primary transition active:scale-95"
              >
                <PencilIcon className="h-4 w-4" />
              </Link>
            </article>
          );
        })}

        {/* Create group CTA */}
        <Link
          href="/groups/new"
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant py-5 text-sm font-semibold text-on-surface-variant transition active:scale-[0.99]"
        >
          <PlusIcon className="h-5 w-5" />
          Create a new group
        </Link>
      </div>
    </div>
  );
}
