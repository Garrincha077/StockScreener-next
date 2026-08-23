-- Chart Alerts v2 / A9
-- Derive evaluator health from actual per-rule evaluation state. This is a
-- private alert-sidecar read model only; no StockScout scan/scoring behavior.

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
  v_health jsonb;
  v_active integer := 0;
  v_evaluated integer := 0;
  v_needs_review integer := 0;
  v_stale integer := 0;
  v_last_evaluated timestamptz;
  v_state text;
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

  select
    count(*) filter (where r.enabled)::integer,
    count(*) filter (where r.enabled and s.evaluated_at is not null)::integer,
    count(*) filter (where r.enabled and s.state = 'needs_review')::integer,
    count(*) filter (
      where r.enabled
        and (s.evaluated_at is null or s.evaluated_at < now() - interval '150 minutes')
    )::integer,
    max(s.evaluated_at) filter (where r.enabled)
  into v_active, v_evaluated, v_needs_review, v_stale, v_last_evaluated
  from stockscout_private.stockscout_next_alert_rules r
  left join stockscout_private.stockscout_next_alert_status s on s.rule_id = r.id
  where r.owner_key = p_owner_key;

  v_state := case
    when v_active = 0 then 'idle'
    when v_evaluated < v_active then 'waiting'
    when v_stale > 0 then 'stale'
    when v_needs_review > 0 then 'attention'
    else 'healthy'
  end;

  v_health := jsonb_build_object(
    'state', v_state,
    'activeRules', v_active,
    'evaluatedRules', v_evaluated,
    'needsReview', v_needs_review,
    'staleRules', v_stale,
    'lastEvaluatedAt', v_last_evaluated,
    'staleAfterMinutes', 150
  );

  return jsonb_build_object(
    'drawings', v_drawings,
    'rules', v_rules,
    'status', v_status,
    'events', v_events,
    'evaluatorHealth', v_health
  );
end;
$$;

revoke all on function stockscout_api.next_chart_alert_v2_snapshot(text) from public, anon, authenticated;
grant execute on function stockscout_api.next_chart_alert_v2_snapshot(text) to service_role;
