"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";
import { useSession } from "./supabase/use-session";
import type { GroupMember } from "./types";

/* Only accepted friendships — used for group invites, community row, etc. */
export function useFriends() {
  const session = useSession();
  const [friends, setFriends] = useState<GroupMember[] | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const uid = session?.user?.id;
      if (!uid) {
        if (active) setFriends([]);
        return;
      }
      const { data } = await supabase
        .from("friendships")
        .select("friend:profiles!friendships_friend_id_fkey(id, name, username, availability_status)")
        .eq("user_id", uid)
        .eq("status", "accepted");
      if (!active) return;
      setFriends((data ?? []).map((r) => r.friend as unknown as GroupMember).filter(Boolean));
    })();
    return () => { active = false; };
  }, [session]);

  return { friends: friends ?? [], loading: friends === undefined };
}
