"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import {
  ArrowLeftIcon,
  PencilIcon,
  GlobeIcon,
  LockIcon,
  PlusIcon,
  XIcon,
} from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import { useSession, useProfile } from "@/lib/supabase/use-session";
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";

const GRADIENTS: [string, string][] = [
  ["#7c3aed", "#4f46e5"],
  ["#059669", "#0891b2"],
  ["#f59e0b", "#ef4444"],
  ["#0284c7", "#7c3aed"],
  ["#db2777", "#9333ea"],
  ["#16a34a", "#0d9488"],
];
function gradientFor(id: string): [string, string] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

type WAPoll = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  created_at: string;
  wa_message_id: string | null;
};

type EventRow = {
  id: string;
  title: string;
  place_name: string | null;
  event_date: string | null;
  event_time: string | null;
  sent_at: string | null;
};

function LinearProgress({ value }: { value: number }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-primary/15">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function QuickPollSheet({
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

  async function submit() {
    const clean = options.filter((o) => o.trim());
    if (!question.trim() || clean.length < 2 || !profile) return;
    setSending(true);
    try {
      let messageId: string | null = null;
      if (waJid) {
        const res = await fetch("/api/whatsapp/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId, waJid, groupId,
            question: question.trim(),
            options: clean.map((o) => o.trim()),
          }),
        });
        const result = await res.json();
        messageId = result.messageId ?? null;
      }
      const { data } = await supabase
        .from("whatsapp_polls")
        .insert({
          group_id: groupId,
          wa_jid: waJid ?? null,
          wa_message_id: messageId,
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
          <p className="mb-3 mt-5 text-[12px] font-medium uppercase tracking-[0.1em] text-on-surface-variant">Options</p>
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
                  <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button onClick={() => setOptions([...options, ""])}
              className="mt-4 flex items-center gap-1 rounded-full px-3 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8">
              <PlusIcon className="h-4 w-4" /> Add option
            </button>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose}
              className="rounded-full px-6 py-2.5 text-[14px] font-medium text-primary hover:bg-primary/8">
              Cancel
            </button>
            <button onClick={submit}
              disabled={sending || !question.trim() || options.filter(o => o.trim()).length < 2}
              className="rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-on-primary shadow-sm disabled:opacity-40">
              {sending ? "Sending…" : "Send poll"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function GroupHubPage() {
  const params = useParams<{ id: string }>();
  const { groups, loading } = useGroups();
  const session = useSession();
  const { profile } = useProfile();
  const group = groups.find((g) => g.id === params.id);
  const userId = session?.user?.id ?? "";

  const [polls, setPolls] = useState<WAPoll[]>([]);
  const [waJid, setWaJid] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    if (!userId || !params.id) return;
    async function load() {
      const [{ data: link }, statusRes, { data: pollData }, { data: eventData }] = await Promise.all([
        supabase.from("whatsapp_group_links").select("wa_jid")
          .eq("group_id", params.id).eq("user_id", userId).maybeSingle(),
        fetch(`/api/whatsapp/status?userId=${userId}`).then(r => r.json()).catch(() => ({})),
        supabase.from("whatsapp_polls").select("*")
          .eq("group_id", params.id).order("created_at", { ascending: false }).limit(3),
        supabase.from("events").select("id, title, place_name, event_date, event_time, sent_at")
          .eq("group_id", params.id).order("event_date", { ascending: true }).limit(5),
      ]);
      setWaJid(link?.wa_jid ?? null);
      setWaConnected(statusRes?.status === "connected");
      setPolls((pollData ?? []) as WAPoll[]);
      setEvents((eventData ?? []) as EventRow[]);
    }
    load();
  }, [userId, params.id]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-surface">
        {/* Skeleton header */}
        <div className="sticky top-0 z-20 grid grid-cols-[3rem_1fr_3rem] items-center bg-surface/95 px-1 py-1">
          <div className="h-12 w-12" />
          <div className="mx-auto h-4 w-32 animate-pulse rounded bg-on-surface/10" />
          <div className="h-12 w-12" />
        </div>
        {/* Skeleton hero */}
        <div className="h-44 animate-pulse bg-on-surface/10" />
        {/* Skeleton actions */}
        <div className="grid grid-cols-3 gap-3 px-4 pt-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-on-surface/8" />
          ))}
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-surface">
        <header className="sticky top-0 z-20 grid grid-cols-[3rem_1fr_3rem] items-center bg-surface/95 px-1 py-1 backdrop-blur-md">
          <Link href="/groups" className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
            <ArrowLeftIcon />
          </Link>
          <h1 className="truncate text-center text-[18px] font-medium text-on-surface">Group</h1>
          <div />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
          <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-surface-container text-4xl">
            🔍
          </div>
          <p className="text-[18px] font-medium text-on-surface">Group not found</p>
          <p className="mt-1.5 text-[14px] text-on-surface-variant">This group isn't available.</p>
          <Link href="/groups" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-on-primary">
            Back to groups
          </Link>
        </div>
      </div>
    );
  }

  const [from, to] = gradientFor(group.id);
  const canPoll = (waConnected && !!waJid) || !waJid;

  return (
    <div className="min-h-[100dvh] bg-surface pb-28">
      {/* Top App Bar */}
      <header className="sticky top-0 z-20 grid grid-cols-[3rem_1fr_3rem] items-center bg-surface/95 px-1 py-1 backdrop-blur-md">
        <Link href="/groups" className="grid h-12 w-12 place-items-center rounded-full text-on-surface hover:bg-on-surface/8">
          <ArrowLeftIcon />
        </Link>
        <h1 className="truncate text-center text-[18px] font-medium text-on-surface">{group.name}</h1>
        <Link href={`/groups/${group.id}/edit`} className="grid h-12 w-12 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
          <PencilIcon className="h-5 w-5" />
        </Link>
      </header>

      {/* Hero */}
      <div
        className="flex h-44 items-end px-6 pb-6"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <div className="text-7xl drop-shadow-lg">{group.emoji}</div>
        <div className="ml-4 pb-1">
          <h2 className="text-[28px] font-normal leading-tight text-white drop-shadow">
            {group.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-medium text-white backdrop-blur-sm">
              {group.isPublic ? <GlobeIcon className="h-3 w-3" /> : <LockIcon className="h-3 w-3" />}
              {group.isPublic ? "Public" : "Private"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-medium text-white backdrop-blur-sm">
              👥 {group.members.length} {group.members.length === 1 ? "member" : "members"}
            </span>
            {waJid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#25d366]/80 px-2.5 py-0.5 text-[12px] font-medium text-white backdrop-blur-sm">
                <WhatsAppIcon className="h-3 w-3" />
                WhatsApp
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 pt-5">

        {/* ── Quick Action Buttons ─────────────────────────────── */}
        <section>
          <div className="grid grid-cols-3 gap-3">
            {/* Polls */}
            <Link
              href={`/groups/${group.id}/plan`}
              className="flex flex-col items-center gap-2 rounded-2xl bg-primary/8 px-3 py-4 text-center transition active:scale-[0.97] active:bg-primary/14"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/12 text-2xl">
                📊
              </div>
              <span className="text-[13px] font-semibold text-primary">Polls</span>
            </Link>

            {/* Plan AI */}
            <Link
              href={`/groups/${group.id}/ai-plan`}
              className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-primary/10 to-primary/5 px-3 py-4 text-center transition active:scale-[0.97]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/12 text-2xl">
                ✨
              </div>
              <span className="text-[13px] font-semibold text-primary">Plan AI</span>
            </Link>

            {/* Create Event */}
            <Link
              href={`/groups/${group.id}/ai-plan`}
              className="flex flex-col items-center gap-2 rounded-2xl bg-surface-container px-3 py-4 text-center transition active:scale-[0.97] active:bg-surface-high"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-on-surface/8 text-2xl">
                🗓
              </div>
              <span className="text-[13px] font-semibold text-on-surface">Create Event</span>
            </Link>
          </div>
        </section>

        {/* ── Recent Polls ────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-medium text-on-surface">Polls</h2>
            <Link href={`/groups/${group.id}/plan`}
              className="rounded-full px-3 py-1 text-[13px] font-medium text-primary hover:bg-primary/8">
              See all
            </Link>
          </div>

          {canPoll ? (
            <button
              onClick={() => setShowPollSheet(true)}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/6 px-4 py-4 text-left transition active:bg-primary/10"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                <PlusIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-primary">Create a poll</p>
                <p className="text-[12px] text-on-surface-variant">
                  {waJid ? "Sends to WhatsApp instantly" : "Members vote in the app"}
                </p>
              </div>
            </button>
          ) : (
            <div className="mb-3 rounded-2xl border border-outline-variant bg-surface-container px-4 py-4">
              <p className="text-[14px] font-medium text-on-surface">
                {!waConnected ? "Connect WhatsApp to create polls" : "Link this group to create polls"}
              </p>
              <p className="mt-0.5 text-[12px] text-on-surface-variant">
                Polls are sent directly to the WhatsApp group.
              </p>
              {!waConnected && (
                <Link href="/groups/connect"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-4 py-2 text-[13px] font-medium text-white">
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  Connect WhatsApp
                </Link>
              )}
            </div>
          )}

          {polls.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/50 py-8 text-center">
              <p className="text-[32px]">📊</p>
              <p className="mt-2 text-[14px] font-medium text-on-surface">No polls yet</p>
              <p className="mt-0.5 text-[12px] text-on-surface-variant">
                {canPoll ? "Create your first poll above." : "Connect WhatsApp to start polling."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {polls.map((poll) => {
                const total = Object.values(poll.vote_counts ?? {}).reduce((a, b) => a + b, 0);
                return (
                  <div key={poll.id} className="rounded-2xl bg-surface-container px-4 py-4">
                    <p className="text-[15px] font-medium text-on-surface">{poll.question}</p>
                    <p className="mt-0.5 text-[12px] text-on-surface-variant">
                      {new Date(poll.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                      {total > 0 && ` · ${total} vote${total !== 1 ? "s" : ""}`}
                    </p>
                    <div className="mt-3 space-y-2.5">
                      {poll.options.slice(0, 3).map((opt, i) => {
                        const count = poll.vote_counts?.[String(i)] ?? 0;
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={i}>
                            <div className="mb-1 flex justify-between">
                              <span className="text-[13px] text-on-surface">{opt}</span>
                              <span className="text-[12px] font-medium text-primary">{pct}%</span>
                            </div>
                            <LinearProgress value={pct} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <Link href={`/groups/${group.id}/plan`}
                className="block rounded-xl py-2 text-center text-[13px] font-medium text-primary hover:bg-primary/8">
                View all polls →
              </Link>
            </div>
          )}
        </section>

        {/* ── WhatsApp section ─────────────────────────── */}
        {waJid && (
          <section>
            <h2 className="mb-3 text-[16px] font-medium text-on-surface">WhatsApp</h2>
            <Link
              href={`/groups/${group.id}/whatsapp`}
              className="flex items-center gap-4 rounded-2xl bg-[#25d366]/8 px-4 py-4 transition active:bg-[#25d366]/14"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#25d366]/15">
                <WhatsAppIcon className="h-6 w-6 text-[#25d366]" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-medium text-on-surface">WhatsApp Group</p>
                <p className="text-[12px] text-[#128c7e]">Live chat · Poll results</p>
              </div>
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current text-on-surface-variant/40">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </Link>
          </section>
        )}

        {/* ── Events section ────────────────────────────── */}
        {events.length > 0 && (
          <section>
            <h2 className="mb-3 text-[16px] font-medium text-on-surface">Upcoming Events</h2>
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="rounded-2xl bg-surface-container px-4 py-4">
                  <p className="text-[15px] font-medium text-on-surface">{e.title}</p>
                  {e.place_name && <p className="mt-0.5 text-[12px] text-on-surface-variant">📍 {e.place_name}</p>}
                  {(e.event_date || e.event_time) && (
                    <p className="mt-0.5 text-[12px] text-on-surface-variant">
                      🗓️ {[e.event_date, e.event_time].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {e.sent_at && <p className="mt-1 text-[11px] font-medium text-[#128c7e]">✓ Sent to WhatsApp</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Chat section ─────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-[16px] font-medium text-on-surface">Chat</h2>
          <Link
            href={`/groups/${group.id}/chat`}
            className="flex items-center gap-4 rounded-2xl bg-surface-container px-4 py-4 transition active:bg-surface-high"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-2xl">
              💬
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-medium text-on-surface">Group Chat</p>
              <p className="text-[12px] text-on-surface-variant">
                {waJid && waConnected ? "Bridged to WhatsApp" : "Chat with your group"}
              </p>
            </div>
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current text-on-surface-variant/40">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </Link>
        </section>

        {/* ── Members section ───────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-medium text-on-surface">
              Members <span className="font-normal text-on-surface-variant">· {group.members.length}</span>
            </h2>
            <Link href={`/groups/${group.id}/edit`}
              className="rounded-full px-3 py-1 text-[13px] font-medium text-primary hover:bg-primary/8">
              Manage
            </Link>
          </div>

          {group.members.length === 0 ? (
            <div className="rounded-2xl bg-surface-container py-8 text-center">
              <p className="text-[32px]">👥</p>
              <p className="mt-2 text-[14px] text-on-surface-variant">No members yet.</p>
              <Link href={`/groups/${group.id}/edit`}
                className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-[13px] font-medium text-on-primary">
                <PlusIcon className="h-3.5 w-3.5" />
                Add members
              </Link>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {group.members.map((m) => {
                const { gradient, initials } = avatarFor(m);
                return (
                  <div key={m.id} className="flex shrink-0 flex-col items-center gap-1.5">
                    <div className="relative">
                      <Avatar initials={initials} gradient={gradient} size="md" />
                      {m.id === group.ownerId && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-on-primary shadow-sm">
                          ★
                        </span>
                      )}
                    </div>
                    <span className="max-w-[56px] truncate text-center text-[11px] text-on-surface-variant">
                      {m.name?.split(" ")[0] || m.username || "User"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {showPollSheet && (
        <QuickPollSheet
          groupId={group.id}
          userId={userId}
          waJid={waJid}
          onCreated={(p) => setPolls((prev) => [p, ...prev.slice(0, 2)])}
          onClose={() => setShowPollSheet(false)}
        />
      )}
    </div>
  );
}
