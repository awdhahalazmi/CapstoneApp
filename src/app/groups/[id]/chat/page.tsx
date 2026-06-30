"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, SendIcon } from "@/components/icons";
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// M3 Assist Chip — small indicator
function AssistChip({
  label,
  color = "default",
}: {
  label: string;
  color?: "green" | "default";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium ${
        color === "green"
          ? "border-[#25d366]/40 bg-[#25d366]/10 text-[#128c7e]"
          : "border-outline-variant bg-surface text-on-surface-variant"
      }`}
    >
      {label}
    </span>
  );
}

export default function GroupChatPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { groups } = useGroups();
  const { profile } = useProfile();
  const session = useSession();
  const group = groups.find((g) => g.id === groupId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // WhatsApp relay state
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
        fetch(`/api/whatsapp/status?userId=${profile!.id}`).then((r) =>
          r.json()
        ),
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Real-time subscription
  useEffect(() => {
    if (!groupId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      const uid = Math.random().toString(36).slice(2);
      channel = supabase.channel(`group-chat-${groupId}-${uid}`);
      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_messages",
            filter: `group_id=eq.${groupId}`,
          },
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

    // Insert to Supabase
    await supabase.from("group_messages").insert({
      group_id: groupId,
      sender_id: profile.id,
      content,
    });

    // Relay to WhatsApp group if linked & connected
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

  return (
    <div className="flex h-[100dvh] flex-col bg-surface">
      {/* M3 Top App Bar — Small */}
      <header className="flex shrink-0 items-center gap-1 border-b border-outline-variant/30 bg-surface/95 px-2 py-1 backdrop-blur-md">
        <Link
          href={`/groups/${groupId}`}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-on-surface hover:bg-on-surface/8"
        >
          <ArrowLeftIcon />
        </Link>
        <div className="min-w-0 flex-1 px-1">
          {/* M3 Title Large */}
          <h1 className="truncate text-[18px] font-medium leading-tight text-on-surface">
            {group ? `${group.emoji} ${group.name}` : "Group Chat"}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-[12px] text-on-surface-variant">
              {group ? `${group.members.length} members` : ""}
            </p>
            {waRelayActive && (
              <AssistChip label="→ WhatsApp" color="green" />
            )}
          </div>
        </div>
      </header>

      {/* Messages — M3 List */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex flex-col gap-4 py-4">
            {[80, 120, 60, 100].map((w, i) => (
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
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">
              💬
            </div>
            <p className="mt-4 text-[18px] font-normal text-on-surface">
              No messages yet
            </p>
            <p className="mt-1 text-[14px] text-on-surface-variant">
              {waRelayActive
                ? "Messages here are also sent to your WhatsApp group."
                : "Be the first to say something!"}
            </p>
          </div>
        )}

        <div className="space-y-1">
          {messages.map((msg, idx) => {
            const isMe = msg.sender_id === myId;
            const senderName =
              msg.sender?.name || msg.sender?.username || "Member";
            const av = avatarFor({
              id: msg.sender_id,
              name: msg.sender?.name ?? undefined,
              username: msg.sender?.username ?? undefined,
            });

            const prevMsg = messages[idx - 1];
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
                {/* Avatar — only for first message in a sequence */}
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

                {/* Bubble + meta */}
                <div
                  className={`flex max-w-[72%] flex-col gap-0.5 ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  {showName && (
                    <span className="ml-1 text-[11px] font-medium text-on-surface-variant">
                      {senderName}
                    </span>
                  )}
                  {/* M3 Chat bubble */}
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

      {/* M3 Input area */}
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
          className="flex items-center gap-3 px-4 py-3"
        >
          {/* M3 Filled Text Field */}
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
              placeholder={
                waRelayActive ? "Message group & WhatsApp…" : "Message the group…"
              }
              className="w-full bg-transparent px-5 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/60 outline-none"
              disabled={sending}
              autoComplete="off"
            />
          </div>

          {/* M3 FAB (small) */}
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || sending}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-40 ${
              waRelayActive
                ? "bg-[#25d366] text-white"
                : "bg-primary text-on-primary"
            }`}
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
