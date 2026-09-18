-- Bound external AI usage per authenticated user. Deterministic financial
-- answers do not consume this quota; the Edge Function consumes a token only
-- immediately before calling the external AI gateway.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.financial_chat_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

revoke all on table private.financial_chat_rate_limits from public, anon, authenticated;

create or replace function public.consume_financial_chat_quota()
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit constant integer := 40;
  v_window constant interval := interval '10 minutes';
  v_started_at timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  insert into private.financial_chat_rate_limits as bucket (
    user_id,
    window_started_at,
    request_count
  )
  values (v_user_id, now(), 1)
  on conflict (user_id) do update
  set
    window_started_at = case
      when now() >= bucket.window_started_at + v_window then now()
      else bucket.window_started_at
    end,
    request_count = case
      when now() >= bucket.window_started_at + v_window then 1
      else least(bucket.request_count + 1, v_limit + 1)
    end
  returning window_started_at, request_count
  into v_started_at, v_count;

  allowed := v_count <= v_limit;
  remaining := greatest(v_limit - v_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (v_started_at + v_window - now())))::integer
    )
  end;

  return next;
end;
$$;

revoke all on function public.consume_financial_chat_quota() from public, anon, authenticated;
grant execute on function public.consume_financial_chat_quota() to authenticated;
