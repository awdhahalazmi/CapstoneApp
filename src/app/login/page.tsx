"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/use-session";
import { AiIcon, ArrowLeftIcon, XIcon, CheckIcon } from "@/components/icons";
import { INTEREST_OPTIONS } from "@/lib/mock-data";

type Mode = "signin" | "signup";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const MAX_INTERESTS = 5;
const SIGNUP_INTERESTS = INTEREST_OPTIONS.slice(0, 7); // 7 quick options

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();

  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  const [usernameRaw, setUsernameRaw] = useState("");
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [customInterest, setCustomInterest] = useState("");

  const [status, setStatus] = useState<"idle" | "loading" | "check-email">("idle");
  const [error, setError] = useState<string | null>(null);
  const [uCheck, setUCheck] = useState<{ name: string; available: boolean } | null>(null);

  const username = usernameRaw.trim().toLowerCase();
  const usernameValid = USERNAME_RE.test(username);
  const usernameChecked = uCheck && uCheck.name === username ? uCheck : null;

  // Basic-info validation (required, email format, strong password, matching confirm)
  const nameValid = name.trim().length > 0;
  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const pwRules = [
    { key: "len", label: "At least 8 characters", ok: password.length >= 8 },
    { key: "upper", label: "An uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
    { key: "lower", label: "A lowercase letter (a–z)", ok: /[a-z]/.test(password) },
    { key: "num", label: "A number (0–9)", ok: /[0-9]/.test(password) },
  ];
  const passwordValid = pwRules.every((r) => r.ok);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  const nameError = nameValid ? "" : "Name is required.";
  const emailError = !email.trim()
    ? "Email is required."
    : emailValid
      ? ""
      : "Enter a valid email address.";
  const confirmError = !confirmPassword
    ? "Please confirm your password."
    : confirmValid
      ? ""
      : "Passwords don't match.";

  const basicValid = nameValid && emailValid && passwordValid && confirmValid;
  const profileValid =
    usernameValid && usernameChecked?.available === true && interests.size >= 1;

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  // Username availability (signup step 2)
  useEffect(() => {
    if (mode !== "signup" || step !== 2 || !usernameValid) return;
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("username_available", { name: username });
      setUCheck({ name: username, available: data === true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [mode, step, username, usernameValid]);

  function switchMode(m: Mode) {
    setMode(m);
    setStep(1);
    setError(null);
  }

  function addInterest(label: string) {
    const v = label.trim();
    if (!v) return;
    setInterests((prev) => {
      if (prev.size >= MAX_INTERESTS) return prev;
      if ([...prev].some((i) => i.toLowerCase() === v.toLowerCase())) return prev;
      return new Set(prev).add(v);
    });
  }
  function removeInterest(label: string) {
    setInterests((prev) => {
      const next = new Set(prev);
      next.delete(label);
      return next;
    });
  }
  function addCustomInterest(e: React.FormEvent) {
    e.preventDefault();
    addInterest(customInterest);
    setCustomInterest("");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid || password.length < 6) return;
    setError(null);
    setStatus("loading");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    }
  }

  async function createAccount() {
    if (!basicValid || !profileValid) return;
    setError(null);
    setStatus("loading");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim(), username, interests: [...interests] },
      },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
      return;
    }
    if (!data.session) setStatus("check-email");
    // else: signed in → redirect effect takes over
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-8">
      {/* Brand (hidden on the taller step 2 to save room) */}
      {!(mode === "signup" && step === 2) && (
        <>
          <span className="fab h-14 w-14">
            <AiIcon className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Beyond Kw</h1>
          <p className="mt-1 text-center text-sm text-on-surface-variant">
            Plan outings &amp; discover places with friends.
          </p>
        </>
      )}

      <div className="mt-6 w-full max-w-sm">
        {status === "check-email" ? (
          <div className="rounded-lg bg-tertiary-container/15 p-5 text-center">
            <p className="font-semibold text-tertiary">Confirm your email ✉️</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              We sent a link to <span className="font-medium">{email}</span>. Click it, then
              sign in.
            </p>
            <button
              onClick={() => {
                switchMode("signin");
                setStatus("idle");
              }}
              className="mt-3 text-sm font-semibold text-primary"
            >
              Back to sign in
            </button>
          </div>
        ) : mode === "signin" ? (
          /* ---------- SIGN IN ---------- */
          <>
            <form onSubmit={signIn} className="space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@email.com"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Password (6+ characters)"
              />
              <button
                type="submit"
                disabled={!emailValid || password.length < 6 || status === "loading"}
                className="btn-primary h-[52px] w-full text-base disabled:opacity-50"
              >
                {status === "loading" ? "Please wait…" : "Sign in"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-on-surface-variant">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-semibold text-primary"
              >
                Create one
              </button>
            </p>
          </>
        ) : step === 1 ? (
          /* ---------- SIGN UP · STEP 1: BASIC INFO ---------- */
          <>
            <StepLabel current={1} />
            <h2 className="mt-3 text-center text-lg font-bold">Basic info</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (basicValid) {
                  setError(null);
                  setStep(2);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => touch("name")}
                  className="input"
                  placeholder="Full name"
                />
                {touched.name && nameError && (
                  <p className="mt-1 text-[12px] text-error">{nameError}</p>
                )}
              </div>
              <div>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch("email")}
                  className="input"
                  placeholder="you@email.com"
                />
                {touched.email && emailError && (
                  <p className="mt-1 text-[12px] text-error">{emailError}</p>
                )}
              </div>
              <div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => touch("password")}
                  className="input"
                  placeholder="Password"
                />
                {/* Live password rules */}
                <ul className="mt-2 space-y-1">
                  {pwRules.map((r) => (
                    <li
                      key={r.key}
                      className={`flex items-center gap-2 text-[12px] ${
                        r.ok ? "text-tertiary" : "text-on-surface-variant"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                          r.ok ? "bg-tertiary text-on-tertiary" : "bg-surface-high"
                        }`}
                      >
                        {r.ok && <CheckIcon className="h-3 w-3" />}
                      </span>
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => touch("confirm")}
                  className="input"
                  placeholder="Confirm password"
                />
                {touched.confirm && confirmError && (
                  <p className="mt-1 text-[12px] text-error">{confirmError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={!basicValid}
                className="btn-primary h-[52px] w-full text-base disabled:opacity-50"
              >
                Continue
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-on-surface-variant">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-semibold text-primary"
              >
                Sign in
              </button>
            </p>
          </>
        ) : (
          /* ---------- SIGN UP · STEP 2: PROFILE SETUP ---------- */
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Back"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="grid h-9 w-9 place-items-center rounded-full text-primary"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <StepLabel current={2} />
            </div>
            <h2 className="mt-3 text-lg font-bold">Set up your profile</h2>
            <p className="text-sm text-on-surface-variant">Pick a username and what you&apos;re into.</p>

            {/* Username */}
            <div className="relative mt-4">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-outline">
                @
              </span>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={usernameRaw}
                onChange={(e) => setUsernameRaw(e.target.value)}
                className="input pl-8"
                placeholder="username"
                maxLength={20}
              />
              {usernameValid && usernameChecked && (
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold ${
                    usernameChecked.available ? "text-tertiary" : "text-error"
                  }`}
                >
                  {usernameChecked.available ? "available" : "taken"}
                </span>
              )}
            </div>
            {usernameRaw && !usernameValid && (
              <p className="mt-1 text-[12px] text-error">3–20 chars · a–z, 0–9, _ only</p>
            )}

            {/* Interests — required, 1 to 5, presets or your own */}
            <p className="mt-5 text-sm font-bold">
              Your interests{" "}
              <span className="font-normal text-on-surface-variant">
                · {interests.size}/{MAX_INTERESTS}
              </span>
            </p>
            <p className="text-[12px] text-on-surface-variant">
              Pick 1–5 — tap a suggestion or type your own.
            </p>

            {/* Selected (removable) */}
            {interests.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {[...interests].map((label) => (
                  <span key={label} className="chip chip-active">
                    {label}
                    <button
                      type="button"
                      onClick={() => removeInterest(label)}
                      aria-label={`Remove ${label}`}
                      className="-mr-1 ml-0.5 grid h-4 w-4 place-items-center rounded-full bg-on-secondary-container/20"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Type your own */}
            <form onSubmit={addCustomInterest} className="mt-2 flex items-center gap-2">
              <input
                value={customInterest}
                onChange={(e) => setCustomInterest(e.target.value)}
                className="input"
                placeholder="Type your own interest…"
                maxLength={24}
                disabled={interests.size >= MAX_INTERESTS}
              />
              <button
                type="submit"
                disabled={!customInterest.trim() || interests.size >= MAX_INTERESTS}
                className="btn-primary h-12 shrink-0 px-4 text-sm disabled:opacity-40"
              >
                Add
              </button>
            </form>

            {/* Suggestions (7) */}
            {interests.size < MAX_INTERESTS ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {SIGNUP_INTERESTS.filter(
                  (o) => ![...interests].some((i) => i.toLowerCase() === o.label.toLowerCase()),
                ).map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => addInterest(o.label)}
                    className="chip"
                  >
                    <span aria-hidden>{o.emoji}</span>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-on-surface-variant">
                That&apos;s the max — remove one to add another.
              </p>
            )}

            <button
              onClick={createAccount}
              disabled={!profileValid || status === "loading"}
              className="btn-primary mt-6 h-[52px] w-full text-base disabled:opacity-50"
            >
              {status === "loading" ? "Creating account…" : "Create account"}
            </button>
          </>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-error-container px-3 py-2 text-center text-sm text-on-error-container">
            {error}
          </p>
        )}

        {status !== "check-email" && (
          <p className="mt-6 text-center text-[12px] text-outline">
            By continuing you agree to Beyond Kw&apos;s Terms &amp; Privacy.
          </p>
        )}
      </div>
    </div>
  );
}

function StepLabel({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <span className={`h-1.5 w-8 rounded-full ${current >= 1 ? "bg-primary" : "bg-surface-high"}`} />
      <span className={`h-1.5 w-8 rounded-full ${current >= 2 ? "bg-primary" : "bg-surface-high"}`} />
      <span className="ml-1 text-[12px] font-semibold text-on-surface-variant">
        Step {current} of 2
      </span>
    </div>
  );
}
