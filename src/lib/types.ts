export type Role = "bauleitung" | "baubegleitung" | "berater" | "auftraggeber" | "gewerk";

export const ROLE_LABELS: Record<Role, string> = {
  bauleitung: "Bauleitung",
  baubegleitung: "Baubegleitung",
  berater: "Berater",
  auftraggeber: "Auftraggeber",
  gewerk: "Gewerk",
};

export const ROLES: Role[] = ["bauleitung", "baubegleitung", "berater", "auftraggeber", "gewerk"];

/** Rollen, die Inhalte pflegen dürfen */
export const MANAGER_ROLES: Role[] = ["bauleitung", "baubegleitung"];

export type ScheduleStatus = "geplant" | "laeuft" | "erledigt";

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  geplant: "Geplant",
  laeuft: "Läuft",
  erledigt: "Erledigt",
};

export interface ScheduleItem {
  id: string;
  project_id: string;
  title: string;
  trade: string | null;
  assignee_id: string | null;
  start_date: string;
  end_date: string;
  status: ScheduleStatus;
  note: string | null;
  buffer_days: number;
  sort_order: number;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
}

export interface ScheduleComment {
  id: string;
  item_id: string;
  project_id: string;
  author_id: string;
  body: string;
  is_problem: boolean;
  created_at: string;
}

export type TopicStatus = "offen" | "in_klaerung" | "festgelegt" | "erledigt";

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  offen: "Offen",
  in_klaerung: "In Klärung",
  festgelegt: "Festgelegt",
  erledigt: "Erledigt",
};

export interface Topic {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  trade: string | null;
  responsible_id: string | null;
  due_date: string | null;
  status: TopicStatus;
  decision: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TopicComment {
  id: string;
  topic_id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export type StepStatus = "offen" | "aktuell" | "erledigt";

export interface ProjectStep {
  id: string;
  project_id: string;
  position: number;
  title: string;
  ball_at: string | null;
  note: string | null;
  status: StepStatus;
  status_since: string;
  done_at: string | null;
  created_at: string;
}

export interface StepComment {
  id: string;
  step_id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

/** Typische Abfolge einer Sanierung – als Startpunkt für neue Projekte */
export const STEP_TEMPLATE: { title: string }[] = [
  { title: "Bestandsaufnahme" },
  { title: "Energieberatung / Sanierungskonzept" },
  { title: "Festlegungen mit Bauherr (Umfang, Budget)" },
  { title: "Statiker beauftragen" },
  { title: "Statik / Positionsplanung" },
  { title: "Ausführungsplanung" },
  { title: "Genehmigung / Förderantrag" },
  { title: "Angebote einholen" },
  { title: "Vergabe / Beauftragung Gewerke" },
  { title: "Ausführung" },
  { title: "Abnahme" },
  { title: "Schlussrechnungen / Dokumentation" },
];

export interface SiteVisit {
  id: string;
  project_id: string;
  visit_date: string;
  title: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
}

export type Visibility = "alle" | "bauherr" | "gewerk" | "intern";

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  alle: "Alle Beteiligten",
  bauherr: "Auftraggeber + intern",
  gewerk: "Auftraggeber + intern + ein Gewerk",
  intern: "Nur intern",
};

export const DOC_CATEGORIES = [
  "Angebot",
  "Auftrag",
  "Nachtrag",
  "Rechnung",
  "Genehmigung",
  "Gutachten / Nachweis",
  "Sonstiges",
];

export const TRADE_FOLDERS = [
  "Abbruch",
  "Aufzug",
  "Dach",
  "Elektro",
  "Estrich",
  "Fassade / WDVS",
  "Fenster / Türen",
  "Gerüst",
  "Heizung / Sanitär",
  "Lüftung",
  "Maler",
  "Rohbau",
  "Tiefbau",
  "Trockenbau",
  "Zimmerer",
];

export interface DocFolder {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  kind: "plan" | "dokument" | "protokoll";
  title: string;
  category: string | null;
  plan_number: string | null;
  plan_index: string | null;
  plan_date: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: Visibility;
  visible_to: string | null;
  trade: string | null;
  doc_date: string | null;
  folder_id: string | null;
  superseded: boolean;
  superseded_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  thread_user_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
}

export const STORAGE_BUCKET = "projektdateien";

export type ProjectStatus = "aktiv" | "ruhend" | "abgeschlossen";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  aktiv: "Aktiv",
  ruhend: "Ruhend",
  abgeschlossen: "Abgeschlossen",
};

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  is_admin: boolean;
}

export interface Project {
  id: string;
  number: string | null;
  name: string;
  street: string | null;
  zip_city: string | null;
  client_name: string | null;
  measure: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  notes: string | null;
  billing_name: string | null;
  billing_street: string | null;
  billing_zip_city: string | null;
  billing_email: string | null;
  billing_note: string | null;
  created_at: string;
}

export interface Member {
  project_id: string;
  user_id: string;
  role: Role;
  trade: string | null;
  created_at: string;
  profiles: Pick<Profile, "id" | "email" | "full_name" | "company" | "phone"> | null;
}

export interface Contact {
  id: string;
  project_id: string;
  name: string;
  company: string | null;
  trade: string | null;
  function: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  note: string | null;
  created_at: string;
}

export function formatDate(value: string | null): string {
  if (!value) return "–";
  const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

/** Heutiges Datum in Berlin als YYYY-MM-DD */
export function todayBerlin(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Schöttes Bauportal";
