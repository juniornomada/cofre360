-- Require AAL2 only for users who have opted in to a verified MFA factor.
-- Users without MFA continue working normally. Once MFA is enrolled, an AAL1
-- session can authenticate but cannot read/write protected application data.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and (
      not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = auth.uid()
          and f.status = 'verified'
      )
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    );
$$;

revoke all on function private.mfa_access_allowed() from public, anon;
grant execute on function private.mfa_access_allowed() to authenticated, service_role;

do $$
declare
  p record;
  using_clause text;
  check_clause text;
  sql_text text;
begin
  for p in
    select schemaname, tablename, policyname, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and 'authenticated' = any(roles)
      and policyname <> 'Deny all client access'
  loop
    using_clause := null;
    check_clause := null;

    if p.qual is not null and position('private.mfa_access_allowed()' in p.qual) = 0 then
      using_clause := format(' USING ((%s) AND private.mfa_access_allowed())', p.qual);
    end if;

    if p.with_check is not null and position('private.mfa_access_allowed()' in p.with_check) = 0 then
      check_clause := format(' WITH CHECK ((%s) AND private.mfa_access_allowed())', p.with_check);
    end if;

    if using_clause is not null or check_clause is not null then
      sql_text := format(
        'ALTER POLICY %I ON %I.%I%s%s',
        p.policyname,
        p.schemaname,
        p.tablename,
        coalesce(using_clause, ''),
        coalesce(check_clause, '')
      );
      execute sql_text;
    end if;
  end loop;
end
$$;
