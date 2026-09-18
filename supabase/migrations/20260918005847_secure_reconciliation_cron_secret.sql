-- Store the scheduled reconciliation bearer secret in Supabase Vault and expose
-- only a service-role verifier. The raw secret is never committed to source control.

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'reconciliation_cron_secret'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'reconciliation_cron_secret',
      'Bearer secret used only by the scheduled reconciliation hook.',
      null
    );
  end if;
end
$$;

create or replace function public.verify_reconciliation_cron_secret(p_token text)
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
      where ds.name = 'reconciliation_cron_secret'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.verify_reconciliation_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_reconciliation_cron_secret(text) to service_role;
