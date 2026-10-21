import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDigest, mailConfigured, sendMail, type DigestItem } from "@/lib/mail";

/**
 * Versand der vorgemerkten Benachrichtigungen.
 * Wird alle 10 Minuten von Supabase (pg_cron) aufgerufen – siehe supabase/benachrichtigung_zeitplan.sql
 *
 * Regeln:
 *  - sofort:   höchstens eine Mail pro Person alle 15 Minuten (alles Neue gebündelt)
 *  - taeglich: eine Mail am Tag ab 7 Uhr
 *  - aus:      keine Mail (Vormerkungen werden verworfen)
 */
export const dynamic = "force-dynamic";

const BUNDLE_MINUTES = 15;
const DAILY_HOUR = 7;

type Pending = { id: string; user_id: string; project_id: string | null; text: string; link: string; created_at: string };
type Prof = { id: string; email: string | null; full_name: string | null; notify_mode: string | null; last_notified_at: string | null };

function berlin(d: Date) {
  return {
    date: d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
    hour: Number(new Intl.DateTimeFormat("de-DE", { hour: "2-digit", hour12: false, timeZone: "Europe/Berlin" }).format(d)),
  };
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!mailConfigured()) {
    return NextResponse.json({ error: "RESEND_API_KEY fehlt" }, { status: 500 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = berlin(now);

  const { data: pendingData, error } = await admin
    .from("notifications")
    .select("id, user_id, project_id, text, link, created_at")
    .is("sent_at", null)
    .order("created_at")
    .limit(3000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pending = (pendingData ?? []) as Pending[];
  const result = { pending: pending.length, sent: 0, waiting: 0, skipped: 0, errors: [] as string[] };

  if (pending.length) {
    const userIds = [...new Set(pending.map((p) => p.user_id))];
    const projectIds = [...new Set(pending.map((p) => p.project_id).filter((x): x is string => !!x))];

    const [{ data: profData }, { data: projData }] = await Promise.all([
      admin.from("profiles").select("id, email, full_name, notify_mode, last_notified_at").in("id", userIds),
      projectIds.length
        ? admin.from("projects").select("id, name, number").in("id", projectIds)
        : Promise.resolve({ data: [] as { id: string; name: string; number: string | null }[] }),
    ]);

    const profiles = new Map<string, Prof>(((profData ?? []) as Prof[]).map((p): [string, Prof] => [p.id, p]));
    const projects = new Map<string, string>(
      ((projData ?? []) as { id: string; name: string; number: string | null }[]).map((p): [string, string] => [
        p.id,
        p.number ? `${p.name} (${p.number})` : p.name,
      ]),
    );

    for (const userId of userIds) {
      const items = pending.filter((p) => p.user_id === userId);
      const ids = items.map((i) => i.id);
      const prof = profiles.get(userId);
      const mode = prof?.notify_mode ?? "sofort";

      if (!prof?.email || mode === "aus") {
        await admin.from("notifications").update({ sent_at: nowIso }).in("id", ids);
        result.skipped++;
        continue;
      }

      const last = prof.last_notified_at ? new Date(prof.last_notified_at) : null;
      if (mode === "sofort" && last && now.getTime() - last.getTime() < BUNDLE_MINUTES * 60_000) {
        result.waiting++;
        continue;
      }
      if (mode === "taeglich" && (today.hour < DAILY_HOUR || (last && berlin(last).date === today.date))) {
        result.waiting++;
        continue;
      }

      const digestItems: DigestItem[] = items.map((i) => ({
        project: (i.project_id && projects.get(i.project_id)) || "Bauportal",
        text: i.text,
        link: i.link,
        at: i.created_at,
      }));
      const mail = buildDigest(prof.full_name, digestItems, mode === "taeglich");
      const res = await sendMail({ to: prof.email, ...mail });

      if (res.ok) {
        await admin.from("notifications").update({ sent_at: nowIso }).in("id", ids);
        await admin.from("profiles").update({ last_notified_at: nowIso }).eq("id", userId);
        result.sent++;
      } else {
        result.errors.push(`${prof.email}: ${res.error}`);
      }
    }
  }

  // Aufräumen: versandte Vormerkungen nach 60 Tagen löschen
  const cutoff = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  await admin.from("notifications").delete().lt("sent_at", cutoff);

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
