-- ============================================================
-- LogMyStack — protocol card social schema
--
-- Creates the shared tables that make the feed cross-user:
--   cards          — every protocol card (public + drafts)
--   card_comments  — comments, visible to everyone
--   card_likes     — one row per (user, card)
--   card_saves     — one row per (user, card) — personal bookmarks
--
-- Plus Row-Level Security so the database enforces who can see/edit what,
-- and triggers that keep the like / comment counts on `cards` in sync.
--
-- This script is idempotent — safe to run more than once.
-- Run it once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

create table if not exists public.cards (
  id            text primary key,
  author_id     uuid not null references auth.users(id) on delete cascade,
  author_name   text,
  title         text not null,
  set_id        text,
  tier          text not null default 'common',
  weeks         int,
  week_progress int,
  compounds     jsonb not null default '[]'::jsonb,
  stats         jsonb not null default '[]'::jsonb,
  notes         text,
  vendor        text,
  verified      boolean not null default false,
  visibility    text not null default 'public',   -- 'public' | 'draft'
  likes         int not null default 0,
  comments      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cards_feed_idx
  on public.cards (visibility, created_at desc);
create index if not exists cards_author_idx
  on public.cards (author_id);

create table if not exists public.card_comments (
  id          uuid primary key default gen_random_uuid(),
  card_id     text not null references public.cards(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists card_comments_card_idx
  on public.card_comments (card_id, created_at);

create table if not exists public.card_likes (
  card_id    text not null references public.cards(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create table if not exists public.card_saves (
  card_id    text not null references public.cards(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

-- ------------------------------------------------------------
-- 2. ROW-LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.cards         enable row level security;
alter table public.card_comments enable row level security;
alter table public.card_likes    enable row level security;
alter table public.card_saves    enable row level security;

-- CARDS ------------------------------------------------------
drop policy if exists "cards_read"   on public.cards;
drop policy if exists "cards_insert" on public.cards;
drop policy if exists "cards_update" on public.cards;
drop policy if exists "cards_delete" on public.cards;

-- Read: anyone signed-in sees public cards; authors also see their own drafts.
create policy "cards_read" on public.cards
  for select using ( visibility = 'public' or author_id = auth.uid() );

-- Insert: only as yourself.
create policy "cards_insert" on public.cards
  for insert with check ( author_id = auth.uid() );

-- Update / delete: only your own cards.
create policy "cards_update" on public.cards
  for update using ( author_id = auth.uid() ) with check ( author_id = auth.uid() );
create policy "cards_delete" on public.cards
  for delete using ( author_id = auth.uid() );

-- CARD_COMMENTS ----------------------------------------------
drop policy if exists "comments_read"   on public.card_comments;
drop policy if exists "comments_insert" on public.card_comments;
drop policy if exists "comments_delete" on public.card_comments;

create policy "comments_read" on public.card_comments
  for select using ( true );
create policy "comments_insert" on public.card_comments
  for insert with check ( author_id = auth.uid() );
create policy "comments_delete" on public.card_comments
  for delete using ( author_id = auth.uid() );

-- CARD_LIKES -------------------------------------------------
drop policy if exists "likes_read"   on public.card_likes;
drop policy if exists "likes_insert" on public.card_likes;
drop policy if exists "likes_delete" on public.card_likes;

create policy "likes_read" on public.card_likes
  for select using ( true );
create policy "likes_insert" on public.card_likes
  for insert with check ( user_id = auth.uid() );
create policy "likes_delete" on public.card_likes
  for delete using ( user_id = auth.uid() );

-- CARD_SAVES -------------------------------------------------
drop policy if exists "saves_read"   on public.card_saves;
drop policy if exists "saves_insert" on public.card_saves;
drop policy if exists "saves_delete" on public.card_saves;

create policy "saves_read" on public.card_saves
  for select using ( user_id = auth.uid() );
create policy "saves_insert" on public.card_saves
  for insert with check ( user_id = auth.uid() );
create policy "saves_delete" on public.card_saves
  for delete using ( user_id = auth.uid() );

-- ------------------------------------------------------------
-- 3. TRIGGERS — keep cards.likes / cards.comments counters in sync
--    (security definer so a user liking someone else's card can
--     still bump that card's counter past the cards RLS policy)
-- ------------------------------------------------------------

create or replace function public.bump_card_likes()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    update public.cards set likes = likes + 1 where id = NEW.card_id;
  elsif (TG_OP = 'DELETE') then
    update public.cards set likes = greatest(likes - 1, 0) where id = OLD.card_id;
  end if;
  return null;
end;
$$;

drop trigger if exists card_likes_count on public.card_likes;
create trigger card_likes_count
  after insert or delete on public.card_likes
  for each row execute function public.bump_card_likes();

create or replace function public.bump_card_comments()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    update public.cards set comments = comments + 1 where id = NEW.card_id;
  elsif (TG_OP = 'DELETE') then
    update public.cards set comments = greatest(comments - 1, 0) where id = OLD.card_id;
  end if;
  return null;
end;
$$;

drop trigger if exists card_comments_count on public.card_comments;
create trigger card_comments_count
  after insert or delete on public.card_comments
  for each row execute function public.bump_card_comments();

create or replace function public.touch_card_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists cards_touch_updated on public.cards;
create trigger cards_touch_updated
  before update on public.cards
  for each row execute function public.touch_card_updated_at();

-- ============================================================
-- Done. Verify in Table Editor: cards, card_comments,
-- card_likes, card_saves should all be present.
-- ============================================================
