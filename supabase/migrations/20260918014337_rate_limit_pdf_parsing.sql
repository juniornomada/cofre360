-- Authenticated PDF parsing is rate limited per user before expensive CPU/AI work.

create table if not exists private.pdf_parse_rate_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists pdf_parse_rate_events_user_created_idx
  on private.pdf_parse_rate_events (user_id, created_at desc);

alter table private.pdf_parse_rate_events enable row level security;

drop policy if exists pdf_parse_rate_events_select_own on private.pdf_parse_rate_events;
create policy pdf_parse_rate_events_select_own
  on private.pdf_parse_rate_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists pdf_parse_rate_events_insert_own on private.pdf_parse_rate_events;
create policy pdf_parse_rate_events_insert_own
  on private.pdf_parse_rate_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant usage on schema private to authenticated;
revoke all on private.pdf_parse_rate_events from public, anon, authenticated;
grant select, insert on private.pdf_parse_rate_events to authenticated;

create or replace function public.consume_pdf_parse_quota()
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
  v_user_id uuid := auth.uid();
  v_limit constant integer := 8;
  v_window constant interval := interval '10 minutes';
  v_count integer;
  v_oldest timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select count(*)::integer, min(created_at)
    into v_count, v_oldest
  from private.pdf_parse_rate_events
  where user_id = v_user_id
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

  insert into private.pdf_parse_rate_events (user_id)
  values (v_user_id);

  allowed := true;
  remaining := greatest(v_limit - v_count - 1, 0);
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke all on function public.consume_pdf_parse_quota() from public, anon;
grant execute on function public.consume_pdf_parse_quota() to authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-pdf-parse-rate-events') then
    perform cron.unschedule('cleanup-pdf-parse-rate-events');
  end if;

  perform cron.schedule(
    'cleanup-pdf-parse-rate-events',
    '17 4 * * *',
    $cron$delete from private.pdf_parse_rate_events where created_at < now() - interval '1 day';$cron$
  );
end
$$;
