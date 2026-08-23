create table if not exists public.stockscout_next_chart_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null check (owner_key ~ '^[0-9a-f]{64}$'),
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 16),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) = 2),
  mode text not null default 'touch' check (mode in ('break_up','break_down','touch')),
  enabled boolean not null default false,
  notify_telegram boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stockscout_next_chart_alerts_owner_ticker_idx
  on public.stockscout_next_chart_alerts(owner_key, ticker, updated_at desc);

alter table public.stockscout_next_chart_alerts enable row level security;

create table if not exists public.stockscout_next_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.stockscout_next_chart_alerts(id) on delete cascade,
  owner_key text not null check (owner_key ~ '^[0-9a-f]{64}$'),
  ticker text not null,
  event_type text not null check (event_type in ('break_up','break_down','touch')),
  scan_generated_at timestamptz not null,
  market_date date not null,
  line_price numeric,
  close_price numeric,
  message text not null,
  telegram_status text not null default 'not_configured' check (telegram_status in ('not_configured','pending','sent','error')),
  telegram_sent_at timestamptz,
  telegram_error text,
  created_at timestamptz not null default now(),
  unique(alert_id, scan_generated_at)
);

create index if not exists stockscout_next_alert_events_owner_created_idx
  on public.stockscout_next_alert_events(owner_key, created_at desc);

alter table public.stockscout_next_alert_events enable row level security;

create or replace function public.stockscout_next_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  order by created_at desc
  limit 1
$$;

revoke all on function public.stockscout_next_secret(text) from public, anon, authenticated;
grant execute on function public.stockscout_next_secret(text) to service_role;

create or replace function public.stockscout_next_validate_evaluator_key(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select decrypted_secret = candidate
    from vault.decrypted_secrets
    where name = 'stockscout_next_evaluator_key'
    order by created_at desc
    limit 1
  ), false)
$$;

revoke all on function public.stockscout_next_validate_evaluator_key(text) from public, anon, authenticated;
grant execute on function public.stockscout_next_validate_evaluator_key(text) to service_role;

revoke all on public.stockscout_next_chart_alerts from anon, authenticated;
revoke all on public.stockscout_next_alert_events from anon, authenticated;
