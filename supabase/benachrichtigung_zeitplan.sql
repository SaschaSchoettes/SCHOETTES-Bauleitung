-- =====================================================================
-- Schöttes Bauportal – Zeitplan für den Mailversand (alle 10 Minuten)
-- Supabase ruft https://portal.schoettes.com/api/notify auf.
--
-- 1. HIER_GEHEIMWORT unten durch denselben Wert ersetzen, der in Vercel
--    als CRON_SECRET eingetragen ist.
-- 2. Supabase → SQL Editor → New query → Inhalt einfügen → Run
--
-- Falls "extension ... is not available" erscheint: Supabase → Database →
-- Extensions → "pg_cron" und "pg_net" einschalten, dann erneut ausführen.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- vorhandenen Zeitplan gleichen Namens entfernen (wiederholbar)
select cron.unschedule(jobid) from cron.job where jobname = 'bauportal-benachrichtigungen';

select cron.schedule(
  'bauportal-benachrichtigungen',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://portal.schoettes.com/api/notify',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer HIER_GEHEIMWORT',
                 'Content-Type',  'application/json'),
    body    := '{}'::jsonb
  );
  $$
);

-- Kontrolle:
select jobname, schedule, active from cron.job where jobname = 'bauportal-benachrichtigungen';
