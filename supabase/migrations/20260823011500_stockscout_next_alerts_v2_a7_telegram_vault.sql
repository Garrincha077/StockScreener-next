-- Chart Alerts v2 / A7
-- Owner-scoped Telegram notification credentials stored in Supabase Vault.
-- User-sidecar only; no StockScout scoring, scan data or frozen LEGACY behavior.

create table if not exists stockscout_private.stockscout_next_telegram_connections (
  owner_key text primary key check (owner_key ~ '^[0-9a-f]{64}$'),
  bot_token_secret_id uuid not null,
  chat_id_secret_id uuid not null,
  bot_id text,
  bot_username text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table stockscout_private.stockscout_next_telegram_connections from public, anon, authenticated;

create or replace function stockscout_api.next_chart_alert_telegram_status(p_owner_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private'
as $$
declare
  v_row stockscout_private.stockscout_next_telegram_connections%rowtype;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select * into v_row
    from stockscout_private.stockscout_next_telegram_connections
   where owner_key = p_owner_key;

  if not found then
    return jsonb_build_object('configured', false);
  end if;

  return jsonb_build_object(
    'configured', true,
    'botId', v_row.bot_id,
    'botUsername', nullif(v_row.bot_username, ''),
    'connectedAt', v_row.connected_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function stockscout_api.next_chart_alert_telegram_store(
  p_owner_key text,
  p_token text,
  p_chat_id text,
  p_bot_id text default null,
  p_bot_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private', 'vault'
as $$
declare
  v_token_name text := 'stockscout_next_telegram_bot_' || p_owner_key;
  v_chat_name text := 'stockscout_next_telegram_chat_' || p_owner_key;
  v_token_secret_id uuid;
  v_chat_secret_id uuid;
  v_connected_at timestamptz;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 200 then
    raise exception 'invalid Telegram token' using errcode = '22023';
  end if;
  if p_chat_id is null or length(trim(p_chat_id)) < 1 or length(trim(p_chat_id)) > 80 then
    raise exception 'invalid Telegram chat id' using errcode = '22023';
  end if;
  if p_bot_username is not null and p_bot_username <> '' and p_bot_username !~ '^[A-Za-z0-9_]{1,64}$' then
    raise exception 'invalid Telegram bot username' using errcode = '22023';
  end if;

  select bot_token_secret_id, chat_id_secret_id, connected_at
    into v_token_secret_id, v_chat_secret_id, v_connected_at
    from stockscout_private.stockscout_next_telegram_connections
   where owner_key = p_owner_key
   for update;

  if v_token_secret_id is null then
    select id into v_token_secret_id from vault.secrets where name = v_token_name order by created_at desc limit 1;
  end if;
  if v_chat_secret_id is null then
    select id into v_chat_secret_id from vault.secrets where name = v_chat_name order by created_at desc limit 1;
  end if;

  if v_token_secret_id is null then
    v_token_secret_id := vault.create_secret(p_token, v_token_name, 'StockScout Next owner-scoped Telegram bot token');
  else
    perform vault.update_secret(v_token_secret_id, p_token, v_token_name, 'StockScout Next owner-scoped Telegram bot token');
  end if;

  if v_chat_secret_id is null then
    v_chat_secret_id := vault.create_secret(trim(p_chat_id), v_chat_name, 'StockScout Next owner-scoped Telegram chat id');
  else
    perform vault.update_secret(v_chat_secret_id, trim(p_chat_id), v_chat_name, 'StockScout Next owner-scoped Telegram chat id');
  end if;

  insert into stockscout_private.stockscout_next_telegram_connections(
    owner_key, bot_token_secret_id, chat_id_secret_id, bot_id, bot_username, connected_at, updated_at
  ) values (
    p_owner_key, v_token_secret_id, v_chat_secret_id, nullif(p_bot_id, ''), nullif(p_bot_username, ''), coalesce(v_connected_at, now()), now()
  )
  on conflict (owner_key) do update
     set bot_token_secret_id = excluded.bot_token_secret_id,
         chat_id_secret_id = excluded.chat_id_secret_id,
         bot_id = excluded.bot_id,
         bot_username = excluded.bot_username,
         updated_at = now();

  return stockscout_api.next_chart_alert_telegram_status(p_owner_key);
end;
$$;

create or replace function stockscout_api.next_chart_alert_telegram_credentials(p_owner_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private', 'vault'
as $$
declare
  v_token text;
  v_chat_id text;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select token.decrypted_secret, chat.decrypted_secret
    into v_token, v_chat_id
    from stockscout_private.stockscout_next_telegram_connections c
    join vault.decrypted_secrets token on token.id = c.bot_token_secret_id
    join vault.decrypted_secrets chat on chat.id = c.chat_id_secret_id
   where c.owner_key = p_owner_key;

  if coalesce(v_token, '') = '' or coalesce(v_chat_id, '') = '' then
    return jsonb_build_object('configured', false);
  end if;

  return jsonb_build_object('configured', true, 'token', v_token, 'chatId', v_chat_id);
end;
$$;

create or replace function stockscout_api.next_chart_alert_telegram_disconnect(p_owner_key text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'stockscout_private', 'vault'
as $$
declare
  v_token_name text := 'stockscout_next_telegram_bot_' || p_owner_key;
  v_chat_name text := 'stockscout_next_telegram_chat_' || p_owner_key;
  v_token_secret_id uuid;
  v_chat_secret_id uuid;
  v_count integer;
begin
  if p_owner_key is null or p_owner_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid owner key' using errcode = '22023';
  end if;

  select bot_token_secret_id, chat_id_secret_id
    into v_token_secret_id, v_chat_secret_id
    from stockscout_private.stockscout_next_telegram_connections
   where owner_key = p_owner_key
   for update;

  delete from stockscout_private.stockscout_next_telegram_connections where owner_key = p_owner_key;
  get diagnostics v_count = row_count;

  delete from vault.secrets
   where id in (v_token_secret_id, v_chat_secret_id)
      or name in (v_token_name, v_chat_name);

  return v_count > 0;
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
       and p.proname like 'next_chart_alert_telegram_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;
