import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ["/login"];

function configError(message: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Konfiguration</title>
     <body style="font-family:system-ui;max-width:640px;margin:15vh auto;padding:0 16px;line-height:1.5">
     <h1 style="font-size:1.3rem">Konfiguration unvollständig</h1>
     <p>${message}</p>
     <p style="color:#666">Vercel → Projekt → Settings → Environment Variables prüfen, danach unter
     „Deployments“ beim neuesten Eintrag „…“ → „Redeploy“.</p></body>`,
    { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !url.startsWith("https://")) {
    return configError(
      "Die Variable <b>NEXT_PUBLIC_SUPABASE_URL</b> fehlt oder ist ungültig (muss mit https:// beginnen).",
    );
  }
  if (!key) {
    return configError("Die Variable <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> fehlt.");
  }

  let response = NextResponse.next({ request });
  let user: User | null = null;

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error("Middleware: Supabase nicht erreichbar", e);
    return configError(
      "Die Verbindung zu Supabase ist fehlgeschlagen. Bitte <b>NEXT_PUBLIC_SUPABASE_URL</b> und " +
        "<b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> auf Tippfehler prüfen.",
    );
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    return NextResponse.redirect(target);
  }

  if (user && path === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/projekte";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
