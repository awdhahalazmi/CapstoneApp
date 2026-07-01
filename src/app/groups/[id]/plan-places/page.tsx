"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { ArrowLeftIcon, CheckIcon, PlusIcon, XIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "home"
  | "categories"
  | "places"
  | "place-choice"
  | "poll-preview"
  | "tracking"
  | "winner"
  | "event-preview"
  | "done"
  | "saved-places";

type ManualPlace = { name: string; category: string };

type SavedPlace = {
  id: string;
  place_name: string;
  category: string;
  vote_count: number;
  is_winner: boolean;
  poll_id: string | null;
  created_at: string;
};

type EventForm = {
  title: string;
  description: string;
  date: string;
  time: string;
  placeName: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: "Café", emoji: "☕" },
  { label: "Restaurant", emoji: "🍽️" },
  { label: "Dessert", emoji: "🍰" },
  { label: "Breakfast", emoji: "🥐" },
  { label: "Dinner", emoji: "🌙" },
  { label: "Beach", emoji: "🏖️" },
  { label: "Activity", emoji: "🎯" },
  { label: "Shopping", emoji: "🛍️" },
  { label: "Other", emoji: "✨" },
];

// ── AI helper ─────────────────────────────────────────────────────────────────

async function invokeAi(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: { messages: [{ role: "user", content: prompt }] },
    });
    if (error) {
      const retryable = error.message.includes("non-2xx") || error.message.includes("Edge Function");
      if (retryable && attempt < 2) { await new Promise(r => setTimeout(r, (attempt + 1) * 4000)); continue; }
      throw new Error(error.message);
    }
    if (data?.error) {
      const msg = String(data.error);
      const isRate = msg.includes("429") || msg.toLowerCase().includes("rate");
      if (isRate && attempt < 2) { await new Promise(r => setTimeout(r, (attempt + 1) * 4000)); continue; }
      throw new Error(msg);
    }
    return (data?.reply as string) ?? "";
  }
  throw new Error("AI is busy — try again in a moment.");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VoteBar({ label, count, total, isWinner }: { label: string; count: number; total: number; isWinner: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={`rounded-2xl px-4 py-3 transition-all ${isWinner ? "bg-primary/10 ring-1 ring-primary/30" : "bg-surface-container"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isWinner && <span className="text-[16px]">🏆</span>}
          <span className={`text-[14px] font-medium truncate ${isWinner ? "text-primary" : "text-on-surface"}`}>{label}</span>
        </div>
        <span className={`text-[13px] font-semibold shrink-0 ml-2 ${isWinner ? "text-primary" : "text-on-surface-variant"}`}>
          {count} {count === 1 ? "vote" : "votes"} · {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-on-surface/8">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isWinner ? "bg-primary" : "bg-on-surface-variant/40"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StepHeader({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2 pb-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < step ? "bg-primary" : "bg-on-surface/12"}`}
        />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlanPlacesPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const router = useRouter();
  const session = useSession();
  const userId = session?.user?.id ?? "";
  const { groups } = useGroups();
  const group = groups.find(g => g.id === groupId);
  const isOwner = !!userId && !!group && group.ownerId === userId;

  const [phase, setPhase] = useState<Phase>("home");
  const [chatBackUrl, setChatBackUrl] = useState(`/groups/${groupId}/chat`);
  const [waJid, setWaJid] = useState<string | null>(null);

  // Detect WA connection — sets back URL and captures waJid for poll sending
  useEffect(() => {
    if (!userId || !groupId) return;
    supabase
      .from("whatsapp_group_links")
      .select("wa_jid")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.wa_jid) {
          setWaJid(data.wa_jid);
          setChatBackUrl(`/groups/${groupId}/whatsapp`);
        }
      });
  }, [groupId, userId]);

  // Categories
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");

  // Manual places
  const [manualPlaces, setManualPlaces] = useState<ManualPlace[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Poll
  const [pollQuestion, setPollQuestion] = useState("Where should we go? 📍");
  const [pollId, setPollId] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [pollEnded, setPollEnded] = useState(false);

  // Saved places
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selectedSavedIds, setSelectedSavedIds] = useState<string[]>([]);

  // Winner & event
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [winnerCategory, setWinnerCategory] = useState<string>("");
  const [eventForm, setEventForm] = useState<EventForm>({ title: "", description: "", date: "", time: "", placeName: "" });
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingPlaces, setSavingPlaces] = useState(false);
  const [placesSaved, setPlacesSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI generation (Plan From Places)
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateCats, setGenerateCats] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // AI generation (From Saved Places)
  const [showSavedGenerate, setShowSavedGenerate] = useState(false);
  const [savedGenCats, setSavedGenCats] = useState<string[]>([]);
  const [savedGenerating, setSavedGenerating] = useState(false);
  const [savedGenError, setSavedGenError] = useState<string | null>(null);

  // Category filter for From Saved Places
  const [savedFilterCats, setSavedFilterCats] = useState<string[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When categories change, set active tab to first one
  useEffect(() => {
    if (selectedCategories.length > 0 && !selectedCategories.includes(activeCat)) {
      setActiveCat(selectedCategories[0]);
    }
  }, [selectedCategories, activeCat]);

  // ── Live poll polling ──────────────────────────────────────────────────────

  const startPolling = useCallback((pid: string, options: string[]) => {
    const tick = async () => {
      const { data } = await supabase
        .from("whatsapp_polls")
        .select("vote_counts")
        .eq("id", pid)
        .single();
      if (data?.vote_counts) {
        const vc = data.vote_counts as Record<string, number>;
        const mapped: Record<string, number> = {};
        options.forEach((opt, i) => { mapped[opt] = vc[String(i)] ?? 0; });
        setVoteCounts(mapped);
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 3000);
  }, []);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // ── Load saved places ──────────────────────────────────────────────────────

  async function loadSavedPlaces() {
    setSavedLoading(true);
    const { data } = await supabase
      .from("poll_place_results")
      .select("*")
      .eq("group_id", groupId)
      .eq("is_winner", false)
      .order("created_at", { ascending: false });
    setSavedPlaces((data ?? []) as SavedPlace[]);
    setSavedLoading(false);
  }

  // ── Add/remove manual places ───────────────────────────────────────────────

  function addPlace(category: string) {
    const name = (inputValues[category] ?? "").trim();
    if (!name) return;
    if (manualPlaces.some(p => p.name.toLowerCase() === name.toLowerCase())) return;
    setManualPlaces(prev => [...prev, { name, category }]);
    setInputValues(prev => ({ ...prev, [category]: "" }));
    setPlacesSaved(false);
  }

  function removePlace(name: string) {
    setManualPlaces(prev => prev.filter(p => p.name !== name));
    setPlacesSaved(false);
  }

  async function savePlacesToDB() {
    if (manualPlaces.length === 0) return;
    setSavingPlaces(true);
    setError(null);
    try {
      // Only delete existing entries for the categories we're about to save
      // so places from other categories are preserved
      const categoriesToUpdate = [...new Set(manualPlaces.map(p => p.category))];
      await supabase
        .from("poll_place_results")
        .delete()
        .eq("group_id", groupId)
        .is("poll_id", null)
        .in("category", categoriesToUpdate);
      const rows = manualPlaces.map(p => ({
        group_id: groupId,
        poll_id: null as string | null,
        place_name: p.name,
        category: p.category,
        vote_count: 0,
        is_winner: false,
      }));
      const { error: err } = await supabase.from("poll_place_results").insert(rows);
      if (err) throw new Error(err.message);
      router.push(chatBackUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save places");
      setSavingPlaces(false);
    }
  }

  // ── AI place generation (Plan From Places) ────────────────────────────────

  async function generatePlacesWithAI() {
    if (generateCats.length === 0) return;
    setGenerating(true);
    setGenerateError(null);

    // Build a clear JSON template the AI must follow exactly
    const templateObj: Record<string, string[]> = {};
    generateCats.forEach(cat => { templateObj[cat] = ["Place1", "Place2", "Place3"]; });

    const prompt =
      `You are a Kuwait local expert. For EACH of the following categories, suggest exactly 3 real, well-known places in Kuwait.\n` +
      `Categories: ${generateCats.join(", ")}\n\n` +
      `Rules:\n` +
      `- Reply ONLY with a JSON object. No markdown, no code blocks, no explanation.\n` +
      `- Include ALL ${generateCats.length} categories as keys.\n` +
      `- Each value is an array of exactly 3 place name strings.\n` +
      `- Suggest real places that actually exist in Kuwait.\n\n` +
      `Required JSON format:\n` +
      JSON.stringify(templateObj);

    try {
      const reply = await invokeAi(prompt);
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Unexpected AI response");
      const parsed: Record<string, string[]> = JSON.parse(jsonMatch[0]);
      const newPlaces: ManualPlace[] = [];
      // Auto-add any new categories to the session
      const updatedCats = [...selectedCategories];
      for (const cat of generateCats) {
        if (!updatedCats.includes(cat)) updatedCats.push(cat);
        const suggestions = parsed[cat] ?? [];
        for (const name of suggestions) {
          const trimmed = name.trim();
          if (trimmed && !manualPlaces.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
            newPlaces.push({ name: trimmed, category: cat });
          }
        }
      }
      if (newPlaces.length === 0) throw new Error("No new places generated");
      setSelectedCategories(updatedCats);
      setManualPlaces(prev => [...prev, ...newPlaces]);
      setShowGenerate(false);
      setGenerateCats([]);
      setPlacesSaved(false);
      setActiveCat(generateCats[0]);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // ── AI generation (From Saved Places) ─────────────────────────────────────

  async function generateSavedPlaces() {
    if (savedGenCats.length === 0) return;
    setSavedGenerating(true);
    setSavedGenError(null);

    // Use existing saved place names as context so AI suggests different ones
    const existingByCat: Record<string, string[]> = {};
    savedPlaces.forEach(sp => {
      const k = sp.category || "Other";
      if (!existingByCat[k]) existingByCat[k] = [];
      existingByCat[k].push(sp.place_name);
    });

    const contextLines = savedGenCats
      .filter(cat => existingByCat[cat]?.length)
      .map(cat => `- ${cat}: ${existingByCat[cat].join(", ")}`)
      .join("\n");

    const templateObj: Record<string, string[]> = {};
    savedGenCats.forEach(cat => { templateObj[cat] = ["Place1", "Place2", "Place3"]; });

    const prompt =
      `You are a Kuwait local expert. Suggest exactly 3 real, well-known places in Kuwait for EACH category below.\n` +
      `Categories: ${savedGenCats.join(", ")}\n\n` +
      (contextLines ? `The user already has these places — suggest NEW different ones:\n${contextLines}\n\n` : "") +
      `Rules: Reply ONLY with a JSON object. No markdown, no code blocks, no explanation. Include ALL ${savedGenCats.length} categories as keys. Each value is an array of exactly 3 place name strings.\n\n` +
      `Required format:\n` + JSON.stringify(templateObj);

    try {
      const reply = await invokeAi(prompt);
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Unexpected AI response");
      const parsed: Record<string, string[]> = JSON.parse(jsonMatch[0]);

      const rows: { group_id: string; poll_id: null; place_name: string; category: string; vote_count: number; is_winner: boolean }[] = [];
      for (const cat of savedGenCats) {
        const suggestions = parsed[cat] ?? [];
        for (const name of suggestions) {
          const trimmed = name.trim();
          if (trimmed && !savedPlaces.some(sp => sp.place_name.toLowerCase() === trimmed.toLowerCase())) {
            rows.push({ group_id: groupId, poll_id: null, place_name: trimmed, category: cat, vote_count: 0, is_winner: false });
          }
        }
      }
      if (rows.length === 0) throw new Error("No new places generated");
      await supabase.from("poll_place_results").insert(rows);
      setShowSavedGenerate(false);
      setSavedGenCats([]);
      await loadSavedPlaces();
    } catch (e) {
      setSavedGenError(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setSavedGenerating(false);
    }
  }

  // ── Create poll ────────────────────────────────────────────────────────────

  async function createPoll(options: string[]) {
    setSubmitting(true);
    setError(null);
    try {
      let waMessageId: string | null = null;
      let effectiveWaJid = "";

      // If this group has WhatsApp, send the poll there first
      if (waJid && userId) {
        const res = await fetch("/api/whatsapp/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, waJid, groupId, question: pollQuestion, options }),
        });
        if (res.ok) {
          const r = await res.json();
          waMessageId = r.messageId ?? null;
          effectiveWaJid = waJid;
        }
        // If WA send fails, fall back to in-app poll silently
      }

      const { data, error: err } = await supabase
        .from("whatsapp_polls")
        .insert({
          group_id: groupId,
          question: pollQuestion,
          options,
          vote_counts: {},
          wa_jid: effectiveWaJid,
          wa_message_id: waMessageId,
          created_by: userId,
        })
        .select()
        .single();
      if (err) throw new Error(err.message);
      setPollId(data.id);
      const initCounts: Record<string, number> = {};
      options.forEach(o => { initCounts[o] = 0; });
      setVoteCounts(initCounts);
      startPolling(data.id, options);
      setPhase("tracking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create poll");
    } finally {
      setSubmitting(false);
    }
  }

  // ── End poll & save results ────────────────────────────────────────────────

  async function endPollAndSave() {
    if (!pollId) return;
    setSaving(true);
    setError(null);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    try {
      const entries = Object.entries(voteCounts);
      const maxVotes = Math.max(...entries.map(([, v]) => v), 0);
      const winners = entries.filter(([, v]) => v === maxVotes && v > 0);
      const winner = winners.length === 1 ? winners[0][0] : null;

      const placeCatMap: Record<string, string> = {};
      manualPlaces.forEach(p => { placeCatMap[p.name] = p.category; });

      const rows = entries.map(([placeName, voteCount]) => ({
        group_id: groupId,
        poll_id: pollId,
        place_name: placeName,
        category: placeCatMap[placeName] ?? "",
        vote_count: voteCount,
        is_winner: placeName === winner,
      }));
      await supabase.from("poll_place_results").insert(rows);

      setPollEnded(true);
      if (winner) {
        setWinnerName(winner);
        setWinnerCategory(placeCatMap[winner] ?? "");
        setPhase("winner");
      } else {
        setPhase("saved-places");
        loadSavedPlaces();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save results");
    } finally {
      setSaving(false);
    }
  }

  // ── AI event generation ────────────────────────────────────────────────────

  async function generateEvent(placeName: string, category: string) {
    setAiLoading(true);
    setError(null);
    const today = new Date().toISOString().split("T")[0];
    const prompt =
      `Create a group outing event for "${placeName}" (category: ${category || "general"}) in Kuwait for the group "${group?.name ?? "our group"}". ` +
      `Today is ${today}. Suggest a date this week. ` +
      `Reply ONLY with raw JSON (no markdown): {"title":"...","description":"...","eventDate":"YYYY-MM-DD","eventTime":"HH:MM"}`;
    try {
      const reply = await invokeAi(prompt);
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");
      const parsed = JSON.parse(jsonMatch[0]);
      setEventForm({
        title: parsed.title ?? `Outing — ${placeName}`,
        description: parsed.description ?? "",
        date: parsed.eventDate ?? "",
        time: parsed.eventTime ?? "",
        placeName,
      });
    } catch {
      setEventForm({ title: `Outing — ${placeName}`, description: "", date: "", time: "", placeName });
    } finally {
      setAiLoading(false);
      setPhase("event-preview");
    }
  }

  // ── Create event ───────────────────────────────────────────────────────────

  async function createEvent() {
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("events").insert({
        group_id: groupId,
        title: eventForm.title,
        description: eventForm.description || null,
        place_name: eventForm.placeName || null,
        event_date: eventForm.date || null,
        event_time: eventForm.time || null,
        source_poll_id: pollId ?? null,
        created_by: userId,
      });
      if (err) throw new Error(err.message);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleCategory(cat: string) {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  function toggleSaved(id: string) {
    setSelectedSavedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function goBack() {
    const map: Partial<Record<Phase, Phase>> = {
      categories: "home",
      places: "categories",
      "place-choice": "places",
      "poll-preview": "place-choice",
      tracking: "poll-preview",
      winner: "tracking",
      "event-preview": "winner",
      "saved-places": "home",
    };
    const p = map[phase];
    if (p) setPhase(p);
  }

  function resetAll() {
    setPhase("home");
    setSelectedCategories([]);
    setActiveCat("");
    setManualPlaces([]);
    setInputValues({});
    setPollQuestion("Where should we go? 📍");
    setPollId(null);
    setVoteCounts({});
    setPollEnded(false);
    setWinnerName(null);
    setEventForm({ title: "", description: "", date: "", time: "", placeName: "" });
    setError(null);
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  const pollOptions = manualPlaces.map(p => p.name);
  const catEmoji = (cat: string) => CATEGORIES.find(c => c.label === cat)?.emoji ?? "📍";

  const backPhases: Phase[] = ["categories", "places", "place-choice", "poll-preview", "winner", "event-preview", "saved-places"];
  const showBack = backPhases.includes(phase);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">

      {/* ── Top App Bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center gap-1 bg-surface/95 px-2 py-3 backdrop-blur-md">
        {showBack ? (
          <button onClick={goBack} className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
            <ArrowLeftIcon />
          </button>
        ) : (
          <Link href={chatBackUrl} className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
            <ArrowLeftIcon />
          </Link>
        )}
        <div className="flex-1 px-1">
          <h1 className="text-[20px] font-semibold text-on-surface">Plan From Places</h1>
          {group && <p className="text-[12px] text-on-surface-variant">{group.emoji} {group.name}</p>}
        </div>
      </header>


      {/* ════════════════════════════════════════════════════════════════
          HOME
      ════════════════════════════════════════════════════════════════ */}
      {phase === "home" && (
        <div className="flex flex-1 flex-col gap-4 px-4 pt-6 pb-8">
          <p className="text-[15px] text-on-surface-variant leading-relaxed">
            Add your own places by category, run a poll, and let AI turn the winner into a group event.
          </p>

          <button
            onClick={() => setPhase("categories")}
            className="flex items-start gap-4 rounded-3xl bg-primary px-5 py-5 text-left transition active:scale-[0.98] shadow-md"
          >
            <div className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl">🗺️</div>
            <div>
              <p className="text-[17px] font-semibold text-on-primary">Plan From Places</p>
              <p className="mt-0.5 text-[13px] text-on-primary/75">Pick categories → add your places → run poll → create event</p>
            </div>
          </button>

          <button
            onClick={() => { setPhase("saved-places"); loadSavedPlaces(); setSavedFilterCats([]); setSelectedSavedIds([]); }}
            className="flex items-start gap-4 rounded-3xl bg-surface-container px-5 py-5 text-left transition active:scale-[0.98]"
          >
            <div className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl">🔁</div>
            <div>
              <p className="text-[17px] font-semibold text-on-surface">From Saved Places</p>
              <p className="mt-0.5 text-[13px] text-on-surface-variant">Reuse places from past polls that didn't win</p>
            </div>
          </button>

          <div className="mt-2 flex flex-wrap gap-2">
            {["Admin approves everything", "Data stays in your group", "AI creates the event"].map(t => (
              <span key={t} className="rounded-full bg-surface-container px-3 py-1.5 text-[12px] text-on-surface-variant">✓ {t}</span>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          CATEGORIES
      ════════════════════════════════════════════════════════════════ */}
      {phase === "categories" && (
        <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
          <p className="mb-4 text-[15px] text-on-surface-variant">Which types of places do you want to add?</p>
          <div className="grid grid-cols-3 gap-3 flex-1">
            {CATEGORIES.map(cat => {
              const selected = selectedCategories.includes(cat.label);
              return (
                <button
                  key={cat.label}
                  onClick={() => toggleCategory(cat.label)}
                  className={`flex flex-col items-center gap-2 rounded-2xl px-3 py-4 transition-all active:scale-[0.96] ${selected ? "bg-primary shadow-sm ring-2 ring-primary" : "bg-surface-container"}`}
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <span className={`text-[13px] font-medium ${selected ? "text-on-primary" : "text-on-surface"}`}>{cat.label}</span>
                  {selected && (
                    <div className="grid h-5 w-5 place-items-center rounded-full bg-white/25">
                      <CheckIcon className="h-3 w-3 text-on-primary" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="sticky bottom-0 pt-4">
            <button
              disabled={selectedCategories.length === 0}
              onClick={() => { setActiveCat(selectedCategories[0]); setPhase("places"); }}
              className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md disabled:opacity-40"
            >
              {selectedCategories.length > 0 ? `Add places for ${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"}` : "Select at least one"}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PLACES — manual entry
      ════════════════════════════════════════════════════════════════ */}
      {phase === "places" && (
        <div className="flex flex-1 flex-col pb-8">

          {/* Category tabs */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
            {selectedCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
                  activeCat === cat ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface-variant"
                }`}
              >
                <span>{catEmoji(cat)}</span>
                {cat}
                {manualPlaces.filter(p => p.category === cat).length > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${activeCat === cat ? "bg-white/25 text-on-primary" : "bg-primary/15 text-primary"}`}>
                    {manualPlaces.filter(p => p.category === cat).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* AI Generate strip */}
          <div className="px-4 pb-3">
            {!showGenerate ? (
              <button
                onClick={() => { setShowGenerate(true); setGenerateCats([...selectedCategories]); setGenerateError(null); }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-3 text-[13px] font-medium text-primary transition active:scale-[0.98]"
              >
                ✨ Generate places with AI
              </button>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-primary">✨ Generate for these categories:</p>
                  <button onClick={() => setShowGenerate(false)} className="text-[12px] text-on-surface-variant">Cancel</button>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedCategories.map(cat => {
                    const on = generateCats.includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => setGenerateCats(prev => on ? prev.filter(c => c !== cat) : [...prev, cat])}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${on ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}
                      >
                        <span>{catEmoji(cat)}</span>{cat}
                      </button>
                    );
                  })}
                </div>
                {generateError && <p className="mb-2 text-[12px] text-red-500">{generateError}</p>}
                <button
                  disabled={generateCats.length === 0 || generating}
                  onClick={generatePlacesWithAI}
                  className="w-full rounded-full bg-primary py-2.5 text-[13px] font-semibold text-on-primary disabled:opacity-40"
                >
                  {generating ? "Generating…" : `Generate for ${generateCats.length} categor${generateCats.length === 1 ? "y" : "ies"}`}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 px-4">
            {/* Category header */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">{catEmoji(activeCat)}</span>
              <p className="text-[16px] font-semibold text-on-surface">{activeCat}</p>
              <span className="text-[13px] text-on-surface-variant">— add your places</span>
            </div>

            {/* Input row */}
            <div className="mb-4 flex gap-2">
              <input
                key={activeCat}
                value={inputValues[activeCat] ?? ""}
                onChange={e => setInputValues(prev => ({ ...prev, [activeCat]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") addPlace(activeCat); }}
                placeholder={`e.g. Paul, ${activeCat === "Café" ? "Mojo" : activeCat === "Restaurant" ? "Slider Station" : "Add a place"}…`}
                className="flex-1 rounded-2xl border border-outline-variant bg-surface-container px-4 py-3 text-[14px] text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => addPlace(activeCat)}
                disabled={!(inputValues[activeCat] ?? "").trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm disabled:opacity-40 transition active:scale-95"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Places for this category */}
            {manualPlaces.filter(p => p.category === activeCat).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-3xl">{catEmoji(activeCat)}</p>
                <p className="text-[14px] text-on-surface-variant">No places added yet</p>
                <p className="text-[12px] text-on-surface-variant/60">Type a place name above and press +</p>
              </div>
            ) : (
              <div className="space-y-2">
                {manualPlaces.filter(p => p.category === activeCat).map((place, i) => (
                  <div key={place.name} className="flex items-center gap-3 rounded-2xl bg-surface-container px-4 py-3.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[14px] font-medium text-on-surface">{place.name}</span>
                    <button
                      onClick={() => removePlace(place.name)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* All added places summary */}
            {manualPlaces.length > 0 && (
              <div className="mt-5 rounded-2xl bg-primary/6 px-4 py-3">
                <p className="text-[13px] font-medium text-primary">
                  {manualPlaces.length} place{manualPlaces.length !== 1 ? "s" : ""} added across {selectedCategories.filter(c => manualPlaces.some(p => p.category === c)).length} categor{selectedCategories.filter(c => manualPlaces.some(p => p.category === c)).length === 1 ? "y" : "ies"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {manualPlaces.map(p => (
                    <span key={p.name} className="rounded-full bg-primary/12 px-2.5 py-1 text-[12px] font-medium text-primary">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {manualPlaces.length >= 1 && (
            <div className="sticky bottom-0 space-y-2 bg-surface/95 px-4 pt-3 pb-1 backdrop-blur-sm">
              {manualPlaces.length >= 2 && (
                <button
                  onClick={() => setPhase("place-choice")}
                  className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md"
                >
                  Continue with {manualPlaces.length} places →
                </button>
              )}
              <button
                onClick={savePlacesToDB}
                disabled={savingPlaces}
                className="w-full rounded-full border border-outline-variant py-3.5 text-[14px] font-medium text-on-surface transition-all hover:bg-on-surface/5 disabled:opacity-60"
              >
                {savingPlaces ? "Saving…" : "💾 Save places & return to chat"}
              </button>
              {error && <p className="pb-1 text-center text-[12px] text-red-500">{error}</p>}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PLACE CHOICE
      ════════════════════════════════════════════════════════════════ */}
      {phase === "place-choice" && (
        <div className="flex flex-1 flex-col px-4 pt-6 pb-8">
          <h2 className="mb-2 text-[22px] font-semibold text-on-surface">Ready to vote?</h2>
          <p className="mb-6 text-[14px] text-on-surface-variant">
            You added {manualPlaces.length} place{manualPlaces.length !== 1 ? "s" : ""}. Create a poll so the group can vote on where to go.
          </p>

          {/* Summary chips */}
          <div className="mb-8 flex flex-wrap gap-2">
            {manualPlaces.map(p => (
              <span key={p.name} className="flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-[13px] font-medium text-on-surface">
                <span>{catEmoji(p.category)}</span>
                {p.name}
              </span>
            ))}
          </div>

          <button
            onClick={() => setPhase("poll-preview")}
            className="flex items-start gap-4 rounded-3xl bg-primary px-5 py-5 text-left transition active:scale-[0.98] shadow-md"
          >
            <div className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl">📊</div>
            <div>
              <p className="text-[17px] font-semibold text-on-primary">Create a Poll</p>
              <p className="mt-0.5 text-[13px] text-on-primary/75">Let the group vote on where to go</p>
            </div>
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          POLL PREVIEW
      ════════════════════════════════════════════════════════════════ */}
      {phase === "poll-preview" && (
        <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
          <p className="mb-4 text-[14px] text-on-surface-variant">Review your poll before it goes live.</p>

          {waJid && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#25d366]/10 px-4 py-3">
              <span className="text-[18px]">💬</span>
              <p className="text-[13px] font-medium text-[#128c47]">This poll will be sent to your WhatsApp group</p>
            </div>
          )}

          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Poll question</label>
            <input
              value={pollQuestion}
              onChange={e => setPollQuestion(e.target.value)}
              className="w-full rounded-2xl border border-outline-variant bg-surface-container px-4 py-3.5 text-[15px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Places in poll ({manualPlaces.length})
            </label>
            <div className="space-y-2">
              {manualPlaces.map((place, i) => (
                <div key={place.name} className="flex items-center gap-3 rounded-2xl bg-surface-container px-4 py-3.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-on-surface">{place.name}</p>
                    <p className="text-[12px] text-on-surface-variant">{catEmoji(place.category)} {place.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!isOwner && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[13px] font-medium text-amber-700">Only the group admin can create polls.</p>
            </div>
          )}

          {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}

          <div className="mt-auto sticky bottom-0 pt-3">
            <button
              disabled={submitting || !isOwner}
              onClick={() => createPoll(pollOptions)}
              className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md disabled:opacity-40"
            >
              {submitting ? "Creating…" : isOwner ? "Create Poll ✨" : "Admin only"}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TRACKING
      ════════════════════════════════════════════════════════════════ */}
      {phase === "tracking" && (
        <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <p className="text-[14px] font-medium text-on-surface">Live results</p>
            <span className="ml-auto text-[13px] text-on-surface-variant">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
          </div>

          <p className="mb-5 text-[15px] font-semibold text-on-surface">{pollQuestion}</p>

          <div className="flex-1 space-y-3">
            {Object.entries(voteCounts).map(([name, count]) => (
              <VoteBar key={name} label={name} count={count} total={totalVotes} isWinner={!pollEnded && count === maxVotes && count > 0 && maxVotes > 0} />
            ))}
          </div>

          {totalVotes === 0 && (
            <div className="mt-4 rounded-2xl bg-surface-container px-4 py-4 text-center">
              <p className="text-[14px] text-on-surface-variant">Waiting for votes…</p>
              <p className="mt-1 text-[12px] text-on-surface-variant/60">Share the poll with your group</p>
            </div>
          )}

          {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

          {isOwner && (
            <div className="sticky bottom-0 pt-4">
              <button
                disabled={saving}
                onClick={endPollAndSave}
                className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md disabled:opacity-40"
              >
                {saving ? "Saving…" : "End Poll & Save Results"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          WINNER
      ════════════════════════════════════════════════════════════════ */}
      {phase === "winner" && winnerName && (
        <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
          <div className="mb-6 rounded-3xl bg-primary px-5 py-6 text-center shadow-md">
            <p className="text-[40px]">🏆</p>
            <p className="mt-2 text-[22px] font-bold text-on-primary">{winnerName}</p>
            <p className="mt-1 text-[14px] text-on-primary/75">{catEmoji(winnerCategory)} {winnerCategory} · {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}</p>
          </div>

          <h3 className="mb-3 text-[14px] font-semibold uppercase tracking-wide text-on-surface-variant">Final Results</h3>
          <div className="mb-6 space-y-2">
            {Object.entries(voteCounts).sort(([, a], [, b]) => b - a).map(([name, count]) => (
              <VoteBar key={name} label={name} count={count} total={totalVotes} isWinner={name === winnerName} />
            ))}
          </div>

          {Object.keys(voteCounts).length > 1 && (
            <div className="mb-6 rounded-2xl bg-surface-container px-4 py-3">
              <p className="text-[13px] font-medium text-on-surface">
                💾 {Object.keys(voteCounts).length - 1} non-winning place{Object.keys(voteCounts).length - 1 !== 1 ? "s" : ""} saved for future polls
              </p>
              <p className="mt-0.5 text-[12px] text-on-surface-variant">Find them in "From Saved Places"</p>
            </div>
          )}

          {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}

          {isOwner && (
            <div className="mt-auto sticky bottom-0 pt-3 space-y-2">
              <button
                disabled={aiLoading}
                onClick={() => generateEvent(winnerName, winnerCategory)}
                className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md disabled:opacity-40"
              >
                {aiLoading ? "AI is planning…✨" : "Create Event with AI ✨"}
              </button>
              <button
                onClick={() => { setEventForm({ title: `Outing — ${winnerName}`, description: "", date: "", time: "", placeName: winnerName }); setPhase("event-preview"); }}
                className="w-full rounded-full border border-outline-variant py-3.5 text-[15px] font-medium text-on-surface"
              >
                Fill event manually
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          EVENT PREVIEW
      ════════════════════════════════════════════════════════════════ */}
      {phase === "event-preview" && (
        <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
          <div className="mb-4 rounded-2xl bg-primary/8 px-4 py-3">
            <p className="text-[13px] font-medium text-primary">✨ AI has drafted this event. Review and approve before it goes live.</p>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Event Title</label>
              <input value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-2xl border border-outline-variant bg-surface-container px-4 py-3.5 text-[15px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Event title" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Place</label>
              <input value={eventForm.placeName} onChange={e => setEventForm(f => ({ ...f, placeName: e.target.value }))}
                className="w-full rounded-2xl border border-outline-variant bg-surface-container px-4 py-3.5 text-[15px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Place name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Date</label>
                <input type="date" value={eventForm.date} onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-2xl border border-outline-variant bg-surface-container px-4 py-3.5 text-[14px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Time</label>
                <input type="time" value={eventForm.time} onChange={e => setEventForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full rounded-2xl border border-outline-variant bg-surface-container px-4 py-3.5 text-[14px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Description</label>
              <textarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                rows={3} className="w-full resize-none rounded-2xl border border-outline-variant bg-surface-container px-4 py-3.5 text-[14px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Optional description…" />
            </div>
          </div>

          {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}

          <div className="sticky bottom-0 pt-4 space-y-2">
            <button disabled={submitting || !eventForm.title.trim()} onClick={createEvent}
              className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md disabled:opacity-40">
              {submitting ? "Creating…" : "✓ Approve & Create Event"}
            </button>
            <button onClick={() => setPhase("winner")} className="w-full rounded-full border border-outline-variant py-3.5 text-[15px] font-medium text-on-surface">
              Back to results
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          DONE
      ════════════════════════════════════════════════════════════════ */}
      {phase === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12 text-center gap-4">
          <div className="grid h-24 w-24 place-items-center rounded-3xl bg-primary/10 text-5xl">🎉</div>
          <div>
            <h2 className="text-[24px] font-bold text-on-surface">Event Created!</h2>
            <p className="mt-1 text-[14px] text-on-surface-variant">{eventForm.title} has been added to {group?.name}.</p>
          </div>
          {eventForm.placeName && <p className="text-[14px] text-on-surface-variant">📍 {eventForm.placeName}</p>}
          {eventForm.date && <p className="text-[14px] text-on-surface-variant">🗓️ {eventForm.date}{eventForm.time ? ` · ${eventForm.time}` : ""}</p>}
          <div className="mt-4 flex w-full flex-col gap-2">
            <Link href={chatBackUrl} className="rounded-full bg-primary px-6 py-4 text-center text-[15px] font-semibold text-on-primary shadow-md">
              Back to Group
            </Link>
            <button onClick={resetAll} className="rounded-full border border-outline-variant px-6 py-3.5 text-[15px] font-medium text-on-surface">
              Plan Another Outing
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          SAVED PLACES
      ════════════════════════════════════════════════════════════════ */}
      {phase === "saved-places" && (
        <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
          <p className="mb-4 text-[14px] text-on-surface-variant">
            Places from past polls that didn't win. Select some to create a new poll.
          </p>

          {savedLoading ? (
            <div className="space-y-3 px-0">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-container" />)}</div>
          ) : savedPlaces.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-4xl">📭</p>
              <p className="text-[16px] font-medium text-on-surface">No saved places yet</p>
              <p className="text-[13px] text-on-surface-variant">Save places from the Plan From Places flow</p>
              <button onClick={() => setPhase("categories")} className="mt-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-on-primary">
                Plan From Places
              </button>
            </div>
          ) : (() => {
            // Unique categories present in saved places
            const savedCats = Array.from(new Set(savedPlaces.map(s => s.category).filter(Boolean)));
            // Places filtered by selected category chips
            const visiblePlaces = savedFilterCats.length > 0
              ? savedPlaces.filter(sp => savedFilterCats.includes(sp.category))
              : [];
            // Group visible places by category
            const byCat: Record<string, SavedPlace[]> = {};
            for (const sp of visiblePlaces) {
              const k = sp.category || "Other";
              if (!byCat[k]) byCat[k] = [];
              byCat[k].push(sp);
            }
            return (
              <>
                {/* Category filter chips */}
                <div className="mb-4">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Pick categories to browse</p>
                  <div className="flex flex-wrap gap-2">
                    {savedCats.map(cat => {
                      const active = savedFilterCats.includes(cat);
                      const count = savedPlaces.filter(sp => sp.category === cat).length;
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setSavedFilterCats(prev => active ? prev.filter(c => c !== cat) : [...prev, cat]);
                            setSelectedSavedIds([]);
                          }}
                          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-all active:scale-95 ${active ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface-variant"}`}
                        >
                          <span>{catEmoji(cat)}</span>
                          {cat}
                          <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active ? "bg-white/25 text-on-primary" : "bg-primary/15 text-primary"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* No category selected yet */}
                {savedFilterCats.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-3xl">☝️</p>
                    <p className="text-[14px] font-medium text-on-surface">Select a category above</p>
                    <p className="text-[12px] text-on-surface-variant">Tap one or more to see and mix places</p>
                  </div>
                ) : (
                  <>
                    {/* Count + select all */}
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[13px] font-medium text-on-surface-variant">
                        {visiblePlaces.length} place{visiblePlaces.length !== 1 ? "s" : ""} · {selectedSavedIds.length} selected
                      </p>
                      <button
                        onClick={() => setSelectedSavedIds(
                          selectedSavedIds.length === visiblePlaces.length ? [] : visiblePlaces.map(s => s.id)
                        )}
                        className="text-[13px] font-medium text-primary"
                      >
                        {selectedSavedIds.length === visiblePlaces.length ? "Deselect all" : "Select all"}
                      </button>
                    </div>

                    {/* Grouped places */}
                    <div className="space-y-5 pb-4">
                      {savedFilterCats.filter(cat => byCat[cat]?.length).map(cat => (
                        <div key={cat}>
                          <div className="mb-2 flex items-center gap-2 px-1">
                            <span className="text-[18px]">{catEmoji(cat)}</span>
                            <p className="text-[15px] font-semibold text-on-surface">{cat}</p>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                              {byCat[cat].length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {byCat[cat].map(sp => {
                              const selected = selectedSavedIds.includes(sp.id);
                              return (
                                <button key={sp.id} onClick={() => toggleSaved(sp.id)}
                                  className={`w-full rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98] ${selected ? "bg-primary/8 ring-1 ring-primary" : "bg-surface-container"}`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-all ${selected ? "border-primary bg-primary" : "border-outline"}`}>
                                      {selected && <CheckIcon className="h-3.5 w-3.5 text-on-primary" />}
                                    </div>
                                    <p className={`flex-1 text-[14px] font-medium ${selected ? "text-primary" : "text-on-surface"}`}>
                                      {sp.place_name}
                                    </p>
                                    <p className="text-[12px] text-on-surface-variant">
                                      {sp.vote_count} vote{sp.vote_count !== 1 ? "s" : ""}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* AI Generate */}
                <div className="mt-4 mb-2">
                  {!showSavedGenerate ? (
                    <button
                      onClick={() => { setShowSavedGenerate(true); setSavedGenCats([]); setSavedGenError(null); }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-3 text-[13px] font-medium text-primary transition active:scale-[0.98]"
                    >
                      ✨ Generate more places with AI
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-primary">✨ Pick categories to generate:</p>
                        <button onClick={() => setShowSavedGenerate(false)} className="text-[12px] text-on-surface-variant">Cancel</button>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {savedCats.map(cat => {
                          const on = savedGenCats.includes(cat);
                          return (
                            <button
                              key={cat}
                              onClick={() => setSavedGenCats(prev => on ? prev.filter(c => c !== cat) : [...prev, cat])}
                              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${on ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}
                            >
                              <span>{catEmoji(cat)}</span>{cat}
                            </button>
                          );
                        })}
                      </div>
                      {savedGenError && <p className="mb-2 text-[12px] text-red-500">{savedGenError}</p>}
                      <button
                        disabled={savedGenCats.length === 0 || savedGenerating}
                        onClick={generateSavedPlaces}
                        className="w-full rounded-full bg-primary py-2.5 text-[13px] font-semibold text-on-primary disabled:opacity-40"
                      >
                        {savedGenerating ? "Generating…" : savedGenCats.length === 0 ? "Select a category first" : `Generate for ${savedGenCats.length} categor${savedGenCats.length === 1 ? "y" : "ies"}`}
                      </button>
                    </div>
                  )}
                </div>

                {selectedSavedIds.length >= 2 && (
                  <div className="sticky bottom-0 bg-surface/95 pt-3 pb-1 backdrop-blur-sm">
                    <button
                      onClick={() => {
                        setManualPlaces(savedPlaces.filter(s => selectedSavedIds.includes(s.id)).map(s => ({ name: s.place_name, category: s.category })));
                        setPollQuestion("Where should we go? 📍");
                        setPhase("poll-preview");
                      }}
                      className="w-full rounded-full bg-primary py-4 text-[15px] font-semibold text-on-primary shadow-md"
                    >
                      Create Poll with {selectedSavedIds.length} places →
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
