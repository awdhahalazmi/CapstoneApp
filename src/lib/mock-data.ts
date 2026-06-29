import type {
  Friend,
  FeedItem,
  Place,
  Group,
  ChatMessage,
  AppNotification,
} from "./types";

/*
  Static mock data for the frontend-only MVP.
  Swap these arrays for Supabase queries when the backend is wired up.
*/

export const currentUser = {
  id: "me",
  name: "Fatma",
  initials: "FB",
  gradient: "from-violet-500 to-fuchsia-500",
  city: "Kuwait City",
  interests: ["Coffee", "Rooftops", "Brunch", "Live music"],
};

/** Interest options for the signup picker + profile editor (emoji = fun & visual). */
export const INTEREST_OPTIONS = [
  { label: "Coffee", emoji: "☕" },
  { label: "Rooftops", emoji: "🌆" },
  { label: "Brunch", emoji: "🥞" },
  { label: "Live music", emoji: "🎵" },
  { label: "Hiking", emoji: "🥾" },
  { label: "Beaches", emoji: "🏖️" },
  { label: "Art", emoji: "🎨" },
  { label: "Gaming", emoji: "🎮" },
  { label: "Football", emoji: "⚽" },
  { label: "Padel", emoji: "🎾" },
  { label: "Foodie", emoji: "🍔" },
  { label: "Shopping", emoji: "🛍️" },
  { label: "Movies", emoji: "🎬" },
  { label: "Photography", emoji: "📸" },
  { label: "Desert camping", emoji: "🏕️" },
  { label: "Board games", emoji: "🎲" },
];

/** Plain labels (used by the profile editor's suggestion list). */
export const SUGGESTED_INTERESTS = INTEREST_OPTIONS.map((o) => o.label);

export const friends: Friend[] = [
  { id: "alex", name: "Alex", initials: "AL", gradient: "from-indigo-500 to-violet-600", online: true, tagline: "Always down for rooftops" },
  { id: "jordan", name: "Jordan", initials: "JO", gradient: "from-rose-400 to-pink-600", online: true, tagline: "Coffee enthusiast" },
  { id: "maya", name: "Maya", initials: "MA", gradient: "from-amber-400 to-orange-600", online: true, tagline: "Event planner" },
  { id: "sam", name: "Sam", initials: "SA", gradient: "from-emerald-400 to-teal-600", online: true, tagline: "Foodie" },
  { id: "tara", name: "Tara", initials: "TA", gradient: "from-sky-400 to-blue-600", online: false, lastSeen: "20m ago", tagline: "Bookworm" },
  { id: "noor", name: "Noor", initials: "NO", gradient: "from-fuchsia-400 to-purple-600", online: true, tagline: "Night owl" },
  { id: "yousef", name: "Yousef", initials: "YO", gradient: "from-cyan-400 to-sky-600", online: false, lastSeen: "1h ago", tagline: "Hiking buddy" },
];

export const onlineCount = friends.filter((f) => f.online).length + 8; // "12 Live"

export const feed: FeedItem[] = [
  {
    id: "f1",
    kind: "check-in",
    friendId: "alex",
    place: "Skyline Social",
    area: "Downtown",
    distance: "0.8m away",
    time: "Just now",
    imageGradient: "from-violet-900 via-purple-700 to-amber-500",
  },
  {
    id: "f2",
    kind: "nearby",
    friendId: "jordan",
    place: "is nearby",
    area: "Salmiya",
    distance: "0.2m away",
    time: "Just now",
  },
  {
    id: "f3",
    kind: "planned",
    friendId: "maya",
    place: "Al Shaheed Park",
    area: "Kuwait City",
    distance: "",
    time: "Tomorrow, 4:00 PM",
    attendees: 3,
    when: "Tomorrow, 4:00 PM",
    imageGradient: "from-emerald-500 to-teal-700",
  },
];

export const places: Place[] = [
  {
    id: "p1",
    name: "Skyline Social",
    category: "Rooftop Lounge",
    area: "Downtown",
    rating: 4.7,
    priceLevel: 3,
    tags: ["Outdoor", "Tonight", "Views"],
    imageGradient: "from-violet-900 via-purple-700 to-amber-500",
    aiReason: "Matches the group's love for rooftop views and stays within everyone's budget.",
  },
  {
    id: "p2",
    name: "Beans & Books",
    category: "Specialty Café",
    area: "Salmiya",
    rating: 4.5,
    priceLevel: 1,
    tags: ["Cozy", "Quiet", "Coffee"],
    imageGradient: "from-amber-300 to-orange-600",
    aiReason: "Quiet enough for Tara, walkable for Jordan, and budget-friendly.",
  },
  {
    id: "p3",
    name: "Al Shaheed Park",
    category: "Park & Walk",
    area: "Kuwait City",
    rating: 4.8,
    priceLevel: 1,
    tags: ["Outdoor", "Free", "Sunset"],
    imageGradient: "from-emerald-400 to-teal-700",
    aiReason: "Everyone enjoyed your last outdoor outing — and the weather is perfect at 4 PM.",
  },
  {
    id: "p4",
    name: "Marina Crescent",
    category: "Waterfront Dining",
    area: "Salmiya",
    rating: 4.4,
    priceLevel: 2,
    tags: ["Seafood", "Group", "Lively"],
    imageGradient: "from-sky-500 to-indigo-700",
    aiReason: "Big tables for groups and a mix of cuisines so everyone finds something.",
  },
];

export const groups: Group[] = [
  {
    id: "g1",
    name: "The Usual Crew",
    emoji: "🎉",
    memberIds: ["alex", "jordan", "maya", "sam"],
    lastActivity: "Maya planned an outing · 2h ago",
    nextPlan: "Al Shaheed Park · Tomorrow 4 PM",
    isPublic: false,
  },
  {
    id: "g2",
    name: "Coffee Club",
    emoji: "☕",
    memberIds: ["jordan", "tara", "noor"],
    lastActivity: "Noor shared Beans & Books · Yesterday",
    isPublic: false,
  },
  {
    id: "g3",
    name: "Weekend Explorers",
    emoji: "🧭",
    memberIds: ["sam", "yousef", "alex", "noor", "maya"],
    lastActivity: "3 new place suggestions · 3d ago",
    nextPlan: "Vote on Friday's spot",
    isPublic: true,
  },
];

export const notifications: AppNotification[] = [
  { id: "n1", kind: "ping", message: "Jordan pinged you — they're nearby in Salmiya.", time: "Just now", read: false },
  { id: "n2", kind: "plan", message: "Maya invited you to Al Shaheed Park tomorrow at 4 PM.", time: "12m ago", read: false },
  { id: "n3", kind: "rec", message: "New AI pick for The Usual Crew: Skyline Social.", time: "1h ago", read: true },
  { id: "n4", kind: "system", message: "Welcome to Beyond Kw 👋 Tell the assistant what you're in the mood for.", time: "Yesterday", read: true },
];

export const initialChat: ChatMessage[] = [
  {
    id: "c0",
    role: "assistant",
    content:
      "Hey Fatma 👋 I'm your Beyond Kw assistant. Tell me who's coming and what you're in the mood for, and I'll plan the perfect outing for your group.",
  },
];

function priceTag(level: number) {
  return "$".repeat(level);
}

/** Picks a mock place based on keywords in the prompt. */
function pickPlace(prompt: string): Place {
  const p = prompt.toLowerCase();
  if (/(coffee|caf[eé]|quiet|study|chill|work)/.test(p)) {
    return places.find((x) => x.id === "p2") ?? places[0];
  }
  if (/(outdoor|park|walk|sunset|nature|fresh air|picnic)/.test(p)) {
    return places.find((x) => x.id === "p3") ?? places[0];
  }
  if (/(seafood|dinner|eat|food|lunch|hungry|restaurant|brunch)/.test(p)) {
    return places.find((x) => x.id === "p4") ?? places[0];
  }
  if (/(tonight|rooftop|view|drinks|night|vibe|lively)/.test(p)) {
    return places.find((x) => x.id === "p1") ?? places[0];
  }
  return places[0];
}

type ReplyContext = {
  prompt: string;
  group?: { name: string; members: { name: string; tagline?: string }[] } | null;
  interests?: string[];
};

/**
 * Canned, context-aware assistant reply. Takes an optional selected group (with
 * members + their interests) so suggestions feel personalized.
 * Replace with an OpenRouter stream later.
 */
export function assistantReply({ prompt, group, interests }: ReplyContext): string {
  const place = pickPlace(prompt);
  const price = priceTag(place.priceLevel);

  if (group) {
    const names = group.members.map((m) => m.name);
    const who =
      names.length === 0
        ? "your group"
        : names.slice(0, 2).join(" and ") +
          (names.length > 2 ? ` +${names.length - 2} more` : "");
    const taglines = group.members
      .map((m) => m.tagline)
      .filter((t): t is string => Boolean(t));
    const vibe =
      taglines.length > 0
        ? ` I factored in what they're into (${taglines
            .slice(0, 2)
            .join(", ")
            .toLowerCase()}).`
        : "";
    return `For ${group.name} — ${who} — I'd suggest ${place.name} in ${place.area} ✨ ${place.aiReason ?? ""}${vibe} It sits around ${price}, comfortable for everyone. Want me to draft an itinerary and ping the group?`;
  }

  const interestText =
    interests && interests.length > 0
      ? `Based on your interests (${interests.slice(0, 3).join(", ")}), `
      : "";
  return `${interestText}I'd start with ${place.name} in ${place.area} — ${place.aiReason ?? ""} (${price}). Want a full plan with a backup option?`;
}
