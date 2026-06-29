"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession, useProfile, refreshProfile } from "@/lib/supabase/use-session";
import { AiIcon, CheckIcon } from "@/components/icons";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function OnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const { profile, loaded } = useProfile();

  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<{ name: string; available: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = raw.trim().toLowerCase();
  const formatValid = USERNAME_RE.test(username);
  const checked = result && result.name === username ? result : null;

  // Not signed in → login. Already has a username → into the app.
  useEffect(() => {
    if (!loaded) return;
    if (!session) router.replace("/login");
    else if (profile?.username) router.replace("/");
  }, [loaded, session, profile, router]);

  // Debounced availability check
  useEffect(() => {
    if (!formatValid) return;
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      setResult({ name: username, available: !data });
    }, 400);
    return () => window.clearTimeout(t);
  }, [username, formatValid]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!formatValid || !session || checked?.available === false) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", session.user.id);
    if (error) {
      setError(
        error.code === "23505"
          ? "That username was just taken — try another."
          : error.message,
      );
      setSaving(false);
      return;
    }
    await refreshProfile();
    router.replace("/");
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <span className="fab h-14 w-14">
        <AiIcon className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">Pick a username</h1>
      <p className="mt-2 text-center text-on-surface-variant">
        This is how friends find and add you on Beyond Kw.
      </p>

      <form onSubmit={save} className="mt-8 w-full max-w-sm">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-outline">
            @
          </span>
          <input
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="input pl-9"
            placeholder="username"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {checked && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold ${
                checked.available ? "text-tertiary" : "text-error"
              }`}
            >
              {checked.available ? "available" : "taken"}
            </span>
          )}
        </div>

        <p className="mt-2 text-[12px] text-on-surface-variant">
          3–20 characters · lowercase letters, numbers, underscores
          {raw && !formatValid && (
            <span className="block text-error">
              Only a–z, 0–9 and _ , at least 3 characters.
            </span>
          )}
        </p>

        {error && (
          <p className="mt-3 rounded-md bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!formatValid || checked?.available === false || saving}
          className="btn-primary mt-6 h-[52px] w-full text-base disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue"}
          {!saving && checked?.available && <CheckIcon className="h-5 w-5" />}
        </button>
      </form>
    </div>
  );
}
