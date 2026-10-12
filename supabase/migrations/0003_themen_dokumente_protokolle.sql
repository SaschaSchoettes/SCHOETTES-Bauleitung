-- =====================================================================
-- Schöttes Bauportal – Schritt 4
-- Themen, Notizen zum Bauzeitenplan, interner Puffer, feinere Sichtbarkeit
-- von Dokumenten, Protokolle & Ortstermine mit Fotos, Rechnungsadresse
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001 und 0002 wurden ausgeführt)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hilfsfunktion: eigene Rolle im Projekt
-- ---------------------------------------------------------------------
create or replace function public.my_role(p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.project_members
   where project_id = p_project and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Stammdaten: Rechnungsadresse
-- ---------------------------------------------------------------------
alter table public.projects add column if not exists billing_name     text;
alter table public.projects add column if not exists billing_street   text;
alter table public.projects add column if not exists billing_zip_city text;
alter table public.projects add column if not exists billing_email    text;
alter table public.projects add column if not exists billing_note     text;

-- ---------------------------------------------------------------------
-- Dokumente: Sichtbarkeit
--   alle    → alle Beteiligten
--   bauherr → intern + Auftraggeber (z. B. Angebote, Rechnungen)
--   gewerk  → intern + Auftraggeber + ein bestimmter Beteiligter
--   intern  → nur Bauleitung, Baubegleitung, Berater
-- Neue Art "protokoll"
-- ---------------------------------------------------------------------
alter table public.project_files drop constraint if exists project_files_kind_check;
alter table public.project_files add constraint project_files_kind_check
  check (kind in ('plan', 'dokument', 'protokoll'));

alter table public.project_files drop constraint if exists project_files_visibility_check;
alter table public.project_files add constraint project_files_visibility_check
  check (visibility in ('alle', 'bauherr', 'gewerk', 'intern'));

alter table public.project_files add column if not exists visible_to uuid
  references public.profiles (id) on delete set null;
alter table public.project_files add column if not exists trade text;   -- Gewerk-Zuordnung (z. B. Angebot Dachdecker)
alter table public.project_files add column if not exists doc_date date;

create or replace function public.can_see_file(p_project uuid, p_visibility text, p_visible_to uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_project) and (
       p_visibility = 'alle'
    or public.is_internal(p_project)
    or (p_visibility in ('bauherr', 'gewerk') and public.my_role(p_project) = 'auftraggeber')
    or (p_visibility = 'gewerk' and p_visible_to = auth.uid())
  );
$$;

drop policy if exists files_select on public.project_files;
create policy files_select on public.project_files for select to authenticated
  using (public.can_see_file(project_id, visibility, visible_to));

-- ---------------------------------------------------------------------
-- Bauzeitenplan: interner Puffer + Notizen von allen Beteiligten
-- ---------------------------------------------------------------------
alter table public.schedule_items add column if not exists buffer_days integer not null default 0
  check (buffer_days >= 0 and buffer_days <= 365);
alter table public.schedule_items add column if not exists sort_order integer not null default 0;

create table if not exists public.schedule_comments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.schedule_items (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body        text not null check (length(btrim(body)) > 0),
  is_problem  boolean not null default false,       -- "Terminproblem" (z. B. Termin nicht einzuhalten)
  created_at  timestamptz not null default now()
);

create index if not exists schedule_comments_item_idx on public.schedule_comments (item_id, created_at);

alter table public.schedule_comments enable row level security;

drop policy if exists sched_comments_select on public.schedule_comments;
create policy sched_comments_select on public.schedule_comments for select to authenticated
  using (public.is_member(project_id));

drop policy if exists sched_comments_insert on public.schedule_comments;
create policy sched_comments_insert on public.schedule_comments for insert to authenticated
  with check (author_id = auth.uid()
              and public.is_member(project_id)
              and exists (select 1 from public.schedule_items s
                          where s.id = item_id and s.project_id = schedule_comments.project_id));

revoke update, delete on public.schedule_comments from authenticated, anon;

-- ---------------------------------------------------------------------
-- Themen (Festlegungen, offene Punkte) – jeder Beteiligte darf anlegen
-- und kommentieren
-- ---------------------------------------------------------------------
create table if not exists public.topics (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  title           text not null check (length(btrim(title)) > 0),
  description     text,
  trade           text,                                      -- betroffenes Gewerk
  responsible_id  uuid references public.profiles (id) on delete set null,
  due_date        date,
  status          text not null default 'offen'
                  check (status in ('offen', 'in_klaerung', 'festgelegt', 'erledigt')),
  decision        text,                                      -- Festlegung / Ergebnis
  decided_at      timestamptz,
  decided_by      uuid references public.profiles (id) on delete set null,
  created_by      uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists topics_project_idx on public.topics (project_id, status, created_at desc);

create table if not exists public.topic_comments (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists topic_comments_topic_idx on public.topic_comments (topic_id, created_at);

-- Festlegung protokollieren (wer, wann); Status/Festlegung nur durch Pflegende
create or replace function public.topics_track_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage(new.project_id) then
    if tg_op = 'INSERT' then
      new.status := 'offen';
      new.decision := null;
    elsif new.status is distinct from old.status or new.decision is distinct from old.decision then
      raise exception 'Status und Festlegung können nur von Bauleitung oder Baubegleitung geändert werden.';
    end if;
  end if;

  if new.status = 'festgelegt'
     and (tg_op = 'INSERT' or old.status is distinct from 'festgelegt'
          or old.decision is distinct from new.decision) then
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  if new.status in ('offen', 'in_klaerung') then
    new.decided_at := null;
    new.decided_by := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists topics_decision on public.topics;
create trigger topics_decision before insert or update on public.topics
  for each row execute function public.topics_track_decision();

alter table public.topics         enable row level security;
alter table public.topic_comments enable row level security;

drop policy if exists topics_select on public.topics;
create policy topics_select on public.topics for select to authenticated
  using (public.is_member(project_id));

drop policy if exists topics_insert on public.topics;
create policy topics_insert on public.topics for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(project_id));

-- Ändern: Ersteller oder Pflegende
drop policy if exists topics_update on public.topics;
create policy topics_update on public.topics for update to authenticated
  using (public.can_manage(project_id) or created_by = auth.uid())
  with check (public.can_manage(project_id) or created_by = auth.uid());

-- Löschen: nur Pflegende
drop policy if exists topics_delete on public.topics;
create policy topics_delete on public.topics for delete to authenticated
  using (public.can_manage(project_id));

drop policy if exists topic_comments_select on public.topic_comments;
create policy topic_comments_select on public.topic_comments for select to authenticated
  using (public.is_member(project_id));

drop policy if exists topic_comments_insert on public.topic_comments;
create policy topic_comments_insert on public.topic_comments for insert to authenticated
  with check (author_id = auth.uid()
              and public.is_member(project_id)
              and exists (select 1 from public.topics t
                          where t.id = topic_id and t.project_id = topic_comments.project_id));

revoke update, delete on public.topic_comments from authenticated, anon;

-- ---------------------------------------------------------------------
-- Ortstermine (kurze Notiz + Fotos) – sichtbar für alle Beteiligten
-- ---------------------------------------------------------------------
create table if not exists public.site_visits (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  visit_date  date not null default current_date,
  title       text,
  body        text not null check (length(btrim(body)) > 0),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists site_visits_project_idx on public.site_visits (project_id, visit_date desc);

create table if not exists public.site_visit_photos (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references public.site_visits (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  storage_path  text not null unique,
  created_at    timestamptz not null default now()
);

alter table public.site_visits       enable row level security;
alter table public.site_visit_photos enable row level security;

drop policy if exists visits_select on public.site_visits;
create policy visits_select on public.site_visits for select to authenticated
  using (public.is_member(project_id));

drop policy if exists visits_write on public.site_visits;
create policy visits_write on public.site_visits for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));

drop policy if exists visit_photos_select on public.site_visit_photos;
create policy visit_photos_select on public.site_visit_photos for select to authenticated
  using (public.is_member(project_id));

drop policy if exists visit_photos_write on public.site_visit_photos;
create policy visit_photos_write on public.site_visit_photos for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));

-- Speicher: Fotos von Ortsterminen ebenfalls lesbar
drop policy if exists projektdateien_select on storage.objects;
create policy projektdateien_select on storage.objects for select to authenticated
  using (bucket_id = 'projektdateien'
         and (exists (select 1 from public.project_files f where f.storage_path = name)
              or exists (select 1 from public.site_visit_photos p where p.storage_path = name)));
