alter table public.stockscout_next_alert_events set schema stockscout_private;
alter table public.stockscout_next_chart_alerts set schema stockscout_private;
alter table public.stockscout_next_runtime_config set schema stockscout_private;

drop function if exists public.stockscout_next_secret(text);

create or replace function stockscout_api.next_chart_alert_snapshot(p_owner_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_alerts jsonb;
  v_events jsonb;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc), '[]'::jsonb)
    into v_alerts
    from stockscout_private.stockscout_next_chart_alerts a
   where a.owner_key = p_owner_key;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
    into v_events
    from (
      select *
        from stockscout_private.stockscout_next_alert_events
       where owner_key = p_owner_key
       order by created_at desc
       limit 50
    ) e;

  return jsonb_build_object('alerts', v_alerts, 'events', v_events);
end;
$$;

create or replace function stockscout_api.next_chart_alert_upsert(p_owner_key text, p_alert jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_id uuid;
  v_ticker text := upper(trim(coalesce(p_alert->>'ticker','')));
  v_mode text := coalesce(p_alert->>'mode','touch');
  v_points jsonb := p_alert->'points';
  v_enabled boolean := coalesce((p_alert->>'enabled')::boolean, false);
  v_notify boolean := coalesce((p_alert->>'notifyTelegram')::boolean, true);
  v_result jsonb;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;
  if v_ticker !~ '^[A-Z0-9.-]{1,16}$' then
    raise exception 'invalid ticker' using errcode = '22023';
  end if;
  if v_mode not in ('break_up','break_down','touch') then
    raise exception 'invalid alert mode' using errcode = '22023';
  end if;
  if jsonb_typeof(v_points) <> 'array' or jsonb_array_length(v_points) <> 2 then
    raise exception 'invalid alert geometry' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_points) p
     where jsonb_typeof(p) <> 'object'
        or coalesce(p->>'time','') !~ '^\d{4}-\d{2}-\d{2}$'
        or jsonb_typeof(p->'price') <> 'number'
        or (p->>'price')::numeric <= 0
  ) then
    raise exception 'invalid alert point' using errcode = '22023';
  end if;

  if nullif(p_alert->>'id','') is not null then
    begin
      v_id := (p_alert->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid alert id' using errcode = '22023';
    end;

    update stockscout_private.stockscout_next_chart_alerts
       set ticker = v_ticker,
           points = v_points,
           mode = v_mode,
           enabled = v_enabled,
           notify_telegram = v_notify,
           updated_at = now()
     where id = v_id and owner_key = p_owner_key
     returning to_jsonb(stockscout_private.stockscout_next_chart_alerts.*) into v_result;

    if v_result is null then
      raise exception 'alert not found' using errcode = 'P0002';
    end if;
  else
    insert into stockscout_private.stockscout_next_chart_alerts(owner_key,ticker,points,mode,enabled,notify_telegram)
    values (p_owner_key,v_ticker,v_points,v_mode,v_enabled,v_notify)
    returning to_jsonb(stockscout_private.stockscout_next_chart_alerts.*) into v_result;
  end if;

  return v_result;
end;
$$;

create or replace function stockscout_api.next_chart_alert_delete(p_owner_key text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare v_count integer;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;
  delete from stockscout_private.stockscout_next_chart_alerts
   where id = p_id and owner_key = p_owner_key;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function stockscout_api.next_chart_alert_evaluator_authorized(p_hash text)
returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
  select coalesce((
    select value = p_hash
      from stockscout_private.stockscout_next_runtime_config
     where key = 'evaluator_key_sha256'
  ), false)
$$;

create or replace function stockscout_api.next_chart_alert_enabled()
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at), '[]'::jsonb)
    from stockscout_private.stockscout_next_chart_alerts a
   where a.enabled = true
$$;

create or replace function stockscout_api.next_chart_alert_event_insert(
  p_alert_id uuid,
  p_event_type text,
  p_scan_generated_at timestamptz,
  p_market_date date,
  p_line_price numeric,
  p_close_price numeric,
  p_message text,
  p_telegram_status text
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_owner_key text;
  v_ticker text;
  v_id uuid;
begin
  if p_event_type not in ('break_up','break_down','touch') then
    raise exception 'invalid event type' using errcode = '22023';
  end if;
  if p_telegram_status not in ('not_configured','pending','sent','error') then
    raise exception 'invalid telegram status' using errcode = '22023';
  end if;
  select owner_key,ticker into v_owner_key,v_ticker
    from stockscout_private.stockscout_next_chart_alerts
   where id = p_alert_id;
  if v_owner_key is null then
    raise exception 'alert not found' using errcode = 'P0002';
  end if;

  insert into stockscout_private.stockscout_next_alert_events(
    alert_id,owner_key,ticker,event_type,scan_generated_at,market_date,line_price,close_price,message,telegram_status
  ) values (
    p_alert_id,v_owner_key,v_ticker,p_event_type,p_scan_generated_at,p_market_date,p_line_price,p_close_price,p_message,p_telegram_status
  )
  on conflict (alert_id,scan_generated_at) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function stockscout_api.next_chart_alert_event_telegram_update(
  p_id uuid,
  p_status text,
  p_error text default null,
  p_sent_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare v_count integer;
begin
  if p_status not in ('not_configured','pending','sent','error') then
    raise exception 'invalid telegram status' using errcode = '22023';
  end if;
  update stockscout_private.stockscout_next_alert_events
     set telegram_status = p_status,
         telegram_sent_at = p_sent_at,
         telegram_error = p_error
   where id = p_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function stockscout_api.next_chart_alert_secret(p_name text)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'vault'
as $$
declare v_secret text;
begin
  if p_name not in ('stockscout_next_telegram_bot_token','stockscout_next_telegram_chat_id') then
    raise exception 'secret name not allowed' using errcode = '22023';
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = p_name
   order by created_at desc
   limit 1;
  return coalesce(v_secret,'');
end;
$$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='stockscout_api'
       and p.proname like 'next_chart_alert_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;
