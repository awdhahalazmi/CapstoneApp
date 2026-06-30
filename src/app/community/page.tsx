"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import AiFab from "@/components/AiFab";
import FriendsRow from "@/components/FriendsRow";
import { MenuIcon, UserPlusIcon } from "@/components/icons";
import { useProfile } from "@/lib/supabase/use-session";
import { useFriends } from "@/lib/friends-store";
import { useGroups } from "@/lib/groups-store";
import { avatarFor } from "@/lib/avatar";

const INTEREST_EMOJIS: Record<string, string> = {
  Coffee: "☕", Rooftops: "🌆", Brunch: "🥞", "Live music": "🎵",
  Hiking: "🥾", Beaches: "🏖️", Art: "🎨", Foodie: "🍽️",
  Nightlife: "🌙", Shopping: "🛍️", Sports: "⚽", Gaming: "🎮",
  Chill: "🌊", "Hidden Gems": "💎",
};

export default function CommunityPage() {
  const { profile } = useProfile();
  const { friends } = useFriends();
  const { groups } = useGroups();
  const av = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });

  // Groups each friend is in (intersection with my groups)
  const myGroupIds = new Set(groups.map((g) => g.id));

  return (
    <div className="pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-surface/80 px-5 py-4 backdrop-blur-md">
        <button aria-label="Menu" className="text-on-surface">
          <MenuIcon />
        </button>
        <h1 className="text-xl font-bold text-primary">Community</h1>
        <Avatar initials={av.initials} gradient={av.gradient} size="sm" />
      </header>

      {/* Friends row */}
      <section className="px-5 pt-2">
        <FriendsRow />
      </section>

      {/* Friends activity */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Your Crew</h2>
          <Link href="/friends"
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1.5 text-[13px] font-semibold text-primary">
            <UserPlusIcon className="h-4 w-4" />
            Find Friends
          </Link>
        </div>

        {friends.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-surface-low px-5 py-10 text-center">
            <p className="text-lg font-bold">No friends yet</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Add friends to see their interests and shared groups here.
            </p>
            <Link href="/friends" className="btn-primary mt-4 h-11 px-6 text-sm">
              <UserPlusIcon className="h-4 w-4" />
              Find Friends
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {friends.map((friend) => {
              const fav = avatarFor(friend);
              const sharedGroups = groups.filter((g) =>
                g.members.some((m) => m.id === friend.id)
              );
              return (
                <article key={friend.id} className="rounded-2xl bg-card p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 shrink-0 rounded-full bg-gradient-to-br ${fav.gradient} grid place-items-center text-sm font-bold text-white`}>
                      {fav.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{friend.name || friend.username}</p>
                      {friend.username && (
                        <p className="text-[13px] text-on-surface-variant">@{friend.username}</p>
                      )}
                    </div>
                  </div>

                  {sharedGroups.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sharedGroups.map((g) => (
                        <Link key={g.id} href={`/groups/${g.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-3 py-1 text-[12px] font-semibold text-primary">
                          {g.emoji} {g.name}
                        </Link>
                      ))}
                    </div>
                  )}

                  {sharedGroups.length === 0 && (
                    <p className="mt-2 text-[13px] text-on-surface-variant">
                      Not in any shared groups yet —{" "}
                      <Link href="/groups/new" className="font-semibold text-primary">create one together</Link>
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AiFab />
    </div>
  );
}
