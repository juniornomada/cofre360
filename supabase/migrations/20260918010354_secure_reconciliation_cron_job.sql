-- Point the daily reconciliation cron at the internal Supabase Edge Function.
-- Authentication uses a dedicated bearer token fetched at execution time from
-- Supabase Vault, so no secret is persisted in cron.job or source control.

do $outer$
begin
  if exists (
    select 1 from cron.job where jobname = 'reconciliation-daily'
  ) then
    perform cron.unschedule('reconciliation-daily');
  end if;

  perform cron.schedule(
    'reconciliation-daily',
    '0 3 * * *',
    $cron$
      select net.http_post(
        url := 'https://bllqvpnjfpcvujrbrbig.supabase.co/functions/v1/reconciliation-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization',
          'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'reconciliation_cron_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
    $cron$
  );
end
$outer$;
