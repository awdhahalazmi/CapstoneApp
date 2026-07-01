"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { ArrowLeftIcon, PlusIcon, SendIcon, StickerIcon, XIcon } from "@/components/icons";
import type { WAInMemoryMessage } from "@/lib/whatsapp/manager";

type WALink = { waJid: string; waName: string; participantCount: number };

type WAPoll = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  wa_message_id: string | null;
  created_at: string;
  created_by: string;
};

type ChatItem =
  | { kind: "msg"; ts: number; data: WAInMemoryMessage }
  | { kind: "poll"; ts: number; data: WAPoll };

function fmt(tsMs: number) {
  return new Date(tsMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(tsMs: number) {
  const d = new Date(tsMs);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, prevMsg }: { msg: WAInMemoryMessage; prevMsg?: WAInMemoryMessage }) {
  const isMe = msg.isFromMe;
  const isSameSender = prevMsg?.senderJid === msg.senderJid && prevMsg?.msgType !== "reaction";
  const initials = (msg.senderName || "??").slice(0, 2).toUpperCase();

  if (msg.msgType === "reaction") {
    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} px-3 mt-0.5`}>
        <span className="text-[18px] opacity-70">{msg.reactionEmoji}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} ${isSameSender ? "mt-0.5" : "mt-3"}`}>
      {!isMe && (
        <div className="w-8 shrink-0 self-end">
          {!isSameSender && (
            <div className="grid h-8 w-8 place-items-center rounded-full bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
              {initials}
            </div>
          )}
        </div>
      )}
      <div className={`flex max-w-[78%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && !isSameSender && (
          <span className="ml-1 text-[11px] font-medium text-on-surface-variant">{msg.senderName}</span>
        )}

        {/* Sticker — no bubble */}
        {msg.msgType === "sticker" ? (
          <div className="flex flex-col items-end gap-0.5">
            {msg.mediaBase64
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={msg.mediaBase64} alt="sticker" className="h-24 w-24 object-contain" />
              : (
                <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-container text-on-surface-variant">
                  <StickerIcon className="h-7 w-7 opacity-60" />
                  <span className="text-[10px] font-medium opacity-60">Sticker</span>
                </div>
              )}
            <span className="mx-1 text-[10px] text-on-surface-variant/50">{fmt(msg.timestampMs)}</span>
          </div>
        ) : (
          <div className={`px-3.5 py-2.5 text-[14px] leading-relaxed ${isMe ? "rounded-[20px] rounded-br-[4px] bg-primary text-on-primary" : "rounded-[20px] rounded-bl-[4px] bg-surface-container text-on-surface"}`}>

            {/* Quote */}
            {msg.quotedText && (
              <div className={`mb-1.5 rounded-lg border-l-[3px] px-2 py-1 ${isMe ? "border-white/50 bg-white/10" : "border-primary/50 bg-primary/8"}`}>
                {msg.quotedSenderName && <p className={`mb-0.5 text-[10px] font-semibold ${isMe ? "text-white/70" : "text-primary"}`}>{msg.quotedSenderName}</p>}
                <p className={`line-clamp-2 text-[11px] ${isMe ? "text-white/60" : "text-on-surface/60"}`}>{msg.quotedText}</p>
              </div>
            )}

            {/* Image */}
            {msg.msgType === "image" && (
              <div className="mb-1.5">
                {msg.mediaBase64
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={msg.mediaBase64} alt="photo" className="max-h-48 w-full rounded-xl object-cover" />
                  : <div className="flex h-36 items-center justify-center rounded-xl bg-black/20 text-4xl">📷</div>}
                {msg.text && <p className="mt-1.5">{msg.text}</p>}
              </div>
            )}

            {/* Video */}
            {msg.msgType === "video" && (
              <div className="relative mb-1.5">
                {msg.mediaBase64
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={msg.mediaBase64} alt="video thumb" className="max-h-48 w-full rounded-xl object-cover" />
                  : <div className="flex h-36 items-center justify-center rounded-xl bg-black/20 text-4xl">🎬</div>}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-black/40 text-white text-xl">▶</div>
                </div>
                {msg.text && <p className="mt-1.5">{msg.text}</p>}
              </div>
            )}

            {/* Audio */}
            {msg.msgType === "audio" && (
              <div className="flex min-w-[160px] items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-[20px]">🎵</div>
                <div className="flex-1">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div key={i} className="w-0.5 rounded-full bg-current opacity-50" style={{ height: `${6 + Math.sin(i * 1.3) * 4}px` }} />
                    ))}
                  </div>
                  <p className="mt-0.5 text-[10px] opacity-60">Voice message</p>
                </div>
              </div>
            )}

            {/* Document */}
            {msg.msgType === "document" && (
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20 text-xl">📄</div>
                <p className="truncate text-[13px]">{msg.text || "Document"}</p>
              </div>
            )}

            {/* Location */}
            {msg.msgType === "location" && (
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📍</span>
                <p className="text-[13px]">{msg.text || "Location"}</p>
              </div>
            )}

            {/* Poll */}
            {msg.msgType === "poll" && (() => {
              const counts = msg.pollVotes ?? {};
              const total = Object.values(counts).reduce((a, b) => a + b, 0);
              const maxCount = Math.max(...(msg.pollOptions ?? []).map((_, i) => counts[String(i)] ?? 0), 0);
              return (
                <div className="min-w-[200px]">
                  <div className="mb-2.5 flex items-center gap-1.5">
                    <span className="text-[16px]">📊</span>
                    <span className="text-[14px] font-semibold">{msg.text}</span>
                  </div>
                  <div className="space-y-2">
                    {(msg.pollOptions ?? []).map((opt, i) => {
                      const count = counts[String(i)] ?? 0;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const isWinner = total > 0 && count === maxCount && count > 0;
                      return (
                        <div key={i}>
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            <span className={`text-[12px] ${isWinner ? "font-semibold" : ""}`}>{isWinner ? "🏆 " : ""}{opt}</span>
                            <span className="shrink-0 text-[11px] tabular-nums opacity-70">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-current/15">
                            <div className={`h-full rounded-full transition-all duration-500 ${isWinner ? "bg-current" : "bg-current/40"}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] opacity-50">
                    {total > 0 ? `${total} vote${total !== 1 ? "s" : ""}` : "No votes yet"} · Vote on WhatsApp
                  </p>
                </div>
              );
            })()}

            {/* Plain text */}
            {msg.msgType === "text" && <span>{msg.text}</span>}

            {/* Timestamp */}
            <div className="mt-1 flex justify-end">
              <span className={`text-[10px] ${isMe ? "text-on-primary/60" : "text-on-surface-variant/50"}`}>{fmt(msg.timestampMs)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create Poll Sheet ──────────────────────────────────────────────────────────
function CreatePollSheet({ groupId, userId, waJid, onClose }: {
  groupId: string; userId: string; waJid: string | null; onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sending, setSending] = useState(false);
  const valid = options.filter(o => o.trim());

  async function submit() {
    if (!question.trim() || valid.length < 2 || !waJid) return;
    setSending(true);
    try {
      const cleanOpts = valid.map(o => o.trim());
      const res = await fetch("/api/whatsapp/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, waJid, groupId, question: question.trim(), options: cleanOpts }),
      });
      const r = await res.json();
      if (r.messageId) {
        // Also save to Supabase for the polls page
        const encKeyBase64 = r.encKeyBase64 ?? null;
        await supabase.from("whatsapp_polls").insert({
          group_id: groupId, wa_jid: waJid, wa_message_id: r.messageId,
          enc_key: encKeyBase64, question: question.trim(), options: cleanOpts,
          vote_counts: {}, created_by: userId,
        });
      }
      onClose();
    } catch (err) { console.error(err); } finally { setSending(false); }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]" />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-surface-container pb-safe">
        <div className="flex justify-center pt-3 pb-5"><div className="h-1 w-8 rounded-full bg-on-surface-variant/30" /></div>
        <div className="overflow-y-auto px-6 pb-8">
          <h2 className="mb-6 text-[24px] font-normal text-on-surface">Create poll</h2>
          <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask the group something…" autoFocus className="w-full rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50" />
          <p className="mb-3 mt-5 text-[12px] font-medium uppercase tracking-[0.1em] text-on-surface-variant">Options</p>
          <div className="space-y-3">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} placeholder={`Option ${i + 1}`} className="flex-1 rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50" />
                {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant"><XIcon className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          {options.length < 10 && <button onClick={() => setOptions([...options, ""])} className="mt-4 flex items-center gap-1 rounded-full px-3 py-2.5 text-[14px] font-medium text-primary"><PlusIcon className="h-4 w-4" /> Add option</button>}
          <div className="mt-4 flex items-center gap-2 rounded-full border border-[#25d366]/40 bg-[#25d366]/8 px-4 py-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#25d366]" />
            <span className="text-[11px] font-medium text-[#128c7e]">Sends to WhatsApp group</span>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} className="rounded-full px-6 py-2.5 text-[14px] font-medium text-primary">Cancel</button>
            <button onClick={submit} disabled={sending || !question.trim() || valid.length < 2 || !waJid} className="rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-on-primary shadow-sm disabled:opacity-40">
              {sending ? "Sending…" : "Send poll"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Poll bubble (for DB-sourced polls) ────────────────────────────────────────
function PollBubble({ poll, isMe }: { poll: WAPoll; isMe: boolean }) {
  const counts = poll.vote_counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...poll.options.map((_, i) => counts[String(i)] ?? 0), 0);
  return (
    <div className={`mt-3 flex ${isMe ? "justify-end pr-10" : "justify-start pl-10"}`}>
      <div className={`max-w-[80%] overflow-hidden rounded-[20px] ${isMe ? "rounded-br-[4px] bg-primary text-on-primary" : "rounded-bl-[4px] bg-surface-container text-on-surface"}`}>
        <div className={`flex items-center gap-2 border-b px-4 py-3 ${isMe ? "border-white/15" : "border-outline-variant/20"}`}>
          <span className="text-[18px]">📊</span>
          <div>
            <p className="text-[14px] font-semibold">{poll.question}</p>
            <p className={`text-[11px] ${isMe ? "text-on-primary/70" : "text-on-surface-variant"}`}>
              {total > 0 ? `${total} vote${total !== 1 ? "s" : ""}` : "No votes yet"} · Vote on WhatsApp
            </p>
          </div>
        </div>
        <div className="space-y-2.5 px-4 py-3">
          {poll.options.map((opt, i) => {
            const count = counts[String(i)] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const isWinner = total > 0 && count === maxCount && count > 0;
            return (
              <div key={i}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`flex items-center gap-1 text-[13px] ${isWinner ? `font-semibold ${isMe ? "" : "text-primary"}` : isMe ? "" : "text-on-surface"}`}>
                    {isWinner && "🏆 "}{opt}
                  </span>
                  <span className={`ml-2 shrink-0 text-[11px] tabular-nums ${isMe ? "text-on-primary/80" : isWinner ? "text-primary" : "text-on-surface-variant"}`}>{pct}%</span>
                </div>
                <div className={`h-1.5 w-full overflow-hidden rounded-full ${isMe ? "bg-on-primary/20" : "bg-on-surface/8"}`}>
                  <div className={`h-full rounded-full transition-all duration-500 ${isMe ? "bg-on-primary" : isWinner ? "bg-primary" : "bg-primary/35"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 pb-2.5 text-right">
          <span className={`text-[10px] ${isMe ? "text-on-primary/60" : "text-on-surface-variant/50"}`}>{fmt(new Date(poll.created_at).getTime())}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WAGroupPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const router = useRouter();
  const { groups } = useGroups();
  const { profile } = useProfile();
  const group = groups.find(g => g.id === groupId);

  const [waLink, setWaLink] = useState<WALink | null>(null);
  const [waStatus, setWaStatus] = useState<string>("idle");
  const [messages, setMessages] = useState<WAInMemoryMessage[]>([]);
  const [polls, setPolls] = useState<WAPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior });
  }, []);

  async function sendMessage() {
    const content = text.trim();
    if (!content || !profile?.id || !waLink?.waJid || sending) return;
    setSending(true);
    setText("");
    try {
      await fetch("/api/whatsapp/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, waJid: waLink.waJid, content }),
      });
      setTimeout(() => scrollToBottom("smooth"), 300);
    } catch (err) { console.error(err); } finally { setSending(false); }
  }

  // Load WA link + check connection status
  useEffect(() => {
    if (!profile?.id || !groupId) return;
    supabase.from("whatsapp_group_links").select("wa_jid, wa_name, wa_participant_count")
      .eq("group_id", groupId).eq("user_id", profile.id).maybeSingle()
      .then(({ data }) => { if (data) setWaLink({ waJid: data.wa_jid, waName: data.wa_name, participantCount: data.wa_participant_count ?? 0 }); });
  }, [profile?.id, groupId]);

  // Poll WA connection status every 3s
  useEffect(() => {
    if (!profile?.id) return;
    const check = () =>
      fetch(`/api/whatsapp/status?userId=${profile.id}`)
        .then(r => r.json()).then(d => setWaStatus(d.status ?? "idle")).catch(() => {});
    check();
    const id = setInterval(check, 3_000);
    return () => clearInterval(id);
  }, [profile?.id]);

  // Load DB polls (and refresh vote_counts every 3s)
  useEffect(() => {
    if (!groupId) return;
    const load = () =>
      supabase.from("whatsapp_polls").select("*").eq("group_id", groupId).order("created_at", { ascending: true })
        .then(({ data }) => { if (data) setPolls(data as WAPoll[]); setLoading(false); });
    load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, [groupId]);

  // Poll Baileys messages every 2s
  useEffect(() => {
    if (!profile?.id || !waLink?.waJid) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/whatsapp/messages?userId=${profile.id}&waJid=${encodeURIComponent(waLink.waJid)}&limit=200`);
        if (res.ok) {
          const { messages: m } = await res.json();
          setMessages(m ?? []);
          setLoading(false);
          if ((m ?? []).length > prevCountRef.current) {
            prevCountRef.current = (m ?? []).length;
            setTimeout(() => scrollToBottom("smooth"), 50);
          }
        }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 2_000);
    return () => clearInterval(id);
  }, [profile?.id, waLink?.waJid, scrollToBottom]);

  // Fallback: stop loading after 5s
  useEffect(() => { const t = setTimeout(() => setLoading(false), 5_000); return () => clearTimeout(t); }, []);

  // Initial scroll
  useEffect(() => { if (!loading) scrollToBottom("instant" as ScrollBehavior); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build merged, sorted timeline — dedupe polls that also appear as Baileys messages.
  // Supabase vote_counts survives server restarts/hot-reloads (the in-memory
  // pollVotes on Baileys messages does not), so it's always the source of truth.
  const baileysIds = new Set(messages.filter(m => m.msgType === "poll").map(m => m.id));
  const dbVoteCountsByWaId = new Map(polls.filter(p => p.wa_message_id).map(p => [p.wa_message_id as string, p.vote_counts]));
  const chatItems: ChatItem[] = [
    ...messages.map(m => ({
      kind: "msg" as const,
      ts: m.timestampMs,
      data: m.msgType === "poll" && dbVoteCountsByWaId.has(m.id) ? { ...m, pollVotes: dbVoteCountsByWaId.get(m.id) } : m,
    })),
    // Only include DB polls that didn't come through Baileys (no duplicate)
    ...polls.filter(p => !p.wa_message_id || !baileysIds.has(p.wa_message_id))
            .map(p => ({ kind: "poll" as const, ts: new Date(p.created_at).getTime(), data: p })),
  ].sort((a, b) => a.ts - b.ts);

  function renderItems() {
    const nodes: React.ReactNode[] = [];
    let lastDay = "";
    let prevMsg: WAInMemoryMessage | undefined;

    for (let i = 0; i < chatItems.length; i++) {
      const item = chatItems[i];
      const day = fmtDay(item.ts);
      if (day !== lastDay) {
        lastDay = day;
        nodes.push(
          <div key={`day-${day}-${i}`} className="my-3 flex items-center gap-3">
            <div className="flex-1 h-px bg-outline-variant/30" />
            <span className="rounded-full bg-surface-container px-3 py-1 text-[11px] text-on-surface-variant">{day}</span>
            <div className="flex-1 h-px bg-outline-variant/30" />
          </div>
        );
      }
      if (item.kind === "poll") {
        nodes.push(<PollBubble key={`poll-${item.data.id}`} poll={item.data} isMe={item.data.created_by === profile?.id} />);
        prevMsg = undefined;
      } else {
        nodes.push(<MessageBubble key={item.data.id} msg={item.data} prevMsg={prevMsg} />);
        prevMsg = item.data;
      }
    }
    return nodes;
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-outline-variant/20 bg-surface/95 backdrop-blur-md">
        <div className="flex items-center gap-1 px-2 py-2">
          <Link href="/groups" className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
            <ArrowLeftIcon />
          </Link>
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[17px] font-semibold text-on-surface">
              {group ? `${group.emoji} ${group.name}` : "WhatsApp Group"}
            </h1>
            {waLink && <p className="truncate text-[12px] text-on-surface-variant">{waLink.waName}{waLink.participantCount > 0 && ` · ${waLink.participantCount} members`}</p>}
          </div>
          {waStatus === "connected" ? (
            <div className="flex items-center gap-1.5 rounded-full border border-[#25d366]/30 bg-[#25d366]/8 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#25d366]" />
              <span className="text-[11px] font-medium text-[#128c7e]">Live</span>
            </div>
          ) : (
            <Link href="/groups" className="flex items-center gap-1.5 rounded-full border border-orange-300/40 bg-orange-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              <span className="text-[11px] font-medium text-orange-600">Reconnect</span>
            </Link>
          )}
        </div>
      </header>

      {/* Reconnect banner */}
      {waStatus !== "connected" && waStatus !== "connecting" && (
        <Link href="/groups" className="shrink-0 bg-orange-50 border-b border-orange-200 px-4 py-2.5 flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <p className="text-[12px] text-orange-700 flex-1">WhatsApp disconnected — tap to scan QR and reconnect</p>
          <span className="text-[11px] font-medium text-orange-600">→</span>
        </Link>
      )}

      {/* Chat */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-2">
        {loading ? (
          <div className="space-y-3 py-4">
            {[80, 130, 70, 110, 90].map((w, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                <div className="h-10 animate-pulse rounded-2xl bg-surface-container" style={{ width: w }} />
              </div>
            ))}
          </div>
        ) : chatItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">💬</div>
            <p className="text-[18px] font-normal text-on-surface">No activity yet</p>
            <p className="max-w-[260px] text-[13px] text-on-surface-variant">
              Messages sent in the WhatsApp group will appear here live.
            </p>
          </div>
        ) : (
          <div>{renderItems()}</div>
        )}
        <div ref={endRef} />
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-outline-variant/20 bg-surface px-4 py-3 pb-safe">
        <div className="mb-2.5 flex items-end gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={waLink ? "Message…" : "Connect WhatsApp to chat"}
            disabled={!waLink}
            className="flex-1 rounded-full border border-outline bg-transparent px-4 py-2.5 text-[14px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!waLink || !text.trim() || sending}
            aria-label="Send message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary shadow-sm active:scale-[0.96] disabled:opacity-40"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            disabled={!waLink}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary py-3 text-[13px] font-medium text-on-primary shadow-sm active:scale-[0.98] disabled:opacity-40"
          >
            <PlusIcon className="h-4 w-4" /> Poll
          </button>
          <button
            onClick={() => router.push(`/groups/${groupId}/plan-places`)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary/10 py-3 text-[13px] font-medium text-primary active:scale-[0.98]"
          >
            🗺️ Plan Places
          </button>
          {group?.ownerId === profile?.id ? (
            <Link
              href={`/groups/${groupId}/ai-plan`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-outline bg-surface py-3 text-[13px] font-medium text-on-surface active:scale-[0.98]"
            >
              AI ✨
            </Link>
          ) : null}
        </div>
      </div>

      {showCreate && waLink && (
        <CreatePollSheet
          groupId={groupId} userId={profile?.id ?? ""} waJid={waLink.waJid}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
