-- =====================================================================
-- Schöttes Bauportal – Schritt 3
-- Rolle "Baubegleitung", Bauzeitenplan, Pläne & Dokumente (mit Dateispeicher),
-- Kommunikation mit Lesebestätigung
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001_grundgeruest.sql wurde ausgeführt)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Neue Rolle: Baubegleitung (pflegt das Portal wie die Bauleitung,
-- ohne Bauleitungsfunktion)
-- ---------------------------------------------------------------------
alter type public.project_role add value if not exists 'baubegleitung';

-- Darf pflegen: Admin, Bauleitung, Baubegleitung
create or replace function public.can_manage(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid()
                   and role::text in ('bauleitung', 'baubegleitung'));
$$;

-- Darf interne Inhalte sehen: zusätzlich Berater
create or replace function public.is_internal(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage(p_project)
      or exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid()
                   and role::text = 'berater');
$$;

-- ---------------------------------------------------------------------
-- Bauzeitenplan
-- ---------------------------------------------------------------------
create table if not exists public.schedule_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null,
  trade         text,                                   -- Gewerk
  assignee_id   uuid references public.profiles (id) on delete set null,  -- zuständiger Beteiligter
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'geplant' check (status in ('geplant', 'laeuft', 'erledigt')),
  note          text,
  confirmed_at  timestamptz,
  confirmed_by  uuid references public.profiles (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint schedule_dates check (end_date >= start_date)
);

create index if not exists schedule_items_project_idx on public.schedule_items (project_id, start_date);

-- Terminänderung → Bestätigung verfällt
create or replace function public.schedule_reset_confirmation()
returns trigger language plpgsql as $$
begin
  if new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.assignee_id is distinct from old.assignee_id then
    new.confirmed_at := null;
    new.confirmed_by := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists schedule_items_reset on public.schedule_items;
create trigger schedule_items_reset before update on public.schedule_items
  for each row execute function public.schedule_reset_confirmation();

-- Bestätigung durch den Zuständigen (nur diese beiden Felder, nichts sonst)
create or replace function public.confirm_schedule_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.schedule_items
     set confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_item
     and (assignee_id = auth.uid() or public.can_manage(project_id));
  if not found then
    raise exception 'Keine Berechtigung, diesen Termin zu bestätigen.';
  end if;
end;
$$;

revoke all on function public.confirm_schedule_item(uuid) from public, anon;
grant execute on function public.confirm_schedule_item(uuid) to authenticated;

alter table public.schedule_items enable row level security;

drop policy if exists schedule_select on public.schedule_items;
create policy schedule_select on public.schedule_items for select to authenticated
  using (public.is_member(project_id));

drop policy if exists schedule_write on public.schedule_items;
create policy schedule_write on public.schedule_items for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));

-- ---------------------------------------------------------------------
-- Pläne & Dokumente
-- ---------------------------------------------------------------------
create table if not exists public.project_files (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  kind          text not null default 'plan' check (kind in ('plan', 'dokument')),
  title         text not null,
  category      text,                 -- z. B. Grundriss, Schnitt, Statik, Angebot
  plan_number   text,                 -- Plannummer, gleiche Nr. = gleicher Plan
  plan_index    text,                 -- Index a, b, c …
  plan_date     date,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  visibility    text not null default 'alle' check (visibility in ('alle', 'intern')),
  superseded    boolean not null default false,
  superseded_at timestamptz,
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists project_files_project_idx on public.project_files (project_id, kind);

-- Neuer Plan mit gleicher Plannummer → ältere Stände werden ungültig
create or replace function public.files_supersede_old()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'plan' and new.plan_number is not null and btrim(new.plan_number) <> '' then
    update public.project_files
       set superseded = true, superseded_at = now()
     where project_id = new.project_id
       and kind = 'plan'
       and lower(btrim(plan_number)) = lower(btrim(new.plan_number))
       and id <> new.id
       and superseded = false;
  end if;
  return new;
end;
$$;

drop trigger if exists project_files_supersede on public.project_files;
create trigger project_files_supersede after insert on public.project_files
  for each row execute function public.files_supersede_old();

alter table public.project_files enable row level security;

drop policy if exists files_select on public.project_files;
create policy files_select on public.project_files for select to authenticated
  using (public.is_member(project_id)
         and (visibility = 'alle' or public.is_internal(project_id)));

drop policy if exists files_write on public.project_files;
create policy files_write on public.project_files for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));

-- ---------------------------------------------------------------------
-- Dateispeicher (privat). Pfad: <project_id>/<uuid>/<dateiname>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('projektdateien', 'projektdateien', false)
on conflict (id) do nothing;

drop policy if exists projektdateien_select on storage.objects;
create policy projektdateien_select on storage.objects for select to authenticated
  using (bucket_id = 'projektdateien'
         and exists (select 1 from public.project_files f where f.storage_path = name));

drop policy if exists projektdateien_insert on storage.objects;
create policy projektdateien_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'projektdateien'
              and public.can_manage(((storage.foldername(name))[1])::uuid));

drop policy if exists projektdateien_delete on storage.objects;
create policy projektdateien_delete on storage.objects for delete to authenticated
  using (bucket_id = 'projektdateien'
         and public.can_manage(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- Kommunikation
--   thread_user_id = null  → Projektkanal (alle Beteiligten)
--   thread_user_id = <id>  → Einzelkanal zwischen diesem Beteiligten und der Bauleitung
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  thread_user_id  uuid references public.profiles (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body            text not null check (length(btrim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index if not exists messages_thread_idx on public.messages (project_id, thread_user_id, created_at);

create table if not exists public.message_reads (
  message_id  uuid not null references public.messages (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, user_id)
);

create or replace function public.can_see_thread(p_project uuid, p_thread_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_project)
     and (p_thread_user is null
          or p_thread_user = auth.uid()
          or public.can_manage(p_project));
$$;

alter table public.messages      enable row level security;
alter table public.message_reads enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.can_see_thread(project_id, thread_user_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_thread(project_id, thread_user_id));

-- Nachrichten sind unveränderlich (Nachweis) – kein update/delete für Nutzer
revoke update, delete on public.messages from authenticated, anon;

drop policy if exists reads_select on public.message_reads;
create policy reads_select on public.message_reads for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

drop policy if exists reads_insert on public.message_reads;
create policy reads_insert on public.message_reads for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.messages m where m.id = message_id));

revoke update, delete on public.message_reads from authenticated, anon;
