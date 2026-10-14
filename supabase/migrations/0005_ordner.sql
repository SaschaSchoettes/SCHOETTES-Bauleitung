-- =====================================================================
-- Schöttes Bauportal – Schritt 6: Ordner für Dokumente
-- Beliebig tiefe Ordner (z. B. Gewerke → Rohbau → Firma → Angebote).
-- Gewerke sehen nur Ordner, in denen eine für sie freigegebene Datei liegt.
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001–0004 wurden ausgeführt)
-- =====================================================================

create table if not exists public.doc_folders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  parent_id   uuid references public.doc_folders (id) on delete restrict,
  name        text not null check (length(btrim(name)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists doc_folders_project_idx on public.doc_folders (project_id, parent_id);

alter table public.project_files add column if not exists folder_id uuid
  references public.doc_folders (id) on delete restrict;

create index if not exists project_files_folder_idx on public.project_files (folder_id);

-- Ordner sichtbar, wenn intern/Auftraggeber oder eine sichtbare Datei darin (auch in Unterordnern) liegt
create or replace function public.folder_visible(p_folder uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive sub as (
    select id from public.doc_folders where id = p_folder
    union all
    select f.id from public.doc_folders f join sub on f.parent_id = sub.id
  )
  select exists (
    select 1 from public.project_files pf
     where pf.folder_id in (select id from sub)
       and public.can_see_file(pf.project_id, pf.visibility, pf.visible_to)
  );
$$;

alter table public.doc_folders enable row level security;

drop policy if exists folders_select on public.doc_folders;
create policy folders_select on public.doc_folders for select to authenticated
  using (public.is_member(project_id)
         and (public.is_internal(project_id)
              or public.my_role(project_id) = 'auftraggeber'
              or public.folder_visible(id)));

drop policy if exists folders_write on public.doc_folders;
create policy folders_write on public.doc_folders for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));
