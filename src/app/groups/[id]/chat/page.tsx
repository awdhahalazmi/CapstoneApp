"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, SendIcon, PlusIcon, XIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { supabase } from "@/lib/supabase/client";
import { useProfile, useSession } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";

type Message = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: { name: string | null; username: string | null } | null;
};

type WAPoll = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  created_at: string;
  wa_jid: string | null;
  created_by: string;
};

type TimelineEntry =
  | { kind: "message"; item: Message; ts: string }
  | { kind: "poll"; item: WAPoll; ts: string };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Poll Bubble ───────────────────────────────────────────────────────────────
function PollBubble({
  poll,
  userVote,
  onVote,
}: {
  poll: WAPoll;
  userVote: number | undefined;
  onVote: (idx: number) => void;
}) {
  const total = Object.values(poll.vote_counts ?? {}).reduce((a, b) => a + b, 0);
  const hasVoted = userVote !== undefined;

  return (
    <div className="w-[85%] rounded-2xl border border-primary/20 bg-surface-container px-4 py-4">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[13px]">📊</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Poll</span>
      </div>
      <p className="text-[15px] font-medium leading-snug text-on-surface">{poll.question}</p>
      <div className="mt-3 space-y-2">
        {poll.options.map((opt, i) => {
          const count = poll.vote_counts?.[String(i)] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isChosen = userVote === i;
          return (
            <button
              key={i}
              onClick={() => !hasVoted && onVote(i)}
              disabled={hasVoted}
              className={`relative w-full overflow-hidden rounded-xl px-4 py-2.5 text-left text-[14px] transition active:scale-[0.98] ${
                hasVoted
                  ? isChosen
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-container/60 text-on-surface-variant"
                  : "border border-outline-variant bg-surface text-on-surface hover:bg-primary/5"
              }`}
            >
              {hasVoted && (
                <div
                  className="absolute inset-y-0 left-0 rounded-xl bg-primary/10 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className={isChosen ? "font-semibold" : ""}>{opt}</span>
                {hasVoted && (
                  <span className="shrink-0 text-[12px] font-semibold text-primary">{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] text-on-surface-variant">
        {total} vote{total !== 1 ? "s" : ""}
        {hasVoted ? " · You voted" : " · Tap an option to vote"}
      </p>
    </div>
  );
}

// ── Create Poll Sheet ─────────────────────────────────────────────────────────
function CreatePollSheet({
  groupId,
  userId,
  onCreated,
  onClose,
}: {
  groupId: string;
  userId: string;
  onCreated: (p: WAPoll) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sending, setSending] = useState(false);

  async function submit() {
    const clean = options.filter((o) => o.trim());
    if (!question.trim() || clean.length < 2) return;
    setSending(true);
    try {
      const { data } = await supabase
        .from("whatsapp_polls")
        .insert({
          group_id: groupId,
          wa_jid: "",
          wa_message_id: null,
          question: question.trim(),
          options: clean.map((o) => o.trim()),
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
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]" />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-surface-container pb-safe">
        <div className="flex justify-center pt-3 pb-5">
          <div className="h-1 w-8 rounded-full bg-on-surface-variant/30" />
        </div>
        <div className="px-6 pb-8">
          <h2 className="mb-6 text-[24px] font-normal text-on-surface">Create poll</h2>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the group something…"
            autoFocus
            className="w-full rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
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
                  className="flex-1 rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
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
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-full px-6 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={sending || !question.trim() || options.filter((o) => o.trim()).length < 2}
              className="rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-on-primary shadow-sm disabled:opacity-40"
            >
              {sending ? "Creating…" : "Create poll"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GroupChatPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { groups } = useGroups();
  const { profile } = useProfile();
  const session = useSession();
  const group = groups.find((g) => g.id === groupId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [polls, setPolls] = useState<WAPoll[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPollSheet, setShowPollSheet] = useState(false);

  const [waJid, setWaJid] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load WA link + status
  useEffect(() => {
    if (!profile?.id || !groupId) return;
    async function loadWA() {
      const [{ data: link }, statusRes] = await Promise.all([
        supabase
          .from("whatsapp_group_links")
          .select("wa_jid")
          .eq("group_id", groupId)
          .eq("user_id", profile!.id)
          .maybeSingle(),
        fetch(`/api/whatsapp/status?userId=${profile!.id}`)
          .then((r) => r.json())
          .catch(() => ({})),
      ]);
      setWaJid(link?.wa_jid ?? null);
      setWaConnected(statusRes?.status === "connected");
    }
    loadWA();
  }, [profile?.id, groupId]);

  // Load messages
  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    supabase
      .from("group_messages")
      .select(
        "id, group_id, sender_id, content, created_at, sender:profiles!group_messages_sender_id_fkey(name, username)"
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data ?? []) as Message[]);
        setLoading(false);
      });
  }, [groupId]);

  // Load in-app polls (wa_jid IS NULL = not sent via WhatsApp)
  useEffect(() => {
    if (!groupId) return;
    supabase
      .from("whatsapp_polls")
      .select("*")
      .eq("group_id", groupId)
      .or("wa_jid.is.null,wa_jid.eq.")
      .order("created_at", { ascending: true })
      .then(({ data }) => setPolls((data ?? []) as WAPoll[]));
  }, [groupId]);

  // Refresh poll vote counts every 5 s so results stay live for all members
  useEffect(() => {
    if (!groupId) return;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from("whatsapp_polls")
        .select("id, vote_counts")
        .eq("group_id", groupId)
        .or("wa_jid.is.null,wa_jid.eq.");
      if (data && data.length > 0) {
        setPolls((prev) =>
          prev.map((p) => {
            const fresh = data.find((d) => d.id === p.id);
            return fresh ? { ...p, vote_counts: (fresh.vote_counts ?? {}) as Record<string, number> } : p;
          })
        );
      }
    }, 5000);
    return () => clearInterval(id);
  }, [groupId]);

  // Restore votes from localStorage
  useEffect(() => {
    if (polls.length === 0) return;
    const saved: Record<string, number> = {};
    for (const poll of polls) {
      const v = localStorage.getItem(`poll_vote_${poll.id}`);
      if (v !== null) saved[poll.id] = Number(v);
    }
    setUserVotes(saved);
  }, [polls]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, polls, scrollToBottom]);

  // Real-time: new messages + poll inserts + vote updates
  useEffect(() => {
    if (!groupId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      const uid = Math.random().toString(36).slice(2);
      channel = supabase.channel(`group-chat-${groupId}-${uid}`);
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
          async (payload) => {
            const newMsg = payload.new as Message;
            const { data: senderData } = await supabase
              .from("profiles")
              .select("name, username")
              .eq("id", newMsg.sender_id)
              .single();
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, sender: senderData }];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "whatsapp_polls", filter: `group_id=eq.${groupId}` },
          (payload) => {
            const newPoll = payload.new as WAPoll;
            if (newPoll.wa_jid !== "" && newPoll.wa_jid !== null) return;
            setPolls((prev) => {
              if (prev.some((p) => p.id === newPoll.id)) return prev;
              return [...prev, newPoll];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "whatsapp_polls", filter: `group_id=eq.${groupId}` },
          (payload) => {
            const updated = payload.new as WAPoll;
            setPolls((prev) =>
              prev.map((p) => (p.id === updated.id ? { ...p, vote_counts: updated.vote_counts } : p))
            );
          }
        )
        .subscribe();
    }, 100);
    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId]);

  async function votePoll(poll: WAPoll, optionIndex: number) {
    if (userVotes[poll.id] !== undefined) return;
    const newCounts = { ...poll.vote_counts };
    newCounts[String(optionIndex)] = (newCounts[String(optionIndex)] ?? 0) + 1;
    // Optimistic update
    setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, vote_counts: newCounts } : p)));
    setUserVotes((prev) => ({ ...prev, [poll.id]: optionIndex }));
    localStorage.setItem(`poll_vote_${poll.id}`, String(optionIndex));
    // Persist
    await supabase.from("whatsapp_polls").update({ vote_counts: newCounts }).eq("id", poll.id);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending || !profile?.id) return;
    setSending(true);
    setInput("");
    await supabase.from("group_messages").insert({
      group_id: groupId,
      sender_id: profile.id,
      content,
    });
    if (waJid && waConnected) {
      fetch("/api/whatsapp/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, waJid, content }),
      }).catch(console.error);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  const myId = profile?.id;
  const waRelayActive = waJid && waConnected;
  const isWaGroup = !!waJid;

  // Merge messages and in-app polls into a single sorted timeline
  const timeline: TimelineEntry[] = [
    ...messages.map((m) => ({ kind: "message" as const, item: m, ts: m.created_at })),
    // Only show polls in chat when NOT a WA group
    ...(!isWaGroup ? polls.map((p) => ({ kind: "poll" as const, item: p, ts: p.created_at })) : []),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div className="flex h-[100dvh] flex-col bg-surface">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-1 border-b border-outline-variant/30 bg-surface/95 px-2 py-1 backdrop-blur-md">
        <Link
          href="/groups"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-on-surface hover:bg-on-surface/8"
        >
          <ArrowLeftIcon />
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-[18px] font-medium leading-tight text-on-surface">
            {group ? `${group.emoji} ${group.name}` : "Group Chat"}
          </h1>
          <p className="text-[12px] text-on-surface-variant">
            {group
              ? `${group.members.length} member${group.members.length !== 1 ? "s" : ""}${waRelayActive ? " · WhatsApp" : ""}`
              : ""}
          </p>
        </div>
      </header>

      {/* Messages + Polls */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex flex-col gap-4 py-4">
            {[80, 120, 60, 100].map((w, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                <div
                  className="h-10 animate-pulse rounded-2xl bg-surface-container"
                  style={{ width: w }}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && timeline.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">
              💬
            </div>
            <p className="mt-4 text-[18px] font-normal text-on-surface">No messages yet</p>
            <p className="mt-1 text-[14px] text-on-surface-variant">
              {isWaGroup
                ? "Messages here are also sent to your WhatsApp group."
                : "Send a message or create a poll to get started!"}
            </p>
          </div>
        )}

        <div className="space-y-1">
          {timeline.map((entry, idx) => {
            if (entry.kind === "poll") {
              const poll = entry.item;
              return (
                <div key={`poll-${poll.id}`} className="mt-4 flex justify-center">
                  <PollBubble
                    poll={poll}
                    userVote={userVotes[poll.id]}
                    onVote={(i) => votePoll(poll, i)}
                  />
                </div>
              );
            }

            const msg = entry.item;
            const isMe = msg.sender_id === myId;
            const senderName = msg.sender?.name || msg.sender?.username || "Member";
            const av = avatarFor({
              id: msg.sender_id,
              name: msg.sender?.name ?? undefined,
              username: msg.sender?.username ?? undefined,
            });

            // Find closest previous message for grouping (skip polls)
            const prevMsgEntry = timeline
              .slice(0, idx)
              .reverse()
              .find((t) => t.kind === "message");
            const prevMsg = prevMsgEntry?.item as Message | undefined;
            const isSameSender = prevMsg?.sender_id === msg.sender_id;
            const showAvatar = !isMe && !isSameSender;
            const showName = !isMe && !isSameSender;

            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} ${
                  isSameSender ? "mt-0.5" : "mt-3"
                }`}
              >
                {!isMe && (
                  <div className="w-8 shrink-0 self-end">
                    {showAvatar ? (
                      <div
                        className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${av.gradient} text-[11px] font-bold text-white`}
                      >
                        {av.initials}
                      </div>
                    ) : null}
                  </div>
                )}
                <div
                  className={`flex max-w-[72%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}
                >
                  {showName && (
                    <span className="ml-1 text-[11px] font-medium text-on-surface-variant">
                      {senderName}
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
          })}
        </div>
        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 bg-surface pb-safe">
        {waRelayActive && (
          <div className="flex items-center gap-2 px-4 py-1.5">
            <div className="h-px flex-1 bg-outline-variant/30" />
            <span className="text-[10px] font-medium text-on-surface-variant/50">
              Messages also sent to WhatsApp
            </span>
            <div className="h-px flex-1 bg-outline-variant/30" />
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 px-4 py-3"
        >
          {/* Poll button — non-WA groups only */}
          {!isWaGroup && profile && (
            <button
              type="button"
              onClick={() => setShowPollSheet(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-xl text-primary transition active:scale-95"
              aria-label="Create poll"
            >
              📊
            </button>
          )}

          <div className="flex-1 overflow-hidden rounded-[28px] bg-surface-container">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={waRelayActive ? "Message group & WhatsApp…" : "Message the group…"}
              className="w-full bg-transparent px-5 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/60 outline-none"
              disabled={sending}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || sending}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-40 ${
              waRelayActive ? "bg-[#25d366] text-white" : "bg-primary text-on-primary"
            }`}
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </form>
      </div>

      {showPollSheet && profile && (
        <CreatePollSheet
          groupId={groupId}
          userId={profile.id}
          onCreated={(p) => setPolls((prev) => [...prev, p])}
          onClose={() => setShowPollSheet(false)}
        />
      )}
    </div>
  );
}
