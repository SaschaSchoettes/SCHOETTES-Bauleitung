import { createBrowserClient } from "@supabase/ssr";

/** Supabase-Client im Browser (z. B. für Datei-Uploads direkt in den Speicher). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
