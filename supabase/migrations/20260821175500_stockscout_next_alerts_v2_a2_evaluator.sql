-- Chart Alerts v2 / A2
-- Cut evaluator reads over to split drawing/rule persistence and make the old
-- combined-table evaluator fail closed. User-sidecar only; no StockScout scan data.

-- Old Edge versions must fail closed after this migration rather than evaluate
-- Weekly/sloped rules with the pre-A0 calendar-day math.
create or replace function stockscout_api.next_chart_alert_enabled()
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
  select '[]'::jsonb
$$;

-- Exact evaluator read model: one row contains drawing geometry + rule semantics.
create or replace function stockscout_api.next_chart_alert_v2_enabled()
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rule_id', r.id,
      'drawing_id', d.id,
      'legacy_alert_id', r.legacy_alert_id,
      'owner_key', r.owner_key,
      'ticker', d.ticker,
      'kind', d.kind,
      'interval', d.interval,
      'points', d.points,
      'extension', d.extension,
      'metadata', d.metadata,
      'condition', r.condition,
      'source', r.source,
      'lifecycle', r.lifecycle,
      'enabled', r.enabled,
      'notify_in_app', r.notify_in_app,
      'notify_telegram', r.notify_telegram,
      'updated_at', greatest(d.updated_at, r.updated_at)
    ) order by greatest(d.updated_at, r.updated_at)
  ), '[]'::jsonb)
  from stockscout_private.stockscout_next_alert_rules r
  join stockscout_private.stockscout_next_drawings d on d.id = r.drawing_id
  where r.enabled = true
$$;

-- A2 makes the previously stored D/W and wick-cross contracts executable.
-- Keep the compatibility mirror for rollback/browser compatibility, but it is no
-- longer an evaluator source because next_chart_alert_enabled() fails closed.
create or replace function stockscout_api.next_chart_alert_rule_upsert(p_owner_key text, p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_id uuid;
  v_drawing_id uuid;
  v_condition text := coalesce(p_rule->>'condition','touch');
  v_source text := coalesce(p_rule->>'source', case when v_condition='touch' then 'wick' else 'close' end);
  v_lifecycle text := coalesce(p_rule->>'lifecycle','rearm');
  v_enabled boolean := coalesce((p_rule->>'enabled')::boolean, false);
  v_notify_in_app boolean := coalesce((p_rule->>'notifyInApp')::boolean, true);
  v_notify_telegram boolean := coalesce((p_rule->>'notifyTelegram')::boolean, true);
  v_drawing stockscout_private.stockscout_next_drawings%rowtype;
  v_existing stockscout_private.stockscout_next_alert_rules%rowtype;
  v_legacy_id uuid;
  v_mode text;
  v_result jsonb;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;
  begin
    v_drawing_id := (p_rule->>'drawingId')::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception 'invalid drawing id' using errcode = '22023';
  end;
  if v_condition not in ('cross_above','cross_below','touch')
     or v_source not in ('close','wick')
     or v_lifecycle not in ('one_shot','rearm') then
    raise exception 'invalid alert rule' using errcode = '22023';
  end if;
  if v_condition = 'touch' and v_source <> 'wick' then
    raise exception 'touch requires wick source' using errcode = '22023';
  end if;

  select * into v_drawing
    from stockscout_private.stockscout_next_drawings
   where id = v_drawing_id and owner_key = p_owner_key;
  if not found then
    raise exception 'drawing not found' using errcode = 'P0002';
  end if;

  select * into v_existing
    from stockscout_private.stockscout_next_alert_rules
   where drawing_id = v_drawing_id and owner_key = p_owner_key;

  if nullif(p_rule->>'id','') is not null then
    begin
      v_id := (p_rule->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid rule id' using errcode = '22023';
    end;
    if v_existing.id is not null and v_existing.id <> v_id then
      raise exception 'rule id does not match drawing rule' using errcode = '22023';
    end if;
  else
    v_id := coalesce(v_existing.id, gen_random_uuid());
  end if;

  v_mode := case v_condition
    when 'cross_above' then 'break_up'
    when 'cross_below' then 'break_down'
    else 'touch'
  end;

  v_legacy_id := v_drawing.legacy_alert_id;
  if v_legacy_id is null then
    v_legacy_id := v_drawing.id;
    insert into stockscout_private.stockscout_next_chart_alerts(
      id,owner_key,ticker,points,mode,enabled,notify_telegram
    ) values (
      v_legacy_id,p_owner_key,v_drawing.ticker,v_drawing.points,v_mode,v_enabled,v_notify_telegram
    );
    update stockscout_private.stockscout_next_drawings
       set legacy_alert_id = v_legacy_id, updated_at = now()
     where id = v_drawing.id;
  else
    update stockscout_private.stockscout_next_chart_alerts
       set ticker = v_drawing.ticker,
           points = v_drawing.points,
           mode = v_mode,
           enabled = v_enabled,
           notify_telegram = v_notify_telegram,
           updated_at = now()
     where id = v_legacy_id and owner_key = p_owner_key;
  end if;

  insert into stockscout_private.stockscout_next_alert_rules(
    id,drawing_id,owner_key,condition,source,lifecycle,enabled,
    notify_in_app,notify_telegram,legacy_alert_id
  ) values (
    v_id,v_drawing_id,p_owner_key,v_condition,v_source,v_lifecycle,v_enabled,
    v_notify_in_app,v_notify_telegram,v_legacy_id
  )
  on conflict (drawing_id) do update
     set condition = excluded.condition,
         source = excluded.source,
         lifecycle = excluded.lifecycle,
         enabled = excluded.enabled,
         notify_in_app = excluded.notify_in_app,
         notify_telegram = excluded.notify_telegram,
         legacy_alert_id = excluded.legacy_alert_id,
         updated_at = now()
  returning to_jsonb(stockscout_private.stockscout_next_alert_rules.*) into v_result;

  insert into stockscout_private.stockscout_next_alert_status(
    drawing_id,rule_id,owner_key,state,review_reason,updated_at
  ) values (
    v_drawing_id,v_id,p_owner_key,
    case when v_enabled then 'active' else 'paused' end,
    null,
    now()
  )
  on conflict (drawing_id) do update
     set rule_id = excluded.rule_id,
         state = excluded.state,
         review_reason = excluded.review_reason,
         updated_at = now();

  return v_result;
end;
$$;

create or replace function stockscout_api.next_chart_alert_status_update(
  p_rule_id uuid,
  p_state text,
  p_review_reason text,
  p_projected_line_price numeric,
  p_latest_close numeric,
  p_latest_high numeric,
  p_latest_low numeric,
  p_distance_pct numeric,
  p_latest_market_date date,
  p_evaluated_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_rule stockscout_private.stockscout_next_alert_rules%rowtype;
  v_count integer;
begin
  if p_state not in ('active','approaching','triggered','paused','needs_review') then
    raise exception 'invalid alert status' using errcode = '22023';
  end if;
  select * into v_rule
    from stockscout_private.stockscout_next_alert_rules
   where id = p_rule_id;
  if not found then
    raise exception 'rule not found' using errcode = 'P0002';
  end if;

  insert into stockscout_private.stockscout_next_alert_status(
    drawing_id,rule_id,owner_key,projected_line_price,latest_close,latest_high,latest_low,
    distance_pct,latest_market_date,state,review_reason,evaluated_at,updated_at
  ) values (
    v_rule.drawing_id,v_rule.id,v_rule.owner_key,p_projected_line_price,p_latest_close,p_latest_high,p_latest_low,
    p_distance_pct,p_latest_market_date,p_state,p_review_reason,p_evaluated_at,now()
  )
  on conflict (drawing_id) do update
     set rule_id = excluded.rule_id,
         owner_key = excluded.owner_key,
         projected_line_price = excluded.projected_line_price,
         latest_close = excluded.latest_close,
         latest_high = excluded.latest_high,
         latest_low = excluded.latest_low,
         distance_pct = excluded.distance_pct,
         latest_market_date = excluded.latest_market_date,
         state = excluded.state,
         review_reason = excluded.review_reason,
         evaluated_at = excluded.evaluated_at,
         updated_at = now();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function stockscout_api.next_chart_alert_v2_event_insert(
  p_rule_id uuid,
  p_scan_generated_at timestamptz,
  p_market_date date,
  p_prev_line_price numeric,
  p_current_line_price numeric,
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
  v_rule stockscout_private.stockscout_next_alert_rules%rowtype;
  v_drawing stockscout_private.stockscout_next_drawings%rowtype;
  v_event_type text;
  v_id uuid;
begin
  if p_telegram_status not in ('not_configured','pending','sent','error') then
    raise exception 'invalid telegram status' using errcode = '22023';
  end if;
  select * into v_rule
    from stockscout_private.stockscout_next_alert_rules
   where id = p_rule_id;
  if not found then
    raise exception 'rule not found' using errcode = 'P0002';
  end if;
  select * into v_drawing
    from stockscout_private.stockscout_next_drawings
   where id = v_rule.drawing_id;
  if not found or v_rule.legacy_alert_id is null then
    raise exception 'drawing compatibility mirror missing' using errcode = 'P0002';
  end if;

  v_event_type := case v_rule.condition
    when 'cross_above' then 'break_up'
    when 'cross_below' then 'break_down'
    else 'touch'
  end;

  insert into stockscout_private.stockscout_next_alert_events(
    alert_id,owner_key,ticker,event_type,scan_generated_at,market_date,
    line_price,close_price,message,telegram_status,
    drawing_id,rule_id,interval,source,prev_line_price,current_line_price,dedupe_identity
  ) values (
    v_rule.legacy_alert_id,v_rule.owner_key,v_drawing.ticker,v_event_type,p_scan_generated_at,p_market_date,
    p_current_line_price,p_close_price,p_message,p_telegram_status,
    v_drawing.id,v_rule.id,v_drawing.interval,v_rule.source,p_prev_line_price,p_current_line_price,
    v_rule.id::text || ':' || p_scan_generated_at::text
  )
  on conflict (alert_id,scan_generated_at) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function stockscout_api.next_chart_alert_rule_disable_after_fire(p_rule_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_rule stockscout_private.stockscout_next_alert_rules%rowtype;
  v_count integer;
begin
  select * into v_rule
    from stockscout_private.stockscout_next_alert_rules
   where id = p_rule_id;
  if not found then
    return false;
  end if;

  update stockscout_private.stockscout_next_alert_rules
     set enabled = false, updated_at = now()
   where id = p_rule_id;
  get diagnostics v_count = row_count;

  if v_rule.legacy_alert_id is not null then
    update stockscout_private.stockscout_next_chart_alerts
       set enabled = false, updated_at = now()
     where id = v_rule.legacy_alert_id;
  end if;

  update stockscout_private.stockscout_next_alert_status
     set state = 'triggered', updated_at = now()
   where drawing_id = v_rule.drawing_id;

  return v_count > 0;
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
       and p.proname in (
         'next_chart_alert_enabled',
         'next_chart_alert_v2_enabled',
         'next_chart_alert_rule_upsert',
         'next_chart_alert_status_update',
         'next_chart_alert_v2_event_insert',
         'next_chart_alert_rule_disable_after_fire'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;
