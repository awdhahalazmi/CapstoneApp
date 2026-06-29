"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, useProfile } from "@/lib/supabase/use-session";

/*
  Lightweight client gate. If a signed-in user hasn't chosen a username yet,
  send them to /onboarding. Signed-out users are left alone (demo mode), so the
  app stays browsable until full login gating is turned on.
*/

export default function AuthRedirector() {
  const session = useSession();
  const { profile, loaded } = useProfile();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loaded || !session) return;
    if (!profile?.username && pathname !== "/onboarding" && pathname !== "/login") {
      router.replace("/onboarding");
    }
  }, [loaded, session, profile, pathname, router]);

  return null;
}
