"use client";

import { useActionState, useState } from "react";
import { addAccess, resetPassword, type AccessState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { APP_NAME, ROLE_LABELS, ROLES } from "@/lib/types";

function Credentials({ c }: { c: NonNullable<AccessState["credentials"]> }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text =
    `Guten Tag ${c.name},\n\n` +
    `Ihr Zugang zum ${APP_NAME}:\n` +
    `Adresse: ${url}\n` +
    `E-Mail: ${c.email}\n` +
    `Passwort: ${c.password}\n\n` +
    `Bitte ändern Sie das Passwort nach der ersten Anmeldung (oben rechts „Passwort“).`;

  return (
    <div className="notice notice-info space-y-2">
      <p className="font-semibold">Zugangsdaten – werden nur jetzt angezeigt:</p>
      <pre className="overflow-x-auto rounded-lg bg-white p-3 text-sm whitespace-pre-wrap">{text}</pre>
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Kopiert ✓" : "Text kopieren"}
      </button>
      <p className="text-xs">
        Passwort getrennt von der E-Mail-Adresse übermitteln (z. B. per SMS), nicht beides in einer Nachricht.
      </p>
    </div>
  );
}

export function AddAccessForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<AccessState, FormData>(addAccess.bind(null, projectId), {});

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name *</label>
          <input name="full_name" required className="input" />
        </div>
        <div>
          <label className="label">E-Mail *</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label">Firma</label>
          <input name="company" className="input" />
        </div>
        <div>
          <label className="label">Telefon</label>
          <input name="phone" type="tel" className="input" />
        </div>
        <div>
          <label className="label">Rolle</label>
          <select name="role" defaultValue="gewerk" className="input">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Gewerk (z. B. Dachdecker)</label>
          <input name="trade" className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="also_contact" defaultChecked className="h-4 w-4" />
          Auch in die Kontaktliste aufnehmen
        </label>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Anlegen …">Zugang anlegen</SubmitButton>
        </div>
      </form>
      <Notice ok={state.credentials ? null : state.ok} error={state.error} />
      {state.credentials && <Credentials c={state.credentials} />}
    </div>
  );
}

export function ResetPasswordForm({
  projectId,
  userId,
  email,
  name,
}: {
  projectId: string;
  userId: string;
  email: string;
  name: string;
}) {
  const [state, formAction] = useActionState<AccessState, FormData>(resetPassword.bind(null, projectId), {});

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm(`Neues Passwort für ${name} erzeugen? Das alte Passwort wird ungültig.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="name" value={name} />
        <SubmitButton className="btn btn-sm" pendingText="Erzeuge …">
          Neues Passwort
        </SubmitButton>
      </form>
      <Notice error={state.error} />
      {state.credentials && <Credentials c={state.credentials} />}
    </div>
  );
}
