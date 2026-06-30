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
function CheckInModal({ onClose, userId, initialTab = "checkin" }: { onClose: () => void; userId: string; initialTab?: "checkin" | "review" }) {
  const [tab, setTab] = useState<"checkin" | "review">(initialTab);

  // Check-in state
  const [placeName, setPlaceName] = useState("");
  const [checkInNote, setCheckInNote] = useState("");

  // Review state
  const [reviewPlace, setReviewPlace] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewPrivate, setReviewPrivate] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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
    await supabase.from("check_ins").insert({
      user_id: userId,
      place_name: placeName.trim(),
      note: checkInNote.trim() || null,
      type: "checkin",
      is_private: false,
    });
    setSaving(false);
    onClose();
  }

  async function submitReview() {
    if (!reviewPlace.trim() || !reviewText.trim()) return;
    setSaving(true);

    let image_url: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { data: uploadData } = await supabase.storage
        .from("checkin-images")
        .upload(path, photoFile, { upsert: true });
      if (uploadData) {
        const { data: urlData } = supabase.storage.from("checkin-images").getPublicUrl(uploadData.path);
        image_url = urlData.publicUrl;
      }
    }

    await supabase.from("check_ins").insert({
      user_id: userId,
      place_name: reviewPlace.trim(),
      note: reviewText.trim(),
      rating: reviewRating > 0 ? reviewRating : null,
      type: "review",
      is_private: reviewPrivate,
      image_url,
    });
    setSaving(false);
    onClose();
  }

  return (
    <>
    {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="no-scrollbar w-full max-w-[440px] overflow-y-auto rounded-t-3xl bg-surface px-5 pb-10 pt-4 shadow-float" style={{ maxHeight: "90dvh" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-outline-variant" />

        <div className="mb-5 flex rounded-xl bg-surface-low p-1">
          <button onClick={() => setTab("checkin")} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === "checkin" ? "bg-card text-primary shadow-soft" : "text-on-surface-variant"}`}>
            📍 Check in
          </button>
          <button onClick={() => setTab("review")} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === "review" ? "bg-card text-primary shadow-soft" : "text-on-surface-variant"}`}>
            ✍️ Review
          </button>
        </div>

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
              {saving ? "Checking in…" : "📍 Check in"}
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
              {saving ? "Saving…" : reviewPrivate ? "Save privately" : "Share review"}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { profile } = useProfile();
  const { friends } = useFriends();
  const { groups } = useGroups();
  const firstName = (profile?.name ?? "").split(" ")[0] || "there";
  const av = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<"checkin" | "review">("checkin");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [places, setPlaces] = useState<DbPlace[]>([]);
  const [upcomingOutings, setUpcomingOutings] = useState<PlannedOuting[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);

  function openModal(tab: "checkin" | "review" = "checkin") {
    setModalTab(tab);
    setShowModal(true);
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
    return `${dayLabel} at ${time}`;
  }

  const [featured, ...rest] = places;

  return (
    <div className="pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-surface/80 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-on-surface-variant">Hi {firstName} 👋</p>
            <h1 className="text-2xl font-bold">Where to next?</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => openModal("checkin")}
              aria-label="Check in or plan outing"
              className="grid h-9 w-9 place-items-center rounded-full bg-primary text-on-primary shadow-float active:scale-95"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <Link href="/notifications" aria-label="Notifications" className="relative text-on-surface">
              <BellIcon />
            </Link>
            <Avatar initials={av.initials} gradient={av.gradient} size="sm" />
          </div>
        </div>
      </header>

      {/* Upcoming outings reminder */}
      {upcomingOutings.length > 0 && (
        <section className="px-5 pt-3 pb-1">
          <p className="mb-2 text-sm font-bold">📅 Upcoming</p>
          <div className="space-y-2">
            {upcomingOutings.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl bg-primary/8 px-4 py-3">
                <span className="text-xl">🗓</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm">{o.place_name}</p>
                  <p className="text-[12px] text-on-surface-variant">{formatOutingDate(o.planned_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Friends mini-row */}
      {friends.length > 0 && (
        <section className="px-5 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold">Your crew</p>
            <Link href="/community" className="text-[13px] font-semibold text-primary">See all</Link>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {friends.slice(0, 8).map((f) => {
              const fav = avatarFor(f);
              return (
                <div key={f.id} className="flex shrink-0 flex-col items-center gap-1">
                  <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${fav.gradient} grid place-items-center text-[13px] font-bold text-white`}>
                    {fav.initials}
                  </div>
                  <span className="max-w-[44px] truncate text-[10px] font-medium text-on-surface-variant">
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
        <section className="px-5 pt-4 pb-2">
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
                <div key={item.id} className="overflow-hidden rounded-xl bg-card shadow-soft">
                  {/* Photo */}
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.place_name}
                      className="h-44 w-full cursor-zoom-in object-cover"
                      onClick={() => setLightboxUrl(item.image_url!)}
                    />
                  )}
                  <div className="flex gap-3 px-4 py-3">
                    <div className={`h-9 w-9 shrink-0 rounded-full bg-gradient-to-br ${fav.gradient} grid place-items-center text-[11px] font-bold text-white`}>
                      {fav.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{displayName}</span>
                        {item.type === "checkin" ? " checked in at " : " reviewed "}
                        <span className="font-semibold text-primary">{item.place_name}</span>
                      </p>
                      {/* Stars for reviews */}
                      {item.type === "review" && item.rating && (
                        <p className="mt-0.5 text-sm">{"⭐".repeat(item.rating)}</p>
                      )}
                      {item.note && (
                        <p className="mt-0.5 text-[13px] text-on-surface-variant line-clamp-2">{item.note}</p>
                      )}
                      <p className="mt-1 text-[11px] text-on-surface-variant/60">
                        {item.type === "checkin" ? "📍" : "✍️"} {timeAgo(item.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state — shown when feed is loaded but empty */}
      {feedLoaded && feedItems.length === 0 && (
        <section className="px-5 pt-5 pb-2">
          {/* Hero card */}
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
              <Link
                href="/friends"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white py-3 text-sm font-bold text-primary shadow-soft transition active:scale-[0.97]"
              >
                👥 Add friends
              </Link>
              <button
                onClick={() => openModal("checkin")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/20 py-3 text-sm font-bold text-white backdrop-blur transition active:scale-[0.97]"
              >
                📍 Check in
              </button>
            </div>
          </div>
          {/* Subtle AI nudge */}
          <Link
            href="/ai"
            className="mt-4 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-primary"
          >
            ✨ Or let the AI find you a spot
          </Link>
        </section>
      )}

      {/* AI picks — only when user has groups */}
      {featured && groups.length > 0 && (
        <section className="pt-4">
          <div className="flex items-center justify-between px-5">
            <h2 className="text-lg font-bold">AI picks for your crew</h2>
            <Link href="/ai" className="text-sm font-semibold text-primary">Ask AI</Link>
          </div>

          <article className="mx-5 mt-3 overflow-hidden rounded-lg shadow-soft">
            <div className="relative h-48">
              <div className={`absolute inset-0 bg-gradient-to-br ${featured.image_gradient ?? "from-violet-500 to-purple-700"}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-bold text-primary backdrop-blur">
                ✨ Top match
              </span>
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <h3 className="text-xl font-bold">{featured.name}</h3>
                <p className="flex items-center gap-1 text-sm opacity-90">
                  <PinIcon className="h-4 w-4" />
                  {featured.category} · {featured.area}
                </p>
              </div>
            </div>
            <div className="bg-card p-4">
              <p className="text-sm text-on-surface-variant">
                <span className="font-semibold text-primary">Why this? </span>
                {featured.ai_reason}
              </p>
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 font-semibold text-on-surface">
                  <StarIcon className="h-4 w-4 text-amber-500" />
                  {featured.rating}
                </span>
                <span className="font-semibold text-tertiary">{priceLabel(featured.price_level ?? 1)}</span>
                <div className="ml-auto flex gap-1.5">
                  {(featured.tags ?? []).slice(0, 2).map((t) => (
                    <span key={t} className="rounded-full bg-surface-low px-2.5 py-1 text-[12px] font-semibold text-on-surface-variant">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>
      )}


      <AiFab />

      {showModal && profile?.id && (
        <CheckInModal userId={profile.id} initialTab={modalTab} onClose={() => setShowModal(false)} />
      )}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
