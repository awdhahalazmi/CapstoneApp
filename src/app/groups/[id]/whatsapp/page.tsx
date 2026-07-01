"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { ArrowLeftIcon, PlusIcon, XIcon } from "@/components/icons";

type WAPoll = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  wa_message_id: string | null;
  created_at: string;
  created_by: string;
  source: string | null;
};

function fmt(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Create Poll Sheet ──────────────────────────────────────────────────────────
function CreatePollSheet({ groupId, userId, waJid, onCreated, onClose }: {
  groupId: string;
  userId: string;
  waJid: string | null;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sending, setSending] = useState(false);
  const valid = options.filter(o => o.trim());

  async function submit() {
    if (!question.trim() || valid.length < 2) return;
    setSending(true);
    try {
      const cleanOpts = valid.map(o => o.trim());
      let messageId: string | null = null;
      if (waJid) {
        const res = await fetch("/api/whatsapp/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, waJid, groupId, question: question.trim(), options: cleanOpts }),
        });
        const r = await res.json();
        messageId = r.messageId ?? null;
      }
      await supabase.from("whatsapp_polls").insert({
        group_id: groupId,
        wa_jid: waJid ?? "",
        wa_message_id: messageId,
        question: question.trim(),
        options: cleanOpts,
        vote_counts: {},
        created_by: userId,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]" />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-surface-container pb-safe">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-8 rounded-full bg-on-surface-variant/30" />
        </div>
        <div className="overflow-y-auto px-6 pb-8 pt-4">
          <h2 className="mb-5 text-[22px] font-semibold text-on-surface">Create Poll</h2>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask the group something…"
            autoFocus
            className="w-full rounded-2xl bg-surface-high px-4 py-3 text-[15px] text-on-surface outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-on-surface-variant/50"
          />
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Options</p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 rounded-2xl bg-surface-high px-4 py-3 text-[15px] text-on-surface outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-on-surface-variant/50"
                />
                {options.length > 2 && (
                  <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button onClick={() => setOptions([...options, ""])} className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-primary">
              <PlusIcon className="h-4 w-4" /> Add option
            </button>
          )}
          {waJid && (
            <div className="mt-3 flex items-center gap-2 rounded-full bg-[#25d366]/10 px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-[#25d366]" />
              <span className="text-[12px] font-medium text-[#128c7e]">Sends to WhatsApp group instantly</span>
            </div>
          )}
          <div className="mt-5 flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-full border border-outline-variant py-3 text-[14px] font-medium text-on-surface-variant">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={sending || !question.trim() || valid.length < 2}
              className="flex-1 rounded-full bg-primary py-3 text-[14px] font-semibold text-on-primary shadow-sm disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send Poll"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Poll Card ──────────────────────────────────────────────────────────────────
function PollCard({ poll, isOwner }: { poll: WAPoll; isOwner: boolean }) {
  const counts = poll.vote_counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...poll.options.map((_, i) => counts[String(i)] ?? 0), 0);
  const isAIPlan = poll.source === "plan_command";

  return (
    <div className={`overflow-hidden rounded-3xl ${isAIPlan ? "bg-gradient-to-br from-primary/8 to-violet-500/6 ring-1 ring-primary/20" : "bg-surface-container"}`}>
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${isAIPlan ? "bg-primary/12 text-primary" : "bg-on-surface/8 text-on-surface-variant"} text-xl`}>
          {isAIPlan ? "✨" : "📊"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-on-surface">{poll.question}</p>
          <div className="mt-1 flex items-center gap-2">
            {isAIPlan && (
              <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                AI Plan
              </span>
            )}
            {isOwner && !isAIPlan && (
              <span className="rounded-full bg-on-surface/8 px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                You
              </span>
            )}
            <span className="text-[11px] text-on-surface-variant">{fmt(poll.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2 px-4 pb-4">
        {poll.options.map((opt, i) => {
          const count = counts[String(i)] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isWinner = total > 0 && count === maxCount && count > 0;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`text-[13px] ${isWinner ? "font-semibold text-primary" : "text-on-surface"}`}>
                  {isWinner && "🏆 "}{opt}
                </span>
                <span className={`shrink-0 text-[12px] tabular-nums font-medium ${isWinner ? "text-primary" : "text-on-surface-variant"}`}>
                  {pct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-on-surface/8">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isWinner ? "bg-primary" : "bg-primary/30"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        <p className="pt-1 text-[11px] text-on-surface-variant">
          {total > 0 ? `${total} vote${total !== 1 ? "s" : ""}` : "No votes yet"}
          {poll.wa_message_id && " · Vote on WhatsApp"}
        </p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WAGroupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { groups } = useGroups();
  const { profile } = useProfile();
  const group = groups.find(g => g.id === groupId);

  const [waJid, setWaJid] = useState<string | null>(null);
  const [polls, setPolls] = useState<WAPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = profile?.id ?? "";

  // Load WA link
  useEffect(() => {
    if (!userId || !groupId) return;
    supabase.from("whatsapp_group_links")
      .select("wa_jid")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setWaJid(data?.wa_jid ?? null));
  }, [userId, groupId]);

  // Load polls and refresh every 3s
  const loadPolls = () => {
    supabase.from("whatsapp_polls")
      .select("id, question, options, vote_counts, wa_message_id, created_at, created_by, source")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setPolls(data as WAPoll[]);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!groupId) return;
    loadPolls();
    intervalRef.current = setInterval(loadPolls, 3_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const aiPolls = polls.filter(p => p.source === "plan_command");
  const adminPolls = polls.filter(p => p.source !== "plan_command");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-20 grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b border-outline-variant/20 bg-surface/95 px-1 py-1 backdrop-blur-md">
        <button onClick={() => router.back()} className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
          <ArrowLeftIcon />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold text-on-surface">
            {group ? `${group.emoji} ${group.name}` : "Group"} — Polls
          </h1>
          <p className="text-[12px] text-on-surface-variant">Admin & AI polls only</p>
        </div>
        <Link
          href={`/groups/${groupId}/ai-plan`}
          className="mr-2 flex items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-[13px] font-semibold text-primary"
        >
          ✨ Plan
        </Link>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-36 animate-pulse rounded-3xl bg-surface-container" />
            ))}
          </div>
        ) : polls.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">📊</div>
            <p className="mt-4 text-[18px] font-semibold text-on-surface">No polls yet</p>
            <p className="mt-1.5 text-[13px] text-on-surface-variant">
              Create a poll or use AI Plan to suggest places for your group.
            </p>
            <Link
              href={`/groups/${groupId}/ai-plan`}
              className="mt-5 flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[14px] font-semibold text-on-primary"
            >
              ✨ Start AI Plan
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {/* AI Plan polls */}
            {aiPolls.length > 0 && (
              <section>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-primary">AI Place Polls</p>
                <div className="space-y-3">
                  {aiPolls.map(p => (
                    <PollCard key={p.id} poll={p} isOwner={p.created_by === userId} />
                  ))}
                </div>
              </section>
            )}

            {/* Admin polls */}
            {adminPolls.length > 0 && (
              <section>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">Group Polls</p>
                <div className="space-y-3">
                  {adminPolls.map(p => (
                    <PollCard key={p.id} poll={p} isOwner={p.created_by === userId} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/20 bg-surface/95 px-4 py-4 pb-safe backdrop-blur-md">
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-surface-container py-3.5 text-[14px] font-semibold text-on-surface transition active:scale-[0.97]"
          >
            <PlusIcon className="h-4 w-4" /> Create Poll
          </button>
          <Link
            href={`/groups/${groupId}/ai-plan`}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-violet-500 py-3.5 text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(124,58,237,0.3)] transition active:scale-[0.97]"
          >
            ✨ AI Plan Outing
          </Link>
        </div>
      </div>

      {showCreate && (
        <CreatePollSheet
          groupId={groupId}
          userId={userId}
          waJid={waJid}
          onCreated={loadPolls}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
