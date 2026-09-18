-- Rate limit bearer-authenticated external transaction ingestion.

create table if not exists private.external_transaction_rate_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists external_transaction_rate_events_user_created_idx
  on private.external_transaction_rate_events (user_id, created_at desc);

revoke all on private.external_transaction_rate_events from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert on private.external_transaction_rate_events to service_role;

create or replace function public.consume_external_transaction_quota(p_user_id uuid)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit constant integer := 60;
  v_window constant interval := interval '10 minutes';
  v_count integer;
  v_oldest timestamptz;
begin
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;

  perform 1 from auth.users where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('external:' || p_user_id::text, 0));

  select count(*)::integer, min(created_at)
    into v_count, v_oldest
  from private.external_transaction_rate_events
  where user_id = p_user_id
    and created_at > now() - v_window;

  if v_count >= v_limit then
    allowed := false;
    remaining := 0;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_oldest + v_window) - now())))::integer
    );
    return next;
    return;
  end if;

  insert into private.external_transaction_rate_events (user_id)
  values (p_user_id);

  allowed := true;
  remaining := greatest(v_limit - v_count - 1, 0);
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke all on function public.consume_external_transaction_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_external_transaction_quota(uuid) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-external-transaction-rate-events') then
    perform cron.unschedule('cleanup-external-transaction-rate-events');
  end if;

  perform cron.schedule(
    'cleanup-external-transaction-rate-events',
    '29 4 * * *',
    $cron$delete from private.external_transaction_rate_events where created_at < now() - interval '1 day';$cron$
  );
end
$$;
