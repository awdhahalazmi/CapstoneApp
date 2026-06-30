"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, useProfile } from "@/lib/supabase/use-session";

const PUBLIC_PATHS = ["/login", "/onboarding"];

export default function AuthRedirector() {
  const session = useSession();
  const { profile, loaded } = useProfile();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loaded) return;

    if (!session) {
      if (!PUBLIC_PATHS.includes(pathname)) router.replace("/login");
      return;
    }

    if (!profile?.username && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/onboarding");
    }
  }, [loaded, session, profile, pathname, router]);

  return null;
}
