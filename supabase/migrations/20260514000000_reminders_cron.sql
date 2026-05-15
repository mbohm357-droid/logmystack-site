-- LogMyStack — schedule the send-reminders Edge Function via pg_cron.
--
-- Requires:
--   1) pg_cron and pg_net extensions enabled (Supabase dashboard → Database → Extensions)
--   2) The send-reminders Edge Function deployed
--   3) These vault secrets set:
--        - project_url     : https://<PROJECT_REF>.supabase.co
--        - cron_secret     : a random string (must match Edge Function CRON_SECRET env var)
--
-- The function runs every 15 minutes. It internally checks each user's
-- reminderPrefs.time + timezone and decides whether to send.

-- Enable extensions if not already (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous schedule for this job (idempotent)
do $$
begin
  perform cron.unschedule('lms-send-reminders');
exception when others then null;
end $$;

-- Schedule: every 15 minutes
select cron.schedule(
  'lms-send-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);
