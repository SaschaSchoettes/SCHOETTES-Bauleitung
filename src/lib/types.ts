export type Role = "bauleitung" | "berater" | "auftraggeber" | "gewerk";

export const ROLE_LABELS: Record<Role, string> = {
  bauleitung: "Bauleitung",
  berater: "Berater",
  auftraggeber: "Auftraggeber",
  gewerk: "Gewerk",
};

export const ROLES: Role[] = ["bauleitung", "berater", "auftraggeber", "gewerk"];

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

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Schöttes Bauportal";
