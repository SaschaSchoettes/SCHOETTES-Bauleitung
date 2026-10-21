import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { saveNotifyMode, sendTestMail } from "./actions";
import { PasswordForm } from "../passwort/PasswordForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { mailConfigured } from "@/lib/mail";

const MODES = [
  {
    value: "sofort",
    title: "Sofort",
    text: "E-Mail bei Neuigkeiten – mehrere Ereignisse werden gebündelt, höchstens eine Mail alle 15 Minuten.",
  },
  { value: "taeglich", title: "Täglich", text: "Eine Zusammenfassung am Morgen (ab 7 Uhr), nur wenn es Neues gibt." },
  { value: "aus", title: "Aus", text: "Keine E-Mails. Neuigkeiten sehen Sie nur in der App." },
];

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { ok, fehler } = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const { data } = await supabase.from("profiles").select("notify_mode").eq("id", user.id).maybeSingle();
  const mode = (data as { notify_mode?: string } | null)?.notify_mode ?? "sofort";

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/projekte" className="text-sm text-slate-500 hover:text-slate-900">
        ← Alle Projekte
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Einstellungen</h1>

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      <section className="card mt-5 p-5">
        <h2 className="font-semibold">E-Mail-Benachrichtigungen</h2>
        <p className="mt-1 text-sm text-slate-500">
          An {profile.email || user.email}: neue Nachrichten, Dokumente und Pläne, Protokolle, Terminprobleme und
          Termine zum Bestätigen.
        </p>
        <form action={saveNotifyMode} className="mt-4 space-y-2">
          {MODES.map((m) => (
            <label key={m.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="notify_mode" value={m.value} defaultChecked={mode === m.value} className="mt-1 h-4 w-4" />
              <span>
                <span className="block font-medium">{m.title}</span>
                <span className="block text-sm text-slate-600">{m.text}</span>
              </span>
            </label>
          ))}
          <div className="pt-2">
            <SubmitButton>Speichern</SubmitButton>
          </div>
        </form>

        {profile.is_admin && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              Versand eingerichtet: {mailConfigured() ? "ja" : "nein – RESEND_API_KEY fehlt in Vercel"}
            </p>
            <form action={sendTestMail} className="mt-2">
              <SubmitButton className="btn btn-sm" pendingText="Sende …">
                Testmail an mich senden
              </SubmitButton>
            </form>
          </div>
        )}
      </section>

      <section className="card mt-5 p-5">
        <h2 className="mb-4 font-semibold">Passwort ändern</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
