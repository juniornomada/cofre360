-- 09:00 UTC = 06:00 BRT (São Paulo). Runs smoke checks with no user data.
-- The Edge Function must be deployed first, with application-level authentication.
do $outer$
begin
  if exists (select 1 from cron.job where jobname = 'run-ai-tests-daily') then
    perform cron.unschedule('run-ai-tests-daily');
  end if;
  perform cron.schedule(
    'run-ai-tests-daily',
    '0 9 * * *',
    $cron$
      select net.http_post(
        url := 'https://bllqvpnjfpcvujrbrbig.supabase.co/functions/v1/run-ai-tests',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization',
          'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'ai_tests_cron_secret' limit 1
          )
        ),
        body := '{"trigger":"scheduled-smoke"}'::jsonb
      ) as request_id;
    $cron$
  );
end
$outer$;
