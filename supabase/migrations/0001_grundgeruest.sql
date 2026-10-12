-- =====================================================================
-- Schöttes Bauportal – Schritt 2: Grundgerüst
-- Profile, Projekte, Projektbeteiligte (Rollen), Kontaktliste, Zugriffsregeln (RLS)
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------
do $$ begin
  create type public.project_role as enum ('bauleitung', 'berater', 'auftraggeber', 'gewerk');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum ('aktiv', 'ruhend', 'abgeschlossen');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Profile (1:1 zu auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  company     text,
  phone       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Profil automatisch anlegen, wenn ein Nutzer erstellt wird
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profile für bereits vorhandene Nutzer nachziehen
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Projekte
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  number       text,
  name         text not null,
  street       text,
  zip_city     text,
  client_name  text,
  measure      text,
  start_date   date,
  end_date     date,
  status       public.project_status not null default 'aktiv',
  notes        text,
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Projektbeteiligte mit Login (Zugänge + Rolle)
-- ---------------------------------------------------------------------
create table if not exists public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.project_role not null,
  trade       text,                         -- Gewerk, z. B. "Dachdecker"
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------
-- Kontaktliste (auch Beteiligte ohne Login)
-- ---------------------------------------------------------------------
create table if not exists public.project_contacts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  company     text,
  trade       text,                         -- Gewerk
  function    text,                         -- Funktion, z. B. Polier, Inhaber
  phone       text,
  mobile      text,
  email       text,
  note        text,
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists project_contacts_project_idx on public.project_contacts (project_id);

-- ---------------------------------------------------------------------
-- updated_at automatisch setzen
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists contacts_updated_at on public.project_contacts;
create trigger contacts_updated_at before update on public.project_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Hilfsfunktionen für Zugriffsregeln (security definer → keine RLS-Schleifen)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid());
$$;

create or replace function public.can_manage(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid()
                   and role = 'bauleitung');
$$;

create or replace function public.shares_project(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.project_members a
    join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- Ersteller eines Projekts automatisch als Bauleitung eintragen
create or replace function public.add_creator_as_bauleitung()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'bauleitung')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_add_creator on public.projects;
create trigger projects_add_creator after insert on public.projects
  for each row execute function public.add_creator_as_bauleitung();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;
alter table public.project_contacts enable row level security;

-- Profile: eigenes, gemeinsame Projekte, Admin
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_project(id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- is_admin darf niemand über die App ändern (nur per SQL)
revoke update on public.profiles from authenticated, anon;
grant update (full_name, company, phone) on public.profiles to authenticated;

-- Projekte
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.is_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_admin());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_admin());

-- Beteiligte
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members for select to authenticated
  using (public.is_member(project_id));

drop policy if exists members_write on public.project_members;
create policy members_write on public.project_members for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));

-- Kontakte
drop policy if exists contacts_select on public.project_contacts;
create policy contacts_select on public.project_contacts for select to authenticated
  using (public.is_member(project_id));

drop policy if exists contacts_write on public.project_contacts;
create policy contacts_write on public.project_contacts for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));
