-- StrandVault — Supabase / Postgres schema (BACKEND.md §3.1, lane BE2)
-- Source of truth: BACKEND.md §3.1. Idempotent: safe to re-run.
-- All table access goes through API routes using the service role.
-- RLS is enabled with NO anon policies on purpose.

create extension if not exists pgcrypto;

-- Profiles: one row per visitor to a store ------------------------------------
create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  store_code  text not null default 'KCL',
  name        text not null check (char_length(name) between 1 and 12),
  look        jsonb not null,                 -- Look (types.ts, frozen)
  fav_id      integer,                        -- #1 favourite (TMDB id), mirrors PresenceState.favId
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists profiles_store_idx on profiles (store_code, last_seen desc);

-- Favourites: many-to-many between profiles and catalogue films ---------------
create table if not exists favourites (
  user_id    uuid not null references profiles(id) on delete cascade,
  film_id    integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, film_id)
);

create index if not exists favourites_film_idx on favourites (film_id);

-- Events: open / watch / rico activity ----------------------------------------
create table if not exists events (
  id         bigserial primary key,
  store_code text not null default 'KCL',
  user_id    uuid references profiles(id) on delete cascade,
  kind       text not null check (kind in ('open','watch','rico')),
  film_id    integer,
  provider   text,                            -- ProviderId for 'watch'
  meta       jsonb,                           -- { source } for open; { mood, fallback } for rico
  created_at timestamptz not null default now()
);

create index if not exists events_user_idx on events (user_id, created_at desc);

-- Row level security: no anon policies. Browser talks only to route handlers. -
alter table profiles   enable row level security;
alter table favourites enable row level security;
alter table events     enable row level security;

-- Grants: newer Supabase projects don't auto-grant API roles on tables created in SQL, so the
-- service-role key (used only by route handlers) needs explicit access. anon/authenticated get
-- nothing here: browsers never touch these tables (RLS on, no policies).
grant usage on schema public to service_role;
grant all on table public.profiles, public.favourites, public.events to service_role;
grant usage, select on all sequences in schema public to service_role;
