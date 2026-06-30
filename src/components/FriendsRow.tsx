"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { UserPlusIcon } from "./icons";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/use-session";

/*
  "Friends" section on Community — shows the user's REAL friends from the
  `friendships` table (people they added on /friends). No mock data.
  (Live "online" presence will come later via Supabase Realtime.)
*/

type Friend = { id: string; name: string; username: string | null };

const GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
  "from-cyan-400 to-sky-600",
];

function avatarFor(p: Friend) {
  const seed = p.username || p.name || p.id;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = (p.name || p.username || "?").trim();
  const initials = base.includes(" ")
    ? base.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : base.slice(0, 2).toUpperCase();
  return { gradient: GRADIENTS[h % GRADIENTS.length], initials };
}

export default function FriendsRow() {
  const session = useSession();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the signed-in user's friends
  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("friend:profiles!friendships_friend_id_fkey(id, name, username)")
        .eq("user_id", session.user.id)
        .eq("status", "accepted");
      if (!active) return;
      setFriends((data ?? []).map((r) => r.friend as unknown as Friend).filter(Boolean));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [session]);

  // Wheel → horizontal scroll (desktop)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!el || el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [friends.length]);

  const Header = (
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold">
        Friends{" "}
        {friends.length > 0 && (
          <span className="text-lg font-semibold text-on-surface-variant">
            · {friends.length}
          </span>
        )}
      </h2>
      <Link
        href="/friends"
        aria-label="Find friends"
        className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1.5 text-[13px] font-semibold text-primary"
      >
        <UserPlusIcon className="h-4 w-4" />
        Find
      </Link>
    </div>
  );

  // Signed out
  if (!session) {
    return (
      <>
        {Header}
        <Link
          href="/login"
          className="mt-3 block rounded-lg bg-surface-low py-5 text-center text-sm font-medium text-on-surface-variant"
        >
          Sign in to see your friends
        </Link>
      </>
    );
  }

  // Loaded, no friends yet
  if (loaded && friends.length === 0) {
    return (
      <>
        {Header}
        <div className="mt-3 flex flex-col items-center rounded-lg bg-surface-low px-5 py-6 text-center">
          <p className="text-sm font-medium">No friends yet</p>
          <p className="mt-0.5 text-[13px] text-on-surface-variant">
            Find people by username and add them.
          </p>
          <Link href="/friends" className="btn-primary mt-3 h-10 px-5 text-sm">
            <UserPlusIcon className="h-4 w-4" />
            Find friends
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {Header}
      <div
        ref={scrollRef}
        className="no-scrollbar -mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-1"
      >
        {friends.map((f) => {
          const { gradient, initials } = avatarFor(f);
          return (
            <Link
              key={f.id}
              href="/friends"
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <Avatar initials={initials} gradient={gradient} size="lg" />
              <span className="w-full truncate text-center text-[13px] font-semibold">
                {f.username ? `@${f.username}` : f.name}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
