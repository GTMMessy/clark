-- Clark keeps each store as a handful of JSON documents addressed by key.
create table if not exists public.kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- No policies: only the server, using the service role key, reads or writes.
alter table public.kv enable row level security;
