import Link from "next/link";
import { PasswordForm } from "./PasswordForm";

export default function PasswortPage() {
  return (
    <div className="mx-auto max-w-md">
      <Link href="/projekte" className="text-sm text-slate-500 hover:text-slate-900">
        ← Alle Projekte
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Passwort ändern</h1>
      <div className="card mt-5 p-5">
        <PasswordForm />
      </div>
    </div>
  );
}
