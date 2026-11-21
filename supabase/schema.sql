create table profiles  (user_id text primary key, name text not null, jacket text not null, store_code text not null,
                        respect int default 0, is_demo boolean default false, created_at timestamptz default now());
create table favourites(user_id text, film_id int, store_code text, created_at timestamptz default now(), primary key (user_id, film_id));
create table rentals   (id bigserial primary key, user_id text, film_id int, store_code text, provider text, created_at timestamptz default now());
create table messages  (id uuid primary key default gen_random_uuid(), user_id text, name text, text text, store_code text, created_at timestamptz default now());
-- Hackathon: RLS off or permissive anon policies. Note it in the README as a known shortcut.
