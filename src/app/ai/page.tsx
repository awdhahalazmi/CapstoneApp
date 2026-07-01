"use client";

import { useEffect, useRef, useState } from "react";
import { AiIcon, SendIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { useProfile } from "@/lib/supabase/use-session";
import { supabase } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types";

function isAskingForGroup(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("which group") ||
    lower.includes("what group") ||
    lower.includes("for which group") ||
    lower.includes("select a group") ||
    lower.includes("choose a group") ||
    lower.includes("which of your groups") ||
    lower.includes("which group would you")
  );
}

function isEventCreated(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("event created") ||
    lower.includes("has been added to the group") ||
    lower.includes("created the event") ||
    lower.includes("i've created") ||
    lower.includes("i have created") ||
    lower.includes("added to the group")
  );
}

async function sendWaNotification(groupId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: waLink } = await supabase
      .from("whatsapp_group_links")
      .select("wa_jid, user_id")
      .eq("group_id", groupId)
      .maybeSingle();

    if (!waLink?.wa_jid) return;

    const { data: event } = await supabase
      .from("events")
      .select("title, place_name, event_date, event_time, description")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!event) return;

    await fetch("/api/whatsapp/send-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: waLink.user_id,
        waJid: waLink.wa_jid,
        title: event.title,
        placeName: event.place_name ?? undefined,
        eventDate: event.event_date ?? undefined,
        eventTime: event.event_time ?? undefined,
        description: event.description ?? undefined,
      }),
    });
  } catch {
    // non-critical
  }
}

export default function AiPage() {
  const { groups } = useGroups();
  const { profile } = useProfile();
  const interests = profile?.interests ?? [];
  const firstName = (profile?.name ?? "").split(" ")[0] || null;

  const greeting: ChatMessage = {
    id: "c0",
    role: "assistant",
    content: `Hey${firstName ? ` ${firstName}` : ""} 👋 I'm your Beyond Kw assistant. Tell me who's coming and what you're in the mood for, and I'll plan the perfect outing for your group.`,
  };

  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [waSentGroupId, setWaSentGroupId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const pendingGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const groupContext = selectedGroup
    ? {
        name: selectedGroup.name,
        members: selectedGroup.members.map((m) => ({ name: m.name })),
      }
    : null;

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;

    const userMsg: ChatMessage = { id: `u${idRef.current++}`, role: "user", content };
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setThinking(true);

    let replyText = "";
    try {
      replyText = await (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase.functions.invoke("ai-chat", {
            body: { messages: history, group: groupContext, interests },
          });
          if (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body = await (error as any).context?.json?.().catch?.(() => null);
            const msg: string = body?.error ?? error.message ?? "edge function error";
            const isRate = msg.includes("429") || msg.toLowerCase().includes("rate") || msg.includes("non-2xx");
            if (isRate && attempt < 2) { await new Promise((r) => setTimeout(r, (attempt + 1) * 4000)); continue; }
            throw new Error(msg);
          }
          if (data?.error) {
            const msg = String(data.error);
            const isRate = msg.includes("429") || msg.toLowerCase().includes("rate");
            if (isRate && attempt < 2) { await new Promise((r) => setTimeout(r, (attempt + 1) * 4000)); continue; }
            throw new Error(msg);
          }
          if (!data?.reply) throw new Error("No reply from AI.");
          return data.reply as string;
        }
        throw new Error("AI is busy — please try again in a moment.");
      })();
    } catch (err) {
      replyText = `Sorry, I couldn't respond right now. Please try again in a moment.`;
    }

    const pickedGroupId = pendingGroupIdRef.current;
    if (pickedGroupId && isEventCreated(replyText)) {
      pendingGroupIdRef.current = null;
      sendWaNotification(pickedGroupId).then(() => {
        setWaSentGroupId(pickedGroupId);
        setTimeout(() => setWaSentGroupId(null), 4000);
      });
    }

    setMessages((m) => [
      ...m,
      { id: `a${idRef.current++}`, role: "assistant", content: replyText },
    ]);
    setThinking(false);
  }

  const suggestions = selectedGroup
    ? [
        `Plan for ${selectedGroup.name}`,
        "Somewhere outdoors",
        "Budget-friendly spot",
      ]
    : ["Plan for tonight", "Quiet café", "Outdoor this weekend"];

  const lastMsg = messages[messages.length - 1];
  const showGroupPicker =
    !thinking &&
    lastMsg?.role === "assistant" &&
    isAskingForGroup(lastMsg.content) &&
    groups.length > 0;

  const waSentGroup = groups.find((g) => g.id === waSentGroupId);
  const isOnlyGreeting = messages.length === 1;

  return (
    <div className="flex h-full flex-col bg-surface md:min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-surface/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary">
            <AiIcon className="h-5 w-5 text-on-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold leading-tight text-on-surface">AI Assistant</h1>
            <p className="text-[12px] text-on-surface-variant">
              {selectedGroup ? `Planning for ${selectedGroup.emoji} ${selectedGroup.name}` : "Plan outings in Kuwait"}
            </p>
          </div>
          {waSentGroup && (
            <span className="shrink-0 rounded-full bg-[#25d366]/15 px-3 py-1 text-[11px] font-semibold text-[#128c7e]">
              ✓ Sent to {waSentGroup.name}
            </span>
          )}
        </div>

        {/* Group selector */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          <button
            onClick={() => setGroupId(null)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              groupId === null
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            Just me
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setGroupId(g.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                groupId === g.id
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span>{g.emoji}</span>
              {g.name}
            </button>
          ))}
        </div>

        <div className="h-px bg-outline-variant/30" />
      </header>

      {/* ── Messages ────────────────────────────────────────────────── */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">

        {/* Empty state illustration */}
        {isOnlyGreeting && (
          <div className="mb-6 flex flex-col items-center gap-2 pt-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
              <AiIcon className="h-8 w-8 text-primary" />
            </div>
            <p className="text-[13px] text-on-surface-variant">Powered by Grok 4.3</p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) =>
            m.role === "assistant" ? (
              <div key={m.id} className="flex items-end gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <AiIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="max-w-[82%] rounded-[20px] rounded-bl-[6px] bg-surface-container px-4 py-3 text-[14px] leading-relaxed text-on-surface shadow-sm">
                  <AssistantMessage content={m.content} />
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[78%] rounded-[20px] rounded-br-[6px] bg-primary px-4 py-3 text-[14px] leading-relaxed text-on-primary">
                  {m.content}
                </div>
              </div>
            ),
          )}

          {thinking && (
            <div className="flex items-end gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <AiIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-1.5 rounded-[20px] rounded-bl-[6px] bg-surface-container px-4 py-3.5 shadow-sm">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </div>
            </div>
          )}
        </div>

        <div ref={endRef} />
      </div>

      {/* ── Bottom bar (sticky to flex bottom) ─────────────────────── */}
      <div className="shrink-0 bg-surface/95 backdrop-blur-md">
        <div className="h-px bg-outline-variant/30" />

        {/* Group picker when AI asks */}
        {showGroupPicker && (
          <div className="px-4 pt-3 pb-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Select a group
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    pendingGroupIdRef.current = g.id;
                    send(`${g.emoji} ${g.name}`);
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container px-3.5 py-2 text-[13px] font-medium text-on-surface"
                >
                  <span>{g.emoji}</span>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick suggestion chips */}
        {!showGroupPicker && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3 pb-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => { send(s); inputRef.current?.focus(); }}
                className="shrink-0 rounded-full border border-outline-variant/60 bg-surface px-3.5 py-1.5 text-[13px] text-on-surface-variant transition-colors active:bg-surface-container"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <form
          className="flex items-center gap-2 px-4 pt-1 pb-3"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedGroup
                ? `Ask about plans for ${selectedGroup.name}…`
                : "Ask about places, plans…"
            }
            className="min-w-0 flex-1 rounded-full border border-outline-variant/50 bg-surface-container px-4 py-3 text-[14px] text-on-surface placeholder:text-on-surface-variant/50 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || thinking}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm transition disabled:opacity-40 active:scale-95"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const cleaned = content
    .split("\n")
    .filter((line) => !line.trim().startsWith("|") && !/^[-|:\s]+$/.test(line.trim()))
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return (
    <div className="space-y-1">
      {cleaned.split("\n").map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
      style={{ animationDelay: delay }}
    />
  );
}
