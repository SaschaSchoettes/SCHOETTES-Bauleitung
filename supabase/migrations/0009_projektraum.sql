-- =====================================================================
-- Schöttes Bauportal – Schritt 9: Projektraum (Ordnerfreigaben wie OneDrive)
--
-- Rechte hängen am Ordner, nicht mehr an der einzelnen Datei:
--   * Ordner werden einzelnen Beteiligten freigegeben (lesen oder lesen + hochladen)
--     oder „allen Beteiligten“ (nur lesen).
--   * Freigaben gelten automatisch für alle Unterordner und Dateien.
--   * Bauleitung, Baubegleitung, Berater und Admin sehen immer alles.
--   * Oberste Ebene (Stammordner) ist für alle Beteiligten sichtbar.
--   * Ausnahme je Datei: „nur intern“.
--   * Protokolle bleiben wie bisher (für alle sichtbar, außer „intern“).
--
-- Bestehende Dateien werden einmalig umgestellt, ohne dass jemand mehr sieht
-- als vorher. Wo das im bisherigen Ordner nicht möglich ist, landet die Datei
-- im neuen Ordner „Vertraulich (Umstellung)“.
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001–0008 wurden ausgeführt)
-- =====================================================================

alter table public.doc_folders add column if not exists share_all boolean not null default false;

create table if not exists public.folder_shares (
  folder_id   uuid not null references public.doc_folders (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  can_upload  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (folder_id, user_id)
);
create index if not exists folder_shares_user_idx on public.folder_shares (user_id);

-- Merker für einmalige Umstellungen (nur Server)
create table if not exists public.schema_flags (
  name text primary key,
  done_at timestamptz not null default now()
);
alter table public.schema_flags enable row level security;
revoke all on public.schema_flags from anon, authenticated;
grant select, insert on public.schema_flags to service_role;

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------

-- Ordner selbst + alle übergeordneten
create or replace function public.folder_ancestors(p_folder uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive up as (
    select id, parent_id, 1 as depth from public.doc_folders where id = p_folder
    union all
    select f.id, f.parent_id, up.depth + 1 from public.doc_folders f join up on f.id = up.parent_id
    where up.depth < 50
  )
  select id from up;
$$;

-- Ordner selbst + alle Unterordner
create or replace function public.folder_descendants(p_folder uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive down as (
    select id, 1 as depth from public.doc_folders where id = p_folder
    union all
    select f.id, down.depth + 1 from public.doc_folders f join down on f.parent_id = down.id
    where down.depth < 50
  )
  select id from down;
$$;

create or replace function public.is_internal_user(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = p_user), false)
      or exists (select 1 from public.project_members
                  where project_id = p_project and user_id = p_user
                    and role::text in ('bauleitung', 'baubegleitung', 'berater'));
$$;

-- Hat p_user (ohne Rollenprüfung) Zugriff auf Inhalte des Ordners?
create or replace function public.folder_access_for(p_folder uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doc_folders d
                  where d.id in (select public.folder_ancestors(p_folder)) and d.share_all)
      or exists (select 1 from public.folder_shares s
                  where s.folder_id in (select public.folder_ancestors(p_folder)) and s.user_id = p_user);
$$;

create or replace function public.folder_upload_for(p_folder uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.folder_shares s
                  where s.folder_id in (select public.folder_ancestors(p_folder))
                    and s.user_id = p_user and s.can_upload);
$$;

revoke all on function public.folder_access_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.folder_upload_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_internal_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.folder_ancestors(uuid) from public, anon, authenticated;
revoke all on function public.folder_descendants(uuid) from public, anon, authenticated;

-- Für die Oberfläche und Richtlinien: angemeldeter Nutzer
create or replace function public.can_see_folder(p_folder uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.doc_folders d
     where d.id = p_folder
       and public.is_member(d.project_id)
       and (public.is_internal(d.project_id)
            or public.folder_access_for(d.id, auth.uid())
            -- Pfad zu einem tiefer freigegebenen Ordner bleibt sichtbar (nur Name)
            or exists (select 1 from public.doc_folders c
                        where c.id in (select public.folder_descendants(d.id))
                          and (c.share_all
                               or exists (select 1 from public.folder_shares s
                                           where s.folder_id = c.id and s.user_id = auth.uid()))))
  );
$$;

create or replace function public.can_open_folder(p_folder uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.doc_folders d
     where d.id = p_folder and public.is_member(d.project_id)
       and (public.is_internal(d.project_id) or public.folder_access_for(d.id, auth.uid()))
  );
$$;

create or replace function public.can_upload_to(p_project uuid, p_folder uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage(p_project)
      or (public.is_member(p_project) and (
            (p_folder is null and coalesce(public.my_role(p_project) = 'auftraggeber', false))
         or (p_folder is not null
             and exists (select 1 from public.doc_folders where id = p_folder and project_id = p_project)
             and public.folder_upload_for(p_folder, auth.uid()))));
$$;

create or replace function public.can_see_doc(p_project uuid, p_kind text, p_visibility text, p_visible_to uuid, p_folder uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'protokoll' then public.can_see_file(p_project, p_visibility, p_visible_to)
    else public.is_member(p_project) and (
           public.is_internal(p_project)
        or (p_visibility <> 'intern'
            and (p_folder is null or public.folder_access_for(p_folder, auth.uid()))))
  end;
$$;

grant execute on function public.can_see_folder(uuid), public.can_open_folder(uuid),
  public.can_upload_to(uuid, uuid), public.can_see_doc(uuid, text, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Einmalige Umstellung der vorhandenen Dateien
-- ---------------------------------------------------------------------
create or replace function public.mig_conf_folder(p_project uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_top uuid; v_sub uuid;
begin
  select id into v_top from public.doc_folders
   where project_id = p_project and parent_id is null and name = 'Vertraulich (Umstellung)' limit 1;
  if v_top is null then
    insert into public.doc_folders (project_id, parent_id, name)
    values (p_project, null, 'Vertraulich (Umstellung)') returning id into v_top;
    insert into public.folder_shares (folder_id, user_id, can_upload)
    select v_top, user_id, true from public.project_members
     where project_id = p_project and role::text = 'auftraggeber'
    on conflict do nothing;
  end if;
  select id into v_sub from public.doc_folders where parent_id = v_top and name = p_name limit 1;
  if v_sub is null then
    insert into public.doc_folders (project_id, parent_id, name) values (p_project, v_top, p_name)
    returning id into v_sub;
  end if;
  return v_sub;
end;
$$;

do $$
declare
  p record; c record; f record;
  v_top uuid; v_sub uuid; v_safe boolean;
begin
  if exists (select 1 from public.schema_flags where name = '0009_projektraum') then
    return;
  end if;

  -- 0) Pläne lagen bisher ohne Ordner → „Pläne / <Kategorie>“
  for p in select distinct project_id from public.project_files where kind = 'plan' and folder_id is null loop
    select id into v_top from public.doc_folders
     where project_id = p.project_id and parent_id is null and name = 'Pläne' limit 1;
    if v_top is null then
      insert into public.doc_folders (project_id, parent_id, name) values (p.project_id, null, 'Pläne')
      returning id into v_top;
    end if;
    for c in select distinct coalesce(nullif(btrim(category), ''), 'Allgemein') as cat
               from public.project_files where project_id = p.project_id and kind = 'plan' and folder_id is null loop
      select id into v_sub from public.doc_folders where parent_id = v_top and name = c.cat limit 1;
      if v_sub is null then
        insert into public.doc_folders (project_id, parent_id, name) values (p.project_id, v_top, c.cat)
        returning id into v_sub;
      end if;
      update public.project_files set folder_id = v_sub
       where project_id = p.project_id and kind = 'plan' and folder_id is null
         and coalesce(nullif(btrim(category), ''), 'Allgemein') = c.cat;
    end loop;
  end loop;

  -- Gewerk-Freigabe ohne gültiges Gewerk → wie „Auftraggeber + intern“
  update public.project_files pf set visibility = 'bauherr', visible_to = null
   where pf.kind <> 'protokoll' and pf.visibility = 'gewerk'
     and not exists (select 1 from public.project_members m
                      where m.project_id = pf.project_id and m.user_id = pf.visible_to);

  -- a) Ordner mit Dateien „alle“ → für alle Beteiligten
  update public.doc_folders d set share_all = true
   where exists (select 1 from public.project_files pf
                  where pf.folder_id = d.id and pf.kind <> 'protokoll' and pf.visibility = 'alle');

  -- b) Auftraggeber sah bisher alles → alle Ordner der obersten Ebene (mit Hochladen)
  insert into public.folder_shares (folder_id, user_id, can_upload)
  select d.id, m.user_id, true
    from public.doc_folders d
    join public.project_members m on m.project_id = d.project_id and m.role::text = 'auftraggeber'
   where d.parent_id is null
  on conflict do nothing;

  -- c) Dateien für ein Gewerk
  for f in select pf.id, pf.project_id, pf.folder_id, pf.visible_to from public.project_files pf
            where pf.kind <> 'protokoll' and pf.visibility = 'gewerk' order by pf.created_at loop
    v_safe := f.folder_id is not null
      and not exists (select 1 from public.doc_folders d
                       where d.id in (select public.folder_ancestors(f.folder_id)) and d.share_all)
      and not exists (select 1 from public.project_files x
                       where x.folder_id in (select public.folder_descendants(f.folder_id))
                         and x.kind <> 'protokoll'
                         and (x.visibility = 'bauherr'
                              or (x.visibility = 'gewerk' and x.visible_to is distinct from f.visible_to)));
    if v_safe then
      insert into public.folder_shares (folder_id, user_id, can_upload)
      values (f.folder_id, f.visible_to, false) on conflict do nothing;
    else
      v_sub := public.mig_conf_folder(f.project_id, coalesce(public.display_name(f.visible_to), 'Gewerk'));
      insert into public.folder_shares (folder_id, user_id, can_upload)
      values (v_sub, f.visible_to, false) on conflict do nothing;
      update public.project_files set folder_id = v_sub where id = f.id;
    end if;
  end loop;

  -- d) Dateien „Auftraggeber + intern“
  for f in select pf.id, pf.project_id, pf.folder_id from public.project_files pf
            where pf.kind <> 'protokoll' and pf.visibility = 'bauherr' loop
    v_safe := f.folder_id is not null
      and not exists (select 1 from public.doc_folders d
                       where d.id in (select public.folder_ancestors(f.folder_id)) and d.share_all)
      and not exists (select 1 from public.folder_shares s
                        join public.project_members m on m.project_id = f.project_id and m.user_id = s.user_id
                       where s.folder_id in (select public.folder_ancestors(f.folder_id))
                         and m.role::text = 'gewerk');
    if not v_safe then
      update public.project_files set folder_id = public.mig_conf_folder(f.project_id, 'Nur Auftraggeber')
       where id = f.id;
    end if;
  end loop;

  -- e) Datei-Sichtbarkeit nur noch „alle“ (= wie Ordner) oder „intern“
  update public.project_files set visibility = 'alle', visible_to = null
   where kind <> 'protokoll' and visibility in ('bauherr', 'gewerk');

  insert into public.schema_flags (name) values ('0009_projektraum');
end;
$$;

revoke all on function public.mig_conf_folder(uuid, text) from public, anon, authenticated;

-- Pläne/Dokumente: nur noch „alle“ (wie Ordner) oder „intern“
alter table public.project_files drop constraint if exists project_files_doc_visibility_check;
alter table public.project_files add constraint project_files_doc_visibility_check
  check (kind = 'protokoll' or visibility in ('alle', 'intern'));

-- ---------------------------------------------------------------------
-- Richtlinien
-- ---------------------------------------------------------------------
alter table public.folder_shares enable row level security;

drop policy if exists folder_shares_select on public.folder_shares;
create policy folder_shares_select on public.folder_shares for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.doc_folders d
                     where d.id = folder_id and public.is_internal(d.project_id)));

drop policy if exists folder_shares_write on public.folder_shares;
create policy folder_shares_write on public.folder_shares for all to authenticated
  using (exists (select 1 from public.doc_folders d where d.id = folder_id and public.can_manage(d.project_id)))
  with check (exists (select 1 from public.doc_folders d where d.id = folder_id and public.can_manage(d.project_id)));

grant select, insert, update, delete on public.folder_shares to authenticated;
grant select, insert, update, delete on public.folder_shares to service_role;

drop policy if exists folders_select on public.doc_folders;
create policy folders_select on public.doc_folders for select to authenticated
  using (public.can_see_folder(id));

drop policy if exists files_select on public.project_files;
create policy files_select on public.project_files for select to authenticated
  using (public.can_see_doc(project_id, kind, visibility, visible_to, folder_id));

drop policy if exists files_insert on public.project_files;
create policy files_insert on public.project_files for insert to authenticated
  with check (
    public.can_manage(project_id)
    or (public.can_upload_to(project_id, folder_id)
        and uploaded_by = auth.uid()
        and kind in ('plan', 'dokument')
        and visibility <> 'intern')
  );

drop policy if exists files_update on public.project_files;
create policy files_update on public.project_files for update to authenticated
  using (public.can_manage(project_id)
         or (public.is_member(project_id) and uploaded_by = auth.uid()))
  with check (public.can_manage(project_id)
              or (uploaded_by = auth.uid()
                  and public.can_upload_to(project_id, folder_id)
                  and visibility <> 'intern'));

drop policy if exists files_delete on public.project_files;
create policy files_delete on public.project_files for delete to authenticated
  using (public.can_manage(project_id)
         or (public.is_member(project_id) and uploaded_by = auth.uid()));

-- Speicher: jeder Beteiligte darf hochladen (der Datensatz entscheidet über den Ordner)
drop policy if exists projektdateien_insert on storage.objects;
create policy projektdateien_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'projektdateien'
              and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists projektdateien_delete on storage.objects;
create policy projektdateien_delete on storage.objects for delete to authenticated
  using (bucket_id = 'projektdateien'
         and (public.can_manage(((storage.foldername(name))[1])::uuid)
              or (public.is_member(((storage.foldername(name))[1])::uuid)
                  and (owner_id = auth.uid()::text
                       or exists (select 1 from public.project_files f
                                   where f.storage_path = name and f.uploaded_by = auth.uid())))));

-- ---------------------------------------------------------------------
-- Benachrichtigung bei neuen Dateien: nach Ordnerfreigabe
-- ---------------------------------------------------------------------
create or replace function public.trg_notify_file()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_ok boolean;
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
    if r.role in ('bauleitung', 'baubegleitung', 'berater') then
      v_ok := true;
    elsif new.kind = 'protokoll' then
      v_ok := new.visibility = 'alle'
           or (new.visibility in ('bauherr', 'gewerk') and r.role = 'auftraggeber')
           or (new.visibility = 'gewerk' and r.user_id = new.visible_to);
    elsif new.visibility = 'intern' then
      v_ok := false;
    elsif new.folder_id is null then
      v_ok := true;
    else
      v_ok := public.folder_access_for(new.folder_id, r.user_id);
    end if;
    if v_ok then
      perform public.notify_add(r.user_id, new.project_id, 'dokument', v_text, v_link);
    end if;
  end loop;
  return new;
end;
$$;
