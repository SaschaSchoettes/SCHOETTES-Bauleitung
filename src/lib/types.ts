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
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  kind: "plan" | "dokument";
  title: string;
  category: string | null;
  plan_number: string | null;
  plan_index: string | null;
  plan_date: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: "alle" | "intern";
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
