"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { ArrowLeftIcon, PlusIcon, XIcon } from "@/components/icons";

// ── Types ──────────────────────────────────────────────────────────────────────
type WAMessage = {
  id: string;
  group_id: string;
  wa_jid: string;
  sender_jid: string;
  sender_name: string;
  content: string;
  is_from_me: boolean;
  wa_message_id: string | null;
  created_at: string;
};

type WAPoll = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  wa_message_id: string | null;
  created_at: string;
};

type WALink = {
  waJid: string;
  waName: string;
  participantCount: number;
};

type Tab = "chat" | "polls";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

// ── LinearProgress ────────────────────────────────────────────────────────────
function LinearProgress({ value, winner }: { value: number; winner: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/12">
      <div
        className={`h-full rounded-full transition-all duration-500 ${winner ? "bg-primary" : "bg-primary/40"}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// ── PollCard ──────────────────────────────────────────────────────────────────
function PollCard({
  poll,
  liveVotes,
}: {
  poll: WAPoll;
  liveVotes: Record<string, Record<string, number>>;
}) {
  const counts =
    poll.wa_message_id && liveVotes[poll.wa_message_id]
      ? liveVotes[poll.wa_message_id]
      : poll.vote_counts ?? {};

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...poll.options.map((_, i) => counts[String(i)] ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-2xl bg-surface-container">
      {/* Header */}
      <div className="px-5 pt-4 pb-2">
        <p className="text-[15px] font-semibold leading-snug text-on-surface">
          {poll.question}
        </p>
        <p className="mt-0.5 text-[11px] text-on-surface-variant">
          {formatDate(poll.created_at)}
          {total > 0 && ` · ${total} vote${total !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2 px-5 pb-5 pt-2">
        {poll.options.map((opt, i) => {
          const count = counts[String(i)] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isWinner = total > 0 && count === maxCount && count > 0;
          return (
            <div key={i}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span
                  className={`flex items-center gap-1 text-[13px] ${
                    isWinner
                      ? "font-semibold text-primary"
                      : "text-on-surface"
                  }`}
                >
                  {isWinner && <span className="text-[11px]">🏆</span>}
                  {opt}
                </span>
                <span
                  className={`shrink-0 text-[12px] font-medium tabular-nums ${
                    isWinner ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {pct}% · {count}
                </span>
              </div>
              <LinearProgress value={pct} winner={isWinner} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CreatePollSheet ────────────────────────────────────────────────────────────
function CreatePollSheet({
  groupId,
  userId,
  waJid,
  onCreated,
  onClose,
}: {
  groupId: string;
  userId: string;
  waJid: string | null;
  onCreated: (p: WAPoll) => void;
  onClose: () => void;
}) {
  const { profile } = useProfile();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sending, setSending] = useState(false);

  const validOptions = options.filter((o) => o.trim());

  async function submit() {
    if (!question.trim() || validOptions.length < 2 || !profile) return;
    setSending(true);
    try {
      const cleanOpts = validOptions.map((o) => o.trim());
      let messageId: string | null = null;

      if (waJid) {
        const res = await fetch("/api/whatsapp/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            waJid,
            groupId,
            question: question.trim(),
            options: cleanOpts,
          }),
        });
        const r = await res.json();
        messageId = r.messageId ?? null;
      }

      const { data } = await supabase
        .from("whatsapp_polls")
        .insert({
          group_id: groupId,
          wa_jid: waJid as string,
          wa_message_id: messageId,
          question: question.trim(),
          options: cleanOpts,
          vote_counts: {},
          created_by: userId,
        })
        .select()
        .single();

      if (data) onCreated(data as WAPoll);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-surface-container pb-safe">
        <div className="flex justify-center pt-3 pb-5">
          <div className="h-1 w-8 rounded-full bg-on-surface-variant/30" />
        </div>
        <div className="overflow-y-auto px-6 pb-8">
          <h2 className="mb-6 text-[24px] font-normal text-on-surface">
            Create poll
          </h2>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the group something…"
            autoFocus
            className="w-full rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mb-3 mt-5 text-[12px] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
            Options
          </p>
          <div className="space-y-3">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.target.value;
                    setOptions(next);
                  }}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                {options.length > 2 && (
                  <button
                    onClick={() =>
                      setOptions(options.filter((_, j) => j !== i))
                    }
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button
              onClick={() => setOptions([...options, ""])}
              className="mt-4 flex items-center gap-1 rounded-full px-3 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8"
            >
              <PlusIcon className="h-4 w-4" /> Add option
            </button>
          )}
          {waJid && (
            <div className="mt-4 flex items-center gap-2 rounded-full border border-[#25d366]/40 bg-[#25d366]/8 px-4 py-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[#25d366]" />
              <span className="text-[11px] font-medium text-[#128c7e]">
                Will be sent to WhatsApp group
              </span>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-full px-6 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={
                sending || !question.trim() || validOptions.length < 2
              }
              className="rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-on-primary shadow-sm disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send poll"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  prevMsg,
}: {
  msg: WAMessage;
  prevMsg: WAMessage | undefined;
}) {
  const isMe = msg.is_from_me;
  const isSameSender = prevMsg?.sender_jid === msg.sender_jid;
  const initials = msg.sender_name.slice(0, 2).toUpperCase() || "??";

  return (
    <div
      className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} ${
        isSameSender ? "mt-0.5" : "mt-3"
      }`}
    >
      {/* Avatar placeholder for left-side messages */}
      {!isMe && (
        <div className="w-8 shrink-0 self-end">
          {!isSameSender ? (
            <div className="grid h-8 w-8 place-items-center rounded-full bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
              {initials}
            </div>
          ) : null}
        </div>
      )}

      <div
        className={`flex max-w-[76%] flex-col gap-0.5 ${
          isMe ? "items-end" : "items-start"
        }`}
      >
        {!isMe && !isSameSender && (
          <span className="ml-1 text-[11px] font-medium text-on-surface-variant">
            {msg.sender_name}
          </span>
        )}
        <div
          className={`px-4 py-2.5 text-[14px] leading-relaxed ${
            isMe
              ? "rounded-[20px] rounded-br-[4px] bg-primary text-on-primary"
              : "rounded-[20px] rounded-bl-[4px] bg-surface-container text-on-surface"
          }`}
        >
          {msg.content}
        </div>
        <span className="mx-1 text-[10px] text-on-surface-variant/50">
          {formatTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WAGroupPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { groups } = useGroups();
  const { profile } = useProfile();
  const group = groups.find((g) => g.id === groupId);

  const [tab, setTab] = useState<Tab>("chat");
  const [waLink, setWaLink] = useState<WALink | null>(null);
  const [messages, setMessages] = useState<WAMessage[]>([]);
  const [polls, setPolls] = useState<WAPoll[]>([]);
  const [liveVotes, setLiveVotes] = useState<
    Record<string, Record<string, number>>
  >({});
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [loadingPolls, setLoadingPolls] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Show toast helper
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // ── Load WA link info ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id || !groupId) return;
    supabase
      .from("whatsapp_group_links")
      .select("wa_jid, wa_name, wa_participant_count")
      .eq("group_id", groupId)
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data)
          setWaLink({
            waJid: data.wa_jid,
            waName: data.wa_name,
            participantCount: data.wa_participant_count ?? 0,
          });
      });
  }, [profile?.id, groupId]);

  // ── Load messages ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!groupId) return;
    setLoadingMsgs(true);
    supabase
      .from("wa_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data ?? []) as WAMessage[]);
        setLoadingMsgs(false);
      });
  }, [groupId]);

  // ── Realtime subscription for new WA messages ──────────────────────────────
  useEffect(() => {
    if (!groupId) return;
    const uid = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`wa-msgs-${groupId}-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wa_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const m = payload.new as WAMessage;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  // ── Scroll to bottom when messages update ─────────────────────────────────
  useEffect(() => {
    if (tab === "chat") scrollToBottom();
  }, [messages, tab, scrollToBottom]);

  // ── Load polls ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!groupId) return;
    setLoadingPolls(true);
    supabase
      .from("whatsapp_polls")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPolls((data ?? []) as WAPoll[]);
        setLoadingPolls(false);
      });
  }, [groupId]);

  // ── Live vote polling every 3 s ────────────────────────────────────────────
  useEffect(() => {
    if (!groupId) return;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/poll-results?groupId=${groupId}`
        );
        if (res.ok) {
          const { votes } = await res.json();
          if (Object.keys(votes).length > 0) setLiveVotes(votes);
        }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 3_000);
    return () => clearInterval(id);
  }, [groupId]);

  const userId = profile?.id ?? "";

  return (
    <div className="flex h-[100dvh] flex-col bg-surface">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-outline-variant/20 bg-surface/95 backdrop-blur-md">
        <div className="flex items-center gap-1 px-2 py-2">
          <Link
            href={`/groups/${groupId}`}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-on-surface hover:bg-on-surface/8"
          >
            <ArrowLeftIcon />
          </Link>

          {/* Group info */}
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[17px] font-semibold text-on-surface">
              {group ? `${group.emoji} ${group.name}` : "WhatsApp Group"}
            </h1>
            {waLink && (
              <p className="truncate text-[12px] text-on-surface-variant">
                {waLink.waName}
                {waLink.participantCount > 0 &&
                  ` · ${waLink.participantCount} members`}
              </p>
            )}
          </div>

          {/* WA indicator */}
          <div className="flex items-center gap-2 rounded-full border border-[#25d366]/30 bg-[#25d366]/8 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-[#25d366]" />
            <span className="text-[11px] font-medium text-[#128c7e]">WA</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex">
          {(["chat", "polls"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-primary"
                  : "border-b-2 border-transparent text-on-surface-variant"
              }`}
            >
              {t === "chat" ? "💬 Chat" : "📊 Polls"}
            </button>
          ))}
        </div>
      </header>

      {/* ── Tab content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* Chat tab */}
        {tab === "chat" && (
          <div className="px-3 pb-6 pt-3">
            {loadingMsgs ? (
              <div className="space-y-3 py-4">
                {[80, 130, 70, 110, 90].map((w, i) => (
                  <div
                    key={i}
                    className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className="h-10 animate-pulse rounded-2xl bg-surface-container"
                      style={{ width: w }}
                    />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">
                  💬
                </div>
                <p className="text-[18px] font-normal text-on-surface">
                  No messages yet
                </p>
                <p className="max-w-[260px] text-[13px] text-on-surface-variant">
                  New messages sent in the WhatsApp group will appear here
                  automatically once the server captures them.
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {messages.map((msg, idx) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    prevMsg={messages[idx - 1]}
                  />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* Polls tab */}
        {tab === "polls" && (
          <div className="px-4 pb-32 pt-3">
            {loadingPolls ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-40 animate-pulse rounded-2xl bg-surface-container"
                  />
                ))}
              </div>
            ) : polls.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">
                  📊
                </div>
                <p className="text-[18px] font-normal text-on-surface">
                  No polls yet
                </p>
                <p className="max-w-[240px] text-[13px] text-on-surface-variant">
                  Create a poll and your group votes directly in WhatsApp.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-2 rounded-full bg-primary px-6 py-2.5 text-[13px] font-medium text-on-primary shadow-sm"
                >
                  Create first poll
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {polls.map((poll) => (
                  <PollCard key={poll.id} poll={poll} liveVotes={liveVotes} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom action bar (polls tab) ── */}
      {tab === "polls" && (
        <div className="shrink-0 border-t border-outline-variant/20 bg-surface px-4 py-3 pb-safe">
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14px] font-medium text-on-primary shadow-sm active:scale-[0.98]"
            >
              <PlusIcon className="h-4 w-4" /> Create Poll
            </button>
            <button
              onClick={() => showToast("Events coming soon!")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-outline bg-surface py-3 text-[14px] font-medium text-on-surface active:scale-[0.98]"
            >
              📅 Create Event
            </button>
          </div>
        </div>
      )}

      {/* ── FAB (chat tab) ── */}
      {tab === "chat" && (
        <div className="fixed bottom-24 right-4 z-30">
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition active:scale-95"
            aria-label="Create poll"
            title="Create poll"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-5 py-2.5 text-[13px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Create Poll Sheet ── */}
      {showCreate && (
        <CreatePollSheet
          groupId={groupId}
          userId={userId}
          waJid={waLink?.waJid ?? null}
          onCreated={(p) => setPolls((prev) => [p, ...prev])}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
