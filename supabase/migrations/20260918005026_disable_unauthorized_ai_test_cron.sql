-- run-ai-tests now requires trusted authorization through auth.users.app_metadata.
-- The previous pg_cron job only sent the public anon key and had been returning
-- HTTP 401, while cron.job_run_details misleadingly showed the SQL submission as
-- successful. Remove that broken scheduled invocation so it cannot generate
-- repeated unauthorized requests.

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'run-ai-tests-daily'
  ) then
    perform cron.unschedule('run-ai-tests-daily');
  end if;
end
$$;
