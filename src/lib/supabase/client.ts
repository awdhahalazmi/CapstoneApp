import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/*
  Browser Supabase client for Beyond Kw.
  Uses the publishable (anon) key — safe to expose in the browser; row-level
  security on every table is what actually protects the data.

  This is a client-side singleton suitable for the current client-rendered app.
  When server-side auth/SSR is added later, switch to @supabase/ssr helpers.
*/

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
