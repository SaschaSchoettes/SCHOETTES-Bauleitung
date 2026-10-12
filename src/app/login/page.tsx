import { Brand } from "@/components/Brand";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Brand large />
        </div>
        <div className="card p-6">
          <h1 className="text-xl font-semibold">Anmelden</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            Bitte mit den Zugangsdaten anmelden, die Sie von der Bauleitung erhalten haben.
          </p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Sascha Schöttes · Baubetreuung &amp; -begutachtung
        </p>
      </div>
    </main>
  );
}
