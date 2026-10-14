-- =====================================================================
-- Schöttes Bauportal – Schritt 5: Projektstand
-- Kette der nächsten Schritte (wer ist am Zug, seit wann) + Notizen
--
-- Ausführen: Supabase → SQL Editor → New query → Inhalt einfügen → Run
-- (Voraussetzung: 0001–0003 wurden ausgeführt)
-- =====================================================================

create table if not exists public.project_steps (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  position      integer not null default 0,
  title         text not null check (length(btrim(title)) > 0),
  ball_at       text,                     -- bei wem liegt der Ball (z. B. "Bauherr", "Statiker")
  note          text,
  status        text not null default 'offen' check (status in ('offen', 'aktuell', 'erledigt')),
  status_since  timestamptz not null default now(),
  done_at       timestamptz,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists project_steps_project_idx on public.project_steps (project_id, position);

-- "seit"-Datum und Erledigt-Datum automatisch pflegen
create or replace function public.steps_track_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_since := now();
    new.done_at := case when new.status = 'erledigt' then now() else null end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_steps_status on public.project_steps;
create trigger project_steps_status before insert or update on public.project_steps
  for each row execute function public.steps_track_status();

create table if not exists public.step_comments (
  id          uuid primary key default gen_random_uuid(),
  step_id     uuid not null references public.project_steps (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists step_comments_step_idx on public.step_comments (step_id, created_at);

alter table public.project_steps enable row level security;
alter table public.step_comments enable row level security;

-- Schritte: alle Beteiligten sehen, Bauleitung/Baubegleitung pflegen
drop policy if exists steps_select on public.project_steps;
create policy steps_select on public.project_steps for select to authenticated
  using (public.is_member(project_id));

drop policy if exists steps_write on public.project_steps;
create policy steps_write on public.project_steps for all to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));

-- Notizen zu Schritten: jeder Beteiligte, unveränderlich
drop policy if exists step_comments_select on public.step_comments;
create policy step_comments_select on public.step_comments for select to authenticated
  using (public.is_member(project_id));

drop policy if exists step_comments_insert on public.step_comments;
create policy step_comments_insert on public.step_comments for insert to authenticated
  with check (author_id = auth.uid()
              and public.is_member(project_id)
              and exists (select 1 from public.project_steps s
                          where s.id = step_id and s.project_id = step_comments.project_id));

revoke update, delete on public.step_comments from authenticated, anon;
