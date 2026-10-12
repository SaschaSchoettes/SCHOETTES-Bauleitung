import Link from "next/link";
import { Brand } from "@/components/Brand";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/projekte" aria-label="Zur Projektübersicht">
            <Brand />
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-500">
            <span className="hidden sm:inline">{profile.full_name || profile.email}</span>
            <Link href="/passwort" className="hover:text-slate-900">
              Passwort
            </Link>
            <form action={signOut}>
              <button type="submit" className="hover:text-slate-900">
                Abmelden
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
