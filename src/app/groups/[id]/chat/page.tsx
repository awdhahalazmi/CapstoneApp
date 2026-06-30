"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, SendIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";

type Message = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: { name: string | null; username: string | null } | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function GroupChatPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { groups } = useGroups();
  const { profile } = useProfile();
  const group = groups.find((g) => g.id === groupId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load recent messages
  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    supabase
      .from("group_messages")
      .select("id, group_id, sender_id, content, created_at, sender:profiles!group_messages_sender_id_fkey(name, username)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data ?? []) as Message[]);
        setLoading(false);
      });
  }, [groupId]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Real-time subscription — deferred via setTimeout to survive React StrictMode double-invoke
  useEffect(() => {
    if (!groupId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const timer = setTimeout(() => {
      channel = supabase.channel(`group-chat-${groupId}`);
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
        .subscribe();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId]);

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
    setSending(false);
    inputRef.current?.focus();
  }

  const myId = profile?.id;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-outline-variant/40 bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <Link
          href={`/groups/${groupId}`}
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 place-items-center text-primary"
        >
          <ArrowLeftIcon />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">
            {group ? `${group.emoji} ${group.name}` : "Group Chat"}
          </h1>
          <p className="text-[12px] text-on-surface-variant">
            {group ? `${group.members.length} members` : "Decide together"}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading && (
          <p className="py-8 text-center text-sm text-on-surface-variant">Loading messages…</p>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <span className="text-4xl">💬</span>
            <p className="mt-3 font-semibold">No messages yet</p>
            <p className="mt-1 text-sm text-on-surface-variant">Be the first to say something!</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === myId;
          const senderName = msg.sender?.name || msg.sender?.username || "Member";
          const av = avatarFor({ id: msg.sender_id, name: msg.sender?.name ?? undefined, username: msg.sender?.username ?? undefined });

          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
              {!isMe && (
                <div className={`h-8 w-8 shrink-0 self-end rounded-full bg-gradient-to-br ${av.gradient} grid place-items-center text-[11px] font-bold text-white`}>
                  {av.initials}
                </div>
              )}
              <div className={`flex max-w-[75%] flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="px-1 text-[11px] font-semibold text-on-surface-variant">
                    {senderName}
                  </span>
                )}
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isMe
                    ? "rounded-br-sm bg-primary text-on-primary"
                    : "rounded-bl-sm bg-card text-on-surface shadow-soft"
                }`}>
                  {msg.content}
                </div>
                <span className="px-1 text-[10px] text-on-surface-variant/60">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex shrink-0 items-center gap-2 border-t border-outline-variant/40 bg-card px-4 py-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the group…"
          className="input flex-1"
          disabled={sending}
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!input.trim() || sending}
          className="fab h-12 w-12 shrink-0 disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
