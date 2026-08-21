create table if not exists public.stockscout_next_runtime_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.stockscout_next_runtime_config enable row level security;
revoke all on public.stockscout_next_runtime_config from anon, authenticated;

insert into public.stockscout_next_runtime_config(key,value,updated_at)
select 'evaluator_key_sha256', encode(extensions.digest(decrypted_secret,'sha256'),'hex'), now()
from vault.decrypted_secrets
where name='stockscout_next_evaluator_key'
order by created_at desc
limit 1
on conflict (key) do update set value=excluded.value, updated_at=excluded.updated_at;

drop function if exists public.stockscout_next_validate_evaluator_key(text);
