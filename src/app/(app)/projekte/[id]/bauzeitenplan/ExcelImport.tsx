"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseScheduleTable, type ImportResult } from "@/lib/scheduleImport";
import { importSchedule } from "./actions";

function de(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function ExcelImport({ projectId, hasItems }: { projectId: string; hasItems: boolean }) {
  const router = useRouter();
  const [table, setTable] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setMsg({});
    setResult(null);
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
      setTable(rows);
      setFileName(file.name);
      setResult(parseScheduleTable(rows, year));
    } catch {
      setMsg({ error: "Die Datei konnte nicht gelesen werden. Bitte eine .xlsx-, .xls- oder .csv-Datei wählen." });
    }
  }

  function changeYear(y: number) {
    setYear(y);
    if (table) setResult(parseScheduleTable(table, y));
  }

  async function doImport() {
    if (!result?.rows.length) return;
    if (replace && !confirm("Alle vorhandenen Vorgänge inkl. Notizen und Bestätigungen werden gelöscht. Fortfahren?")) return;
    setBusy(true);
    const res = await importSchedule(
      projectId,
      result.rows.map((r) => ({ title: r.title, trade: r.trade, start_date: r.start_date, end_date: r.end_date })),
      replace,
    );
    setBusy(false);
    if (res.error) return setMsg({ error: res.error });
    setMsg({ ok: `${res.count} Vorgänge importiert.` });
    setTable(null);
    setResult(null);
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <label className="label">Excel-Datei (.xlsx, .xls, .csv)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="input" />
        </div>
        <div>
          <label className="label">Jahr der KW-Angaben</label>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => changeYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
            className="input"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Erkannt werden Spalten wie <b>Maßnahme/Vorgang</b>, <b>Start</b> (Kalenderwoche oder Datum),{" "}
        <b>Dauer in Wochen/Tagen</b> oder <b>Ende</b>, optional <b>Gewerk</b>. Bei Kalenderwochen gilt Mo–Fr.
      </p>

      {result?.error && <p className="notice notice-error">{result.error}</p>}

      {result && result.rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            Vorschau „{fileName}“: {result.rows.length} Vorgänge
          </p>
          <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Vorgang</th>
                  <th className="px-3 py-2 whitespace-nowrap">Beginn</th>
                  <th className="px-3 py-2 whitespace-nowrap">Ende</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Quelle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((r) => (
                  <tr key={r.row}>
                    <td className="px-3 py-1.5">
                      {r.title}
                      {r.trade && <span className="text-slate-500"> · {r.trade}</span>}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{de(r.start_date)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{de(r.end_date)}</td>
                    <td className="hidden px-3 py-1.5 text-xs whitespace-nowrap text-slate-500 sm:table-cell">
                      Z. {r.row}: {r.info}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.skipped.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">{result.skipped.length} Zeilen übersprungen</summary>
              <ul className="mt-1 list-disc pl-5">
                {result.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          {hasItems && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4" />
              Vorhandene Vorgänge ersetzen (sonst werden die neuen ergänzt)
            </label>
          )}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={doImport}>
            {busy ? "Importiere …" : `${result.rows.length} Vorgänge übernehmen`}
          </button>
        </div>
      )}

      {msg.error && <p className="notice notice-error">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok">{msg.ok}</p>}
    </div>
  );
}
