"use client";

import { useEffect, useRef, useState } from "react";
import { AiIcon, SendIcon } from "@/components/icons";
import { initialChat, assistantReply, friends } from "@/lib/mock-data";
import { useGroups } from "@/lib/groups-store";
import { useProfile } from "@/lib/supabase/use-session";
import { supabase } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types";

const friendById = Object.fromEntries(friends.map((f) => [f.id, f]));

export default function AiPage() {
  const { groups } = useGroups();
  const { profile } = useProfile();
  const interests = profile?.interests ?? [];

  const [messages, setMessages] = useState<ChatMessage[]>(initialChat);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const groupContext = selectedGroup
    ? {
        name: selectedGroup.name,
        members: selectedGroup.memberIds
          .map((id) => friendById[id])
          .filter(Boolean)
          .map((f) => ({ name: f.name, tagline: f.tagline })),
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
      // Real AI via the Supabase `ai-chat` edge function (OpenRouter key stays server-side).
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { messages: history, group: groupContext, interests },
      });
      if (error || !data?.reply) throw error ?? new Error("no reply");
      replyText = data.reply as string;
    } catch {
      // Fallback: signed-out users, or the OpenRouter key isn't set yet.
      replyText = assistantReply({ prompt: content, group: groupContext, interests });
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
                {m.content}
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

      {/* Quick suggestions — adapt to the selected group */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

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

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-outline"
      style={{ animationDelay: delay }}
    />
  );
}
