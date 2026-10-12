"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          E-Mail
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      {state.error && <p className="notice notice-error">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full" pendingText="Anmelden …">
        Anmelden
      </SubmitButton>
    </form>
  );
}
