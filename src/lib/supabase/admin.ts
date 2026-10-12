import { createClient } from "@supabase/supabase-js";

/**
 * Admin-Client mit Service-Role-Key. Umgeht RLS!
 * Nur in Server-Actions verwenden, nachdem die Berechtigung des Aufrufers geprüft wurde.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt in den Umgebungsvariablen.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
