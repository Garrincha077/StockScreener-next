-- Chart Alerts v2 / A6
-- Add owner-scoped in-app read/unread lifecycle for persisted trigger events.
-- User-sidecar only: no StockScout scan, score, ranking, LEGACY, or canonical payload changes.

alter table stockscout_private.stockscout_next_alert_events
  add column if not exists read_at timestamptz;

create index if not exists stockscout_next_alert_events_owner_unread_idx
  on stockscout_private.stockscout_next_alert_events(owner_key, created_at desc)
  where read_at is null;

create or replace function stockscout_api.next_chart_alert_event_set_read(
  p_owner_key text,
  p_id uuid,
  p_read boolean default true
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_count integer;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  update stockscout_private.stockscout_next_alert_events
     set read_at = case when p_read then coalesce(read_at, now()) else null end
   where id = p_id
     and owner_key = p_owner_key;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function stockscout_api.next_chart_alert_event_set_read(text,uuid,boolean)
  from public, anon, authenticated;
grant execute on function stockscout_api.next_chart_alert_event_set_read(text,uuid,boolean)
  to service_role;
