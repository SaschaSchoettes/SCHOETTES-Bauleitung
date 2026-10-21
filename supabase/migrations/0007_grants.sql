-- =====================================================================
-- Schöttes Bauportal – Explizite Tabellenrechte (Supabase-Änderung ab 30.10.2026)
-- Neue Tabellen in "public" erhalten ab diesem Datum keine automatischen
-- Rechte mehr. Dieses Skript vergibt sie ausdrücklich – nötig vor allem bei
-- einem Neuaufbau. Für das laufende Projekt unschädlich (wiederholbar).
--
-- Bewusst KEINE Rechte für "anon" (nicht angemeldete Besucher).
-- Bewusst eingeschränkt: Nachrichten/Kommentare unveränderlich,
-- Profile nur Name/Firma/Telefon änderbar.
--
-- Ausführen: nach 0001–0006
-- =====================================================================

-- Server (Service-Role) darf alles
grant select, insert, update, delete on
  public.profiles, public.projects, public.project_members, public.project_contacts,
  public.schedule_items, public.schedule_comments, public.project_files, public.doc_folders,
  public.messages, public.message_reads, public.topics, public.topic_comments,
  public.site_visits, public.site_visit_photos, public.project_steps, public.step_comments
to service_role;

-- Angemeldete Nutzer: volle Rechte (Einschränkung über Row Level Security)
grant select, insert, update, delete on
  public.projects, public.project_members, public.project_contacts,
  public.schedule_items, public.project_files, public.doc_folders,
  public.topics, public.site_visits, public.site_visit_photos, public.project_steps
to authenticated;

-- Unveränderliche Einträge: nur lesen und anlegen
grant select, insert on
  public.messages, public.message_reads, public.topic_comments,
  public.schedule_comments, public.step_comments
to authenticated;
revoke update, delete on
  public.messages, public.message_reads, public.topic_comments,
  public.schedule_comments, public.step_comments
from authenticated, anon;

-- Profile: lesen; ändern nur Name, Firma, Telefon (nicht is_admin)
grant select on public.profiles to authenticated;
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (full_name, company, phone) on public.profiles to authenticated;

-- Funktion für Terminbestätigung
grant execute on function public.confirm_schedule_item(uuid) to authenticated;
