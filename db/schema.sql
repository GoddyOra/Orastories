-- Orastories: core schema for the UGC platform pivot.
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
--
-- Scope of this migration: get manuscripts out of the public repo / client
-- bundle and into a real database. Auth-gated, rate-limited per-chapter
-- delivery comes in the next phase (reader portal) — chapters are left
-- publicly readable here because the site is currently free-to-read with
-- no login wall, so this migration doesn't change who can read what, only
-- where the text lives.

create extension if not exists "pgcrypto";

-- One row per authenticated user, extends Supabase's built-in auth.users.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reader' check (role in ('creator', 'reader')),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists books (
  id text primary key,                 -- slug, e.g. 'lust-and-lies-the-limond-affair'
  creator_id uuid references profiles(id) on delete set null,
  title text not null,
  author text not null,
  cover text,
  genre text,
  synopsis text,
  published_date text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references books(id) on delete cascade,
  position int not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (book_id, position)
);

create table if not exists reads (
  id uuid primary key default gen_random_uuid(),
  reader_id uuid references profiles(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  read_date date not null default current_date,
  created_at timestamptz not null default now(),
  -- one counted read per reader per chapter per day: basic guard against
  -- refresh-spam inflating the readership pool. Real fraud filtering
  -- (rate limits, bot detection) comes in the payouts phase.
  unique (reader_id, chapter_id, read_date)
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references books(id) on delete cascade,
  reader_id uuid not null references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  unique (book_id, reader_id)
);

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  reader_id uuid not null references profiles(id) on delete cascade,
  book_id text not null references books(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (reader_id, book_id)
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_cents int not null,
  stripe_transfer_id text,
  created_at timestamptz not null default now()
);

-- Row Level Security

alter table profiles enable row level security;
alter table books enable row level security;
alter table chapters enable row level security;
alter table reads enable row level security;
alter table reviews enable row level security;
alter table bookmarks enable row level security;
alter table payouts enable row level security;

create policy "profiles are publicly readable" on profiles
  for select using (true);
create policy "users manage their own profile" on profiles
  for update using (auth.uid() = id);
create policy "users insert their own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "published books are publicly readable" on books
  for select using (is_published = true);
create policy "creators manage their own books" on books
  for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy "chapters are publicly readable" on chapters
  for select using (
    exists (select 1 from books where books.id = chapters.book_id and books.is_published = true)
  );
create policy "creators manage chapters of their own books" on chapters
  for all using (
    exists (select 1 from books where books.id = chapters.book_id and books.creator_id = auth.uid())
  ) with check (
    exists (select 1 from books where books.id = chapters.book_id and books.creator_id = auth.uid())
  );

create policy "readers manage their own read log" on reads
  for all using (auth.uid() = reader_id) with check (auth.uid() = reader_id);
create policy "creators see read counts for their own books" on reads
  for select using (
    exists (
      select 1 from chapters join books on books.id = chapters.book_id
      where chapters.id = reads.chapter_id and books.creator_id = auth.uid()
    )
  );

create policy "reviews are publicly readable" on reviews
  for select using (true);
create policy "readers manage their own reviews" on reviews
  for all using (auth.uid() = reader_id) with check (auth.uid() = reader_id);

create policy "readers manage their own bookmarks" on bookmarks
  for all using (auth.uid() = reader_id) with check (auth.uid() = reader_id);

create policy "creators see their own payouts" on payouts
  for select using (auth.uid() = creator_id);
