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
      replyText = `Sorry, I couldn't respond right now. Please try again in a moment. (${err instanceof Error ? err.message : String(err)})`;
    }

    // If a group was picked via chip and AI just created an event, send to WA
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
        `Suggest a place for ${selectedGroup.name}`,
        "Somewhere outdoors",
        "A budget-friendly spot",
      ]
    : ["Plan something for tonight", "Find a quiet café", "Outdoor spot this weekend"];

  const lastMsg = messages[messages.length - 1];
  const showGroupPicker =
    !thinking &&
    lastMsg?.role === "assistant" &&
    isAskingForGroup(lastMsg.content) &&
    groups.length > 0;

  const waSentGroup = groups.find((g) => g.id === waSentGroupId);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-outline-variant/40 bg-surface/80 px-5 py-3.5 backdrop-blur-md">
        <span className="fab h-10 w-10">
          <AiIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">AI Assistant</h1>
          <p className="truncate text-[12px] text-on-surface-variant">
            {selectedGroup
              ? `Planning for ${selectedGroup.name}`
              : "Plan an outing or ask anything"}
          </p>
        </div>
        {/* WA sent toast */}
        {waSentGroup && (
          <span className="ml-auto shrink-0 rounded-full bg-green-100 px-3 py-1 text-[11px] font-semibold text-green-700">
            ✓ Sent to {waSentGroup.name}
          </span>
        )}
      </header>

      {/* Group selector */}
      <div className="border-b border-outline-variant/40 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Planning for
        </p>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setGroupId(null)}
            className={`chip ${groupId === null ? "chip-active" : ""}`}
          >
            Just me
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setGroupId(g.id)}
              className={`chip ${groupId === g.id ? "chip-active" : ""}`}
            >
              <span aria-hidden>{g.emoji}</span>
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) =>
          m.role === "assistant" ? (
            <div key={m.id} className="flex items-end gap-2">
              <span className="fab h-7 w-7 shrink-0">
                <AiIcon className="h-4 w-4" />
              </span>
              <div className="max-w-[80%] rounded-lg rounded-bl-sm bg-card px-3.5 py-2.5 text-sm shadow-soft">
                <AssistantMessage content={m.content} />
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-on-primary">
                {m.content}
              </div>
            </div>
          ),
        )}

        {thinking && (
          <div className="flex items-end gap-2">
            <span className="fab h-7 w-7 shrink-0">
              <AiIcon className="h-4 w-4" />
            </span>
            <div className="flex gap-1 rounded-lg rounded-bl-sm bg-card px-4 py-3 shadow-soft">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Group picker — appears when AI asks which group */}
      {showGroupPicker && (
        <div className="border-t border-outline-variant/40 px-4 py-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Select a group
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {groups.map((g) => (
              <button
                key={g.id}
                className="chip"
                onClick={() => {
                  pendingGroupIdRef.current = g.id;
                  send(`${g.emoji} ${g.name}`);
                }}
              >
                <span aria-hidden>{g.emoji}</span>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick suggestions */}
      {!showGroupPicker && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        className="flex items-center gap-2 border-t border-outline-variant/40 bg-card px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input"
          placeholder={
            selectedGroup
              ? `Ask about plans for ${selectedGroup.name}…`
              : "Ask about places, plans, or budgets…"
          }
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!input.trim() || thinking}
          className="fab h-12 w-12 shrink-0 disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
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
    <div className="space-y-1.5">
      {cleaned.split("\n").map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1" />;
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
      className="h-2 w-2 animate-bounce rounded-full bg-outline"
      style={{ animationDelay: delay }}
    />
  );
}
