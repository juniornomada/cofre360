-- Keep the quota mutation internal to Edge Functions. Authenticated users can
-- no longer call the SECURITY DEFINER RPC directly; financial-chat invokes it
-- with the server-only service_role after validating the caller's JWT.

revoke all on function public.consume_financial_chat_quota() from public, anon, authenticated, service_role;
drop function public.consume_financial_chat_quota();

create or replace function public.consume_financial_chat_quota(p_user_id uuid)
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
  v_limit constant integer := 40;
  v_window constant interval := interval '10 minutes';
  v_started_at timestamptz;
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;

  perform 1 from auth.users where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into private.financial_chat_rate_limits as bucket (
    user_id,
    window_started_at,
    request_count
  )
  values (p_user_id, now(), 1)
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

revoke all on function public.consume_financial_chat_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_financial_chat_quota(uuid) to service_role;
