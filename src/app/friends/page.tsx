"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { ArrowLeftIcon, SearchIcon, UserPlusIcon, CheckIcon, XIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase/client";
import { useSession, useProfile } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";

type Profile = { id: string; username: string | null; name: string };
type FriendRow = { user_id: string; friend_id: string; status: string; other: Profile };

export default function FriendsPage() {
  const session = useSession();
  const { profile } = useProfile();
  const uid = session?.user?.id ?? null;

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  // friendships where I am involved (either side)
  const [rows, setRows] = useState<FriendRow[]>([]);

  const q = query.trim().toLowerCase();

  const loadRows = useCallback(async () => {
    if (!uid) return;
    // Rows where I sent the invite
    const { data: sent } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status, other:profiles!friendships_friend_id_fkey(id, name, username)")
      .eq("user_id", uid);
    // Rows where I received the invite
    const { data: recv } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status, other:profiles!friendships_user_id_fkey(id, name, username)")
      .eq("friend_id", uid);

    const mapped: FriendRow[] = [
      ...(sent ?? []).map((r) => ({ user_id: r.user_id, friend_id: r.friend_id, status: r.status, other: r.other as unknown as Profile })),
      ...(recv ?? []).map((r) => ({ user_id: r.user_id, friend_id: r.friend_id, status: r.status, other: r.other as unknown as Profile })),
    ].filter((r) => r.other);
    setRows(mapped);
  }, [uid]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Debounced search
  useEffect(() => {
    if (!uid || q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, name")
        .neq("id", uid)
        .not("username", "is", null)
        .ilike("username", `%${q}%`)
        .limit(12);
      setSearchResults((data as Profile[]) ?? []);
    }, 350);
    return () => clearTimeout(t);
  }, [q, uid]);

  // helpers
  function rowFor(otherId: string) {
    return rows.find(
      (r) => (r.user_id === uid && r.friend_id === otherId) ||
             (r.friend_id === uid && r.user_id === otherId)
    );
  }
  function iSent(row: FriendRow) { return row.user_id === uid; }

  async function sendInvite(p: Profile) {
    if (!uid) return;
    await supabase.from("friendships").insert({ user_id: uid, friend_id: p.id, status: "pending" });
    const senderName = profile?.name ?? profile?.username ?? "Someone";
    await supabase.from("notifications").insert({
      user_id: p.id,
      message: `${senderName} sent you a friend request`,
      kind: "ping",
      read: false,
    });
    await loadRows();
  }

  async function accept(row: FriendRow) {
    await supabase.from("friendships").update({ status: "accepted" })
      .eq("user_id", row.user_id).eq("friend_id", row.friend_id);
    await supabase.from("friendships").upsert(
      { user_id: row.friend_id, friend_id: row.user_id, status: "accepted" },
      { onConflict: "user_id,friend_id" }
    );
    const accepterName = profile?.name ?? profile?.username ?? "Someone";
    await supabase.from("notifications").insert({
      user_id: row.user_id,
      message: `${accepterName} accepted your friend request`,
      kind: "ping",
      read: false,
    });
    await loadRows();
  }

  async function decline(row: FriendRow) {
    await supabase.from("friendships").delete()
      .eq("user_id", row.user_id).eq("friend_id", row.friend_id);
    await loadRows();
  }

  async function removeFriend(otherId: string) {
    if (!uid) return;
    // Delete both directions
    await supabase.from("friendships").delete()
      .eq("user_id", uid).eq("friend_id", otherId);
    await supabase.from("friendships").delete()
      .eq("user_id", otherId).eq("friend_id", uid);
    await loadRows();
  }

  const acceptedFriends = rows.filter((r) => r.status === "accepted" && r.user_id === uid);
  const incomingRequests = rows.filter((r) => r.status === "pending" && r.friend_id === uid);
  const sentRequests = rows.filter((r) => r.status === "pending" && r.user_id === uid);

  async function cancelInvite(row: FriendRow) {
    await supabase.from("friendships").delete()
      .eq("user_id", row.user_id).eq("friend_id", row.friend_id);
    await loadRows();
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="fab h-14 w-14"><UserPlusIcon className="h-7 w-7" /></span>
        <p className="mt-4 font-semibold">Sign in to find friends</p>
        <Link href="/login" className="btn-primary mt-5 h-11 px-6">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 grid grid-cols-[2.5rem_1fr_2.5rem] items-center bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <Link href="/community" aria-label="Back" className="grid h-10 w-10 place-items-center text-primary">
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-center text-lg font-bold text-primary">Find Friends</h1>
        <span />
      </header>

      <div className="px-5 pt-3 space-y-6">
        {/* Search */}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-11"
            placeholder="Search by username…"
            autoCapitalize="none"
            autoCorrect="off"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline">
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Self-search hint */}
        {q.length >= 2 && q === (profile?.username ?? "").toLowerCase() && (
          <p className="text-[13px] font-medium text-primary">
            That&apos;s your own username — try searching for someone else.
          </p>
        )}

        {/* Already-a-friend hint */}
        {q.length >= 2 && q !== (profile?.username ?? "").toLowerCase() &&
          acceptedFriends.some((r) => r.other.username?.toLowerCase() === q) && (
          <p className="text-[13px] font-medium text-primary">
            @{q} is already your friend.
          </p>
        )}

        {/* Search results */}
        {q.length >= 2 && q !== (profile?.username ?? "").toLowerCase() && (
          <section>
            <h2 className="mb-3 text-sm font-bold">Results</h2>
            {searchResults.length === 0 ? (
              <p className="rounded-xl bg-surface-low py-6 text-center text-sm text-on-surface-variant">No users match "@{q}".</p>
            ) : (
              <ul className="space-y-3">
                {searchResults.map((p) => {
                  const row = rowFor(p.id);
                  const av = avatarFor(p);
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-soft">
                      <Avatar initials={av.initials} gradient={av.gradient} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.name || p.username}</p>
                        <p className="truncate text-[13px] text-on-surface-variant">@{p.username}</p>
                      </div>
                      {!row && (
                        <button onClick={() => sendInvite(p)} className="btn-primary h-10 px-4 text-sm">
                          <UserPlusIcon className="h-4 w-4" /> Add
                        </button>
                      )}
                      {row?.status === "accepted" && (
                        <button onClick={() => removeFriend(p.id)} className="rounded-full bg-surface-low px-3 py-2 text-[13px] font-semibold text-error transition active:scale-95">
                          Remove
                        </button>
                      )}
                      {row?.status === "pending" && iSent(row) && (
                        <span className="rounded-full bg-surface-low px-3 py-2 text-[13px] font-semibold text-on-surface-variant">Pending</span>
                      )}
                      {row?.status === "pending" && !iSent(row) && (
                        <div className="flex gap-2">
                          <button onClick={() => accept(row)} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-on-primary">
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => decline(row)} className="grid h-9 w-9 place-items-center rounded-full bg-surface-high text-on-surface-variant">
                            <XIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Sent requests */}
        {sentRequests.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-bold">
              Sent Requests <span className="ml-1 rounded-full bg-surface-low px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">{sentRequests.length}</span>
            </h2>
            <ul className="space-y-3">
              {sentRequests.map((row) => {
                const av = avatarFor(row.other);
                return (
                  <li key={row.friend_id} className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-soft">
                    <Avatar initials={av.initials} gradient={av.gradient} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.other.name || row.other.username}</p>
                      <p className="truncate text-[13px] text-on-surface-variant">@{row.other.username}</p>
                    </div>
                    <button onClick={() => cancelInvite(row)}
                      className="rounded-full bg-surface-low px-3 py-2 text-[13px] font-semibold text-on-surface-variant transition active:bg-error-container active:text-on-error-container">
                      Cancel
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Incoming requests */}
        {incomingRequests.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-bold">
              Friend Requests <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">{incomingRequests.length}</span>
            </h2>
            <ul className="space-y-3">
              {incomingRequests.map((row) => {
                const av = avatarFor(row.other);
                return (
                  <li key={row.user_id} className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-soft">
                    <Avatar initials={av.initials} gradient={av.gradient} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.other.name || row.other.username}</p>
                      <p className="truncate text-[13px] text-on-surface-variant">@{row.other.username}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => accept(row)} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-on-primary">
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => decline(row)} className="grid h-9 w-9 place-items-center rounded-full bg-surface-high text-on-surface-variant">
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Accepted friends */}
        <section>
          <h2 className="mb-3 text-sm font-bold">
            Your friends <span className="font-normal text-on-surface-variant">· {acceptedFriends.length}</span>
          </h2>
          {acceptedFriends.length === 0 ? (
            <p className="rounded-xl bg-surface-low py-6 text-center text-sm text-on-surface-variant">
              No friends yet — search a username above to send an invite.
            </p>
          ) : (
            <ul className="space-y-3">
              {acceptedFriends.map((row) => {
                const av = avatarFor(row.other);
                return (
                  <li key={row.friend_id} className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-soft">
                    <Avatar initials={av.initials} gradient={av.gradient} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.other.name || row.other.username}</p>
                      <p className="truncate text-[13px] text-on-surface-variant">@{row.other.username}</p>
                    </div>
                    <button onClick={() => removeFriend(row.friend_id)} className="rounded-full bg-surface-low px-3 py-2 text-[13px] font-semibold text-error transition active:scale-95">
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
