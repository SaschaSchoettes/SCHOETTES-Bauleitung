import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { updateProject } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/types";

export default async function StammdatenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { project: p, canManage } = await requireProject(id);
  const ro = !canManage;
  const action = updateProject.bind(null, id);

  const field = (
    name: string,
    label: string,
    value: string | null,
    opts: { type?: string; wide?: boolean; required?: boolean } = {},
  ) => (
    <div className={opts.wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={opts.type ?? "text"}
        defaultValue={value ?? ""}
        readOnly={ro}
        required={opts.required}
        className="input"
      />
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-semibold">Stammdaten</h2>
      <p className="mt-1 text-sm text-slate-500">
        Projektdaten{ro ? " – nur Ansicht, Änderungen über die Bauleitung" : ""}
      </p>

      <form action={action} className="card mt-5 grid gap-4 p-5 sm:grid-cols-2">
        {field("number", "Projektnummer", p.number)}
        {field("name", "Bezeichnung", p.name, { required: true })}
        {field("street", "Straße, Hausnummer", p.street)}
        {field("zip_city", "PLZ, Ort", p.zip_city)}
        {field("client_name", "Auftraggeber / Bauherr", p.client_name, { wide: true })}

        <h3 className="mt-2 font-semibold text-slate-600 sm:col-span-2">Rechnungsadresse</h3>
        {field("billing_name", "Rechnungsempfänger", p.billing_name, { wide: true })}
        {field("billing_street", "Straße, Hausnummer", p.billing_street)}
        {field("billing_zip_city", "PLZ, Ort", p.billing_zip_city)}
        {field("billing_email", "E-Mail für Rechnungen", p.billing_email, { type: "email" })}
        {field("billing_note", "Hinweis (z. B. Projektnr. auf Rechnung angeben)", p.billing_note)}

        <h3 className="mt-2 font-semibold text-slate-600 sm:col-span-2">Maßnahme &amp; Termine</h3>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="measure">
            Maßnahme
          </label>
          <textarea
            id="measure"
            name="measure"
            rows={3}
            defaultValue={p.measure ?? ""}
            readOnly={ro}
            className="input"
          />
        </div>

        {field("start_date", "Baubeginn", p.start_date, { type: "date" })}
        {field("end_date", "Fertigstellung (geplant)", p.end_date, { type: "date" })}

        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={p.status} disabled={ro} className="input">
            {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Hinweise für alle Beteiligten (z. B. Zufahrt, Schlüssel, Arbeitszeiten)
          </label>
          <textarea id="notes" name="notes" rows={4} defaultValue={p.notes ?? ""} readOnly={ro} className="input" />
        </div>

        {canManage && (
          <div className="space-y-3 sm:col-span-2">
            <Notice ok={ok} error={fehler} />
            <SubmitButton>Speichern</SubmitButton>
          </div>
        )}
      </form>

      {canManage && (
        <section className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 className="font-semibold">Zugänge &amp; Rollen</h3>
            <p className="text-sm text-slate-500">Wer sich anmelden kann und was er sieht</p>
          </div>
          <Link href={`/projekte/${id}/zugaenge`} className="btn">
            Zugänge verwalten →
          </Link>
        </section>
      )}
    </div>
  );
}
