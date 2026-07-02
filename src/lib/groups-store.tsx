"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/client";
import { useSession } from "./supabase/use-session";
import type { Group, GroupMember } from "./types";

const CREATED_EMOJIS = ["🎈", "✨", "🌙", "🏖️", "🎬", "🍽️", "🎮", "⚽", "🎉", "☕"];

async function loadGroups(uid: string): Promise<Group[]> {
  // Group ids I'm a member of
  const { data: memberRows } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("member_id", uid);
  const memberGroupIds = (memberRows ?? []).map((r) => r.group_id);

  // Groups I own OR belong to
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase.from("groups") as any).select("id, name, emoji, owner_id, interests");
  q = memberGroupIds.length
    ? q.or(`owner_id.eq.${uid},id.in.(${memberGroupIds.join(",")})`)
    : q.eq("owner_id", uid);
  const { data: groupRows } = await q as { data: { id: string; name: string; emoji: string; owner_id: string; interests: string[] }[] | null };
  const groups = groupRows ?? [];
  if (groups.length === 0) return [];

  // Members (profiles) for those groups
  const ids = groups.map((g) => g.id);
  const { data: memRows } = await supabase
    .from("group_members")
    .select("group_id, profile:profiles!group_members_member_id_fkey(id, name, username)")
    .in("group_id", ids);

  const byGroup: Record<string, GroupMember[]> = {};
  for (const r of memRows ?? []) {
    const p = r.profile as unknown as GroupMember | null;
    if (!p) continue;
    (byGroup[r.group_id] ??= []).push(p);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    ownerId: g.owner_id,
    members: byGroup[g.id] ?? [],
    interests: g.interests ?? [],
  }));
}

export function useGroups() {
  const session = useSession();
  const [groups, setGroups] = useState<Group[] | undefined>(undefined);
  const uid = session?.user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!uid) {
      setGroups([]);
      return;
    }
    setGroups(await loadGroups(uid));
  }, [uid]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!uid) {
        if (active) setGroups([]);
        return;
      }
      const g = await loadGroups(uid);
      if (active) setGroups(g);
    })();
    return () => {
      active = false;
    };
  }, [uid]);

  async function createGroup(input: {
    name: string;
    memberIds: string[];
    emoji?: string;
    interests?: string[];
  }): Promise<string | null> {
    if (!uid) return null;
    const emoji = input.emoji ?? CREATED_EMOJIS[input.name.length % CREATED_EMOJIS.length];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: g, error } = await (supabase.from("groups") as any)
      .insert({ owner_id: uid, name: input.name.trim(), emoji, interests: input.interests ?? [] })
      .select("id")
      .single();
    if (error || !g) return null;
    const memberIds = Array.from(new Set([uid, ...input.memberIds]));
    await supabase
      .from("group_members")
      .insert(memberIds.map((member_id) => ({ group_id: g.id, member_id })));
    await refresh();
    return g.id as string;
  }

  async function updateGroup(
    id: string,
    patch: { name?: string; emoji?: string; interests?: string[] },
  ) {
    const upd: Record<string, unknown> = {};
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.emoji !== undefined) upd.emoji = patch.emoji;
    if (patch.interests !== undefined) upd.interests = patch.interests;
    if (Object.keys(upd).length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("groups") as any).update(upd).eq("id", id);
    await refresh();
  }

  async function deleteGroup(id: string) {
    // Delete children that may not have ON DELETE CASCADE yet
    await supabase.from("group_messages").delete().eq("group_id", id);
    await supabase.from("group_members").delete().eq("group_id", id);

    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) {
      console.error("[deleteGroup] failed:", error.message, error.code);
      throw new Error(error.message);
    }
    await refresh();
  }

  async function addMember(groupId: string, memberId: string) {
    await supabase.from("group_members").insert({ group_id: groupId, member_id: memberId });
    await refresh();
  }

  async function removeMember(groupId: string, memberId: string) {
    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("member_id", memberId);
    await refresh();
  }

  return {
    groups: groups ?? [],
    loading: groups === undefined,
    refresh,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
  };
}
