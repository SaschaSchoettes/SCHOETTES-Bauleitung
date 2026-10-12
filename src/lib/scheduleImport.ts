/**
 * Import eines Bauzeitenplans aus einer Tabelle (Excel/CSV).
 * Unterstützt u. a. das Format "Maßnahme | Start (KW) | Dauer in Wochen"
 * sowie "Vorgang | Gewerk | Beginn (Datum) | Ende (Datum)".
 */

export type ImportRow = {
  title: string;
  trade: string | null;
  start_date: string;
  end_date: string;
  row: number; // Zeilennummer in der Tabelle (1-basiert)
  info: string; // z. B. "KW 41, 2 Wochen"
};

export type ImportResult = { rows: ImportRow[]; skipped: string[]; error?: string };

const DAY = 86_400_000;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Montag der ISO-Kalenderwoche */
export function mondayOfIsoWeek(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // 0 = Montag
  const week1Monday = new Date(jan4.getTime() - jan4Dow * DAY);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY);
}

export function isoWeekOf(dateIso: string): { week: number; year: number } {
  const d = new Date(dateIso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d.getTime() + (3 - dow) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - mondayOfIsoWeek(1, year).getTime()) / (7 * DAY)) + 1;
  return { week, year };
}

function excelSerialToDate(n: number): Date {
  // Excel (1900-System): Tag 25569 = 1970-01-01
  return new Date(Math.round((n - 25569) * DAY));
}

function norm(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

type Parsed = { kind: "kw"; week: number } | { kind: "date"; date: Date } | null;

function parseWhen(v: unknown): Parsed {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return { kind: "date", date: new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())) };
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v >= 1 && v <= 53 && Number.isInteger(v)) return { kind: "kw", week: v };
    if (v > 20000 && v < 80000) return { kind: "date", date: excelSerialToDate(v) };
    return null;
  }
  const s = norm(v);
  const kw = s.match(/^(?:kw|kalenderwoche)?\s*\.?\s*(\d{1,2})$/i);
  if (kw && +kw[1] >= 1 && +kw[1] <= 53) return { kind: "kw", week: +kw[1] };
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (de) {
    const y = +de[3] < 100 ? 2000 + +de[3] : +de[3];
    return { kind: "date", date: new Date(Date.UTC(y, +de[2] - 1, +de[1])) };
  }
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return { kind: "date", date: new Date(Date.UTC(+isoM[1], +isoM[2] - 1, +isoM[3])) };
  return null;
}

const NAME_RX = /(maßnahme|massnahme|vorgang|bezeichnung|tätigkeit|leistung|arbeiten|aktivität|position)/i;
const TRADE_RX = /^(gewerk|firma|unternehmen|ausführende?)$/i;
const START_RX = /(start|beginn|anfang|^von$|^ab$)/i;
const END_RX = /(ende|^bis$|fertig)/i;
const DUR_RX = /(dauer)/i;
const PLACEHOLDER_RX = /^(aktivität|vorgang|position)\s*\d+$/i;

export function parseScheduleTable(table: unknown[][], year: number): ImportResult {
  const skipped: string[] = [];

  // Kopfzeile suchen (in den ersten 15 Zeilen)
  let headerIdx = -1;
  for (let r = 0; r < Math.min(table.length, 15); r++) {
    const cells = (table[r] ?? []).map(norm);
    if (cells.some((c) => NAME_RX.test(c)) && cells.some((c) => START_RX.test(c))) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      rows: [],
      skipped,
      error:
        "Keine Kopfzeile gefunden. Erwartet werden Spalten wie „Maßnahme/Vorgang“ und „Start/Beginn“ " +
        "sowie „Dauer“ oder „Ende“.",
    };
  }

  const header = (table[headerIdx] ?? []).map(norm);
  const find = (rx: RegExp, exclude: number[] = []) =>
    header.findIndex((c, i) => !exclude.includes(i) && rx.test(c));

  const nameCol = find(NAME_RX);
  const startCol = find(START_RX, [nameCol]);
  const endCol = find(END_RX, [nameCol, startCol]);
  const durCol = find(DUR_RX, [nameCol, startCol]);
  const tradeCol = find(TRADE_RX, [nameCol, startCol, endCol, durCol]);
  const durInDays = durCol >= 0 && /tag/i.test(header[durCol]);

  const rows: ImportRow[] = [];
  let firstWeek: number | null = null;

  for (let r = headerIdx + 1; r < table.length; r++) {
    const line = table[r] ?? [];
    const title = norm(line[nameCol]);
    if (!title) continue;
    if (PLACEHOLDER_RX.test(title)) {
      skipped.push(`Zeile ${r + 1}: „${title}“ (Platzhalter)`);
      continue;
    }

    const start = parseWhen(line[startCol]);
    if (!start) {
      skipped.push(`Zeile ${r + 1}: „${title}“ (kein Start erkennbar)`);
      continue;
    }

    let startDate: Date;
    let info: string;
    let startIsKw = false;
    if (start.kind === "kw") {
      if (firstWeek === null) firstWeek = start.week;
      // Jahreswechsel: deutlich kleinere KW als die erste → Folgejahr
      const y = start.week < firstWeek - 20 ? year + 1 : year;
      startDate = mondayOfIsoWeek(start.week, y);
      info = `KW ${start.week}/${y}`;
      startIsKw = true;
    } else {
      startDate = start.date;
      info = `ab ${startDate.toISOString().slice(0, 10)}`;
    }

    let endDate: Date | null = null;
    const end = endCol >= 0 ? parseWhen(line[endCol]) : null;
    if (end?.kind === "date") endDate = end.date;
    if (end?.kind === "kw") {
      const y = firstWeek !== null && end.week < firstWeek - 20 ? year + 1 : year;
      endDate = new Date(mondayOfIsoWeek(end.week, y).getTime() + 4 * DAY); // Freitag
    }

    if (!endDate) {
      const durRaw = durCol >= 0 ? Number(String(line[durCol] ?? "").replace(",", ".")) : NaN;
      const dur = Number.isFinite(durRaw) && durRaw > 0 ? durRaw : startIsKw ? 1 : 1;
      if (durInDays) {
        endDate = new Date(startDate.getTime() + (Math.ceil(dur) - 1) * DAY);
        info += `, ${dur} Tag(e)`;
      } else if (startIsKw || durCol >= 0) {
        // Wochen: Montag + (n-1) Wochen + 4 Tage = Freitag der letzten Woche
        endDate = new Date(startDate.getTime() + ((Math.ceil(dur) - 1) * 7 + 4) * DAY);
        info += `, ${dur} Woche(n)`;
      } else {
        endDate = startDate;
      }
    }

    if (endDate.getTime() < startDate.getTime()) {
      skipped.push(`Zeile ${r + 1}: „${title}“ (Ende vor Beginn)`);
      continue;
    }

    rows.push({
      title: title.slice(0, 200),
      trade: tradeCol >= 0 ? norm(line[tradeCol]) || null : null,
      start_date: iso(startDate),
      end_date: iso(endDate),
      row: r + 1,
      info,
    });
  }

  if (rows.length === 0 && !skipped.length) {
    return { rows, skipped, error: "Keine Vorgänge gefunden." };
  }
  return { rows, skipped };
}
