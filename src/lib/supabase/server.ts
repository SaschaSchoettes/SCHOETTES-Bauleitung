import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase-Client für Server-Komponenten und Server-Actions (mit Login des Nutzers, RLS aktiv). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In Server-Komponenten nicht erlaubt – die Middleware erneuert die Sitzung.
          }
        },
      },
    },
  );
}
