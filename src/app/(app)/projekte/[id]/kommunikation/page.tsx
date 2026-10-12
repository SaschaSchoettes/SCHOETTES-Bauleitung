import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getMembers, getUnread, memberName } from "@/lib/data";
import { sendMessage } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ScrollToBottom } from "@/components/ScrollToBottom";
import { MANAGER_ROLES, ROLE_LABELS, formatDateTime, type Member, type Message } from "@/lib/types";

type Thread = { key: string; title: string; subtitle: string };

export default async function KommunikationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kanal?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, canManage } = await requireProject(id);

  const members = await getMembers(supabase, id);
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const managers = members.filter((m) => MANAGER_ROLES.includes(m.role));

  // Kanäle
  const threads: Thread[] = [{ key: "projekt", title: "Alle Beteiligten", subtitle: "Projektkanal" }];
  if (canManage) {
    for (const m of members) {
      if (m.user_id === user.id || MANAGER_ROLES.includes(m.role)) continue;
      threads.push({
        key: m.user_id,
        title: memberName(m),
        subtitle: [ROLE_LABELS[m.role], m.trade].filter(Boolean).join(" · "),
      });
    }
  } else {
    threads.push({ key: user.id, title: "Bauleitung", subtitle: "Ihr direkter Kanal" });
  }

  const active = threads.find((t) => t.key === sp.kanal) ?? threads[0];
  const threadUserId = active.key === "projekt" ? null : active.key;

  // Nachrichten des aktiven Kanals
  const baseQuery = supabase.from("messages").select("*").eq("project_id", id);
  const filtered = threadUserId
    ? baseQuery.eq("thread_user_id", threadUserId)
    : baseQuery.is("thread_user_id", null);
  const { data: msgData } = await filtered.order("created_at", { ascending: true }).limit(300);
  const messages = (msgData ?? []) as Message[];

  // Als gelesen markieren
  const toMark = messages.filter((m) => m.author_id !== user.id).map((m) => ({ message_id: m.id, user_id: user.id }));
  if (toMark.length) {
    await supabase.from("message_reads").upsert(toMark, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  }

  // Lesebestätigungen laden
  const readsByMsg = new Map<string, { user_id: string; read_at: string }[]>();
  if (messages.length) {
    const { data: reads } = await supabase
      .from("message_reads")
      .select("message_id, user_id, read_at")
      .in(
        "message_id",
        messages.map((m) => m.id),
      );
    for (const r of (reads ?? []) as { message_id: string; user_id: string; read_at: string }[]) {
      if (!readsByMsg.has(r.message_id)) readsByMsg.set(r.message_id, []);
      readsByMsg.get(r.message_id)!.push(r);
    }
  }

  // Empfänger je Kanal
  const recipientsFor = (m: Message): Member[] => {
    const pool = threadUserId
      ? members.filter((x) => x.user_id === threadUserId || MANAGER_ROLES.includes(x.role))
      : members;
    return pool.filter((x) => x.user_id !== m.author_id);
  };

  const { byThread } = await getUnread(supabase, id, user.id);
  const send = sendMessage.bind(null, id);
  const base = `/projekte/${id}/kommunikation`;

  return (
    <div>
      <AutoRefresh seconds={20} />
      <h2 className="text-xl font-semibold">Kommunikation</h2>
      <p className="mt-1 text-sm text-slate-500">
        Projektkanal für alle Beteiligten und direkte Kanäle zur Bauleitung
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Kanalliste */}
        <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:overflow-visible md:px-0">
          {threads.map((t) => {
            const unread = byThread.get(t.key) ?? 0;
            const isActive = t.key === active.key;
            return (
              <Link
                key={t.key}
                href={`${base}?kanal=${t.key}`}
                className={`card flex min-w-[180px] items-center justify-between gap-2 px-3 py-2.5 md:min-w-0 ${
                  isActive ? "border-brand bg-brand-soft" : "hover:border-brand"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.title}</span>
                  <span className="block truncate text-xs text-slate-500">{t.subtitle}</span>
                </span>
                {unread > 0 && !isActive && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">{unread}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Verlauf */}
        <section className="card flex min-h-[50vh] flex-col">
          <header className="border-b border-slate-100 px-4 py-3">
            <div className="font-semibold">{active.title}</div>
            <div className="text-xs text-slate-500">
              {threadUserId
                ? `Sichtbar für ${active.title} und ${managers.length ? managers.map(memberName).join(", ") : "die Bauleitung"}`
                : `Sichtbar für alle ${members.length} Beteiligten mit Zugang`}
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" style={{ maxHeight: "60vh" }}>
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">Noch keine Nachrichten.</p>
            )}
            {messages.map((m) => {
              const mine = m.author_id === user.id;
              const author = byId.get(m.author_id);
              const reads = readsByMsg.get(m.id) ?? [];
              const recipients = recipientsFor(m);
              const readIds = new Set(reads.map((r) => r.user_id));
              const showReceipts = mine || canManage;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${mine ? "bg-brand text-white" : "bg-slate-100"}`}>
                    {!mine && (
                      <div className="mb-0.5 text-xs font-semibold text-slate-600">
                        {author ? memberName(author) : "Ehemaliger Beteiligter"}
                        {author && <span className="font-normal"> · {author.trade || ROLE_LABELS[author.role]}</span>}
                      </div>
                    )}
                    <div className="text-[0.95rem] break-words whitespace-pre-wrap">{m.body}</div>
                    <div className={`mt-1 text-[0.7rem] ${mine ? "text-white/70" : "text-slate-500"}`}>
                      {formatDateTime(m.created_at)}
                      {showReceipts && recipients.length > 0 && (
                        <details className="inline">
                          <summary className="ml-2 inline cursor-pointer list-none underline decoration-dotted">
                            gelesen {recipients.filter((r) => readIds.has(r.user_id)).length}/{recipients.length}
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {recipients.map((r) => {
                              const rd = reads.find((x) => x.user_id === r.user_id);
                              return (
                                <li key={r.user_id}>
                                  {rd ? "✓" : "○"} {memberName(r)}
                                  {rd ? ` – ${formatDateTime(rd.read_at)}` : " – ungelesen"}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <ScrollToBottom dep={`${active.key}-${messages.length}`} />
          </div>

          <form action={send} className="border-t border-slate-100 p-3">
            <input type="hidden" name="kanal" value={active.key} />
            <Notice error={sp.fehler} />
            <textarea
              name="body"
              required
              rows={3}
              maxLength={5000}
              className="input mt-1"
              placeholder={threadUserId ? `Nachricht an ${active.title} …` : "Nachricht an alle Beteiligten …"}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Nachrichten können nicht gelöscht oder geändert werden.</span>
              <SubmitButton pendingText="Sende …">Senden</SubmitButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
