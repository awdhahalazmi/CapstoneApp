"use client";

import { useSyncExternalStore } from "react";

/*
  Per-group map pins, stored in localStorage (consistent with groups-store /
  user-store). Each group has its own set of pins.

  Multi-user realtime sharing comes when groups move to Supabase — this same
  API (usePins / addPin / removePin / toggleReaction) will then read/write a
  `place_pins` table instead of localStorage.
*/

export const PIN_CATEGORIES = [
  { key: "restaurant", label: "Restaurant", color: "#ef4444", emoji: "🍽️" },
  { key: "cafe", label: "Cafe", color: "#f59e0b", emoji: "☕" },
  { key: "activity", label: "Activity", color: "#8b5cf6", emoji: "🎯" },
  { key: "shopping", label: "Shopping", color: "#ec4899", emoji: "🛍️" },
  { key: "beach", label: "Beach", color: "#06b6d4", emoji: "🏖️" },
  { key: "park", label: "Park", color: "#22c55e", emoji: "🌳" },
  { key: "museum", label: "Museum", color: "#6366f1", emoji: "🏛️" },
  { key: "hotel", label: "Hotel", color: "#0ea5e9", emoji: "🏨" },
  { key: "hidden_gem", label: "Hidden Gem", color: "#d946ef", emoji: "💎" },
  { key: "other", label: "Other", color: "#64748b", emoji: "📍" },
] as const;

export const PIN_REACTIONS = [
  { key: "favorite", label: "Favorite", emoji: "❤️" },
  { key: "approve", label: "Approve", emoji: "👍" },
  { key: "dislike", label: "Dislike", emoji: "👎" },
  { key: "must_visit", label: "Must Visit", emoji: "⭐" },
  { key: "visited", label: "Visited", emoji: "✅" },
] as const;

export function categoryMeta(key: string) {
  return PIN_CATEGORIES.find((c) => c.key === key) ?? PIN_CATEGORIES[PIN_CATEGORIES.length - 1];
}

export type Pin = {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  category: string;
  lat: number;
  lng: number;
  createdAt: string;
  reactions: string[]; // active reaction keys (this device, for now)
};

const STORAGE_KEY = "beyondkw.pins.v1";
const EMPTY: Pin[] = [];

let byGroup: Record<string, Pin[]> | null = null;
const listeners = new Set<() => void>();

function read(): Record<string, Pin[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, Pin[]>;
  } catch {
    // ignore
  }
  return {};
}

function all(): Record<string, Pin[]> {
  if (byGroup === null) byGroup = read();
  return byGroup;
}

function persist(next: Record<string, Pin[]>) {
  byGroup = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function addPin(
  groupId: string,
  data: { title: string; description?: string; category: string; lat: number; lng: number },
): Pin {
  const pin: Pin = {
    id: `pin-${Date.now()}`,
    groupId,
    title: data.title.trim(),
    description: data.description?.trim() || undefined,
    category: data.category,
    lat: data.lat,
    lng: data.lng,
    createdAt: new Date().toISOString(),
    reactions: [],
  };
  const current = all();
  persist({ ...current, [groupId]: [...(current[groupId] ?? []), pin] });
  return pin;
}

export function removePin(groupId: string, pinId: string) {
  const current = all();
  persist({ ...current, [groupId]: (current[groupId] ?? []).filter((p) => p.id !== pinId) });
}

export function toggleReaction(groupId: string, pinId: string, reaction: string) {
  const current = all();
  const next = (current[groupId] ?? []).map((p) => {
    if (p.id !== pinId) return p;
    const has = p.reactions.includes(reaction);
    return {
      ...p,
      reactions: has ? p.reactions.filter((r) => r !== reaction) : [...p.reactions, reaction],
    };
  });
  persist({ ...current, [groupId]: next });
}

export function usePins(groupId: string): Pin[] {
  return useSyncExternalStore(
    subscribe,
    () => all()[groupId] ?? EMPTY,
    () => EMPTY,
  );
}
