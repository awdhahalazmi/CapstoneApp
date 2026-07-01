/*
  Domain types for Beyond Kw.
  These mirror the shape of the eventual Supabase tables so swapping mock data
  for real queries later is a drop-in change.
*/

export type Friend = {
  id: string;
  name: string;
  initials: string;
  /** tailwind gradient classes for the avatar ring/fill */
  gradient: string;
  online: boolean;
  /** human-readable last-seen, shown when offline */
  lastSeen?: string;
  /** short interest/bio line, e.g. "Coffee enthusiast" */
  tagline?: string;
};

export type FeedKind = "check-in" | "nearby" | "planned";

export type FeedItem = {
  id: string;
  kind: FeedKind;
  friendId: string;
  place: string;
  area: string;
  distance: string;
  time: string;
  /** gradient used as the venue image placeholder */
  imageGradient?: string;
  attendees?: number;
  when?: string;
};

export type Place = {
  id: string;
  name: string;
  category: string;
  area: string;
  rating: number;
  priceLevel: 1 | 2 | 3;
  tags: string[];
  imageGradient: string;
  /** why the AI surfaced this place for the group */
  aiReason?: string;
};

export type GroupMember = {
  id: string; // profile id
  name: string;
  username: string | null;
  availability_status?: "available" | "not_in_the_mood";
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  isPublic: boolean;
  ownerId: string;
  members: GroupMember[];
  interests: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type AppNotification = {
  id: string;
  message: string;
  time: string;
  read: boolean;
  kind: "ping" | "plan" | "rec" | "system";
};
