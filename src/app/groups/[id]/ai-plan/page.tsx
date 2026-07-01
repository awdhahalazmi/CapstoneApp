"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { ArrowLeftIcon, PlusIcon, XIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "init"
  | "choose"
  | "select-poll"
  | "tie-break"
  | "ai-thinking"
  | "ai-suggestion"
  | "build-polls"
  | "sending"
  | "tracking"
  | "analyzing"
  | "event-preview"
  | "reminders"
  | "done";

type PollRow = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  created_at: string;
  wa_jid: string | null;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  place_name: string | null;
  event_date: string | null;
  event_time: string | null;
  poll_summary: string | null;
  wa_jid: string | null;
  sent_at: string | null;
};

type AISuggestion = {
  outingType: string;
  reason: string;
  places: { name: string; area: string; reason: string; emoji: string }[];
};

// ── AI with retry ─────────────────────────────────────────────────────────────

async function invokeAi(content: string, client: typeof supabase, maxAttempts = 3): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await client.functions.invoke("ai-chat", {
      body: { messages: [{ role: "user", content }] },
    });
    if (error) {
      // "non-2xx" means the deployed function returned 5xx — usually OpenRouter rate limit
      const retryable = error.message.includes("non-2xx") || error.message.includes("Edge Function");
      if (retryable && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 4000));
        continue;
      }
      throw new Error(error.message);
    }
    if (data?.error) {
      const msg = String(data.error);
      const isRate = msg.includes("429") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("quota");
      if (isRate && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 4000));
        continue;
      }
      throw new Error(msg);
    }
    return (data?.reply as string) ?? "";
  }
  throw new Error("AI service is busy — please try again in a moment.");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pollTotal(counts: Record<string, number> = {}) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function getWinners(poll: PollRow): { indices: number[]; count: number } {
  const total = pollTotal(poll.vote_counts);
  if (total === 0) return { indices: [], count: 0 };
  const counts = poll.options.map((_, i) => poll.vote_counts?.[String(i)] ?? 0);
  const max = Math.max(...counts);
  return { indices: counts.reduce<number[]>((a, c, i) => (c === max ? [...a, i] : a), []), count: max };
}

function generateDateOptions(): string[] {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const opts: string[] = [];
  const now = new Date();
  for (let d = 1; d <= 10 && opts.length < 12; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const label = `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    const slots = (date.getDay() === 5 || date.getDay() === 6)
      ? ["6:00 PM", "8:00 PM", "9:00 PM"]
      : ["7:00 PM", "8:30 PM"];
    for (const t of slots) { if (opts.length < 12) opts.push(`${label} · ${t}`); }
  }
  return opts;
}

function parseDateTimeFromLabel(label: string): { date: string; time: string } {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const m = label.match(/(\w+),\s*(\w+)\s+(\d+)\s*·\s*([\d:]+)\s*([AP]M)/i);
  if (!m) return { date: "", time: "" };
  const year = new Date().getFullYear();
  const date = `${year}-${months[m[2]] ?? "01"}-${m[3].padStart(2, "0")}`;
  let h = parseInt(m[4].split(":")[0]);
  const min = m[4].split(":")[1] ?? "00";
  if (m[5].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[5].toUpperCase() === "AM" && h === 12) h = 0;
  return { date, time: `${String(h).padStart(2, "0")}:${min}` };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function VoteBar({ label, votes, total, isWinner }: { label: string; votes: number; total: number; isWinner: boolean }) {
  const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
  return (
    <div className={`rounded-xl px-3 py-2.5 ${isWinner ? "bg-primary/10" : "bg-surface-container-low"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`truncate text-[13px] font-medium ${isWinner ? "text-primary" : "text-on-surface"}`}>
          {isWinner && "🏆 "}{label}
        </span>
        <span className={`shrink-0 text-[12px] tabular-nums ${isWinner ? "text-primary" : "text-on-surface-variant"}`}>{votes}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-on-surface/10">
        <div className={`h-full rounded-full transition-all duration-700 ${isWinner ? "bg-primary" : "bg-on-surface/30"}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PlacesPollEditor({ label, question, setQuestion, options, setOptions }: {
  label: string; question: string; setQuestion: (v: string) => void;
  options: string[]; setOptions: (v: string[]) => void;
}) {
  return (
    <div className="rounded-3xl bg-surface-container px-5 py-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <input value={question} onChange={(e) => setQuestion(e.target.value)}
        className="w-full rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary"
        placeholder="Poll question…" />
      <div className="mt-3 space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={opt} onChange={(e) => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
              className="flex-1 rounded-xl border border-outline bg-transparent px-3 py-2 text-[13px] text-on-surface outline-none focus:border-primary"
              placeholder={`Option ${i + 1}`} />
            {options.length > 2 && (
              <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 12 && (
        <button onClick={() => setOptions([...options, ""])}
          className="mt-2 flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-medium text-primary hover:bg-primary/8">
          <PlusIcon className="h-4 w-4" /> Add option
        </button>
      )}
    </div>
  );
}

function DateTimePollEditor({ label, question, setQuestion, options, setOptions }: {
  label: string; question: string; setQuestion: (v: string) => void;
  options: string[]; setOptions: (v: string[]) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatSlot(dateStr: string, timeStr: string): string {
    if (!dateStr || !timeStr) return "";
    const d = new Date(`${dateStr}T${timeStr}`);
    const day = days[d.getDay()];
    const month = months[d.getMonth()];
    const date = d.getDate();
    let h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${day}, ${month} ${date} · ${h}:${min} ${ampm}`;
  }

  function addSlot() {
    const label = formatSlot(newDate, newTime);
    if (!label || options.includes(label) || options.length >= 12) return;
    setOptions([...options, label]);
    setNewTime("");
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="rounded-3xl bg-surface-container px-5 py-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <input value={question} onChange={(e) => setQuestion(e.target.value)}
        className="w-full rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary"
        placeholder="Poll question…" />

      {/* Existing slots as chips */}
      {options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-full bg-surface-container-low pl-3 pr-1 py-1.5">
              <span className="text-[12px] font-medium text-on-surface">{opt}</span>
              <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="grid h-5 w-5 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/12">
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new slot */}
      {options.length < 12 && (
        <div className="mt-3 rounded-2xl border border-outline/50 bg-surface px-3 py-3">
          <p className="mb-2 text-[11px] font-medium text-on-surface-variant">Add a time slot</p>
          <div className="flex gap-2">
            <input type="date" value={newDate} min={today} onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 rounded-xl border border-outline bg-transparent px-3 py-2 text-[13px] text-on-surface outline-none focus:border-primary" />
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)}
              className="w-28 rounded-xl border border-outline bg-transparent px-3 py-2 text-[13px] text-on-surface outline-none focus:border-primary" />
          </div>
          <button onClick={addSlot} disabled={!newDate || !newTime}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-primary/10 py-2 text-[13px] font-medium text-primary disabled:opacity-40">
            <PlusIcon className="h-4 w-4" /> Add slot
          </button>
        </div>
      )}
    </div>
  );
}

function LivePollCard({ poll }: { poll: PollRow }) {
  const total = pollTotal(poll.vote_counts);
  const { indices } = getWinners(poll);
  return (
    <div className="space-y-2 rounded-b-2xl bg-surface-container px-4 pb-4 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-on-surface">{poll.question}</p>
        <span className="text-[11px] text-on-surface-variant">{total} vote{total !== 1 ? "s" : ""}</span>
      </div>
      {poll.options.map((opt, i) => (
        <VoteBar key={i} label={opt} votes={poll.vote_counts?.[String(i)] ?? 0} total={total}
          isWinner={total > 0 && indices.length === 1 && indices[0] === i} />
      ))}
      {total === 0 && <p className="mt-1 text-center text-[11px] text-on-surface-variant">Waiting for votes…</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const REMINDER_OPTIONS = [
  { label: "30 minutes before", ms: 30 * 60 * 1000 },
  { label: "2 hours before", ms: 2 * 60 * 60 * 1000 },
  { label: "1 day before", ms: 24 * 60 * 60 * 1000 },
];

export default function OutingPlannerPage() {
  const params = useParams<{ id: string }>();
  const { groups, loading: groupsLoading } = useGroups();
  const session = useSession();
  const group = groups.find((g) => g.id === params.id);
  const userId = session?.user?.id ?? "";
  const isOwner = !!group && userId === group.ownerId;

  const [phase, setPhase] = useState<Phase>("init");
  const [waJid, setWaJid] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Option 1
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [tiedPlaces, setTiedPlaces] = useState<string[]>([]);
  const [fromPhase, setFromPhase] = useState<Phase>("choose");

  // Option 2
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);

  // Poll builder
  const [q1, setQ1] = useState("");
  const [opts1, setOpts1] = useState<string[]>([]);
  const [q2, setQ2] = useState("When should we meet? 📅");
  const [opts2, setOpts2] = useState<string[]>([]);

  // Tracking
  const [selectedPollIds, setSelectedPollIds] = useState<Set<string>>(new Set());
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Event
  const [winningPlace, setWinningPlace] = useState("");
  const [winningTime, setWinningTime] = useState("");
  const [eventForm, setEventForm] = useState({ title: "", place: "", date: "", time: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<EventRow | null>(null);

  // Reminders
  const [selectedReminders, setSelectedReminders] = useState<number[]>([2 * 60 * 60 * 1000]);
  const [sendingEvent, setSendingEvent] = useState(false);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || !params.id) return;
    async function init() {
      const [{ data: link }, statusRes, { data: pollData }] = await Promise.all([
        supabase.from("whatsapp_group_links").select("wa_jid")
          .eq("group_id", params.id).eq("user_id", userId).maybeSingle(),
        fetch(`/api/whatsapp/status?userId=${userId}`).then((r) => r.json()).catch(() => ({})),
        supabase.from("whatsapp_polls").select("*")
          .eq("group_id", params.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setWaJid(link?.wa_jid ?? null);
      setWaConnected(statusRes?.status === "connected");
      const rows = (pollData ?? []) as PollRow[];
      setPolls(rows);
      setSelectedPollIds(new Set(rows.map((p) => p.id)));
      setPhase("choose");
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, params.id]);

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!params.id || phase !== "tracking") return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      const ch = supabase
        .channel(`outing-polls-${params.id}-${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_polls", filter: `group_id=eq.${params.id}` },
          (payload) => {
            if (payload.eventType === "INSERT") setPolls((p) => [payload.new as PollRow, ...p]);
            if (payload.eventType === "UPDATE") setPolls((p) => p.map((r) => r.id === (payload.new as PollRow).id ? payload.new as PollRow : r));
          })
        .subscribe();
      realtimeRef.current = ch;
    }, 0);
    return () => {
      cancelled = true; clearTimeout(t);
      if (realtimeRef.current) { supabase.removeChannel(realtimeRef.current); realtimeRef.current = null; }
    };
  }, [params.id, phase]);

  // ── Option 1: analyze selected poll ───────────────────────────────────────

  function analyzePoll() {
    const poll = polls.find((p) => p.id === selectedPollId);
    if (!poll) return;
    const { indices, count } = getWinners(poll);
    if (count === 0) { setError("This poll has no votes yet. Wait for members to vote first."); return; }
    if (indices.length === 1) {
      const place = poll.options[indices[0]];
      setWinningPlace(place);
      setEventForm({ title: `Group Outing — ${place}`, place, date: "", time: "", description: `Poll winner: ${place} with ${count} vote${count !== 1 ? "s" : ""}` });
      setFromPhase("select-poll");
      setPhase("event-preview");
    } else {
      setTiedPlaces(indices.map((i) => poll.options[i]));
      setPhase("tie-break");
    }
  }

  function pickTiedPlace(place: string) {
    setWinningPlace(place);
    setEventForm({ title: `Group Outing — ${place}`, place, date: "", time: "", description: "Chosen by admin to break the tie." });
    setFromPhase("tie-break");
    setPhase("event-preview");
  }

  // ── Option 2: AI plan ──────────────────────────────────────────────────────

  async function startAiPlan() {
    setPhase("ai-thinking");
    setError(null);
    try {
      const prompt =
        `IMPORTANT: Reply with raw JSON only — no markdown, no explanation, no tool calls.\n\n` +
        `Group "${group?.name}" in Kuwait wants to plan a group outing.\n` +
        `Suggest the BEST outing type and recommend 4 real places in Kuwait.\n\n` +
        `Reply ONLY:\n` +
        `{"outingType":"Café Outing","reason":"Short reason why...","places":[{"name":"Exact Place Name","area":"Area, Kuwait","reason":"Why perfect for a group","emoji":"☕"}]}`;
      const reply = await invokeAi(prompt, supabase);
      const raw = reply.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      setAiSuggestion(JSON.parse(raw) as AISuggestion);
      setPhase("ai-suggestion");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI failed. Try again.");
      setPhase("choose");
    }
  }

  function pickPlace(place: AISuggestion["places"][0]) {
    if (!aiSuggestion) return;
    const others = aiSuggestion.places.filter((p) => p.name !== place.name).slice(0, 3).map((p) => p.name);
    setQ1(`Which place for our ${aiSuggestion.outingType}? 📍`);
    setOpts1([place.name, ...others]);
    setPhase("build-polls");
  }

  // ── Send polls ─────────────────────────────────────────────────────────────

  async function sendPolls() {
    const c1 = opts1.filter((o) => o.trim());
    const c2 = opts2.filter((o) => o.trim());
    if (c1.length < 2 || c2.length < 2) return;
    setPhase("sending"); setError(null);
    try {
      let newPolls: PollRow[] = [];
      if (waJid && waConnected) {
        const r1 = await fetch("/api/whatsapp/poll", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, waJid, question: q1.trim(), options: c1 }) });
        const j1 = await r1.json();
        const { data: p1 } = await supabase.from("whatsapp_polls").insert({
          group_id: params.id, wa_jid: waJid, wa_message_id: j1.messageId ?? null,
          question: q1.trim(), options: c1, vote_counts: {}, created_by: userId,
        }).select().single();
        await new Promise((r) => setTimeout(r, 1500));
        const r2 = await fetch("/api/whatsapp/poll", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, waJid, question: q2.trim(), options: c2 }) });
        const j2 = await r2.json();
        const { data: p2 } = await supabase.from("whatsapp_polls").insert({
          group_id: params.id, wa_jid: waJid, wa_message_id: j2.messageId ?? null,
          question: q2.trim(), options: c2, vote_counts: {}, created_by: userId,
        }).select().single();
        newPolls = [p1, p2].filter(Boolean) as PollRow[];
      } else {
        const { data: p1 } = await supabase.from("whatsapp_polls").insert({
          group_id: params.id, wa_jid: null, wa_message_id: null,
          question: q1.trim(), options: c1, vote_counts: {}, created_by: userId,
        }).select().single();
        const { data: p2 } = await supabase.from("whatsapp_polls").insert({
          group_id: params.id, wa_jid: null, wa_message_id: null,
          question: q2.trim(), options: c2, vote_counts: {}, created_by: userId,
        }).select().single();
        newPolls = [p1, p2].filter(Boolean) as PollRow[];
      }
      setPolls(newPolls);
      setSelectedPollIds(new Set(newPolls.map((p) => p.id)));
      setPhase("tracking");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send polls.");
      setPhase("build-polls");
    }
  }

  // ── Analyze results ────────────────────────────────────────────────────────

  async function analyzeResults(calledFrom: Phase = "tracking") {
    const toAnalyze = polls.filter((p) => selectedPollIds.has(p.id));
    if (toAnalyze.length === 0) return;
    setPhase("analyzing"); setError(null);
    const summarize = (p: PollRow) =>
      p.options.map((o, i) => `  ${o}: ${p.vote_counts?.[String(i)] ?? 0} votes`).join("\n");
    const prompt =
      `IMPORTANT: Reply with raw JSON only — no markdown, no explanation.\n\n` +
      `Group "${group?.name}" voted on their outing in Kuwait.\n\n` +
      toAnalyze.map((p) => `Poll: "${p.question}"\n${summarize(p)}`).join("\n\n") +
      `\n\nAnalyze ALL polls above together. Find the best matching place (considering all polls) and the winning date/time.\n` +
      `Reply ONLY:\n{"winningPlace":"Place Name","winningTime":"Day, Month DD · HH:MM AM/PM or TBD","pollSummary":"Brief result summary"}`;
    try {
      const reply = await invokeAi(prompt, supabase);
      const raw = reply.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(raw);
      const place = parsed.winningPlace ?? "";
      const timeLabel = parsed.winningTime ?? "TBD";
      const { date, time } = timeLabel !== "TBD" ? parseDateTimeFromLabel(timeLabel) : { date: "", time: "" };
      setWinningPlace(place);
      setWinningTime(timeLabel);
      setEventForm({ title: place ? `Group Outing — ${place}` : "Group Outing", place, date, time, description: parsed.pollSummary ?? "" });
      setFromPhase(calledFrom);
      setPhase("event-preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed. Try again.");
      setPhase(calledFrom);
    }
  }

  // ── Create event ───────────────────────────────────────────────────────────

  async function createEvent() {
    if (!eventForm.title.trim()) { setError("Event title is required."); return; }
    if (!userId) { setError("Not signed in."); return; }
    setCreating(true); setError(null);
    try {
      const pollSummary = winningPlace
        ? `${winningPlace}${winningTime && winningTime !== "TBD" ? ` · ${winningTime}` : ""}` : null;
      const { data, error: dbErr } = await supabase.from("events").insert({
        group_id: params.id, title: eventForm.title.trim(),
        description: eventForm.description.trim() || null,
        place_name: eventForm.place.trim() || null,
        event_date: eventForm.date || null, event_time: eventForm.time || null,
        poll_summary: pollSummary, wa_jid: waJid, created_by: userId,
      }).select().single();
      if (dbErr) { setError(dbErr.message); return; }
      setCreatedEvent(data as EventRow);
      setPhase("reminders");
    } finally { setCreating(false); }
  }

  // ── Schedule reminders & send ──────────────────────────────────────────────

  async function scheduleAndSend() {
    if (!createdEvent) return;
    setSendingEvent(true);
    if (waJid && waConnected) {
      try {
        await fetch("/api/whatsapp/send-event", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, waJid, title: createdEvent.title, placeName: createdEvent.place_name,
            eventDate: createdEvent.event_date, eventTime: createdEvent.event_time,
            description: createdEvent.description, pollSummary: createdEvent.poll_summary }),
        });
      } catch { /* non-critical */ }
      try {
        await supabase.from("events").update({ sent_at: new Date().toISOString() })
          .eq("id", (createdEvent as EventRow & { id: string }).id);
      } catch { /* non-critical */ }
    }
    if (createdEvent.event_date && selectedReminders.length > 0) {
      const base = new Date(`${createdEvent.event_date}T${createdEvent.event_time ?? "12:00"}:00`);
      try {
        await supabase.from("event_reminders").insert(
          selectedReminders.map((ms) => ({
            event_id: (createdEvent as EventRow & { id: string }).id,
            remind_at: new Date(base.getTime() - ms).toISOString(),
            label: REMINDER_OPTIONS.find((r) => r.ms === ms)?.label ?? "Reminder",
            created_by: userId,
          }))
        );
      } catch { /* non-critical */ }
    }
    setSendingEvent(false);
    setPhase("done");
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (groupsLoading || phase === "init") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }
  if (!group) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <p className="text-on-surface-variant">Group not found.</p>
        <Link href="/groups" className="mt-4 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-on-primary">Back</Link>
      </div>
    );
  }
  if (waJid && !isOwner) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <p className="text-[40px]">👑</p>
        <p className="mt-2 text-[15px] font-semibold text-on-surface">Owner only</p>
        <p className="mt-1 text-[13px] text-on-surface-variant">Only {group.name}&apos;s owner can plan outings via WhatsApp.</p>
        <Link href="/groups" className="mt-5 rounded-full border border-outline px-5 py-2.5 text-[14px] font-medium text-on-surface">Back to group</Link>
      </div>
    );
  }

  const TITLES: Record<Phase, string> = {
    init: "Plan an Outing", choose: "Plan an Outing ✨",
    "select-poll": "Select Poll", "tie-break": "Break the Tie",
    "ai-thinking": "AI is thinking…", "ai-suggestion": "AI Suggestion",
    "build-polls": "Review Polls", sending: "Sending…",
    tracking: "Live Poll Results", analyzing: "Analyzing Results…",
    "event-preview": "Review Event", reminders: "Schedule Reminders", done: "Done! 🎉",
  };

  const totalVotes = polls.reduce((s, p) => s + pollTotal(p.vote_counts), 0);
  const canGoBack = ["select-poll", "tie-break", "ai-suggestion", "build-polls", "event-preview", "reminders"].includes(phase);

  function goBack() {
    const map: Partial<Record<Phase, Phase>> = {
      "select-poll": "choose", "tie-break": "select-poll",
      "ai-suggestion": "choose", "build-polls": "ai-suggestion",
      "event-preview": fromPhase,
      reminders: "event-preview",
    };
    const p = map[phase]; if (p) setPhase(p);
  }

  return (
    <div className="min-h-[100dvh] bg-surface pb-28">
      <header className="sticky top-0 z-20 grid grid-cols-[3rem_1fr_3rem] items-center bg-surface/95 px-1 py-1 backdrop-blur-md">
        {canGoBack ? (
          <button onClick={goBack} className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
            <ArrowLeftIcon />
          </button>
        ) : (
          <Link href="/groups" className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
            <ArrowLeftIcon />
          </Link>
        )}
        <h1 className="truncate text-center text-[16px] font-medium text-on-surface">{TITLES[phase]}</h1>
        {phase === "tracking" ? (
          <button onClick={() => setPhase("build-polls")}
            className="grid h-12 w-12 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
            <PlusIcon className="h-5 w-5" />
          </button>
        ) : <span />}
      </header>

      <div className="space-y-4 px-4 pt-4">

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-[13px] text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="mt-1 text-[12px] font-medium text-red-700 underline">Dismiss</button>
          </div>
        )}

        {/* ── Choose ─────────────────────────────────────────────────────── */}
        {phase === "choose" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 px-5 py-5">
              <p className="text-[18px] font-bold text-on-surface">Plan an Outing 🎯</p>
              <p className="mt-1 text-[13px] text-on-surface-variant">
                {waJid ? `${group.name} · WhatsApp linked` : group.name}
              </p>
            </div>

            <p className="px-1 text-[13px] font-medium text-on-surface-variant">How would you like to plan?</p>

            {polls.length > 0 && (
              <button onClick={() => { setError(null); setPhase("select-poll"); }}
                className="w-full rounded-3xl bg-surface-container px-5 py-5 text-left transition active:bg-surface-high">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-2xl">📊</div>
                  <div>
                    <p className="text-[15px] font-semibold text-on-surface">Use Existing Polls</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">
                      {polls.length} poll{polls.length !== 1 ? "s" : ""} in this group — AI picks the winner and creates an event.
                    </p>
                  </div>
                </div>
              </button>
            )}

            <button onClick={startAiPlan}
              className="w-full rounded-3xl bg-surface-container px-5 py-5 text-left transition active:bg-surface-high">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-2xl">✨</div>
                <div>
                  <p className="text-[15px] font-semibold text-on-surface">Let AI Plan Everything</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">
                    AI suggests places, {waJid && waConnected ? "sends polls to the group," : "creates polls,"} reads results, and creates the event.
                  </p>
                </div>
              </div>
            </button>

            {polls.length === 0 && (
              <p className="text-center text-[12px] text-on-surface-variant">No existing polls in this group yet</p>
            )}
          </div>
        )}

        {/* ── Select poll ────────────────────────────────────────────────── */}
        {phase === "select-poll" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-on-surface-variant">
                Select the polls for AI to analyze together.
              </p>
              {polls.length > 1 && (
                <button
                  onClick={() => setSelectedPollIds(selectedPollIds.size === polls.length ? new Set() : new Set(polls.map((p) => p.id)))}
                  className="text-[12px] font-medium text-primary">
                  {selectedPollIds.size === polls.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            <div className="space-y-3">
              {polls.map((poll) => {
                const total = pollTotal(poll.vote_counts);
                const { indices } = getWinners(poll);
                const leader = indices.length === 1 ? poll.options[indices[0]] : null;
                const isSel = selectedPollIds.has(poll.id);
                return (
                  <button key={poll.id}
                    onClick={() => {
                      setSelectedPollIds((prev) => {
                        const n = new Set(prev);
                        n.has(poll.id) ? n.delete(poll.id) : n.add(poll.id);
                        return n;
                      });
                      setError(null);
                    }}
                    className={`w-full rounded-2xl border-2 px-4 py-4 text-left transition-all ${isSel ? "border-primary bg-primary/4" : "border-transparent bg-surface-container"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${isSel ? "border-primary bg-primary" : "border-outline"}`}>
                        {isSel && <span className="text-[10px] font-bold text-on-primary">✓</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-on-surface">{poll.question}</p>
                        <p className="mt-0.5 text-[12px] text-on-surface-variant">
                          {total} vote{total !== 1 ? "s" : ""}
                          {leader ? ` · Leading: ${leader}` : total > 0 ? " · Tied" : " · No votes yet"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {poll.options.slice(0, 4).map((o, i) => (
                            <span key={i} className="rounded-full bg-surface-container-low px-2.5 py-1 text-[11px] text-on-surface-variant">{o}</span>
                          ))}
                          {poll.options.length > 4 && (
                            <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-[11px] text-on-surface-variant">+{poll.options.length - 4} more</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="sticky bottom-24 pt-2">
              <button onClick={() => analyzeResults("select-poll")} disabled={selectedPollIds.size === 0}
                className="w-full rounded-full bg-primary py-3.5 text-[15px] font-semibold text-on-primary shadow-lg disabled:opacity-40">
                {selectedPollIds.size > 0
                  ? `Analyze ${selectedPollIds.size} poll${selectedPollIds.size !== 1 ? "s" : ""} with AI ✨`
                  : "Select at least one poll"}
              </button>
            </div>
          </>
        )}

        {/* ── Tie break ──────────────────────────────────────────────────── */}
        {phase === "tie-break" && (
          <>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-[15px] font-semibold text-amber-800">It&apos;s a tie! 🤝</p>
              <p className="mt-1 text-[13px] text-amber-700">
                {tiedPlaces.length} places tied. Pick one to proceed, or create a tiebreaker poll.
              </p>
            </div>
            <div className="space-y-3">
              {tiedPlaces.map((place) => (
                <button key={place} onClick={() => pickTiedPlace(place)}
                  className="w-full rounded-2xl bg-surface-container px-5 py-4 text-left transition active:bg-surface-high">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-xl">📍</div>
                    <p className="flex-1 text-[15px] font-semibold text-on-surface">{place}</p>
                    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current text-on-surface-variant/40">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => { setQ1("Which place should we go? 📍"); setOpts1(tiedPlaces); setPhase("build-polls"); }}
              className="w-full rounded-full border border-outline py-3 text-[14px] font-medium text-on-surface hover:bg-on-surface/6">
              Create a tiebreaker poll instead
            </button>
          </>
        )}

        {/* ── AI thinking ────────────────────────────────────────────────── */}
        {phase === "ai-thinking" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 rounded-2xl bg-primary/6 px-4 py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <p className="text-[13px] font-medium text-primary">AI is finding the best outing for {group.name}…</p>
            </div>
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-container" />)}
          </div>
        )}

        {/* ── AI suggestion ──────────────────────────────────────────────── */}
        {phase === "ai-suggestion" && aiSuggestion && (
          <>
            <div className="rounded-3xl bg-primary px-5 py-5 text-on-primary">
              <p className="text-[11px] font-semibold uppercase tracking-widest opacity-70">AI recommends</p>
              <h2 className="mt-1 text-[22px] font-bold">{aiSuggestion.outingType}</h2>
              <p className="mt-2 text-[13px] leading-relaxed opacity-85">{aiSuggestion.reason}</p>
            </div>
            <p className="px-1 text-[13px] font-medium text-on-surface-variant">Pick the main place for the poll:</p>
            <div className="space-y-3">
              {aiSuggestion.places.map((place) => (
                <button key={place.name} onClick={() => pickPlace(place)}
                  className="w-full rounded-2xl bg-surface-container px-4 py-4 text-left transition active:bg-surface-high">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-2xl">{place.emoji}</span>
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-on-surface">{place.name}</p>
                      <p className="text-[12px] text-on-surface-variant">📍 {place.area}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">{place.reason}</p>
                    </div>
                    <svg viewBox="0 0 24 24" className="mt-1 h-5 w-5 shrink-0 fill-current text-on-surface-variant/40">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Build polls ─────────────────────────────────────────────────── */}
        {phase === "build-polls" && (
          <>
            <div className="rounded-2xl bg-primary/6 px-4 py-3">
              <p className="text-[13px] font-medium text-primary">
                {waJid && waConnected
                  ? "Review both polls before sending to your WhatsApp group."
                  : "Review both polls before creating them for the group."}
              </p>
            </div>
            <PlacesPollEditor label="Poll 1 — Where?" question={q1} setQuestion={setQ1} options={opts1} setOptions={setOpts1} />
            <DateTimePollEditor label="Poll 2 — When?" question={q2} setQuestion={setQ2} options={opts2} setOptions={setOpts2} />
            <div className="sticky bottom-24 pt-2">
              <button onClick={sendPolls}
                disabled={opts1.filter((o) => o.trim()).length < 2 || opts2.filter((o) => o.trim()).length < 2}
                className={`w-full rounded-full py-3.5 text-[15px] font-semibold shadow-lg disabled:opacity-40 ${waJid && waConnected ? "bg-[#25d366] text-white" : "bg-primary text-on-primary"}`}>
                {waJid && waConnected ? "Send polls to WhatsApp 📲" : "Create polls for the group"}
              </button>
            </div>
          </>
        )}

        {/* ── Sending ─────────────────────────────────────────────────────── */}
        {phase === "sending" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 rounded-2xl bg-[#25d366]/10 px-4 py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#25d366]/30 border-t-[#25d366]" />
              <p className="text-[13px] font-medium text-[#128c7e]">
                {waJid && waConnected ? "Sending polls to WhatsApp…" : "Creating polls…"}
              </p>
            </div>
            <div className="h-36 animate-pulse rounded-3xl bg-surface-container" />
            <div className="h-36 animate-pulse rounded-3xl bg-surface-container" />
          </div>
        )}

        {/* ── Tracking ─────────────────────────────────────────────────────── */}
        {phase === "tracking" && (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-surface-container px-4 py-3">
              <div>
                <p className="text-[14px] font-medium text-on-surface">{totalVotes} total vote{totalVotes !== 1 ? "s" : ""}</p>
                <p className="text-[12px] text-on-surface-variant">{polls.length} poll{polls.length !== 1 ? "s" : ""} · updating live</p>
              </div>
              <div className="flex items-center gap-2">
                {polls.length > 1 && (
                  <button onClick={() => setSelectedPollIds(selectedPollIds.size === polls.length ? new Set() : new Set(polls.map((p) => p.id)))}
                    className="text-[12px] font-medium text-primary">
                    {selectedPollIds.size === polls.length ? "Deselect all" : "Select all"}
                  </button>
                )}
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
              </div>
            </div>
            <div className="space-y-3">
              {polls.map((poll) => {
                const sel = selectedPollIds.has(poll.id);
                return (
                  <div key={poll.id} className={`rounded-2xl border-2 transition-all ${sel ? "border-primary" : "border-transparent"}`}>
                    <button onClick={() => setSelectedPollIds((prev) => { const n = new Set(prev); n.has(poll.id) ? n.delete(poll.id) : n.add(poll.id); return n; })}
                      className="flex w-full items-center gap-2 px-4 pb-1 pt-3 text-left">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${sel ? "border-primary bg-primary" : "border-outline"}`}>
                        {sel && <span className="text-[10px] font-bold text-on-primary">✓</span>}
                      </div>
                      <span className="text-[13px] font-medium text-on-surface-variant">
                        {sel ? "Selected for analysis" : "Tap to include"}
                      </span>
                    </button>
                    <LivePollCard poll={poll} />
                  </div>
                );
              })}
            </div>
            <div className="sticky bottom-24 pt-2">
              <button onClick={() => analyzeResults("tracking")} disabled={selectedPollIds.size === 0}
                className="w-full rounded-full bg-primary py-3.5 text-[15px] font-semibold text-on-primary shadow-lg disabled:opacity-40">
                {selectedPollIds.size > 0
                  ? `Results are in — Analyze ${selectedPollIds.size} poll${selectedPollIds.size !== 1 ? "s" : ""} ✨`
                  : "Select polls to analyze"}
              </button>
            </div>
          </>
        )}

        {/* ── Analyzing ───────────────────────────────────────────────────── */}
        {phase === "analyzing" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 rounded-2xl bg-primary/6 px-4 py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <p className="text-[13px] font-medium text-primary">AI is reading the poll results…</p>
            </div>
            <div className="h-36 animate-pulse rounded-3xl bg-surface-container" />
            <div className="h-24 animate-pulse rounded-2xl bg-surface-container" />
          </div>
        )}

        {/* ── Event preview ────────────────────────────────────────────────── */}
        {phase === "event-preview" && (
          <>
            <div className="rounded-3xl bg-primary/8 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/70">Event preview</p>
              <p className="mt-1 text-[13px] text-on-surface-variant">
                Review and edit the details below, then approve to create the event.
              </p>
            </div>
            <div className="rounded-3xl bg-surface-container px-4 py-4">
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Title</p>
                  <input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    className="w-full rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary"
                    placeholder="Event title *" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Place</p>
                  <input value={eventForm.place} onChange={(e) => setEventForm({ ...eventForm, place: e.target.value })}
                    className="w-full rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary"
                    placeholder="Place / venue" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Date &amp; Time</p>
                  <div className="flex gap-2">
                    <input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                      className="flex-1 rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary" />
                    <input type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                      className="flex-1 rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary" />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Description</p>
                  <textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                    placeholder="Optional" rows={2}
                    className="w-full resize-none rounded-xl border border-outline bg-transparent px-3 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary" />
                </div>
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
                <button onClick={createEvent} disabled={creating || !eventForm.title.trim()}
                  className="w-full rounded-full bg-primary py-3 text-[14px] font-semibold text-on-primary shadow-sm disabled:opacity-40">
                  {creating ? "Creating…" : "Approve & Create Event ✓"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Reminders ────────────────────────────────────────────────────── */}
        {phase === "reminders" && createdEvent && (
          <>
            <div className="rounded-3xl border border-green-200 bg-green-50 px-5 py-4">
              <p className="text-[15px] font-semibold text-green-800">Event created! 🎉</p>
              <p className="mt-0.5 text-[13px] font-medium text-green-700">{createdEvent.title}</p>
              {createdEvent.place_name && <p className="text-[12px] text-green-600">📍 {createdEvent.place_name}</p>}
              {createdEvent.event_date && (
                <p className="text-[12px] text-green-600">
                  🗓️ {createdEvent.event_date}{createdEvent.event_time ? ` · ${createdEvent.event_time}` : ""}
                </p>
              )}
            </div>

            {createdEvent.event_date ? (
              <>
                <p className="px-1 text-[14px] font-semibold text-on-surface">Schedule reminders</p>
                <div className="space-y-2">
                  {REMINDER_OPTIONS.map(({ label, ms }) => {
                    const on = selectedReminders.includes(ms);
                    return (
                      <button key={ms}
                        onClick={() => setSelectedReminders((prev) => on ? prev.filter((r) => r !== ms) : [...prev, ms])}
                        className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all ${on ? "border-primary bg-primary/6" : "border-transparent bg-surface-container"}`}>
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary" : "border-outline"}`}>
                          {on && <span className="text-[10px] font-bold text-on-primary">✓</span>}
                        </div>
                        <span className="text-[14px] font-medium text-on-surface">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-surface-container px-4 py-3">
                <p className="text-[13px] text-on-surface-variant">No date set — reminders skipped.</p>
              </div>
            )}

            <div className="sticky bottom-24 pt-2">
              <button onClick={scheduleAndSend} disabled={sendingEvent}
                className={`w-full rounded-full py-3.5 text-[15px] font-semibold shadow-lg disabled:opacity-60 ${waJid && waConnected ? "bg-[#25d366] text-white" : "bg-primary text-on-primary"}`}>
                {sendingEvent ? "Sending…"
                  : waJid && waConnected
                    ? "Send to WhatsApp & Schedule Reminders 📲"
                    : selectedReminders.length > 0 && createdEvent.event_date
                      ? "Schedule Reminders"
                      : "Done"}
              </button>
            </div>
          </>
        )}

        {/* ── Done ─────────────────────────────────────────────────────────── */}
        {phase === "done" && createdEvent && (
          <div className="space-y-4 pt-2">
            <div className="rounded-3xl bg-primary px-5 py-8 text-center text-on-primary">
              <p className="text-[50px]">🎉</p>
              <h2 className="mt-2 text-[22px] font-bold">{createdEvent.title}</h2>
              {createdEvent.place_name && <p className="mt-1 text-[13px] opacity-90">📍 {createdEvent.place_name}</p>}
              {createdEvent.event_date && (
                <p className="mt-0.5 text-[13px] opacity-90">
                  🗓️ {createdEvent.event_date}{createdEvent.event_time ? ` · ${createdEvent.event_time}` : ""}
                </p>
              )}
              {createdEvent.poll_summary && (
                <p className="mt-3 rounded-2xl bg-white/15 px-4 py-2 text-[12px]">🏆 {createdEvent.poll_summary}</p>
              )}
              {waJid && waConnected && <p className="mt-2 text-[12px] opacity-80">✓ Sent to WhatsApp</p>}
              {selectedReminders.length > 0 && createdEvent.event_date && (
                <p className="mt-1 text-[12px] opacity-80">🔔 {selectedReminders.length} reminder{selectedReminders.length !== 1 ? "s" : ""} scheduled</p>
              )}
            </div>
            <Link href="/groups"
              className="block w-full rounded-full border border-outline py-3 text-center text-[14px] font-medium text-on-surface hover:bg-on-surface/6">
              Back to group
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
