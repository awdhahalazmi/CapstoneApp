"use client";

import { useSyncExternalStore } from "react";
import { groups as seedGroups } from "./mock-data";
import type { Group } from "./types";

/*
  Frontend-only groups store backed by localStorage, exposed via
  useSyncExternalStore so it stays SSR-safe (no hydration mismatch) and doesn't
  call setState inside an effect.

  When the backend lands, replace read()/persist() with Supabase queries — the
  useGroups() / addGroup() API can stay the same.
*/

const STORAGE_KEY = "beyondkw.groups.v1";
const CREATED_EMOJIS = ["🎈", "✨", "🌙", "🏖️", "🎬", "🍽️", "🎮", "⚽"];

type NewGroupInput = {
  name: string;
  memberIds: string[];
  isPublic: boolean;
};

// Client-side cache. `null` until first read so the snapshot ref stays stable.
let snapshot: Group[] | null = null;
const listeners = new Set<() => void>();

function read(): Group[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Group[];
      // Backfill isPublic for groups saved before the field existed, so every
      // card can show a public/private badge. Seeded groups keep their value;
      // anything else defaults to private.
      return stored.map((g) =>
        g.isPublic === undefined
          ? {
              ...g,
              isPublic: seedGroups.find((s) => s.id === g.id)?.isPublic ?? false,
            }
          : g,
      );
    }
  } catch {
    // corrupt or unavailable storage — fall back to seed data
  }
  return seedGroups;
}

function getSnapshot(): Group[] {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

// During SSR and the initial hydration pass, always use the seed data.
function getServerSnapshot(): Group[] {
  return seedGroups;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist(next: Group[]): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode, quota) — keep in-memory copy
  }
  listeners.forEach((l) => l());
}

export function addGroup({ name, memberIds, isPublic }: NewGroupInput): Group {
  const current = getSnapshot();
  const group: Group = {
    id: `g-${Date.now()}`,
    name: name.trim(),
    emoji: CREATED_EMOJIS[current.length % CREATED_EMOJIS.length],
    memberIds,
    lastActivity: "You created this group · just now",
    isPublic,
  };
  persist([group, ...current]); // newest first
  return group;
}

export function updateGroup(id: string, patch: Partial<Group>): void {
  persist(getSnapshot().map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export function deleteGroup(id: string): void {
  persist(getSnapshot().filter((g) => g.id !== id));
}

export function useGroups() {
  const groups = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { groups, addGroup, updateGroup, deleteGroup };
}
