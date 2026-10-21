"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { APP_URL, sendMail } from "@/lib/mail";

function back(key: "ok" | "fehler", msg: string): never {
  redirect(`/einstellungen?${key}=${encodeURIComponent(msg)}`);
}

export async function saveNotifyMode(formData: FormData) {
  const { supabase, user } = await requireUser();
  const mode = String(formData.get("notify_mode") ?? "");
  if (!["sofort", "taeglich", "aus"].includes(mode)) back("fehler", "Ungültige Auswahl.");

  const { error } = await supabase.from("profiles").update({ notify_mode: mode }).eq("id", user.id);
  if (error) back("fehler", "Speichern fehlgeschlagen: " + error.message);
  back("ok", "Einstellung gespeichert.");
}

export async function sendTestMail() {
  const { profile, user } = await requireUser();
  const to = profile.email || user.email;
  if (!to) back("fehler", "Keine E-Mail-Adresse hinterlegt.");

  const res = await sendMail({
    to,
    subject: "Bauportal: Testnachricht",
    text: `Guten Tag,\n\ndie E-Mail-Benachrichtigung des Schöttes Bauportals funktioniert.\n\n${APP_URL}\n`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px">` +
      `<p>Guten Tag,</p><p>die E-Mail-Benachrichtigung des Schöttes Bauportals funktioniert.</p>` +
      `<p><a href="${APP_URL}">${APP_URL}</a></p></div>`,
  });
  if (!res.ok) back("fehler", res.error);
  back("ok", `Testmail an ${to} verschickt – bitte Posteingang (und Spam-Ordner) prüfen.`);
}
