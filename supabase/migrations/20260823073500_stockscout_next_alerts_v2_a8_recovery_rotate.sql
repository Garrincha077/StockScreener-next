-- Chart Alerts v2 / A8 follow-up
-- Allow the primary device to replace a lost recovery key without breaking
-- already-linked devices. Only the hash is stored.

create or replace function stockscout_api.next_chart_alert_sync_rotate(
  p_device_owner_key text,
  p_sync_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_owner_key text;
begin
  if p_device_owner_key is null or p_device_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device owner key' using errcode = '22023';
  end if;
  if p_sync_hash is null or p_sync_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sync hash' using errcode = '22023';
  end if;

  select owner_key into v_owner_key
    from stockscout_private.stockscout_next_alert_device_links
   where device_owner_key = p_device_owner_key
   for update;

  if v_owner_key is null or v_owner_key <> p_device_owner_key then
    raise exception 'only the primary sync device can rotate the recovery key' using errcode = 'P0001';
  end if;

  begin
    update stockscout_private.stockscout_next_alert_sync_profiles
       set sync_hash = p_sync_hash,
           updated_at = now()
     where owner_key = v_owner_key;
    if not found then
      raise exception 'sync profile not found' using errcode = 'P0002';
    end if;
  exception when unique_violation then
    raise exception 'recovery key is already in use' using errcode = 'P0001';
  end;

  return stockscout_api.next_chart_alert_sync_status(p_device_owner_key);
end;
$$;

revoke all on function stockscout_api.next_chart_alert_sync_rotate(text,text) from public, anon, authenticated;
grant execute on function stockscout_api.next_chart_alert_sync_rotate(text,text) to service_role;
