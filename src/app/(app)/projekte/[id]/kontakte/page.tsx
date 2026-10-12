import { requireProject } from "@/lib/auth";
import { deleteContact, saveContact } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import type { Contact } from "@/lib/types";

function telHref(n: string) {
  return "tel:" + n.replace(/[^\d+]/g, "");
}

function ContactForm({
  action,
  contact,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  contact?: Contact;
  submitLabel: string;
}) {
  const c = contact;
  const f = (name: keyof Contact, label: string, type = "text", required = false) => (
    <div>
      <label className="label">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={(c?.[name] as string | null) ?? ""}
        className="input"
      />
    </div>
  );
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {c && <input type="hidden" name="contact_id" value={c.id} />}
      {f("name", "Name *", "text", true)}
      {f("company", "Firma")}
      {f("trade", "Gewerk (z. B. Dachdecker)")}
      {f("function", "Funktion (z. B. Polier)")}
      {f("phone", "Telefon", "tel")}
      {f("mobile", "Mobil", "tel")}
      {f("email", "E-Mail", "email")}
      {f("note", "Notiz")}
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export default async function KontaktePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { supabase, canManage } = await requireProject(id);

  const { data } = await supabase
    .from("project_contacts")
    .select("*")
    .eq("project_id", id)
    .order("trade", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const contacts = (data ?? []) as Contact[];

  // Nach Gewerk gruppieren
  const groups = new Map<string, Contact[]>();
  for (const c of contacts) {
    const key = c.trade?.trim() || "Weitere Beteiligte";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const save = saveContact.bind(null, id);
  const del = deleteContact.bind(null, id);

  return (
    <div>
      <h2 className="text-xl font-semibold">Kontakte</h2>
      <p className="mt-1 text-sm text-slate-500">Alle Beteiligten mit Ansprechpartner und Erreichbarkeit</p>

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      {contacts.length === 0 && (
        <div className="card mt-5 p-6 text-center text-slate-500">Noch keine Kontakte erfasst.</div>
      )}

      <div className="mt-5 space-y-6">
        {[...groups.entries()].map(([trade, list]) => (
          <section key={trade}>
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{trade}</h3>
            <div className="space-y-3">
              {list.map((c) => (
                <article key={c.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-sm text-slate-500">
                        {[c.function, c.company].filter(Boolean).join(" · ") || " "}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.mobile && (
                      <a href={telHref(c.mobile)} className="btn btn-sm">
                        📱 {c.mobile}
                      </a>
                    )}
                    {c.phone && (
                      <a href={telHref(c.phone)} className="btn btn-sm">
                        ☎ {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="btn btn-sm max-w-full truncate">
                        ✉ {c.email}
                      </a>
                    )}
                  </div>
                  {c.note && <p className="mt-2 text-sm text-slate-600">{c.note}</p>}

                  {canManage && (
                    <details className="mt-3 border-t border-slate-100 pt-2">
                      <summary className="cursor-pointer text-sm text-slate-500">Bearbeiten</summary>
                      <ContactForm action={save} contact={c} submitLabel="Änderungen speichern" />
                      <form action={del} className="mt-3">
                        <input type="hidden" name="contact_id" value={c.id} />
                        <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                          Kontakt löschen
                        </SubmitButton>
                      </form>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {canManage && (
        <details className="card mt-8 p-5">
          <summary className="cursor-pointer font-semibold">Kontakt hinzufügen</summary>
          <ContactForm action={save} submitLabel="Kontakt anlegen" />
        </details>
      )}
    </div>
  );
}
