"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession, useProfile } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { ArrowLeftIcon, PlusIcon, XIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

type WAPoll = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  created_at: string;
  wa_jid: string | null;
  wa_message_id: string | null;
};

// ── M3 Linear Progress ────────────────────────────────────────────────────────
function LinearProgress({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-primary/15">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// ── M3 Outlined Text Field ────────────────────────────────────────────────────
function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative w-full">
      {label && (
        <label className="mb-1.5 block text-[12px] font-medium text-on-surface-variant">
          {label}
        </label>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-[4px] border border-outline bg-transparent px-4 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/50 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

// ── Create Poll Sheet (M3 Modal Bottom Sheet) ─────────────────────────────────
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
          body: JSON.stringify({ userId, waJid, groupId, question: question.trim(), options: cleanOpts }),
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
      {/* M3 Modal Bottom Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[28px] bg-surface-container pb-safe">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-5">
          <div className="h-1 w-8 rounded-full bg-on-surface-variant/30" />
        </div>

        <div className="overflow-y-auto px-6 pb-8">
          {/* M3 Headline Small */}
          <h2 className="mb-6 text-[24px] font-normal leading-tight text-on-surface">
            Create poll
          </h2>

          <TextField
            label="Question"
            value={question}
            onChange={setQuestion}
            placeholder="Ask the group something…"
            autoFocus
          />

          <p className="mb-3 mt-5 text-[12px] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
            Options
          </p>
          <div className="space-y-3">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <TextField
                    value={opt}
                    onChange={(v) => {
                      const next = [...options];
                      next[i] = v;
                      setOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                </div>
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
            // M3 Text Button
            <button
              onClick={() => setOptions([...options, ""])}
              className="mt-4 flex items-center gap-1 rounded-full px-3 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8"
            >
              <PlusIcon className="h-4 w-4" />
              Add option
            </button>
          )}

          {waJid && (
            <div className="mt-4 flex items-center gap-2 rounded-full border border-[#25d366]/40 bg-[#25d366]/8 px-4 py-2">
              <span className="text-[11px] font-medium text-[#128c7e]">
                Will be sent to WhatsApp group
              </span>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            {/* M3 Text Button */}
            <button
              onClick={onClose}
              className="rounded-full px-6 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8"
            >
              Cancel
            </button>
            {/* M3 Filled Button */}
            <button
              onClick={submit}
              disabled={sending || !question.trim() || validOptions.length < 2}
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

// ── Poll Card (M3 Filled Card) ─────────────────────────────────────────────────
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

  return (
    <div className="rounded-3xl bg-surface-container px-5 py-4">
      {/* M3 Title Medium */}
      <p className="text-[16px] font-medium leading-snug text-on-surface">
        {poll.question}
      </p>
      {/* M3 Body Small */}
      <p className="mt-1 text-[12px] text-on-surface-variant">
        {new Date(poll.created_at).toLocaleDateString("en", {
          month: "short",
          day: "numeric",
        })}
        {total > 0 && ` · ${total} vote${total !== 1 ? "s" : ""}`}
      </p>

      <div className="mt-4 space-y-3">
        {poll.options.map((opt, i) => {
          const count = counts[String(i)] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[14px] text-on-surface">{opt}</span>
                <span className="text-[12px] font-medium text-primary">{pct}%</span>
              </div>
              <LinearProgress value={pct} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GroupPollsPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const session = useSession();
  const { profile } = useProfile();
  const { groups } = useGroups();
  const group = groups.find((g) => g.id === groupId);
  const userId = session?.user?.id ?? "";

  const [polls, setPolls] = useState<WAPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [waJid, setWaJid] = useState<string | null>(null);
  const [liveVotes, setLiveVotes] = useState<Record<string, Record<string, number>>>({});
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!userId || !groupId) return;
    async function load() {
      const [{ data: link }, { data: pollData }] = await Promise.all([
        supabase
          .from("whatsapp_group_links")
          .select("wa_jid")
          .eq("group_id", groupId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("whatsapp_polls")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false }),
      ]);
      setWaJid(link?.wa_jid ?? null);
      setPolls((pollData ?? []) as WAPoll[]);
      setLoading(false);
    }
    load();
  }, [userId, groupId]);

  // Live vote polling every 3 s
  useEffect(() => {
    if (!groupId) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/whatsapp/poll-results?groupId=${groupId}`);
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      {/* M3 Top App Bar — Small */}
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-surface/95 px-2 py-3 backdrop-blur-md">
        <Link
          href={`/groups/${groupId}`}
          className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8"
        >
          <ArrowLeftIcon />
        </Link>
        <div className="flex-1 px-2">
          {/* M3 Title Large */}
          <h1 className="text-[22px] font-normal text-on-surface">Polls</h1>
          {group && (
            <p className="text-[12px] text-on-surface-variant">{group.name}</p>
          )}
        </div>
        {/* Trailing icon button */}
        {userId && (
          <button
            onClick={() => setShowCreate(true)}
            className="grid h-12 w-12 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8"
            aria-label="Create poll"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-2">
        {/* WA not linked notice — M3 Assist Chip style */}
        {!loading && !waJid && (
          <Link
            href="/groups/connect"
            className="mb-5 flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container px-4 py-3"
          >
            <span className="text-xl">💬</span>
            <div>
              <p className="text-[13px] font-medium text-on-surface">
                Connect WhatsApp to send polls
              </p>
              <p className="text-[12px] text-on-surface-variant">
                Polls are sent directly to the WA group
              </p>
            </div>
          </Link>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-3xl bg-surface-container" />
            ))}
          </div>
        ) : polls.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-surface-container text-5xl">
              📊
            </div>
            {/* M3 Title Medium */}
            <p className="mt-2 text-[22px] font-normal text-on-surface">No polls yet</p>
            {/* M3 Body Medium */}
            <p className="max-w-[240px] text-[14px] text-on-surface-variant">
              {waJid
                ? "Create a poll and your group can vote directly in WhatsApp."
                : "Link WhatsApp to start sending polls to your group."}
            </p>
            {waJid && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-on-primary shadow-sm"
              >
                Create first poll
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {polls.map((poll) => (
              <PollCard key={poll.id} poll={poll} liveVotes={liveVotes} />
            ))}
          </div>
        )}
      </div>

      {/* M3 FAB — bottom right */}
      {userId && polls.length > 0 && (
        <div className="fixed bottom-24 right-4 z-30">
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition active:scale-95"
            aria-label="Create poll"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Create Poll Sheet */}
      {showCreate && (
        <CreatePollSheet
          groupId={groupId}
          userId={userId}
          waJid={waJid}
          onCreated={(p) => setPolls((prev) => [p, ...prev])}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
