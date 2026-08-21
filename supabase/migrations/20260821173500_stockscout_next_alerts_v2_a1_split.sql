-- Chart Alerts v2 / A1
-- Separate persistent drawing geometry from alert rules while keeping the
-- current MVP chart-alert table/API as a compatibility mirror until A2+.
-- This migration is user-sidecar only; it does not touch StockScout scan data.

create table if not exists stockscout_private.stockscout_next_drawings (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null check (owner_key ~ '^[0-9a-f]{64}$'),
  ticker text not null check (ticker = upper(ticker) and ticker ~ '^[A-Z0-9.-]{1,16}$'),
  kind text not null check (kind in ('trendline','horizontal')),
  interval text not null default 'D' check (interval in ('D','W')),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) = 2),
  extension text not null default 'ray_right' check (extension in ('ray_right','pane')),
  label text,
  style jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  legacy_alert_id uuid unique references stockscout_private.stockscout_next_chart_alerts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stockscout_next_drawings_owner_ticker_idx
  on stockscout_private.stockscout_next_drawings(owner_key, ticker, updated_at desc);

alter table stockscout_private.stockscout_next_drawings enable row level security;
revoke all on stockscout_private.stockscout_next_drawings from public, anon, authenticated;

create table if not exists stockscout_private.stockscout_next_alert_rules (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references stockscout_private.stockscout_next_drawings(id) on delete cascade,
  owner_key text not null check (owner_key ~ '^[0-9a-f]{64}$'),
  condition text not null check (condition in ('cross_above','cross_below','touch')),
  source text not null default 'close' check (source in ('close','wick')),
  lifecycle text not null default 'rearm' check (lifecycle in ('one_shot','rearm')),
  enabled boolean not null default false,
  notify_in_app boolean not null default true,
  notify_telegram boolean not null default true,
  legacy_alert_id uuid unique references stockscout_private.stockscout_next_chart_alerts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(drawing_id)
);

create index if not exists stockscout_next_alert_rules_owner_enabled_idx
  on stockscout_private.stockscout_next_alert_rules(owner_key, enabled, updated_at desc);

alter table stockscout_private.stockscout_next_alert_rules enable row level security;
revoke all on stockscout_private.stockscout_next_alert_rules from public, anon, authenticated;

create table if not exists stockscout_private.stockscout_next_alert_status (
  drawing_id uuid primary key references stockscout_private.stockscout_next_drawings(id) on delete cascade,
  rule_id uuid references stockscout_private.stockscout_next_alert_rules(id) on delete set null,
  owner_key text not null check (owner_key ~ '^[0-9a-f]{64}$'),
  projected_line_price numeric,
  latest_close numeric,
  latest_high numeric,
  latest_low numeric,
  distance_pct numeric,
  latest_market_date date,
  state text not null default 'paused' check (state in ('active','approaching','triggered','paused','needs_review')),
  review_reason text,
  evaluated_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists stockscout_next_alert_status_owner_state_idx
  on stockscout_private.stockscout_next_alert_status(owner_key, state, updated_at desc);

alter table stockscout_private.stockscout_next_alert_status enable row level security;
revoke all on stockscout_private.stockscout_next_alert_status from public, anon, authenticated;

-- Event schema is extended now, but the deployed A0/MVP evaluator can keep its
-- existing RPC signature. A1 fills the new provenance fields server-side.
alter table stockscout_private.stockscout_next_alert_events
  add column if not exists drawing_id uuid,
  add column if not exists rule_id uuid,
  add column if not exists interval text,
  add column if not exists source text,
  add column if not exists prev_line_price numeric,
  add column if not exists current_line_price numeric,
  add column if not exists dedupe_identity text;

-- Deterministic one-time backfill from the MVP combined rows. The old schema did
-- not persist D/W. We preserve the actual live evaluator semantics as D and mark
-- migrated sloped lines for review rather than pretending the lost interval is known.
insert into stockscout_private.stockscout_next_drawings(
  id, owner_key, ticker, kind, interval, points, extension, metadata,
  legacy_alert_id, created_at, updated_at
)
select
  a.id,
  a.owner_key,
  a.ticker,
  case
    when abs(((a.points->0->>'price')::numeric) - ((a.points->1->>'price')::numeric)) < 0.000000001
      then 'horizontal'
    else 'trendline'
  end,
  'D',
  a.points,
  case
    when abs(((a.points->0->>'price')::numeric) - ((a.points->1->>'price')::numeric)) < 0.000000001
      then 'pane'
    else 'ray_right'
  end,
  jsonb_build_object(
    'migratedFrom', 'chart_alert_mvp',
    'legacyIntervalUnknown', true,
    'runtimeIntervalPreserved', 'D'
  ),
  a.id,
  a.created_at,
  a.updated_at
from stockscout_private.stockscout_next_chart_alerts a
on conflict (id) do nothing;

insert into stockscout_private.stockscout_next_alert_rules(
  id, drawing_id, owner_key, condition, source, lifecycle, enabled,
  notify_in_app, notify_telegram, legacy_alert_id, created_at, updated_at
)
select
  a.id,
  a.id,
  a.owner_key,
  case a.mode
    when 'break_up' then 'cross_above'
    when 'break_down' then 'cross_below'
    else 'touch'
  end,
  case when a.mode = 'touch' then 'wick' else 'close' end,
  'rearm',
  a.enabled,
  true,
  a.notify_telegram,
  a.id,
  a.created_at,
  a.updated_at
from stockscout_private.stockscout_next_chart_alerts a
on conflict (drawing_id) do nothing;

insert into stockscout_private.stockscout_next_alert_status(
  drawing_id, rule_id, owner_key, state, review_reason, updated_at
)
select
  d.id,
  r.id,
  d.owner_key,
  case
    when d.kind = 'trendline' then 'needs_review'
    when r.enabled then 'active'
    else 'paused'
  end,
  case when d.kind = 'trendline' then 'legacy_interval_not_persisted' else null end,
  greatest(d.updated_at, r.updated_at)
from stockscout_private.stockscout_next_drawings d
join stockscout_private.stockscout_next_alert_rules r on r.drawing_id = d.id
on conflict (drawing_id) do nothing;

update stockscout_private.stockscout_next_alert_events e
   set drawing_id = coalesce(e.drawing_id, d.id),
       rule_id = coalesce(e.rule_id, r.id),
       interval = coalesce(e.interval, d.interval),
       source = coalesce(e.source, r.source),
       current_line_price = coalesce(e.current_line_price, e.line_price),
       dedupe_identity = coalesce(e.dedupe_identity, e.alert_id::text || ':' || e.scan_generated_at::text)
  from stockscout_private.stockscout_next_drawings d
  left join stockscout_private.stockscout_next_alert_rules r on r.drawing_id = d.id
 where d.legacy_alert_id = e.alert_id;

-- V2 read model. This is not used by the current MVP Edge Function yet.
create or replace function stockscout_api.next_chart_alert_v2_snapshot(p_owner_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_drawings jsonb;
  v_rules jsonb;
  v_status jsonb;
  v_events jsonb;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.updated_at desc), '[]'::jsonb)
    into v_drawings
    from stockscout_private.stockscout_next_drawings d
   where d.owner_key = p_owner_key;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc), '[]'::jsonb)
    into v_rules
    from stockscout_private.stockscout_next_alert_rules r
   where r.owner_key = p_owner_key;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc), '[]'::jsonb)
    into v_status
    from stockscout_private.stockscout_next_alert_status s
   where s.owner_key = p_owner_key;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
    into v_events
    from (
      select *
        from stockscout_private.stockscout_next_alert_events
       where owner_key = p_owner_key
       order by created_at desc
       limit 100
    ) e;

  return jsonb_build_object(
    'drawings', v_drawings,
    'rules', v_rules,
    'status', v_status,
    'events', v_events
  );
end;
$$;

create or replace function stockscout_api.next_chart_drawing_upsert(p_owner_key text, p_drawing jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_id uuid;
  v_ticker text := upper(trim(coalesce(p_drawing->>'ticker','')));
  v_kind text := coalesce(p_drawing->>'kind','trendline');
  v_interval text := coalesce(p_drawing->>'interval','D');
  v_points jsonb := p_drawing->'points';
  v_extension text := coalesce(p_drawing->>'extension', case when v_kind='horizontal' then 'pane' else 'ray_right' end);
  v_label text := nullif(p_drawing->>'label','');
  v_style jsonb := coalesce(p_drawing->'style','{}'::jsonb);
  v_result jsonb;
  v_legacy_id uuid;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;
  if v_ticker !~ '^[A-Z0-9.-]{1,16}$' then
    raise exception 'invalid ticker' using errcode = '22023';
  end if;
  if v_kind not in ('trendline','horizontal') or v_interval not in ('D','W') or v_extension not in ('ray_right','pane') then
    raise exception 'invalid drawing contract' using errcode = '22023';
  end if;
  if jsonb_typeof(v_points) <> 'array' or jsonb_array_length(v_points) <> 2 then
    raise exception 'invalid drawing geometry' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_points) p
     where jsonb_typeof(p) <> 'object'
        or coalesce(p->>'time','') !~ '^\d{4}-\d{2}-\d{2}$'
        or jsonb_typeof(p->'price') <> 'number'
        or (p->>'price')::numeric <= 0
  ) then
    raise exception 'invalid drawing point' using errcode = '22023';
  end if;
  if jsonb_typeof(v_style) <> 'object' then
    raise exception 'invalid drawing style' using errcode = '22023';
  end if;

  if nullif(p_drawing->>'id','') is not null then
    begin
      v_id := (p_drawing->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid drawing id' using errcode = '22023';
    end;

    update stockscout_private.stockscout_next_drawings
       set ticker = v_ticker,
           kind = v_kind,
           interval = v_interval,
           points = v_points,
           extension = v_extension,
           label = v_label,
           style = v_style,
           metadata = metadata - 'legacyIntervalUnknown',
           updated_at = now()
     where id = v_id and owner_key = p_owner_key
     returning legacy_alert_id, to_jsonb(stockscout_private.stockscout_next_drawings.*)
          into v_legacy_id, v_result;

    if v_result is null then
      raise exception 'drawing not found' using errcode = 'P0002';
    end if;
  else
    insert into stockscout_private.stockscout_next_drawings(
      owner_key,ticker,kind,interval,points,extension,label,style
    ) values (
      p_owner_key,v_ticker,v_kind,v_interval,v_points,v_extension,v_label,v_style
    )
    returning id, legacy_alert_id, to_jsonb(stockscout_private.stockscout_next_drawings.*)
         into v_id, v_legacy_id, v_result;

    insert into stockscout_private.stockscout_next_alert_status(drawing_id,owner_key,state)
    values (v_id,p_owner_key,'paused')
    on conflict (drawing_id) do nothing;
  end if;

  -- Keep current MVP geometry in sync if this drawing already has a v1 mirror.
  if v_legacy_id is not null then
    update stockscout_private.stockscout_next_chart_alerts
       set ticker = v_ticker, points = v_points, updated_at = now()
     where id = v_legacy_id and owner_key = p_owner_key;
  end if;

  return v_result;
end;
$$;

create or replace function stockscout_api.next_chart_drawing_delete(p_owner_key text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_legacy_id uuid;
  v_count integer;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select legacy_alert_id into v_legacy_id
    from stockscout_private.stockscout_next_drawings
   where id = p_id and owner_key = p_owner_key;

  delete from stockscout_private.stockscout_next_drawings
   where id = p_id and owner_key = p_owner_key;
  get diagnostics v_count = row_count;

  if v_legacy_id is not null then
    delete from stockscout_private.stockscout_next_chart_alerts
     where id = v_legacy_id and owner_key = p_owner_key;
  end if;

  return v_count > 0;
end;
$$;

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

  -- Until A2 replaces the deployed evaluator, do not allow a new V2 caller to
  -- enable semantics that the MVP evaluator cannot faithfully reproduce.
  if v_enabled and v_drawing.interval = 'W' then
    raise exception 'weekly alert activation requires A2 evaluator' using errcode = '55000';
  end if;
  if v_enabled and v_source = 'wick' and v_condition in ('cross_above','cross_below') then
    raise exception 'wick crossing activation requires A2 evaluator' using errcode = '55000';
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

create or replace function stockscout_api.next_chart_alert_rule_delete(p_owner_key text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_drawing_id uuid;
  v_legacy_id uuid;
  v_count integer;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select drawing_id,legacy_alert_id into v_drawing_id,v_legacy_id
    from stockscout_private.stockscout_next_alert_rules
   where id = p_id and owner_key = p_owner_key;
  if not found then return false; end if;

  delete from stockscout_private.stockscout_next_alert_rules
   where id = p_id and owner_key = p_owner_key;
  get diagnostics v_count = row_count;

  -- Keep the compatibility drawing visible to the current MVP UI, but make it
  -- inert so the old evaluator cannot fire a deleted V2 rule.
  if v_legacy_id is not null then
    update stockscout_private.stockscout_next_chart_alerts
       set mode = 'touch', enabled = false, notify_telegram = false, updated_at = now()
     where id = v_legacy_id and owner_key = p_owner_key;
  end if;

  insert into stockscout_private.stockscout_next_alert_status(
    drawing_id,rule_id,owner_key,state,review_reason,updated_at
  ) values (v_drawing_id,null,p_owner_key,'paused',null,now())
  on conflict (drawing_id) do update
     set rule_id = null, state = 'paused', review_reason = null, updated_at = now();

  return v_count > 0;
end;
$$;

-- Keep the current V1 Edge/client contract working. V1 writes are dual-written
-- into the split model; V1 reads/evaluator remain on the compatibility table.
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
  v_kind text;
  v_condition text;
  v_source text;
  v_rule_id uuid;
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
    select 1 from jsonb_array_elements(v_points) p
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
    v_id := gen_random_uuid();
    insert into stockscout_private.stockscout_next_chart_alerts(
      id,owner_key,ticker,points,mode,enabled,notify_telegram
    ) values (v_id,p_owner_key,v_ticker,v_points,v_mode,v_enabled,v_notify)
    returning to_jsonb(stockscout_private.stockscout_next_chart_alerts.*) into v_result;
  end if;

  v_kind := case
    when abs(((v_points->0->>'price')::numeric) - ((v_points->1->>'price')::numeric)) < 0.000000001
      then 'horizontal'
    else 'trendline'
  end;
  v_condition := case v_mode
    when 'break_up' then 'cross_above'
    when 'break_down' then 'cross_below'
    else 'touch'
  end;
  v_source := case when v_mode='touch' then 'wick' else 'close' end;

  insert into stockscout_private.stockscout_next_drawings(
    id,owner_key,ticker,kind,interval,points,extension,metadata,legacy_alert_id
  ) values (
    v_id,p_owner_key,v_ticker,v_kind,'D',v_points,
    case when v_kind='horizontal' then 'pane' else 'ray_right' end,
    jsonb_build_object('source','legacy_v1','legacyIntervalUnknown',true,'runtimeIntervalPreserved','D'),
    v_id
  )
  on conflict (id) do update
     set ticker = excluded.ticker,
         kind = excluded.kind,
         points = excluded.points,
         extension = excluded.extension,
         legacy_alert_id = excluded.legacy_alert_id,
         updated_at = now();

  select id into v_rule_id
    from stockscout_private.stockscout_next_alert_rules
   where drawing_id = v_id and owner_key = p_owner_key;
  if v_rule_id is null then v_rule_id := v_id; end if;

  insert into stockscout_private.stockscout_next_alert_rules(
    id,drawing_id,owner_key,condition,source,lifecycle,enabled,
    notify_in_app,notify_telegram,legacy_alert_id
  ) values (
    v_rule_id,v_id,p_owner_key,v_condition,v_source,'rearm',v_enabled,true,v_notify,v_id
  )
  on conflict (drawing_id) do update
     set condition = excluded.condition,
         source = excluded.source,
         enabled = excluded.enabled,
         notify_telegram = excluded.notify_telegram,
         legacy_alert_id = excluded.legacy_alert_id,
         updated_at = now()
  returning id into v_rule_id;

  insert into stockscout_private.stockscout_next_alert_status(
    drawing_id,rule_id,owner_key,state,review_reason,updated_at
  ) values (
    v_id,v_rule_id,p_owner_key,
    case when v_kind='trendline' then 'needs_review' when v_enabled then 'active' else 'paused' end,
    case when v_kind='trendline' then 'legacy_interval_not_persisted' else null end,
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

create or replace function stockscout_api.next_chart_alert_delete(p_owner_key text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_drawing_count integer := 0;
  v_alert_count integer := 0;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  delete from stockscout_private.stockscout_next_drawings
   where id = p_id and owner_key = p_owner_key;
  get diagnostics v_drawing_count = row_count;

  delete from stockscout_private.stockscout_next_chart_alerts
   where id = p_id and owner_key = p_owner_key;
  get diagnostics v_alert_count = row_count;

  return v_drawing_count > 0 or v_alert_count > 0;
end;
$$;

-- Preserve the deployed event-insert signature while recording A1 provenance.
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
  v_drawing_id uuid;
  v_rule_id uuid;
  v_interval text;
  v_source text;
  v_id uuid;
begin
  if p_event_type not in ('break_up','break_down','touch') then
    raise exception 'invalid event type' using errcode = '22023';
  end if;
  if p_telegram_status not in ('not_configured','pending','sent','error') then
    raise exception 'invalid telegram status' using errcode = '22023';
  end if;

  select a.owner_key,a.ticker,d.id,r.id,d.interval,r.source
    into v_owner_key,v_ticker,v_drawing_id,v_rule_id,v_interval,v_source
    from stockscout_private.stockscout_next_chart_alerts a
    left join stockscout_private.stockscout_next_drawings d on d.legacy_alert_id = a.id
    left join stockscout_private.stockscout_next_alert_rules r on r.drawing_id = d.id
   where a.id = p_alert_id;
  if v_owner_key is null then
    raise exception 'alert not found' using errcode = 'P0002';
  end if;

  insert into stockscout_private.stockscout_next_alert_events(
    alert_id,owner_key,ticker,event_type,scan_generated_at,market_date,
    line_price,close_price,message,telegram_status,
    drawing_id,rule_id,interval,source,current_line_price,dedupe_identity
  ) values (
    p_alert_id,v_owner_key,v_ticker,p_event_type,p_scan_generated_at,p_market_date,
    p_line_price,p_close_price,p_message,p_telegram_status,
    v_drawing_id,v_rule_id,v_interval,v_source,p_line_price,
    p_alert_id::text || ':' || p_scan_generated_at::text
  )
  on conflict (alert_id,scan_generated_at) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Service-role-only gateway, matching the existing alert security pattern.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='stockscout_api'
       and (p.proname like 'next_chart_alert_%' or p.proname like 'next_chart_drawing_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;
