"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon, PlusIcon } from "@/components/icons";
const SUGGESTED_INTERESTS = [
  "Coffee", "Rooftops", "Brunch", "Live music", "Hiking", "Beaches",
  "Art", "Foodie", "Nightlife", "Shopping", "Sports", "Gaming",
  "Chill", "Hidden Gems", "Photography", "Desert camping", "Board games",
];
import { avatarFor } from "@/lib/avatar";
import { supabase } from "@/lib/supabase/client";
import { useSession, useProfile, refreshProfile } from "@/lib/supabase/use-session";
import { useGroups } from "@/lib/groups-store";
import { useFriends } from "@/lib/friends-store";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const INTEREST_EMOJIS: Record<string, string> = {
  Coffee: "☕", Rooftops: "🌆", Brunch: "🥞", "Live music": "🎵",
  Hiking: "🥾", Beaches: "🏖️", Art: "🎨", Foodie: "🍽️",
  Nightlife: "🌙", Shopping: "🛍️", Sports: "⚽", Gaming: "🎮",
  Chill: "🌊", "Hidden Gems": "💎",
};

function SettingsIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const session = useSession();
  const { profile } = useProfile();
  const { groups } = useGroups();
  const { friends } = useFriends();
  const interests = profile?.interests ?? [];

  const stats = [
    { label: "Places", value: 0 },
    { label: "Friends", value: friends.length },
    { label: "Groups", value: groups.length },
  ];

  const [editingInterests, setEditingInterests] = useState(false);
  const [newInterest, setNewInterest] = useState("");
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState("");
  const [eUsername, setEUsername] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const meta = session?.user?.user_metadata ?? {};
  const email = session?.user?.email ?? null;
  const displayName =
    profile?.name ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    email?.split("@")[0] ||
    "Me";
  const av = avatarFor({ id: profile?.id, name: profile?.name, username: profile?.username });

  const suggestions = SUGGESTED_INTERESTS.filter(
    (s) => !interests.some((i) => i.toLowerCase() === s.toLowerCase()),
  );

  async function persistInterests(next: string[]) {
    if (!profile) return;
    await supabase.from("profiles").update({ interests: next }).eq("id", profile.id);
    await refreshProfile();
  }
  async function addInterest(label: string) {
    const v = label.trim();
    if (!v || interests.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    await persistInterests([...interests, v]);
  }
  async function removeInterest(label: string) {
    await persistInterests(interests.filter((i) => i !== label));
  }
  function submitInterest(e: React.FormEvent) {
    e.preventDefault();
    addInterest(newInterest);
    setNewInterest("");
  }

  function openEdit() {
    setEName(profile?.name ?? "");
    setEUsername(profile?.username ?? "");
    setEEmail(email ?? "");
    setEditError(null);
    setEditing(true);
  }

  async function saveProfile() {
    if (!profile) return;
    const name = eName.trim();
    const uname = eUsername.trim().toLowerCase();
    if (name.length < 1) return setEditError("Name is required.");
    if (!USERNAME_RE.test(uname)) return setEditError("Username must be 3–20 chars (a–z, 0–9, _).");
    setSaving(true);
    setEditError(null);
    if (uname !== profile.username) {
      const { data } = await supabase.rpc("username_available", { p_username: uname });
      if (data !== true) { setSaving(false); return setEditError("That username is taken."); }
    }
    const { error: upErr } = await supabase.from("profiles").update({ name, username: uname }).eq("id", profile.id);
    if (upErr) {
      setSaving(false);
      return setEditError(upErr.code === "23505" ? "That username is taken." : upErr.message);
    }
    const newEmail = eEmail.trim();
    if (newEmail && newEmail !== email) {
      const { error: emErr } = await supabase.auth.updateUser({ email: newEmail });
      if (emErr) { setSaving(false); return setEditError(emErr.message); }
      setNotice(`Confirmation sent to ${newEmail} — click the link to finish.`);
    }
    await refreshProfile();
    setSaving(false);
    setEditing(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-24">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h1 className="text-xl font-bold text-primary">Profile</h1>
          <button onClick={openEdit} className="text-on-surface-variant transition active:scale-90">
            <SettingsIcon />
          </button>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 pt-4 pb-2">
          {/* Avatar with violet ring */}
          <div className="rounded-full p-[3px] bg-gradient-to-br from-primary to-primary-container shadow-[0_10px_25px_rgba(124,58,237,0.25)]">
            <div className={`h-24 w-24 rounded-full bg-gradient-to-br ${av.gradient} grid place-items-center text-2xl font-bold text-white ring-2 ring-surface`}>
              {av.initials}
            </div>
          </div>

          <h2 className="mt-4 text-2xl font-bold text-on-surface">{displayName}</h2>

          {/* Badge */}
          {profile?.username && (
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-3 py-1 text-[13px] font-semibold text-on-primary-fixed-variant">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
              </svg>
              @{profile.username}
            </span>
          )}
        </div>

        {/* Edit profile form */}
        {editing && (
          <div className="mx-5 mt-2 rounded-2xl bg-card p-4 shadow-soft space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Name</label>
              <input value={eName} onChange={(e) => setEName(e.target.value)} className="input mt-1" placeholder="Full name" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Username</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-outline">@</span>
                <input value={eUsername} onChange={(e) => setEUsername(e.target.value)} className="input pl-8" placeholder="username" maxLength={20} autoCapitalize="none" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Email</label>
              <input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} className="input mt-1" placeholder="you@email.com" />
            </div>
            {editError && <p className="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">{editError}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditing(false)} className="btn-secondary h-11 flex-1">Cancel</button>
              <button onClick={saveProfile} disabled={saving} className="btn-primary h-11 flex-1 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        )}

        {notice && (
          <p className="mx-5 mt-3 rounded-xl bg-tertiary-container/20 px-3 py-2 text-sm text-tertiary">{notice}</p>
        )}

        {/* Stats */}
        <div className="mx-5 mt-5 grid grid-cols-3 divide-x divide-outline-variant/40 rounded-2xl bg-surface-low py-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold text-on-surface">{s.value}</p>
              <p className="mt-0.5 text-[12px] font-medium text-on-surface-variant">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Interests */}
        <section className="mt-6 px-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-on-surface">Interests</h3>
            {profile && (
              <button onClick={() => setEditingInterests((v) => !v)} className="text-[13px] font-semibold text-primary">
                {editingInterests ? "Done" : "Edit"}
              </button>
            )}
          </div>

          {interests.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No interests yet — tap Edit to add some.</p>
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {interests.map((interest, i) => {
                const emoji = INTEREST_EMOJIS[interest];
                const isFirst = i === 0;
                return (
                  <span
                    key={interest}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold ${
                      isFirst
                        ? "bg-primary text-on-primary"
                        : "bg-surface-low text-on-surface-variant"
                    }`}
                  >
                    {emoji && <span aria-hidden>{emoji}</span>}
                    {interest}
                    {editingInterests && (
                      <button onClick={() => removeInterest(interest)} aria-label={`Remove ${interest}`}
                        className="grid h-4 w-4 place-items-center rounded-full bg-white/20">
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {editingInterests && (
            <div className="mt-4 space-y-3">
              <form onSubmit={submitInterest} className="flex gap-2">
                <input value={newInterest} onChange={(e) => setNewInterest(e.target.value)} className="input flex-1" placeholder="Add an interest…" maxLength={24} />
                <button type="submit" disabled={!newInterest.trim()} className="btn-primary h-12 shrink-0 px-4 text-sm disabled:opacity-40">Add</button>
              </form>
              {suggestions.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Suggestions</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button key={s} onClick={() => addInterest(s)}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-1.5 text-[13px] font-semibold text-on-surface-variant transition active:scale-95">
                        <PlusIcon className="h-3.5 w-3.5" />
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Sign out row */}
        <div className="mx-5 mt-6">
          {session ? (
            <button
              onClick={() => setConfirmSignOut(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-4 text-[15px] font-semibold text-error shadow-[0px_4px_20px_rgba(0,0,0,0.04)] transition active:scale-[0.99]"
            >
              <SignOutIcon />
              Sign Out
            </button>
          ) : (
            <button onClick={() => router.push("/login")} className="btn-primary h-[52px] w-full text-base">Sign in</button>
          )}
        </div>
      </div>

      {/* Sign-out confirmation */}
      {confirmSignOut && (
        <>
          <button aria-label="Close" onClick={() => setConfirmSignOut(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <div className="fixed inset-x-5 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl bg-card p-6 shadow-[0px_10px_25px_rgba(124,58,237,0.18)]">
            <h3 className="text-lg font-bold">Sign out?</h3>
            <p className="mt-1 text-sm text-on-surface-variant">You'll need to sign in again to access your account.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmSignOut(false)} className="btn-secondary h-11 flex-1">Cancel</button>
              <button onClick={signOut} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-error text-[15px] font-semibold text-on-error transition active:scale-[0.98]">
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
