/** E-Mail-Versand über Resend (https://resend.com) – nur serverseitig verwenden. */

export const APP_URL = (process.env.APP_URL || "https://portal.schoettes.com").replace(/\/+$/, "");
const MAIL_FROM = process.env.MAIL_FROM || "Schöttes Bauportal <portal@schoettes.com>";

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY fehlt in den Umgebungsvariablen." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Versand fehlgeschlagen (${res.status}): ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Versand fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)) };
  }
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type DigestItem = { project: string; text: string; link: string; at: string };

/** Sammel-Mail mit allen Neuigkeiten, gruppiert nach Projekt */
export function buildDigest(name: string | null, items: DigestItem[], daily: boolean) {
  const byProject = new Map<string, DigestItem[]>();
  for (const it of items) {
    if (!byProject.has(it.project)) byProject.set(it.project, []);
    byProject.get(it.project)!.push(it);
  }

  const subject = daily
    ? `Bauportal – Tagesübersicht (${items.length} ${items.length === 1 ? "Neuigkeit" : "Neuigkeiten"})`
    : items.length === 1
      ? `Bauportal: ${items[0].text.slice(0, 80)}${items[0].text.length > 80 ? " …" : ""}`
      : `Bauportal: ${items.length} Neuigkeiten`;

  const greeting = name ? `Guten Tag ${name},` : "Guten Tag,";
  const intro = daily ? "hier die Neuigkeiten seit gestern im Schöttes Bauportal:" : "es gibt Neues im Schöttes Bauportal:";

  let html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a202c;max-width:600px">` +
    `<p>${esc(greeting)}</p><p>${esc(intro)}</p>`;
  let text = `${greeting}\n\n${intro}\n`;

  for (const [project, list] of byProject) {
    html += `<h3 style="margin:20px 0 6px;color:#283b5c;font-size:16px">${esc(project)}</h3><ul style="padding-left:18px;margin:0">`;
    text += `\n${project}\n`;
    for (const it of list) {
      const url = APP_URL + it.link;
      html += `<li style="margin:6px 0"><a href="${esc(url)}" style="color:#026c82">${esc(it.text)}</a></li>`;
      text += `- ${it.text}\n  ${url}\n`;
    }
    html += `</ul>`;
  }

  const settings = `${APP_URL}/einstellungen`;
  html +=
    `<p style="margin-top:24px"><a href="${esc(APP_URL)}" style="background:#283b5c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Bauportal öffnen</a></p>` +
    `<p style="font-size:12px;color:#64748b;margin-top:24px">Diese Nachricht wurde automatisch versandt. ` +
    `Benachrichtigungen ändern oder abschalten: <a href="${esc(settings)}" style="color:#64748b">${esc(settings)}</a></p></div>`;
  text += `\nBauportal öffnen: ${APP_URL}\n\nBenachrichtigungen ändern oder abschalten: ${settings}\n`;

  return { subject, html, text };
}
