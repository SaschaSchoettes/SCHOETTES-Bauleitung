"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";

export function PasswordForm() {
  const [state, formAction] = useActionState<PasswordState, FormData>(changePassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          Neues Passwort (mind. 10 Zeichen)
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password2">
          Neues Passwort wiederholen
        </label>
        <input id="password2" name="password2" type="password" autoComplete="new-password" required className="input" />
      </div>
      <Notice ok={state.ok} error={state.error} />
      <SubmitButton>Passwort ändern</SubmitButton>
    </form>
  );
}
