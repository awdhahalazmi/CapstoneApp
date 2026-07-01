"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { useSession } from "@/lib/supabase/use-session";
import { supabase } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "ready" | "fetching" | "voting" | "analyzing" | "winner" | "event" | "done";

type PlaceCard = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  price: string | null;
  openNow: boolean | null;
  types: string[];
  photoUrl?: string | null;
};

type PollRow = {
  id: string;
  options: string[];
  vote_counts: Record<string, number>;
  metadata: { place_cards?: PlaceCard[] } | null;
};

// ── Interest → Google Places query map ───────────────────────────────────────

const INTEREST_QUERIES: Record<string, string[]> = {
  "Cafés":       ["café", "coffee shop", "specialty coffee", "café brunch"],
  "Restaurants": ["restaurant", "dining restaurant", "popular restaurant", "family restaurant"],
  "Cinema":      ["cinema", "movie theater", "cinescape", "grand cinemas"],
  "Outdoors":    ["outdoor park", "beach park", "public park", "waterfront"],
  "Gaming":      ["gaming entertainment", "arcade gaming", "esports gaming", "gaming lounge"],
  "Shopping":    ["shopping mall", "retail mall", "luxury shopping", "outlet mall"],
  "Nightlife":   ["lounge bar", "night lounge", "rooftop lounge", "entertainment lounge"],
  "Sports":      ["sports club", "fitness gym", "sports facility", "swimming pool sports"],
  "Culture":     ["museum", "cultural center", "art gallery", "heritage site"],
  "Fast Food":   ["fast food", "burger restaurant", "popular fast food", "food court"],
};

const KUWAIT_AREAS = [
  "Salmiya", "Hawalli", "Jabriya", "Kuwait City", "Fahaheel",
  "Bayan", "Mishref", "Salwa", "Rumaithiya", "Al Rai", "Sharq",
  "Abu Halifa", "Mangaf", "Fintas", "Mahboula", "Bneid Al Qar",
];

function pickRandomArea(): string {
  return KUWAIT_AREAS[Math.floor(Math.random() * KUWAIT_AREAS.length)];
}

function pickQuery(interest: string): string {
  const variants = INTEREST_QUERIES[interest] ?? [interest];
  const base = variants[Math.floor(Math.random() * variants.length)];
  return `${base} in ${pickRandomArea()} Kuwait`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalVotes(counts: Record<string, number>) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function winnerIndex(counts: Record<string, number>): number {
  let maxV = -1, maxI = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > maxV) { maxV = v; maxI = Number(k); }
  }
  return maxI;
}

function cardGradient(types: string[]): string {
  if (types.some((t) => t.includes("cafe") || t.includes("coffee"))) return "from-amber-400 to-orange-500";
  if (types.some((t) => t.includes("restaurant") || t.includes("food"))) return "from-rose-400 to-pink-600";
  if (types.some((t) => t.includes("cinema") || t.includes("movie"))) return "from-violet-500 to-indigo-600";
  if (types.some((t) => t.includes("park") || t.includes("nature"))) return "from-emerald-400 to-teal-600";
  if (types.some((t) => t.includes("shopping") || t.includes("store"))) return "from-sky-400 to-blue-600";
  return "from-primary to-violet-600";
}

function cardEmoji(types: string[]): string {
  if (types.some((t) => t.includes("cafe") || t.includes("coffee"))) return "☕";
  if (types.some((t) => t.includes("restaurant") || t.includes("food"))) return "🍽️";
  if (types.some((t) => t.includes("cinema") || t.includes("movie"))) return "🎬";
  if (types.some((t) => t.includes("park") || t.includes("nature"))) return "🌿";
  if (types.some((t) => t.includes("shopping") || t.includes("store"))) return "🛍️";
  return "📍";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default function AIPlanPage() {
  const params = useParams<{ id: string }>();
  const { groups } = useGroups();
  const session = useSession();
  const userId = session?.user?.id ?? "";
  const group = groups.find((g) => g.id === params.id);

  const [phase, setPhase] = useState<Phase>("ready");
  const [placeCards, setPlaceCards] = useState<PlaceCard[]>([]);
  const [poll, setPoll] = useState<PollRow | null>(null);
  const [myVoteIdx, setMyVoteIdx] = useState<number | null>(null);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const [waJid, setWaJid] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({ title: "", date: "", time: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<{ poll: PollRow; cards: PlaceCard[] } | null>(null);
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const autoPickedRef = useRef(false);
  const timerStartedRef = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Load WA link + check for existing active plan poll
  useEffect(() => {
    if (!userId || !params.id) return;
    (async () => {
      const [{ data: link }, { data: existing }] = await Promise.all([
        supabase
          .from("whatsapp_group_links")
          .select("wa_jid")
          .eq("group_id", params.id)
          .eq("user_id", userId)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("whatsapp_polls") as any)
          .select("id, options, vote_counts, metadata")
          .eq("group_id", params.id)
          .eq("source", "plan_command")
          .not("metadata", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() as Promise<{ data: PollRow | null; error: unknown }>,
      ]);
      setWaJid(link?.wa_jid ?? null);
      const cards = (existing?.metadata as { place_cards?: PlaceCard[] } | null)?.place_cards;
      if (existing && cards && cards.length >= 2) {
        setResumable({ poll: existing, cards });
      }
    })();
  }, [userId, params.id]);

  // Realtime vote updates
  useEffect(() => {
    if (!poll) return;
    if (subRef.current) supabase.removeChannel(subRef.current);
    const ch = supabase
      .channel(`ai_plan_${poll.id}_${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_polls", filter: `id=eq.${poll.id}` },
        (payload) => {
          setPoll((prev) =>
            prev
              ? { ...prev, vote_counts: (payload.new as { vote_counts: Record<string, number> }).vote_counts ?? {} }
              : prev
          );
        }
      )
      .subscribe();
    subRef.current = ch;
    return () => { supabase.removeChannel(ch); subRef.current = null; };
  }, [poll?.id]);

  // Start countdown + auto-pick when votes reach threshold
  useEffect(() => {
    if (phase !== "voting" || !poll || timerStartedRef.current) return;
    const tot = totalVotes(poll.vote_counts ?? {});
    if (tot < 2) return;
    timerStartedRef.current = true;
    let t = 5;
    setCountdown(t);
    const interval = setInterval(() => {
      t -= 1;
      setCountdown(t);
      if (t <= 0) {
        clearInterval(interval);
        setCountdown(null);
        setPhase("analyzing");
      }
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll?.vote_counts, phase]);

  // Auto-create event when phase transitions to analyzing
  useEffect(() => {
    if (phase !== "analyzing" || autoPickedRef.current || !poll) return;
    autoPickedRef.current = true;
    (async () => {
      const idx = winnerIndex(poll.vote_counts ?? {});
      const winner = placeCards[idx];
      if (!winner) { setPhase("done"); return; }
      setWinnerIdx(idx);
      await new Promise((r) => setTimeout(r, 1500));

      // Check if server-side already created the event to avoid duplicates
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("source_poll_id", poll.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("events").insert({
          group_id: params.id,
          created_by: userId,
          title: `Group Outing — ${winner.name}`,
          place_name: winner.name,
          source_poll_id: poll.id,
        });

        // Announce the event to the WhatsApp group
        if (waJid) {
          fetch("/api/whatsapp/send-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              waJid,
              title: `Group Outing — ${winner.name}`,
              placeName: winner.name,
              pollSummary: "Voted #1 by the group 🏆",
            }),
          }).catch(() => { /* non-fatal */ });
        }
      }

      setPhase("done");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Generate places from group interests via Google Places
  async function generatePlaces() {
    if (!group) return;
    timerStartedRef.current = false;
    autoPickedRef.current = false;
    setCountdown(null);
    setResumable(null);
    setPhase("fetching");
    setError(null);

    const groupInterests = group.interests ?? [];
    const queries = groupInterests.length > 0
      ? groupInterests.map((k) => pickQuery(k))
      : [`restaurant in ${pickRandomArea()} Kuwait`];

    // Load previously shown place IDs so we avoid repeating the same spots
    const shownKey = `shown_places_${params.id}`;
    const shownIds = new Set<string>(JSON.parse(localStorage.getItem(shownKey) ?? "[]"));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    // Fetch more per interest so we have enough after filtering out already-seen places
    const perInterest = Math.min(5, Math.ceil(10 / queries.length));

    const results = await Promise.allSettled(
      queries.map((q) =>
        fetch(`${supabaseUrl}/functions/v1/google-places`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
          body: JSON.stringify({ query: q, maxResults: perInterest }),
        }).then((r) => r.json() as Promise<{ places?: PlaceCard[] }>)
      )
    );

    const seenNames = new Set<string>();
    const fresh: PlaceCard[] = [];
    const fallback: PlaceCard[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const p of r.value.places ?? []) {
        if (seenNames.has(p.name)) continue;
        seenNames.add(p.name);
        if (shownIds.has(p.id)) fallback.push(p);
        else fresh.push(p);
      }
    }

    // Prefer fresh places; fill with fallback if needed
    const merged = [...fresh, ...fallback];
    const cards = merged.slice(0, 6);

    // Persist shown place IDs (cap at 60 to avoid stale bloat)
    const updatedShown = [...shownIds, ...cards.map((c) => c.id)];
    localStorage.setItem(shownKey, JSON.stringify(updatedShown.slice(-60)));
    if (cards.length < 2) {
      setError("Couldn't find enough places. Check that your GOOGLE_PLACES_API_KEY is set in Supabase secrets.");
      setPhase("ready");
      return;
    }

    setPlaceCards(cards);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertResult = await (supabase.from("whatsapp_polls") as any)
      .insert({
        group_id: params.id,
        wa_jid: waJid ?? "",
        question: "Where should we go? 🗺️",
        options: cards.map((c) => c.name),
        vote_counts: {},
        created_by: userId,
        source: "plan_command",
        metadata: { place_cards: cards },
      })
      .select("id, options, vote_counts, metadata")
      .single();
    const newPoll: PollRow | null = insertResult.data;
    const pollErr: unknown = insertResult.error;

    if (pollErr || !newPoll) {
      setError("Failed to create the poll. Please try again.");
      setPhase("ready");
      return;
    }

    setPoll(newPoll as PollRow);

    if (waJid) {
      try {
        const waRes = await fetch("/api/whatsapp/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, waJid, groupId: params.id, question: "Where should we go? 🗺️", options: cards.map((c) => c.name), placePhotoUrls: cards.map((c) => c.photoUrl ?? null) }),
        });
        if (waRes.ok) {
          const { messageId } = await waRes.json() as { messageId?: string };
          if (messageId) {
            // Save wa_message_id so WA votes sync back to this DB row via update_poll_votes RPC
            await supabase.from("whatsapp_polls").update({ wa_message_id: messageId }).eq("id", newPoll.id);
          }
        }
      } catch { /* non-fatal — in-app voting still works */ }
    }

    setPhase("voting");
  }

  async function vote(idx: number) {
    if (!poll || myVoteIdx === idx) return;
    const prevIdx = myVoteIdx;
    // Optimistic update so the tap feels instant
    setPoll((p) => {
      if (!p) return p;
      const c = { ...(p.vote_counts ?? {}) };
      if (prevIdx !== null) c[String(prevIdx)] = Math.max(0, (c[String(prevIdx)] ?? 1) - 1);
      c[String(idx)] = (c[String(idx)] ?? 0) + 1;
      return { ...p, vote_counts: c };
    });
    setMyVoteIdx(idx);
    localStorage.setItem(`vote_${poll.id}`, String(idx));
    // Atomic server-side increment — no race condition when two people vote simultaneously
    const { data } = await supabase.rpc("cast_vote", {
      p_poll_id: poll.id,
      p_old_idx: prevIdx ?? -1,
      p_new_idx: idx,
    });
    // Reconcile with the authoritative counts returned by the RPC
    if (data) setPoll((p) => p ? { ...p, vote_counts: data as Record<string, number> } : p);
  }

  function pickWinner() {
    if (!poll) return;
    const idx = winnerIndex(poll.vote_counts ?? {});
    const winner = placeCards[idx];
    if (!winner) return;
    setWinnerIdx(idx);
    setEventForm({ title: `Group Outing — ${winner.name}`, date: "", time: "", notes: "" });
    setPhase("winner");
  }

  async function createEvent() {
    if (winnerIdx === null || saving) return;
    const winner = placeCards[winnerIdx];
    if (!winner) return;
    setSaving(true);
    const { error: evErr } = await supabase.from("events").insert({
      group_id: params.id,
      created_by: userId,
      title: eventForm.title || `Group Outing — ${winner.name}`,
      place_name: winner.name,
      event_date: eventForm.date || null,
      event_time: eventForm.time || null,
      description: eventForm.notes || null,
      source_poll_id: poll?.id ?? null,
    });
    setSaving(false);
    if (!evErr) setPhase("done");
  }

  const interests = group?.interests ?? [];
  const total = totalVotes(poll?.vote_counts ?? {});

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-20 grid grid-cols-[3rem_1fr_3rem] items-center bg-surface/95 px-1 py-1 backdrop-blur-md">
        <Link href={`/groups/${params.id}`} className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
          <ArrowLeftIcon />
        </Link>
        <h1 className="truncate text-center text-[18px] font-medium text-on-surface">
          {phase === "ready" && "Plan Outing"}
          {phase === "fetching" && "Finding Places…"}
          {phase === "voting" && "Vote on Places"}
          {phase === "analyzing" && "AI Deciding…"}
          {phase === "winner" && "AI Picked a Winner ✨"}
          {phase === "event" && "Create Event"}
          {phase === "done" && "Event Created 🎉"}
        </h1>
        <div />
      </header>

      <div className="flex-1 overflow-y-auto pb-32">

        {/* ── READY ── */}
        {phase === "ready" && (
          <div className="flex flex-col items-center px-6 pt-8 text-center">
            <div className="grid h-24 w-24 place-items-center rounded-[32px] bg-gradient-to-br from-primary to-violet-500 text-5xl shadow-[0_12px_32px_rgba(124,58,237,0.35)]">
              {group?.emoji ?? "✨"}
            </div>
            <h2 className="mt-5 text-[24px] font-semibold text-on-surface">{group?.name}</h2>
            <p className="mt-1.5 text-[14px] text-on-surface-variant">
              AI finds real Kuwait spots based on your group&apos;s interests
            </p>

            {interests.length > 0 ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {interests.map((interest) => (
                  <span key={interest} className="rounded-full bg-primary/10 px-3 py-1.5 text-[13px] font-medium text-primary">
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-5 w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
                <p className="text-[13px] font-medium text-amber-700">No interests set</p>
                <p className="mt-0.5 text-[12px] text-amber-600">Edit the group to add interests.</p>
                <Link href={`/groups/${params.id}/edit`} className="mt-2 inline-block text-[12px] font-semibold text-amber-700 underline">
                  Edit group →
                </Link>
              </div>
            )}

            {resumable && (
              <div className="mt-5 w-full max-w-sm rounded-2xl border border-primary/20 bg-primary/6 px-4 py-4 text-left">
                <p className="text-[13px] font-bold text-primary">Active plan found</p>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  {resumable.cards.length} places · {totalVotes(resumable.poll.vote_counts ?? {})} vote{totalVotes(resumable.poll.vote_counts ?? {}) !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={() => {
                    timerStartedRef.current = false;
                    autoPickedRef.current = false;
                    setPlaceCards(resumable.cards);
                    setPoll(resumable.poll);
                    const stored = localStorage.getItem(`vote_${resumable.poll.id}`);
                    if (stored !== null) setMyVoteIdx(Number(stored));
                    setResumable(null);
                    setPhase("voting");
                  }}
                  className="mt-3 flex h-10 w-full items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-on-primary transition active:scale-95"
                >
                  Resume voting →
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 w-full max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={generatePlaces}
              disabled={!group}
              className="mt-5 flex h-[52px] w-full max-w-sm items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 text-[16px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.35)] transition active:scale-[0.97] disabled:opacity-50"
            >
              {resumable ? "🔄 Start New Plan" : "✨ Find Places for Us"}
            </button>
          </div>
        )}

        {/* ── FETCHING ── */}
        {phase === "fetching" && (
          <div className="flex flex-col items-center px-6 pt-20 text-center">
            <div className="relative grid h-24 w-24 place-items-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-3xl shadow-lg">
                🗺️
              </div>
            </div>
            <p className="mt-8 text-[18px] font-semibold text-on-surface">Searching Kuwait…</p>
            <p className="mt-2 text-[14px] text-on-surface-variant">
              Finding the best {interests.length > 0 ? interests.join(" & ") : "places"} for your group
            </p>
          </div>
        )}

        {/* ── VOTING ── */}
        {phase === "voting" && placeCards.length > 0 && (
          <div className="px-4 pt-4">
            {/* Header bar */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-on-surface-variant">
                {total === 0 ? "Tap a place to cast your vote" : `${total} vote${total !== 1 ? "s" : ""} so far`}
              </p>
              {countdown !== null && (
                <span className="rounded-full bg-primary px-3 py-1 text-[12px] font-bold text-white">
                  🤖 {countdown}s
                </span>
              )}
            </div>

            {/* Chart-style vote cards — sorted by votes (leaderboard order) */}
            <div className="space-y-1.5">
              {placeCards
                .map((card, idx) => ({ card, idx, count: poll?.vote_counts?.[String(idx)] ?? 0 }))
                .sort((a, b) => b.count - a.count)
                .map(({ card, idx, count }, rank0) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const isMyVote = myVoteIdx === idx;
                const maxCount = Math.max(...placeCards.map((_, i) => poll?.vote_counts?.[String(i)] ?? 0), 0);
                const isLeading = total > 0 && count === maxCount && count > 0;
                const rank = rank0 + 1;
                const emoji = cardEmoji(card.types);
                return (
                  <button
                    key={card.id}
                    onClick={() => vote(idx)}
                    className={`w-full overflow-hidden rounded-xl border text-left transition-all duration-200 active:scale-[0.98]
                      ${isLeading
                        ? "border-primary/25 bg-primary/5 shadow-[0_1px_8px_rgba(124,58,237,0.12)]"
                        : "border-outline-variant/15 bg-surface-container"
                      }`}
                  >
                    <div className="px-3 py-2.5">
                      {/* Top row: rank · name · % */}
                      <div className="flex items-center gap-2">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black
                          ${isLeading ? "bg-primary text-white" : "bg-on-surface/10 text-on-surface-variant"}`}>
                          {rank}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold leading-tight text-on-surface">{card.name}</p>
                        </div>
                        <p className={`shrink-0 text-[18px] font-black tabular-nums leading-none
                          ${isLeading ? "text-primary" : total === 0 ? "text-on-surface/20" : "text-on-surface/40"}`}>
                          {pct}%
                        </p>
                      </div>

                      {/* Bar */}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-on-surface/8">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out
                            ${isLeading ? "bg-gradient-to-r from-primary to-violet-500" : "bg-primary/30"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Meta row */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-xs">{emoji}</span>
                        {card.rating && <span className="text-[10px] text-on-surface-variant">★ {card.rating.toFixed(1)}</span>}
                        {card.openNow !== null && (
                          <span className={`text-[10px] ${card.openNow ? "text-emerald-500" : "text-on-surface-variant/50"}`}>
                            {card.openNow ? "● Open" : "Closed"}
                          </span>
                        )}
                        <span className="flex-1" />
                        {isLeading && <span className="text-[10px] font-semibold text-primary">🏆 Leading</span>}
                        {isMyVote && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            Your vote ✓
                          </span>
                        )}
                        <span className="text-[10px] text-on-surface-variant">{count} vote{count !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {countdown === null && total > 0 && (
              <p className="mt-4 text-center text-[13px] font-medium text-primary">👀 AI is watching votes…</p>
            )}
            {waJid && (
              <p className="mt-3 text-center text-[12px] text-on-surface-variant">
                📱 Poll also sent to your WhatsApp group
              </p>
            )}
          </div>
        )}

        {/* ── ANALYZING ── */}
        {phase === "analyzing" && (
          <div className="flex flex-col items-center px-6 pt-20 text-center">
            <div className="relative grid h-24 w-24 place-items-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <div className="absolute inset-2 animate-ping rounded-full bg-primary/10" style={{ animationDelay: "0.3s" }} />
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-3xl shadow-lg">
                🤖
              </div>
            </div>
            <p className="mt-8 text-[20px] font-bold text-on-surface">AI is picking the winner…</p>
            <p className="mt-2 text-[14px] text-on-surface-variant">Analyzing votes and creating your event</p>
          </div>
        )}

        {/* ── WINNER ── */}
        {phase === "winner" && winnerIdx !== null && (() => {
          const winner = placeCards[winnerIdx];
          const gradient = cardGradient(winner.types);
          const emoji = cardEmoji(winner.types);
          const count = poll?.vote_counts?.[String(winnerIdx)] ?? 0;
          return (
            <div className="px-4 pt-6">
              <div className="mb-4 text-center">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-primary">AI Selected</p>
                <p className="mt-0.5 text-[22px] font-bold text-on-surface">The Group Is Going To…</p>
              </div>
              <div className={`rounded-3xl bg-gradient-to-br ${gradient} p-6 shadow-[0_12px_32px_rgba(124,58,237,0.3)]`}>
                <div className="mb-3 text-5xl">{emoji}</div>
                <h3 className="text-[24px] font-bold text-white">{winner.name}</h3>
                <p className="mt-1 text-[13px] text-white/75">{winner.address}</p>
                <div className="mt-3 flex items-center gap-3">
                  {winner.rating && <span className="text-[13px] font-semibold text-white">★ {winner.rating.toFixed(1)}</span>}
                  {winner.price && <span className="text-[13px] text-white/75">{winner.price}</span>}
                  {winner.openNow !== null && (
                    <span className={`text-[12px] font-semibold ${winner.openNow ? "text-green-200" : "text-red-200"}`}>
                      {winner.openNow ? "Open now" : "Closed"}
                    </span>
                  )}
                </div>
                <div className="mt-3 rounded-xl bg-white/15 px-3 py-2">
                  <p className="text-[13px] font-medium text-white">🏆 Won with {count} vote{count !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <button
                onClick={() => setPhase("event")}
                className="mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 text-[16px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.3)] transition active:scale-[0.97]"
              >
                Create the Event →
              </button>
              <button onClick={() => setPhase("voting")} className="mt-3 w-full py-2 text-center text-[13px] text-on-surface-variant">
                Back to votes
              </button>
            </div>
          );
        })()}

        {/* ── EVENT FORM ── */}
        {phase === "event" && winnerIdx !== null && (
          <div className="space-y-4 px-4 pt-4">
            <div className="rounded-3xl bg-primary/6 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/70">Event Details</p>
              <p className="mt-0.5 text-[13px] text-on-surface-variant">Review and confirm the outing details.</p>
            </div>
            {(["title", "date", "time"] as const).map((key) => (
              <div key={key}>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">{key}</p>
                <input
                  type={key === "date" ? "date" : key === "time" ? "time" : "text"}
                  value={eventForm[key]}
                  onChange={(e) => setEventForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={key === "title" ? eventForm.title : undefined}
                  className="w-full rounded-2xl bg-surface-container px-4 py-3 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Notes (optional)</p>
              <textarea
                rows={3}
                value={eventForm.notes}
                onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any details for the group…"
                className="w-full resize-none rounded-2xl bg-surface-container px-4 py-3 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {phase === "done" && winnerIdx !== null && (
          <div className="flex flex-col items-center px-6 pt-16 text-center">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-5xl shadow-[0_12px_32px_rgba(16,185,129,0.35)]">
              🎉
            </div>
            <h2 className="mt-6 text-[24px] font-bold text-on-surface">Event Created!</h2>
            <p className="mt-2 text-[15px] text-on-surface-variant">
              {placeCards[winnerIdx]?.name} — it&apos;s happening!
            </p>
            <Link
              href={`/groups/${params.id}`}
              className="mt-8 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 text-[16px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.3)]"
            >
              Back to Group
            </Link>
            <button
              onClick={() => {
                timerStartedRef.current = false;
                autoPickedRef.current = false;
                setCountdown(null);
                setResumable(null);
                setPhase("ready");
                setPoll(null);
                setPlaceCards([]);
                setMyVoteIdx(null);
                setWinnerIdx(null);
              }}
              className="mt-3 text-[14px] font-medium text-primary"
            >
              Plan another outing
            </button>
          </div>
        )}
      </div>

      {/* Sticky footer CTA */}
      {phase === "voting" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/20 bg-surface/90 px-4 py-4 backdrop-blur-md">
          {countdown !== null ? (
            <div className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 text-[16px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.3)]">
              🤖 AI picks in {countdown}s…
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 h-[52px] items-center justify-center rounded-full bg-surface-container text-[14px] font-medium text-on-surface-variant">
                {total === 0 ? "⏳ Waiting for votes…" : "👀 AI is watching — 2 votes trigger auto-pick"}
              </div>
              <button
                onClick={() => {
                  timerStartedRef.current = false;
                  autoPickedRef.current = false;
                  setCountdown(null);
                  setPoll(null);
                  setPlaceCards([]);
                  setMyVoteIdx(null);
                  setWinnerIdx(null);
                  setPhase("ready");
                }}
                className="h-[52px] shrink-0 rounded-full bg-surface-container px-4 text-[13px] font-semibold text-on-surface-variant transition active:scale-95"
                title="Start new plan"
              >
                ↺ New
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "event" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/20 bg-surface/90 px-4 py-4 backdrop-blur-md">
          <button
            onClick={createEvent}
            disabled={saving}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 text-[16px] font-semibold text-white shadow-[0_10px_28px_rgba(124,58,237,0.3)] transition active:scale-[0.97] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm Event ✓"}
          </button>
        </div>
      )}
    </div>
  );
}
