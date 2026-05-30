SELECT cron.unschedule('run-ai-tests-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='run-ai-tests-daily');
SELECT cron.schedule(
  'run-ai-tests-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://bllqvpnjfpcvujrbrbig.supabase.co/functions/v1/run-ai-tests',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbHF2cG5qZnBjdnVqcmJyYmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODM0MzMsImV4cCI6MjA5MjM1OTQzM30.OhfKRPCuI_K_KPq9lntWqn8Rydoqbd_SEqb3nkbtrK8"}'::jsonb,
    body:='{"trigger":"scheduled"}'::jsonb
  ) AS request_id;
  $$
);