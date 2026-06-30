"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import AiFab from "@/components/AiFab";
import { MenuIcon, UserPlusIcon, CheckIcon, XIcon } from "@/components/icons";
import { useProfile, useSession } from "@/lib/supabase/use-session";
import { useFriends } from "@/lib/friends-store";
import { useGroups } from "@/lib/groups-store";
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";

type PendingRequest = { id: string; name: string; username: string | null };

const INTEREST_EMOJIS: Record<string, string> = {
  Coffee: "☕", Rooftops: "🌆", Brunch: "🥞", "Live music": "🎵",
  Hiking: "🥾", Beaches: "🏖️", Art: "🎨", Foodie: "🍽️",
  Nightlife: "🌙", Shopping: "🛍️", Sports: "⚽", Gaming: "🎮",
  Chill: "🌊", "Hidden Gems": "💎",
};

export default function CommunityPage() {
  const { profile } = useProfile();
  const session = useSession();
  const uid = session?.user?.id;
  const { friends } = useFriends();
  const { groups } = useGroups();
  const av = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });

  const [requests, setRequests] = useState<PendingRequest[]>([]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("sender:profiles!friendships_user_id_fkey(id, name, username)")
        .eq("friend_id", uid)
        .eq("status", "pending");
      if (!active) return;
      setRequests((data ?? []).map((r) => r.sender as unknown as PendingRequest).filter(Boolean));
    })();
    return () => { active = false; };
  }, [uid]);

  async function acceptRequest(req: PendingRequest) {
    if (!uid) return;
    await supabase.from("friendships").update({ status: "accepted" })
      .eq("user_id", req.id).eq("friend_id", uid);
    await supabase.from("friendships").upsert(
      { user_id: uid, friend_id: req.id, status: "accepted" },
      { onConflict: "user_id,friend_id" }
    );
    const accepterName = profile?.name ?? profile?.username ?? "Someone";
    await supabase.from("notifications").insert({
      user_id: req.id,
      message: `${accepterName} accepted your friend request`,
      kind: "ping",
      read: false,
    });
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  }

  async function declineRequest(req: PendingRequest) {
    if (!uid) return;
    await supabase.from("friendships").delete()
      .eq("user_id", req.id).eq("friend_id", uid);
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  }

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

      {/* Friend requests banner */}
      {requests.length > 0 && (
        <section className="px-5 pt-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/8 p-4 space-y-3">
            <h2 className="flex items-center gap-2 font-bold text-[15px] text-primary">
              Friend Requests
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-on-primary">
                {requests.length}
              </span>
            </h2>
            {requests.map((req) => {
              const rav = avatarFor(req);
              return (
                <div key={req.id} className="flex items-center gap-3">
                  <div className={`h-10 w-10 shrink-0 rounded-full bg-gradient-to-br ${rav.gradient} grid place-items-center text-sm font-bold text-white`}>
                    {rav.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px]">{req.name || req.username}</p>
                    {req.username && (
                      <p className="text-[12px] text-on-surface-variant">@{req.username}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => acceptRequest(req)} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-on-primary transition active:scale-95">
                      <CheckIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => declineRequest(req)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-high text-on-surface-variant transition active:scale-95">
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Friends activity */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Your squad</h2>
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
