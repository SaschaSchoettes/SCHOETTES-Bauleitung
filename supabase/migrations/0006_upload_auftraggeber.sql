-- =====================================================================
-- Schöttes Bauportal – Schritt 7: Auftraggeber darf hochladen
-- Auftraggeber laden Pläne/Dokumente in vorhandene Ordner hoch und
-- verwalten nur ihre eigenen Uploads (nicht "nur intern").
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001–0005 wurden ausgeführt)
-- =====================================================================

create or replace function public.can_upload(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage(p_project) or coalesce(public.my_role(p_project) = 'auftraggeber', false);
$$;

-- project_files: Schreibrechte aufteilen
drop policy if exists files_write  on public.project_files;
drop policy if exists files_insert on public.project_files;
drop policy if exists files_update on public.project_files;
drop policy if exists files_delete on public.project_files;

create policy files_insert on public.project_files for insert to authenticated
  with check (
    public.can_manage(project_id)
    or (public.can_upload(project_id)
        and uploaded_by = auth.uid()
        and kind in ('plan', 'dokument')
        and visibility <> 'intern')
  );

create policy files_update on public.project_files for update to authenticated
  using (public.can_manage(project_id)
         or (public.can_upload(project_id) and uploaded_by = auth.uid()))
  with check (public.can_manage(project_id)
              or (public.can_upload(project_id) and uploaded_by = auth.uid() and visibility <> 'intern'));

create policy files_delete on public.project_files for delete to authenticated
  using (public.can_manage(project_id)
         or (public.can_upload(project_id) and uploaded_by = auth.uid()));

-- Speicher: hochladen und eigene Dateien entfernen
drop policy if exists projektdateien_insert on storage.objects;
create policy projektdateien_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'projektdateien'
              and public.can_upload(((storage.foldername(name))[1])::uuid));

drop policy if exists projektdateien_delete on storage.objects;
create policy projektdateien_delete on storage.objects for delete to authenticated
  using (bucket_id = 'projektdateien'
         and (public.can_manage(((storage.foldername(name))[1])::uuid)
              or (public.can_upload(((storage.foldername(name))[1])::uuid)
                  and (owner_id = auth.uid()::text
                       or exists (select 1 from public.project_files f
                                   where f.storage_path = name and f.uploaded_by = auth.uid())))));

-- Eigene Uploads immer lesbar (z. B. direkt nach dem Hochladen)
drop policy if exists projektdateien_select on storage.objects;
create policy projektdateien_select on storage.objects for select to authenticated
  using (bucket_id = 'projektdateien'
         and (owner_id = auth.uid()::text
              or exists (select 1 from public.project_files f where f.storage_path = name)
              or exists (select 1 from public.site_visit_photos p where p.storage_path = name)));
