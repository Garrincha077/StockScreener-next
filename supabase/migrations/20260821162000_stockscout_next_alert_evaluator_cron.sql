create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'stockscout-next-alert-evaluator' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'stockscout-next-alert-evaluator',
  '15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jekidjsifihbbuzxrbse.supabase.co/functions/v1/stockscout-next-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-stockscout-evaluator-key', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'stockscout_next_evaluator_key'
          order by created_at desc limit 1
        )
      ),
      body := '{"action":"evaluate"}'::jsonb
    );
  $cron$
);
