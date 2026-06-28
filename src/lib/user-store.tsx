"use client";

import { useSyncExternalStore } from "react";
import { currentUser } from "./mock-data";

/*
  Frontend-only profile store backed by localStorage. Holds the editable parts
  of the current user's profile (interests for now) so changes persist across
  navigation and refreshes.

  When the backend lands, replace read()/persist() with Supabase queries on the
  users table — the useUser() / addInterest() / removeInterest() API can stay.
*/

const STORAGE_KEY = "beyondkw.profile.v1";

type Profile = {
  interests: string[];
};

const seed: Profile = { interests: [...currentUser.interests] };

let snapshot: Profile | null = null;
const listeners = new Set<() => void>();

function read(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...seed, ...(JSON.parse(raw) as Profile) };
  } catch {
    // corrupt or unavailable storage — fall back to seed
  }
  return seed;
}

function getSnapshot(): Profile {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): Profile {
  return seed;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist(next: Profile): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — keep in-memory copy
  }
  listeners.forEach((l) => l());
}

export function addInterest(label: string): void {
  const value = label.trim();
  if (!value) return;
  const current = getSnapshot().interests;
  // case-insensitive dedupe
  if (current.some((i) => i.toLowerCase() === value.toLowerCase())) return;
  persist({ ...getSnapshot(), interests: [...current, value] });
}

export function removeInterest(label: string): void {
  persist({
    ...getSnapshot(),
    interests: getSnapshot().interests.filter((i) => i !== label),
  });
}

export function useUser() {
  const profile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...profile, addInterest, removeInterest };
}
