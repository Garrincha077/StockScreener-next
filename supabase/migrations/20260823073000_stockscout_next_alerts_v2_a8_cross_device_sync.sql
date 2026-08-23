-- Chart Alerts v2 / A8
-- Cross-device alert identity using a user-managed recovery/sync key.
-- The raw recovery key is never stored: the Edge gateway hashes it before RPC use.
-- User-sidecar only; no StockScout scoring, scan data or frozen LEGACY behavior.

create table if not exists stockscout_private.stockscout_next_alert_sync_profiles (
  sync_hash text primary key check (sync_hash ~ '^[0-9a-f]{64}$'),
  owner_key text not null unique check (owner_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stockscout_private.stockscout_next_alert_device_links (
  device_owner_key text primary key check (device_owner_key ~ '^[0-9a-f]{64}$'),
  owner_key text not null references stockscout_private.stockscout_next_alert_sync_profiles(owner_key) on delete cascade,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stockscout_next_alert_device_links_owner_idx
  on stockscout_private.stockscout_next_alert_device_links(owner_key, linked_at);

revoke all on table stockscout_private.stockscout_next_alert_sync_profiles from public, anon, authenticated;
revoke all on table stockscout_private.stockscout_next_alert_device_links from public, anon, authenticated;

create or replace function stockscout_api.next_chart_alert_owner_resolve(p_device_owner_key text)
returns text
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

  select l.owner_key into v_owner_key
    from stockscout_private.stockscout_next_alert_device_links l
   where l.device_owner_key = p_device_owner_key;

  return coalesce(v_owner_key, p_device_owner_key);
end;
$$;

create or replace function stockscout_api.next_chart_alert_sync_status(p_device_owner_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_owner_key text;
  v_profile stockscout_private.stockscout_next_alert_sync_profiles%rowtype;
  v_linked boolean;
  v_devices integer;
begin
  if p_device_owner_key is null or p_device_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device owner key' using errcode = '22023';
  end if;

  v_owner_key := stockscout_api.next_chart_alert_owner_resolve(p_device_owner_key);

  select * into v_profile
    from stockscout_private.stockscout_next_alert_sync_profiles
   where owner_key = v_owner_key;

  if not found then
    return jsonb_build_object(
      'enabled', false,
      'linked', false,
      'primaryDevice', false,
      'deviceCount', 0
    );
  end if;

  select exists(
    select 1
      from stockscout_private.stockscout_next_alert_device_links l
     where l.device_owner_key = p_device_owner_key
       and l.owner_key = v_owner_key
  ) into v_linked;

  select count(*)::integer into v_devices
    from stockscout_private.stockscout_next_alert_device_links l
   where l.owner_key = v_owner_key;

  return jsonb_build_object(
    'enabled', true,
    'linked', v_linked,
    'primaryDevice', p_device_owner_key = v_owner_key,
    'deviceCount', v_devices,
    'createdAt', v_profile.created_at,
    'updatedAt', v_profile.updated_at
  );
end;
$$;

create or replace function stockscout_api.next_chart_alert_sync_create(
  p_device_owner_key text,
  p_sync_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_existing_owner text;
begin
  if p_device_owner_key is null or p_device_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device owner key' using errcode = '22023';
  end if;
  if p_sync_hash is null or p_sync_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sync hash' using errcode = '22023';
  end if;

  select owner_key into v_existing_owner
    from stockscout_private.stockscout_next_alert_device_links
   where device_owner_key = p_device_owner_key
   for update;

  if v_existing_owner is not null then
    raise exception 'cross-device sync is already enabled for this device' using errcode = 'P0001';
  end if;

  if exists(
    select 1 from stockscout_private.stockscout_next_alert_sync_profiles
     where owner_key = p_device_owner_key
  ) then
    raise exception 'cross-device sync is already enabled for this owner' using errcode = 'P0001';
  end if;

  begin
    insert into stockscout_private.stockscout_next_alert_sync_profiles(sync_hash, owner_key)
    values (p_sync_hash, p_device_owner_key);
  exception when unique_violation then
    raise exception 'recovery key is already in use' using errcode = 'P0001';
  end;

  insert into stockscout_private.stockscout_next_alert_device_links(device_owner_key, owner_key)
  values (p_device_owner_key, p_device_owner_key);

  return stockscout_api.next_chart_alert_sync_status(p_device_owner_key);
end;
$$;

create or replace function stockscout_api.next_chart_alert_sync_join(
  p_device_owner_key text,
  p_sync_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private', 'vault'
as $$
declare
  v_target_owner text;
  v_existing_owner text;
  v_source_has_profile boolean;
  v_source_telegram stockscout_private.stockscout_next_telegram_connections%rowtype;
  v_target_telegram stockscout_private.stockscout_next_telegram_connections%rowtype;
begin
  if p_device_owner_key is null or p_device_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device owner key' using errcode = '22023';
  end if;
  if p_sync_hash is null or p_sync_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sync hash' using errcode = '22023';
  end if;

  select owner_key into v_target_owner
    from stockscout_private.stockscout_next_alert_sync_profiles
   where sync_hash = p_sync_hash
   for update;

  if v_target_owner is null then
    raise exception 'recovery key not found' using errcode = 'P0002';
  end if;

  select owner_key into v_existing_owner
    from stockscout_private.stockscout_next_alert_device_links
   where device_owner_key = p_device_owner_key
   for update;

  if v_existing_owner is not null then
    if v_existing_owner <> v_target_owner then
      raise exception 'this device is already linked to another sync profile' using errcode = 'P0001';
    end if;
    return stockscout_api.next_chart_alert_sync_status(p_device_owner_key);
  end if;

  if p_device_owner_key = v_target_owner then
    insert into stockscout_private.stockscout_next_alert_device_links(device_owner_key, owner_key)
    values (p_device_owner_key, v_target_owner)
    on conflict (device_owner_key) do update
       set owner_key = excluded.owner_key, updated_at = now();
    return stockscout_api.next_chart_alert_sync_status(p_device_owner_key);
  end if;

  select exists(
    select 1
      from stockscout_private.stockscout_next_alert_sync_profiles
     where owner_key = p_device_owner_key
  ) into v_source_has_profile;

  if v_source_has_profile then
    raise exception 'cannot merge a device that is the primary owner of another sync profile' using errcode = 'P0001';
  end if;

  select * into v_source_telegram
    from stockscout_private.stockscout_next_telegram_connections
   where owner_key = p_device_owner_key
   for update;

  select * into v_target_telegram
    from stockscout_private.stockscout_next_telegram_connections
   where owner_key = v_target_owner
   for update;

  if v_source_telegram.owner_key is not null and v_target_telegram.owner_key is not null then
    raise exception 'both device profiles have Telegram configured; disconnect one before merging' using errcode = 'P0001';
  end if;

  -- Preserve any drawings/alerts already created on the joining browser by moving
  -- their owner scope to the first device's canonical owner. UUID identities stay
  -- unchanged, so drawing/rule/event relationships and dedupe identities remain valid.
  update stockscout_private.stockscout_next_chart_alerts
     set owner_key = v_target_owner
   where owner_key = p_device_owner_key;

  update stockscout_private.stockscout_next_drawings
     set owner_key = v_target_owner
   where owner_key = p_device_owner_key;

  update stockscout_private.stockscout_next_alert_rules
     set owner_key = v_target_owner
   where owner_key = p_device_owner_key;

  update stockscout_private.stockscout_next_alert_status
     set owner_key = v_target_owner
   where owner_key = p_device_owner_key;

  update stockscout_private.stockscout_next_alert_events
     set owner_key = v_target_owner
   where owner_key = p_device_owner_key;

  if v_source_telegram.owner_key is not null then
    update stockscout_private.stockscout_next_telegram_connections
       set owner_key = v_target_owner,
           updated_at = now()
     where owner_key = p_device_owner_key;

    perform vault.update_secret(
      v_source_telegram.bot_token_secret_id,
      null,
      'stockscout_next_telegram_bot_' || v_target_owner,
      'StockScout Next owner-scoped Telegram bot token'
    );
    perform vault.update_secret(
      v_source_telegram.chat_id_secret_id,
      null,
      'stockscout_next_telegram_chat_' || v_target_owner,
      'StockScout Next owner-scoped Telegram chat id'
    );
  end if;

  insert into stockscout_private.stockscout_next_alert_device_links(device_owner_key, owner_key)
  values (p_device_owner_key, v_target_owner);

  update stockscout_private.stockscout_next_alert_sync_profiles
     set updated_at = now()
   where owner_key = v_target_owner;

  return stockscout_api.next_chart_alert_sync_status(p_device_owner_key);
end;
$$;

create or replace function stockscout_api.next_chart_alert_sync_unlink(p_device_owner_key text)
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

  select owner_key into v_owner_key
    from stockscout_private.stockscout_next_alert_device_links
   where device_owner_key = p_device_owner_key
   for update;

  if v_owner_key is null then
    return stockscout_api.next_chart_alert_sync_status(p_device_owner_key);
  end if;

  if p_device_owner_key = v_owner_key then
    raise exception 'primary sync device cannot be unlinked; rotate or disable the profile in a later recovery flow' using errcode = 'P0001';
  end if;

  delete from stockscout_private.stockscout_next_alert_device_links
   where device_owner_key = p_device_owner_key;

  update stockscout_private.stockscout_next_alert_sync_profiles
     set updated_at = now()
   where owner_key = v_owner_key;

  return jsonb_build_object(
    'enabled', false,
    'linked', false,
    'primaryDevice', false,
    'deviceCount', 0
  );
end;
$$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'stockscout_api'
       and p.proname in (
         'next_chart_alert_owner_resolve',
         'next_chart_alert_sync_status',
         'next_chart_alert_sync_create',
         'next_chart_alert_sync_join',
         'next_chart_alert_sync_unlink'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;
