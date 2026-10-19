-- Internal daily smoke tests use a dedicated Vault secret, never a user JWT
-- or the public Supabase key. The secret is not persisted in git or cron.job.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ai_tests_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'ai_tests_cron_secret',
      'Dedicated bearer token for the daily AI QA smoke checks.',
      null
    );
  end if;
end
$$;

create or replace function public.verify_ai_tests_cron_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select ds.decrypted_secret = p_token
      from vault.decrypted_secrets ds
      where ds.name = 'ai_tests_cron_secret'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.verify_ai_tests_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_ai_tests_cron_secret(text) to service_role;
