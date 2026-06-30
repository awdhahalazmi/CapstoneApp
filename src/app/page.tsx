"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import AiFab from "@/components/AiFab";
import { BellIcon, StarIcon, PinIcon, PlusIcon } from "@/components/icons";
import { useProfile } from "@/lib/supabase/use-session";
import { useFriends } from "@/lib/friends-store";
import { useGroups } from "@/lib/groups-store";
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";

function priceLabel(level: number) {
  return "$".repeat(level);
}

type DbPlace = {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  rating: number | null;
  price_level: number | null;
  tags: string[];
  image_gradient: string | null;
  ai_reason: string | null;
};

type PlannedOuting = {
  id: string;
  place_name: string;
  planned_at: string;
  notes: string | null;
  group_id: string | null;
};

type FeedItem = {
  id: string;
  user_id: string;
  place_name: string;
  note: string | null;
  type: string;
  is_private: boolean;
  rating: number | null;
  image_url: string | null;
  created_at: string;
  profiles: { name: string | null; username: string | null } | null;
};

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Preview"
        className="max-h-[90dvh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white backdrop-blur"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Check-in / Review modal ───────────────────────────────────────────────────
async function notifyFriends(userId: string, message: string) {
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from("friendships").select("friend_id").eq("user_id", userId).eq("status", "accepted"),
    supabase.from("friendships").select("user_id").eq("friend_id", userId).eq("status", "accepted"),
  ]);
  const ids = [...new Set([
    ...(a ?? []).map((r: { friend_id: string }) => r.friend_id),
    ...(b ?? []).map((r: { user_id: string }) => r.user_id),
  ])];
  if (ids.length === 0) return;
  await supabase.from("notifications").insert(
    ids.map((fid) => ({ user_id: fid, message, kind: "ping", read: false }))
  );
}

function CheckInModal({ onClose, userId, senderName, initialTab = "checkin", editItem }: { onClose: () => void; userId: string; senderName: string; initialTab?: "checkin" | "review"; editItem?: FeedItem | null }) {
  const isEditing = !!editItem;
  const [tab, setTab] = useState<"checkin" | "review">(editItem ? (editItem.type as "checkin" | "review") : initialTab);

  // Check-in state
  const [placeName, setPlaceName] = useState(editItem?.type === "checkin" ? editItem.place_name : "");
  const [checkInNote, setCheckInNote] = useState(editItem?.type === "checkin" ? (editItem.note ?? "") : "");

  // Review state
  const [reviewPlace, setReviewPlace] = useState(editItem?.type === "review" ? editItem.place_name : "");
  const [reviewText, setReviewText] = useState(editItem?.type === "review" ? (editItem.note ?? "") : "");
  const [reviewRating, setReviewRating] = useState(editItem?.type === "review" ? (editItem.rating ?? 0) : 0);
  const [reviewPrivate, setReviewPrivate] = useState(editItem?.type === "review" ? editItem.is_private : false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(editItem?.image_url ?? null);

  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submitCheckIn() {
    if (!placeName.trim()) return;
    setSaving(true);
    if (isEditing && editItem) {
      await supabase.from("check_ins").update({ place_name: placeName.trim(), note: checkInNote.trim() || null }).eq("id", editItem.id);
    } else {
      await supabase.from("check_ins").insert({ user_id: userId, place_name: placeName.trim(), note: checkInNote.trim() || null, type: "checkin", is_private: false });
      await notifyFriends(userId, `📍 ${senderName} checked in at ${placeName.trim()}`);
    }
    setSaving(false);
    onClose();
  }

  async function submitReview() {
    if (!reviewPlace.trim() || !reviewText.trim()) return;
    setSaving(true);

    let image_url: string | null = photoFile ? null : (photoPreview ?? null);
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { data: uploadData } = await supabase.storage.from("checkin-images").upload(path, photoFile, { upsert: true });
      if (uploadData) {
        const { data: urlData } = supabase.storage.from("checkin-images").getPublicUrl(uploadData.path);
        image_url = urlData.publicUrl;
      }
    }

    if (isEditing && editItem) {
      await supabase.from("check_ins").update({ place_name: reviewPlace.trim(), note: reviewText.trim(), rating: reviewRating > 0 ? reviewRating : null, is_private: reviewPrivate, image_url }).eq("id", editItem.id);
    } else {
      await supabase.from("check_ins").insert({ user_id: userId, place_name: reviewPlace.trim(), note: reviewText.trim(), rating: reviewRating > 0 ? reviewRating : null, type: "review", is_private: reviewPrivate, image_url });
      if (!reviewPrivate) {
        const stars = reviewRating > 0 ? " " + "⭐".repeat(reviewRating) : "";
        await notifyFriends(userId, `✍️ ${senderName} reviewed ${reviewPlace.trim()}${stars}`);
      }
    }
    setSaving(false);
    onClose();
  }

  return (
    <>
    {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="no-scrollbar w-full max-w-[440px] overflow-y-auto rounded-t-3xl bg-surface px-5 pb-10 pt-4 shadow-float" style={{ maxHeight: "90dvh" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-outline-variant" />

        {isEditing ? (
          <p className="mb-4 text-sm font-bold">{tab === "checkin" ? "✏️ Edit check-in" : "✏️ Edit review"}</p>
        ) : (
          <div className="mb-5 flex rounded-xl bg-surface-low p-1">
            <button onClick={() => setTab("checkin")} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === "checkin" ? "bg-card text-primary shadow-soft" : "text-on-surface-variant"}`}>
              📍 Check in
            </button>
            <button onClick={() => setTab("review")} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === "review" ? "bg-card text-primary shadow-soft" : "text-on-surface-variant"}`}>
              ✍️ Review
            </button>
          </div>
        )}

        {tab === "checkin" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-on-surface-variant">Let your friends know where you are right now.</p>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-on-surface-variant">Where are you at?</label>
              <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} className="input w-full" placeholder="e.g. Avenues Mall, Crust Salmiya…" autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-on-surface-variant">What&apos;s up? (optional)</label>
              <input value={checkInNote} onChange={(e) => setCheckInNote(e.target.value)} className="input w-full" placeholder="e.g. grabbing coffee, anyone around?" />
            </div>
            <button onClick={submitCheckIn} disabled={!placeName.trim() || saving} className="btn-primary mt-1 h-12 w-full disabled:opacity-40">
              {saving ? "Saving…" : isEditing ? "✏️ Save changes" : "📍 Check in"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-on-surface-variant">Share your thoughts on a place you&apos;ve visited.</p>

            {/* Place name */}
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-on-surface-variant">Place name</label>
              <input value={reviewPlace} onChange={(e) => setReviewPlace(e.target.value)} className="input w-full" placeholder="e.g. Mais Alghanim, The Avenues…" autoFocus />
            </div>

            {/* Star rating */}
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-on-surface-variant">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReviewRating(s === reviewRating ? 0 : s)}
                    className="text-3xl transition-transform active:scale-90"
                    aria-label={`${s} stars`}
                  >
                    {s <= reviewRating ? "⭐" : "☆"}
                  </button>
                ))}
              </div>
            </div>

            {/* Review text */}
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-on-surface-variant">Your review</label>
              <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} className="input w-full resize-none" rows={3} placeholder="How was the vibe, food, service? Any tips?" />
            </div>

            {/* Photo upload */}
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-on-surface-variant">Photo (optional)</label>
              {photoPreview ? (
                <div className="relative overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="h-48 w-full cursor-zoom-in object-cover"
                    onClick={() => setLightbox(photoPreview)}
                  />
                  <button
                    type="button"
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white text-xs"
                  >
                    ✕
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                    tap to preview
                  </span>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-low px-4 py-3 text-sm text-on-surface-variant transition hover:bg-card">
                  <span className="text-xl">📷</span>
                  <span>Take or choose a photo</span>
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhoto} />
                </label>
              )}
            </div>

            {/* Privacy toggle */}
            <button
              type="button"
              onClick={() => setReviewPrivate((v) => !v)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${reviewPrivate ? "border-outline-variant bg-surface-low text-on-surface-variant" : "border-primary/30 bg-primary/5 text-primary"}`}
            >
              <span className="text-base">{reviewPrivate ? "🔒" : "🌍"}</span>
              <span className="font-semibold">{reviewPrivate ? "Only me" : "Share with friends"}</span>
              <span className="ml-auto text-[12px] opacity-60">tap to switch</span>
            </button>

            <button onClick={submitReview} disabled={!reviewPlace.trim() || !reviewText.trim() || saving} className="btn-primary mt-1 h-12 w-full disabled:opacity-40">
              {saving ? "Saving…" : isEditing ? "✏️ Save changes" : reviewPrivate ? "Save privately" : "Share review"}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

type WaGroup = {
  id: string;
  wa_name: string;
  group_id: string;
  wa_participant_count: number;
};

function greeting(name: string) {
  const h = new Date().getHours();
  if (h < 12) return { line: `Good morning, ${name} ☀️`, sub: "Here's what's going on today." };
  if (h < 17) return { line: `Good afternoon, ${name} 🌤️`, sub: "Here's what's going on today." };
  return { line: `Good evening, ${name} 🌙`, sub: "Here's what's been happening." };
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { profile } = useProfile();
  const { friends } = useFriends();
  const { groups } = useGroups();
  const firstName = (profile?.name ?? "").split(" ")[0] || "there";
  const av = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });
  const { line: greetLine, sub: greetSub } = greeting(firstName);

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<"checkin" | "review">("checkin");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [places, setPlaces] = useState<DbPlace[]>([]);
  const [upcomingOutings, setUpcomingOutings] = useState<PlannedOuting[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [waGroups, setWaGroups] = useState<WaGroup[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [myStatus, setMyStatus] = useState<"available" | "not_in_the_mood">("available");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<FeedItem | null>(null);

  function openModal(tab: "checkin" | "review" = "checkin") {
    setModalTab(tab);
    setShowModal(true);
  }

  function openEdit(item: FeedItem) {
    setEditItem(item);
    setModalTab(item.type as "checkin" | "review");
    setShowModal(true);
    setActionMenuId(null);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditItem(null);
  }

  async function deleteCheckIn(id: string) {
    await supabase.from("check_ins").delete().eq("id", id);
    setFeedItems((items) => items.filter((i) => i.id !== id));
    setActionMenuId(null);
    setDeleteConfirmId(null);
  }

  // Load places from DB
  useEffect(() => {
    supabase
      .from("places")
      .select("id, name, category, area, rating, price_level, tags, image_gradient, ai_reason")
      .order("rating", { ascending: false })
      .limit(10)
      .then(({ data }) => setPlaces((data ?? []) as DbPlace[]));
  }, []);

  // Load upcoming planned outings
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("planned_outings")
      .select("id, place_name, planned_at, notes, group_id")
      .eq("created_by", profile.id)
      .gte("planned_at", new Date().toISOString())
      .order("planned_at", { ascending: true })
      .limit(3)
      .then(({ data }) => setUpcomingOutings((data ?? []) as PlannedOuting[]));
  }, [profile?.id, showModal]);

  // Load own status
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("profiles")
      .select("availability_status")
      .eq("id", profile.id)
      .single()
      .then(({ data }) => {
        if (data?.availability_status) {
          setMyStatus(data.availability_status as "available" | "not_in_the_mood");
        }
      });
  }, [profile?.id]);

  async function updateStatusTo(next: "available" | "not_in_the_mood") {
    setMyStatus(next);
    setShowStatusPicker(false);
    if (!profile?.id) return;
    await supabase.from("profiles").update({ availability_status: next }).eq("id", profile.id);
  }

  // Load connected WhatsApp groups
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("whatsapp_group_links")
      .select("id, wa_name, group_id, wa_participant_count")
      .eq("user_id", profile.id)
      .limit(5)
      .then(({ data }) => setWaGroups((data ?? []) as WaGroup[]));
  }, [profile?.id]);

  // Track presence — who has the app open right now
  useEffect(() => {
    if (!profile?.id) return;
    // Random suffix avoids topic collision on React StrictMode double-mount
    const name = `presence-${profile.id}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase.channel(name);
    channel.on("presence", { event: "sync" }, () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())));
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ user_id: profile.id });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Load feed: my check-ins/reviews + friends' public ones (RLS enforces access)
  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    supabase
      .from("check_ins")
      .select("id, user_id, place_name, note, type, is_private, rating, image_url, created_at, profiles(name, username)")
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (active) {
          setFeedItems((data ?? []) as FeedItem[]);
          setFeedLoaded(true);
        }
      });
    return () => { active = false; };
  }, [profile?.id, showModal]);

  function formatOutingDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isToday = d.toDateString() === today.toDateString();
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${dayLabel} · ${time}`;
  }

  const [featured] = places;

  return (
    <div className="pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-surface/80 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold leading-tight">{greetLine}</h1>
            <p className="text-[13px] text-on-surface-variant">{greetSub}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => openModal("checkin")}
              aria-label="Check in or review"
              className="grid h-9 w-9 place-items-center rounded-full bg-primary text-on-primary shadow-float active:scale-95"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <Link href="/notifications" aria-label="Notifications" className="relative text-on-surface">
              <BellIcon />
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker((v) => !v)}
                aria-label="Set your status"
                className="relative active:scale-95 transition"
              >
                <Avatar initials={av.initials} gradient={av.gradient} size="sm" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${myStatus === "available" ? "bg-green-400" : "bg-orange-400"}`} />
              </button>

              {showStatusPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusPicker(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-40 overflow-hidden rounded-xl bg-card shadow-float">
                    <button
                      onClick={() => updateStatusTo("available")}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition active:bg-surface-low ${myStatus === "available" ? "bg-green-50" : ""}`}
                    >
                      <span className="text-sm">🟢</span>
                      <p className="flex-1 text-[12px] font-semibold">Available</p>
                      {myStatus === "available" && <span className="text-green-600 text-[10px] font-bold">✓</span>}
                    </button>
                    <div className="mx-3 h-px bg-on-surface/8" />
                    <button
                      onClick={() => updateStatusTo("not_in_the_mood")}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition active:bg-surface-low ${myStatus === "not_in_the_mood" ? "bg-orange-50" : ""}`}
                    >
                      <span className="text-sm">💤</span>
                      <p className="flex-1 text-[12px] font-semibold">Not in the mood</p>
                      {myStatus === "not_in_the_mood" && <span className="text-orange-600 text-[10px] font-bold">✓</span>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* WhatsApp groups */}
      {waGroups.length > 0 && (
        <section className="px-5 pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-bold">💬 WhatsApp groups</p>
            <Link href="/groups" className="text-[13px] font-semibold text-primary">See all</Link>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {waGroups.map((wg) => (
              <Link
                key={wg.id}
                href={`/groups/${wg.group_id}`}
                className="flex shrink-0 items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft transition active:scale-[0.98]"
                style={{ minWidth: 200 }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-xl">
                  💬
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">{wg.wa_name}</p>
                  <p className="text-[11px] text-on-surface-variant">{wg.wa_participant_count} members</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming events */}
      {upcomingOutings.length > 0 && (
        <section className="px-5 pt-4">
          <p className="mb-2.5 text-sm font-bold">📅 Upcoming</p>
          <div className="space-y-2">
            {upcomingOutings.map((o) => (
              <Link
                key={o.id}
                href={o.group_id ? `/groups/${o.group_id}` : "#"}
                className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3.5 transition active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
                  🗓
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm text-on-surface">{o.place_name}</p>
                  <p className="text-[12px] text-primary font-medium mt-0.5">{formatOutingDate(o.planned_at)}</p>
                </div>
                <span className="text-on-surface-variant/40 text-lg">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Friends mini-row */}
      {friends.length > 0 && (
        <section className="px-5 pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-bold">Your squad</p>
            <Link href="/community" className="text-[13px] font-semibold text-primary">See all</Link>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {friends.slice(0, 8).map((f) => {
              const fav = avatarFor(f);
              const isOnline = onlineIds.has(f.id);
              const notInMood = f.availability_status === "not_in_the_mood";
              return (
                <div key={f.id} className="flex shrink-0 flex-col items-center gap-1.5">
                  <div className="relative">
                    <div className={`h-12 w-12 rounded-full bg-gradient-to-br ${fav.gradient} grid place-items-center text-[13px] font-bold text-white shadow-soft transition ${notInMood ? "opacity-50 grayscale" : ""}`}>
                      {fav.initials}
                    </div>
                    {notInMood ? (
                      <span className="absolute -bottom-0.5 -right-0.5 text-[13px] leading-none">💤</span>
                    ) : (
                      <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface ${isOnline ? "bg-green-400" : "bg-gray-300"}`} />
                    )}
                  </div>
                  <span className="max-w-[48px] truncate text-[10px] font-medium text-on-surface-variant">
                    {f.username ?? (f.name ?? "").split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Activity feed */}
      {feedItems.length > 0 && (
        <section className="px-5 pt-5 pb-2">
          <p className="mb-3 text-sm font-bold">What&apos;s happening</p>
          <div className="space-y-3">
            {feedItems.map((item) => {
              const senderName = item.profiles?.name ?? item.profiles?.username ?? "Someone";
              const isOwn = item.user_id === profile?.id;
              const displayName = isOwn ? "You" : senderName.split(" ")[0];
              const fav = avatarFor({
                id: item.user_id,
                name: item.profiles?.name ?? undefined,
                username: item.profiles?.username ?? undefined,
              });
              return (
                <div key={item.id} className="rounded-2xl bg-card shadow-soft">
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.place_name}
                      className="h-44 w-full cursor-zoom-in object-cover rounded-t-2xl"
                      onClick={() => setLightboxUrl(item.image_url!)}
                    />
                  )}
                  <div className="flex gap-3 px-4 py-3">
                    <div className="relative shrink-0">
                      <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${fav.gradient} grid place-items-center text-[11px] font-bold text-white ${isOwn && item.type === "checkin" ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-card" : ""}`}>
                        {fav.initials}
                      </div>
                      {isOwn && item.type === "checkin" && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white ring-[1.5px] ring-card">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{displayName}</span>
                        {item.type === "checkin" ? " checked in at " : " reviewed "}
                        <span className="font-semibold text-primary">{item.place_name}</span>
                      </p>
                      {item.type === "review" && item.rating && (
                        <p className="mt-0.5 text-sm">{"⭐".repeat(item.rating)}</p>
                      )}
                      {item.note && (
                        <p className="mt-0.5 text-[13px] text-on-surface-variant line-clamp-2">{item.note}</p>
                      )}
                      <p className="mt-1 text-[11px] text-on-surface-variant/60">
                        {timeAgo(item.created_at)}
                      </p>
                    </div>
                    {item.type === "checkin" && !isOwn && (
                      <span className="shrink-0 self-center inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <PinIcon className="h-3 w-3" /> Check-in
                      </span>
                    )}
                    {isOwn && (
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setActionMenuId((v) => v === item.id ? null : item.id)}
                          className="grid h-7 w-7 place-items-center rounded-full text-on-surface-variant/50 hover:bg-surface-low active:bg-surface-low"
                        >
                          ⋮
                        </button>
                        {actionMenuId === item.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => { setActionMenuId(null); setDeleteConfirmId(null); }} />
                            <div className="absolute right-0 top-8 z-50 w-36 overflow-hidden rounded-xl bg-card shadow-float">
                              {deleteConfirmId === item.id ? (
                                <div className="p-3">
                                  <p className="mb-2.5 text-[12px] font-semibold">Delete this?</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="flex-1 rounded-lg bg-surface-low py-1.5 text-[12px] font-semibold"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => deleteCheckIn(item.id)}
                                      className="flex-1 rounded-lg bg-error/10 py-1.5 text-[12px] font-semibold text-error"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openEdit(item)}
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition active:bg-surface-low"
                                  >
                                    ✏️ Edit
                                  </button>
                                  <div className="mx-3 h-px bg-on-surface/8" />
                                  <button
                                    onClick={() => setDeleteConfirmId(item.id)}
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-error transition active:bg-error/5"
                                  >
                                    🗑 Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {feedLoaded && feedItems.length === 0 && (
        <section className="px-5 pt-5 pb-2">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-violet-700 px-6 pb-7 pt-8 shadow-float">
            <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <div className="absolute -left-6 bottom-0 h-32 w-32 rounded-full bg-white/5" />
            <p className="text-5xl">🗺️</p>
            <h2 className="mt-4 text-2xl font-bold leading-tight text-white">
              Explore Kuwait<br />with your crew
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Add friends, check in together, and discover the best spots around you.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/friends" className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white py-3 text-sm font-bold text-primary shadow-soft transition active:scale-[0.97]">
                👥 Add friends
              </Link>
              <button onClick={() => openModal("checkin")} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/20 py-3 text-sm font-bold text-white backdrop-blur transition active:scale-[0.97]">
                📍 Check in
              </button>
            </div>
          </div>
          <Link href="/ai" className="mt-4 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-primary">
            ✨ Or let the AI find you a spot
          </Link>
        </section>
      )}

      {/* AI picks — only when user has groups */}
      {featured && groups.length > 0 && (
        <section className="pt-5">
          <div className="flex items-center justify-between px-5">
            <h2 className="text-sm font-bold">AI picks for your crew</h2>
            <Link href="/ai" className="text-[13px] font-semibold text-primary">Ask AI</Link>
          </div>
          <article className="mx-5 mt-2.5 overflow-hidden rounded-2xl shadow-soft">
            <div className="relative h-44">
              <div className={`absolute inset-0 bg-gradient-to-br ${featured.image_gradient ?? "from-violet-500 to-purple-700"}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-bold text-primary backdrop-blur">✨ Top match</span>
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <h3 className="text-lg font-bold">{featured.name}</h3>
                <p className="flex items-center gap-1 text-sm opacity-80">
                  <PinIcon className="h-3.5 w-3.5" />{featured.category} · {featured.area}
                </p>
              </div>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[13px] text-on-surface-variant">
                <span className="font-semibold text-primary">Why this? </span>{featured.ai_reason}
              </p>
              <div className="mt-2.5 flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 font-semibold">
                  <StarIcon className="h-4 w-4 text-amber-500" />{featured.rating}
                </span>
                <span className="font-semibold text-tertiary">{priceLabel(featured.price_level ?? 1)}</span>
                <div className="ml-auto flex gap-1.5">
                  {(featured.tags ?? []).slice(0, 2).map((t) => (
                    <span key={t} className="rounded-full bg-surface-low px-2.5 py-1 text-[12px] font-semibold text-on-surface-variant">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>
      )}

      <AiFab />

      {showModal && profile?.id && (
        <CheckInModal userId={profile.id} senderName={profile.name ?? firstName} initialTab={modalTab} editItem={editItem} onClose={handleModalClose} />
      )}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
