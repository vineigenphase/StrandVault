-- StrandVault · THE VAULT: every movie + TV show we know about, searchable.
-- Run in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- app_id convention (matches Film.id in the app):
--   movie → TMDB id (positive)    tv → −TMDB id (negative)
-- so movie 1399 and TV show 1399 never collide, and favourites.film_id (int) still works.

create extension if not exists pg_trgm;

create table if not exists titles (
  app_id          int primary key,
  tmdb_id         int  not null,
  media_type      text not null check (media_type in ('movie','tv')),
  imdb_id         text,
  title           text not null,
  original_title  text,
  year            int,
  overview        text,                      -- the description shown on the movie page
  tagline         text,
  genres          int[] not null default '{}',  -- TMDB movie genre ids (TV genres normalised)
  aisle           text not null default 'drama',
  runtime         int,                       -- minutes (TV: typical episode length)
  seasons         int,
  episodes        int,
  certification   text,                      -- GB rating, e.g. 15, 12A, PG
  rating          real,
  votes           int,
  popularity      real,
  trending        boolean not null default false,
  poster          text,
  backdrop        text,
  cast_names      text[] not null default '{}',
  cast_text       text not null default '',  -- cast_names joined, for search
  director        text,                      -- TV: creators
  trailer_key     text,                      -- YouTube key
  providers       jsonb not null default '[]',  -- Provider[] for GB
  tmdb_watch_link text,
  updated_at      timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(original_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(cast_text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(overview, '')), 'D')
  ) stored
);

create index if not exists titles_search_idx     on titles using gin (search);
create index if not exists titles_title_trgm_idx on titles using gin (title gin_trgm_ops);
create index if not exists titles_pop_idx        on titles (popularity desc);
create index if not exists titles_aisle_idx      on titles (aisle, popularity desc);
create index if not exists titles_imdb_idx       on titles (imdb_id);

alter table titles enable row level security;
drop policy if exists "read titles" on titles;
create policy "read titles" on titles for select using (true);
grant select on titles to anon, authenticated;
grant all on titles to service_role;
-- writes: service role only (build script + API routes)

-- Search: exact/prefix title first, then the best of full-text rank and fuzzy title similarity,
-- nudged by how well-known the title is. Handles typos ("interstelar"), cast ("keanu"), plot words ("heist").
create or replace function search_titles(q text, media text default null, lim int default 24)
returns table (
  app_id int, tmdb_id int, media_type text, imdb_id text, title text, original_title text, year int,
  overview text, tagline text, genres int[], aisle text, runtime int, seasons int, episodes int,
  certification text, rating real, votes int, popularity real, trending boolean, poster text,
  backdrop text, cast_names text[], director text, trailer_key text, providers jsonb, tmdb_watch_link text
)
language sql stable
as $$
  with query as (select websearch_to_tsquery('english', q) as tsq)
  select t.app_id, t.tmdb_id, t.media_type, t.imdb_id, t.title, t.original_title, t.year,
         t.overview, t.tagline, t.genres, t.aisle, t.runtime, t.seasons, t.episodes,
         t.certification, t.rating, t.votes, t.popularity, t.trending, t.poster,
         t.backdrop, t.cast_names, t.director, t.trailer_key, t.providers, t.tmdb_watch_link
  from titles t, query
  where (media is null or t.media_type = media)
    and (t.search @@ query.tsq or t.title % q or t.title ilike q || '%')
  order by
    (lower(t.title) = lower(q)) desc,
    (t.title ilike q || '%') desc,
    greatest(ts_rank(t.search, query.tsq), similarity(t.title, q))
      * (1 + ln(1 + coalesce(t.votes, 0)) / 10) desc
  limit least(greatest(lim, 1), 48);
$$;

grant execute on function search_titles(text, text, int) to anon, authenticated, service_role;
