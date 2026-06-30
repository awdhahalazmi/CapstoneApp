"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import {
  PlusIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
  ChatIcon,
  MapIcon,
} from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { useSession } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";

export default function GroupsPage() {
  const session = useSession();
  const { groups, loading } = useGroups();

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-surface/80 px-5 py-4 backdrop-blur-md">
        <h1 className="text-2xl font-bold">Groups</h1>
        {session && (
          <Link href="/groups/new" className="btn-primary h-10 px-4 text-sm">
            <PlusIcon className="h-4 w-4" />
            New
          </Link>
        )}
      </header>

      <div className="space-y-4 px-5 pt-2">
        {!session ? (
          <div className="rounded-lg bg-surface-low px-5 py-8 text-center">
            <p className="text-sm font-medium">Sign in to see your groups</p>
            <Link href="/login" className="btn-primary mt-3 h-10 px-5 text-sm">
              Sign in
            </Link>
          </div>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">Loading groups…</p>
        ) : groups.length === 0 ? (
          <div className="rounded-lg bg-surface-low px-5 py-8 text-center">
            <p className="text-sm font-medium">No groups yet</p>
            <p className="mt-0.5 text-[13px] text-on-surface-variant">
              Create one and invite your friends.
            </p>
            <Link href="/groups/new" className="btn-primary mt-3 h-10 px-5 text-sm">
              <PlusIcon className="h-4 w-4" />
              New group
            </Link>
          </div>
        ) : (
          groups.map((g) => (
            <article key={g.id} className="card p-4">
              <Link
                href={`/groups/${g.id}`}
                aria-label={`View ${g.name}`}
                className="block transition active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-secondary-container text-2xl">
                    {g.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold">{g.name}</h2>

                    {g.members.length > 0 && (
                      <div className="mt-1.5 flex -space-x-2.5">
                        {g.members.slice(0, 4).map((m) => {
                          const { gradient, initials } = avatarFor(m);
                          return (
                            <div key={m.id} className="rounded-full ring-2 ring-card">
                              <Avatar initials={initials} gradient={gradient} size="sm" />
                            </div>
                          );
                        })}
                        {g.members.length > 4 && (
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-surface-high text-[11px] font-bold text-on-surface-variant ring-2 ring-card">
                            +{g.members.length - 4}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-on-surface-variant">
                      <span>
                        {g.members.length} {g.members.length === 1 ? "member" : "members"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {g.isPublic ? (
                          <GlobeIcon className="h-3 w-3" />
                        ) : (
                          <LockIcon className="h-3 w-3" />
                        )}
                        {g.isPublic ? "Public" : "Private"}
                      </span>
                    </p>
                  </div>
                </div>
              </Link>

              {/* Actions: Join Chat + Map + Edit */}
              <div className="mt-3 flex items-center gap-2 border-t border-outline-variant/30 pt-3">
                <Link
                  href={`/groups/${g.id}/chat`}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary transition active:scale-[0.98]"
                >
                  <ChatIcon className="h-5 w-5" />
                  Join Chat
                </Link>
                <Link
                  href={`/groups/${g.id}/map`}
                  aria-label={`${g.name} map`}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-low text-primary transition active:scale-95"
                >
                  <MapIcon className="h-5 w-5" />
                </Link>
                <Link
                  href={`/groups/${g.id}/edit`}
                  aria-label={`Edit ${g.name}`}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-high text-on-surface transition active:scale-95"
                >
                  <PencilIcon className="h-5 w-5" />
                </Link>
              </div>
            </article>
          ))
        )}

        {session && groups.length > 0 && (
          <Link
            href="/groups/new"
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant py-5 text-sm font-semibold text-on-surface-variant transition active:scale-[0.99]"
          >
            <PlusIcon className="h-5 w-5" />
            Create a new group
          </Link>
        )}
      </div>
    </div>
  );
}
