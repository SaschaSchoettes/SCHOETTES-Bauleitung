"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string; ok?: string };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");

  if (pw.length < 10) return { error: "Das Passwort muss mindestens 10 Zeichen lang sein." };
  if (pw !== pw2) return { error: "Die beiden Eingaben stimmen nicht überein." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: "Passwort konnte nicht geändert werden: " + error.message };

  return { ok: "Passwort geändert." };
}
