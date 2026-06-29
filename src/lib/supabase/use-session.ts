"use client";

import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

/*
  Reactive auth + profile store via useSyncExternalStore.
  - SSR-safe: server snapshots are logged-out / no profile until the client hydrates.
  - Loads the current user's profile row (incl. username) whenever the session changes.
*/

export type Profile = {
  id: string;
  username: string | null;
  name: string;
  avatar_url: string | null;
  city: string | null;
  interests: string[];
};

let session: Session | null = null;
let profile: Profile | null = null;
let profileLoaded = false;
let profileSnapshot: { profile: Profile | null; loaded: boolean } = {
  profile: null,
  loaded: false,
};
const SERVER_PROFILE = { profile: null, loaded: false } as const;

let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  profileSnapshot = { profile, loaded: profileLoaded };
  listeners.forEach((l) => l());
}

async function loadProfile() {
  const uid = session?.user?.id;
  if (!uid) {
    profile = null;
    profileLoaded = true;
    emit();
    return;
  }
  const { data } = await supabase
    .from("profiles")
    .select("id, username, name, avatar_url, city, interests")
    .eq("id", uid)
    .maybeSingle();
  profile = (data as Profile | null) ?? null;
  profileLoaded = true;
  emit();
}

function setSession(next: Session | null) {
  session = next;
  profileLoaded = false;
  emit();
  loadProfile();
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => setSession(data.session));
  supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
}

function subscribe(listener: () => void): () => void {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-fetch the current profile (e.g. after setting a username). */
export function refreshProfile() {
  return loadProfile();
}

export function useSession() {
  return useSyncExternalStore(
    subscribe,
    () => session,
    () => null,
  );
}

export function useProfile() {
  return useSyncExternalStore(
    subscribe,
    () => profileSnapshot,
    () => SERVER_PROFILE,
  );
}
