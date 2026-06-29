"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import {
  ArrowLeftIcon,
  SearchIcon,
  UserPlusIcon,
  CheckIcon,
  XIcon,
} from "@/components/icons";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/use-session";

type PublicProfile = {
  id: string;
  username: string | null;
  name: string;
  avatar_url?: string | null;
};

const GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
  "from-cyan-400 to-sky-600",
];

function avatarFor(p: PublicProfile) {
  const seed = p.username || p.name || p.id;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = (p.name || p.username || "?").trim();
  const initials = base.includes(" ")
    ? base.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : base.slice(0, 2).toUpperCase();
  return { gradient: GRADIENTS[h % GRADIENTS.length], initials };
}

export default function FriendsPage() {
  const session = useSession();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2;

  // Load my current friends
  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("friend:profiles!friendships_friend_id_fkey(id, username, name)")
        .eq("user_id", session.user.id);
      if (!active) return;
      const list = (data ?? [])
        .map((r) => r.friend as unknown as PublicProfile)
        .filter(Boolean);
      setFriends(list);
      setFriendIds(new Set(list.map((f) => f.id)));
    })();
    return () => {
      active = false;
    };
  }, [session]);

  // Debounced username search
  useEffect(() => {
    if (!session || !searching) return;
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, name")
        .neq("id", session.user.id)
        .not("username", "is", null)
        .ilike("username", `%${q}%`)
        .limit(12);
      setResults((data as PublicProfile[]) ?? []);
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, searching, session]);

  async function addFriend(p: PublicProfile) {
    if (!session) return;
    const { error } = await supabase
      .from("friendships")
      .insert({ user_id: session.user.id, friend_id: p.id });
    if (!error) {
      setFriendIds((prev) => new Set(prev).add(p.id));
      setFriends((prev) => (prev.some((f) => f.id === p.id) ? prev : [p, ...prev]));
    }
  }

  async function removeFriend(id: string) {
    if (!session) return;
    await supabase
      .from("friendships")
      .delete()
      .eq("user_id", session.user.id)
      .eq("friend_id", id);
    setFriendIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setFriends((prev) => prev.filter((f) => f.id !== id));
  }

  function Row({ p, isFriend }: { p: PublicProfile; isFriend: boolean }) {
    const { gradient, initials } = avatarFor(p);
    return (
      <li className="flex items-center gap-3 rounded-lg bg-card p-3 shadow-soft">
        <Avatar initials={initials} gradient={gradient} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.name || p.username}</p>
          <p className="truncate text-[13px] text-on-surface-variant">@{p.username}</p>
        </div>
        {isFriend ? (
          <button
            onClick={() => removeFriend(p.id)}
            className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-2 text-[13px] font-semibold text-on-surface-variant"
          >
            <CheckIcon className="h-4 w-4 text-tertiary" />
            Friends
          </button>
        ) : (
          <button onClick={() => addFriend(p)} className="btn-primary h-10 px-4 text-sm">
            <UserPlusIcon className="h-4 w-4" />
            Add
          </button>
        )}
      </li>
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

      {!session ? (
        <div className="flex flex-col items-center px-6 pt-16 text-center">
          <span className="fab h-14 w-14">
            <UserPlusIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 font-semibold">Sign in to find friends</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Search people by username and add them to plan outings together.
          </p>
          <Link href="/login" className="btn-primary mt-5 h-11 px-6">
            Sign in
          </Link>
        </div>
      ) : (
        <div className="px-5 pt-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-11"
              placeholder="Search by username…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-surface-high text-on-surface-variant"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {searching ? (
            <section className="mt-4">
              <h2 className="text-sm font-bold">Results</h2>
              {results.length === 0 ? (
                <p className="mt-3 rounded-lg bg-surface-low py-6 text-center text-sm text-on-surface-variant">
                  No users match “{q}”.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {results.map((p) => (
                    <Row key={p.id} p={p} isFriend={friendIds.has(p.id)} />
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="mt-4">
              <h2 className="text-sm font-bold">
                Your friends{" "}
                <span className="font-normal text-on-surface-variant">· {friends.length}</span>
              </h2>
              {friends.length === 0 ? (
                <p className="mt-3 rounded-lg bg-surface-low py-6 text-center text-sm text-on-surface-variant">
                  No friends yet — search a username above to add someone.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {friends.map((p) => (
                    <Row key={p.id} p={p} isFriend />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
