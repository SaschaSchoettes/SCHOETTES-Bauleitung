-- =====================================================================
-- Schöttes Bauportal – Schritt 8: E-Mail-Benachrichtigungen
-- Ereignisse werden automatisch vorgemerkt; der Versand erfolgt gebündelt
-- über /api/notify (Zeitplan siehe supabase/benachrichtigung_zeitplan.sql).
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001–0007 wurden ausgeführt)
-- =====================================================================

-- Einstellung je Nutzer: sofort (gebündelt) / täglich / aus
alter table public.profiles add column if not exists notify_mode text not null default 'sofort';
alter table public.profiles drop constraint if exists profiles_notify_mode_check;
alter table public.profiles add constraint profiles_notify_mode_check
  check (notify_mode in ('sofort', 'taeglich', 'aus'));
alter table public.profiles add column if not exists last_notified_at timestamptz;

grant update (notify_mode) on public.profiles to authenticated;

-- Vorgemerkte Benachrichtigungen (nur für den Server lesbar)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  kind        text not null,
  text        text not null,
  link        text not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists notifications_pending_idx on public.notifications (user_id) where sent_at is null;

alter table public.notifications enable row level security;   -- keine Richtlinien = nur Service-Role
revoke all on public.notifications from authenticated, anon;
grant select, insert, update, delete on public.notifications to service_role;

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------
create or replace function public.notify_add(p_user uuid, p_project uuid, p_kind text, p_text text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user is not distinct from auth.uid() then
    return;  -- niemand benachrichtigt sich selbst
  end if;
  insert into public.notifications (user_id, project_id, kind, text, link)
  values (p_user, p_project, p_kind, left(p_text, 400), p_link);
end;
$$;

create or replace function public.display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), email, 'Unbekannt') from public.profiles where id = p_user;
$$;

revoke all on function public.notify_add(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Nachrichten
-- ---------------------------------------------------------------------
create or replace function public.trg_notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_author text := public.display_name(new.author_id);
  v_base text := '/projekte/' || new.project_id || '/kommunikation?kanal=';
begin
  if new.thread_user_id is null then
    for r in select user_id from public.project_members
              where project_id = new.project_id and user_id <> new.author_id loop
      perform public.notify_add(r.user_id, new.project_id, 'nachricht',
        'Nachricht an alle von ' || v_author || ': ' || new.body, v_base || 'projekt');
    end loop;
  else
    -- Beteiligter selbst (falls er nicht der Absender ist)
    if new.thread_user_id <> new.author_id then
      perform public.notify_add(new.thread_user_id, new.project_id, 'nachricht',
        'Nachricht von ' || v_author || ': ' || new.body, v_base || new.thread_user_id);
    end if;
    -- Bauleitung / Baubegleitung
    for r in select user_id from public.project_members
              where project_id = new.project_id
                and role::text in ('bauleitung', 'baubegleitung')
                and user_id <> new.author_id
                and user_id <> new.thread_user_id loop
      perform public.notify_add(r.user_id, new.project_id, 'nachricht',
        'Nachricht von ' || v_author || ': ' || new.body, v_base || new.thread_user_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages
  for each row execute function public.trg_notify_message();

-- ---------------------------------------------------------------------
-- Dokumente, Pläne, Protokolle (nur an Beteiligte, die die Datei sehen dürfen)
-- ---------------------------------------------------------------------
create or replace function public.trg_notify_file()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_label text := case new.kind when 'plan' then 'Neuer Plan'
                                 when 'protokoll' then 'Neues Protokoll'
                                 else 'Neues Dokument' end;
  v_link text := '/projekte/' || new.project_id ||
                 case when new.kind = 'protokoll' then '/protokolle'
                      when new.folder_id is not null then '/dokumente?ordner=' || new.folder_id
                      else '/dokumente' end;
  v_text text := v_label || ': ' || new.title ||
                 coalesce(' (Index ' || new.plan_index || ')', '') ||
                 coalesce(' – von ' || public.display_name(new.uploaded_by), '');
begin
  for r in select user_id, role::text as role from public.project_members
            where project_id = new.project_id
              and user_id is distinct from new.uploaded_by loop
    if new.visibility = 'alle'
       or r.role in ('bauleitung', 'baubegleitung', 'berater')
       or (new.visibility in ('bauherr', 'gewerk') and r.role = 'auftraggeber')
       or (new.visibility = 'gewerk' and r.user_id = new.visible_to) then
      perform public.notify_add(r.user_id, new.project_id, 'dokument', v_text, v_link);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_file on public.project_files;
create trigger notify_file after insert on public.project_files
  for each row execute function public.trg_notify_file();

-- ---------------------------------------------------------------------
-- Ortstermine
-- ---------------------------------------------------------------------
create or replace function public.trg_notify_visit()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from public.project_members
            where project_id = new.project_id and user_id is distinct from new.created_by loop
    perform public.notify_add(r.user_id, new.project_id, 'protokoll',
      'Neuer Ortstermin vom ' || to_char(new.visit_date, 'DD.MM.YYYY') || coalesce(': ' || new.title, ''),
      '/projekte/' || new.project_id || '/protokolle');
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_visit on public.site_visits;
create trigger notify_visit after insert on public.site_visits
  for each row execute function public.trg_notify_visit();

-- ---------------------------------------------------------------------
-- Terminproblem (Notiz im Bauzeitenplan) → Bauleitung + Auftraggeber
-- ---------------------------------------------------------------------
create or replace function public.trg_notify_schedule_problem()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_title text;
begin
  if not new.is_problem then
    return new;
  end if;
  select title into v_title from public.schedule_items where id = new.item_id;
  for r in select user_id from public.project_members
            where project_id = new.project_id
              and role::text in ('bauleitung', 'baubegleitung', 'auftraggeber')
              and user_id <> new.author_id loop
    perform public.notify_add(r.user_id, new.project_id, 'termin',
      '⚠ Terminproblem bei „' || coalesce(v_title, 'Vorgang') || '“ – ' ||
      public.display_name(new.author_id) || ': ' || new.body,
      '/projekte/' || new.project_id || '/bauzeitenplan?offen=' || new.item_id || '#v-' || new.item_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_schedule_problem on public.schedule_comments;
create trigger notify_schedule_problem after insert on public.schedule_comments
  for each row execute function public.trg_notify_schedule_problem();

-- ---------------------------------------------------------------------
-- Termin zum Bestätigen → zuständiger Beteiligter
-- ---------------------------------------------------------------------
create or replace function public.trg_notify_schedule_confirm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and new.confirmed_at is null and new.status <> 'erledigt'
     and (tg_op = 'INSERT'
          or old.assignee_id is distinct from new.assignee_id
          or old.start_date <> new.start_date
          or old.end_date <> new.end_date) then
    perform public.notify_add(new.assignee_id, new.project_id, 'termin',
      'Bitte Termin bestätigen: ' || new.title || ' (' ||
      to_char(new.start_date, 'DD.MM.') || '–' || to_char(new.end_date, 'DD.MM.YYYY') || ')',
      '/projekte/' || new.project_id || '/bauzeitenplan?offen=' || new.id || '#v-' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_schedule_confirm on public.schedule_items;
create trigger notify_schedule_confirm after insert or update on public.schedule_items
  for each row execute function public.trg_notify_schedule_confirm();
