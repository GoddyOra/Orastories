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
  username text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  stripe_account_id text,               -- server-only, never selectable by clients (see grant below)
  stripe_payouts_enabled boolean not null default false,
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
  price_cents int check (price_cents is null or price_cents >= 50), -- null = not for sale
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

-- A reader's request to become a creator. Status changes (approved/rejected)
-- are made only by the site owner via the Supabase dashboard (service role,
-- bypasses RLS) — there is deliberately no self-serve path to role='creator'.
create table if not exists creator_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- A reader's one-time tip to a book's creator, split via Stripe Connect
-- destination charges. Rows are only ever written by the Stripe Edge
-- Functions (service role) — create-tip-checkout inserts the pending row,
-- stripe-webhook is the only thing that ever marks it succeeded, since a
-- client-side "payment succeeded" redirect is trivially fakeable.
create table if not exists tips (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references books(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete cascade,
  reader_id uuid not null references profiles(id) on delete cascade,
  amount_cents int not null,
  platform_fee_cents int not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);

-- A reader's one-time purchase of a book's full PDF, same split mechanism
-- and write-ownership rules as tips (only create-purchase-checkout and
-- stripe-webhook, both service-role, ever write to this table). Unlike
-- tips, creator visibility is via a join to books (books.creator_id)
-- rather than a denormalized creator_id column here.
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references books(id) on delete cascade,
  buyer_id uuid not null references profiles(id) on delete cascade,
  amount_cents int not null,
  platform_fee_cents int not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);
-- Belt-and-suspenders against a double-click/race producing two succeeded
-- rows for the same book+buyer (create-purchase-checkout also checks this
-- at the application level, but this closes the race that check can't).
create unique index if not exists purchases_one_succeeded_per_buyer
  on purchases(book_id, buyer_id) where status = 'succeeded';

-- Row Level Security

alter table profiles enable row level security;
alter table books enable row level security;
alter table chapters enable row level security;
alter table reads enable row level security;
alter table reviews enable row level security;
alter table bookmarks enable row level security;
alter table payouts enable row level security;
alter table creator_applications enable row level security;
alter table tips enable row level security;
alter table purchases enable row level security;

create policy "profiles are publicly readable" on profiles
  for select using (true);
create policy "users manage their own profile" on profiles
  for update using (auth.uid() = id);
-- Force role='reader' on self-insert: nobody's own first row can claim
-- creator. Combined with the column-level grant below, role can only ever
-- be changed by the site owner (dashboard/service role, bypasses RLS/grants).
create policy "users insert their own profile" on profiles
  for insert with check (auth.uid() = id and role = 'reader');
-- RLS's WITH CHECK can't cleanly compare against the pre-update row, so the
-- "can edit username/display_name but never role" rule is enforced via a
-- plain Postgres column-level grant instead of a policy.
revoke update on profiles from authenticated;
grant update (username, display_name) on profiles to authenticated;
-- Row-level "publicly readable" applies per-row, not per-column: without this
-- grant, stripe_account_id (added for tipping) would be selectable by every
-- visitor via the policy above. stripe_payouts_enabled stays public since the
-- reader-facing UI needs it to decide whether to show a book's tip button.
revoke select on profiles from authenticated, anon;
grant select (id, role, display_name, username, bio, created_at, stripe_payouts_enabled) on profiles to authenticated, anon;

create policy "users view their own application" on creator_applications
  for select using (auth.uid() = user_id);
create policy "users submit their own application" on creator_applications
  for insert with check (auth.uid() = user_id and status = 'pending');
-- No update policy for creator_applications: status changes are
-- dashboard/service-role only (default-deny for the authenticated role).

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

create policy "creators view tips they received" on tips
  for select using (auth.uid() = creator_id);
create policy "readers view tips they sent" on tips
  for select using (auth.uid() = reader_id);
-- No insert/update policy: rows are only ever written by the Stripe Edge
-- Functions via the service-role key (see comment on the table above).

create policy "buyers view their own purchases" on purchases
  for select using (auth.uid() = buyer_id);
create policy "creators view purchases of their own books" on purchases
  for select using (
    exists (select 1 from books where books.id = purchases.book_id and books.creator_id = auth.uid())
  );
-- No insert/update policy: same reasoning as tips.

-- Storage: one private bucket for canonical book PDFs, one file per book at
-- {book_id}/manuscript.pdf. Storage policies are plain RLS on
-- storage.objects, consistent with every other table here.
insert into storage.buckets (id, name, public)
values ('book-pdfs', 'book-pdfs', false)
on conflict (id) do nothing;

create policy "creators manage their own book pdfs" on storage.objects
  for all using (
    bucket_id = 'book-pdfs'
    and exists (select 1 from books where books.id = (storage.foldername(name))[1] and books.creator_id = auth.uid())
  ) with check (
    bucket_id = 'book-pdfs'
    and exists (select 1 from books where books.id = (storage.foldername(name))[1] and books.creator_id = auth.uid())
  );

create policy "buyers download pdfs they purchased" on storage.objects
  for select using (
    bucket_id = 'book-pdfs'
    and exists (
      select 1 from purchases
      where purchases.book_id = (storage.foldername(name))[1]
        and purchases.buyer_id = auth.uid()
        and purchases.status = 'succeeded'
    )
  );

-- Blog articles: unlike books, authorship has no role gate at all - any
-- signed-up user can publish. Ranked by view_count/avg-rating "relevance"
-- by default, computed client-side (fetch-all-and-reduce, same pattern as
-- book ratings) rather than a DB aggregate, since the dataset is small.
create table articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,               -- lightweight markup (bold/italic/heading/quote/[img]), never raw HTML
  cover_image_url text,
  cover_image_alt text,              -- title + keywords, for image-search SEO
  keywords text[] not null check (array_length(keywords, 1) between 3 and 5),
  view_count int not null default 0,
  is_published boolean not null default true,   -- author's own publish/unpublish toggle
  removed_reason text,               -- null | 'flagged_auto' | 'flagged_manual' - owner/trigger only
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table article_ratings (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  reader_id uuid not null references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (article_id, reader_id)
);

-- No select policy at all (see below) - flags are visible only via the
-- dashboard, never to other users or the flagged author. unique(article_id,
-- flagger_id) closes the "flag your own target 10x" loophole against the
-- 10-flags-in-5-days auto-removal trigger.
create table article_flags (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  flagger_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (article_id, flagger_id)
);

-- One row per (article, viewer, day) so view_count (bumped by the trigger
-- below) can't be inflated by refresh-spamming. viewer_key is the reader's
-- id as text when signed in, or a browser-local anonymous id for guests.
create table article_views (
  article_id uuid not null references articles(id) on delete cascade,
  viewer_key text not null,
  viewed_date date not null default current_date,
  primary key (article_id, viewer_key, viewed_date)
);

create function bump_article_view_count() returns trigger as $$
begin
  update articles set view_count = view_count + 1 where id = new.article_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger article_views_bump after insert on article_views
for each row execute function bump_article_view_count();

-- The auto-removal safety valve: fires on every new flag, checks the
-- rolling 5-day window, and flips is_published itself via security definer
-- (flaggers only ever get INSERT on article_flags, never UPDATE on
-- articles - this trigger is the one exception, scoped to exactly this).
create function check_article_flag_threshold() returns trigger as $$
declare
  recent_count int;
begin
  select count(*) into recent_count from article_flags
  where article_id = new.article_id and created_at >= now() - interval '5 days';

  if recent_count >= 10 then
    update articles set is_published = false, removed_reason = 'flagged_auto', removed_at = now()
    where id = new.article_id and is_published = true;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger article_flag_threshold after insert on article_flags
for each row execute function check_article_flag_threshold();

alter table articles enable row level security;
alter table article_ratings enable row level security;
alter table article_flags enable row level security;
alter table article_views enable row level security;

create policy "published articles are publicly readable" on articles
  for select using (is_published = true);
create policy "authors see their own articles including unpublished" on articles
  for select using (auth.uid() = author_id);
create policy "any signed-in user creates their own articles" on articles
  for insert with check (auth.uid() = author_id);
create policy "authors update their own articles" on articles
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
-- Column-level lock, same pattern as profiles.role: authors can edit their
-- own content/metadata/publish-toggle, but never removed_reason/removed_at.
revoke update on articles from authenticated;
grant update (title, body, cover_image_url, cover_image_alt, keywords, is_published, updated_at) on articles to authenticated;

create policy "article ratings are publicly readable" on article_ratings for select using (true);
create policy "readers rate articles as themselves" on article_ratings
  for all using (auth.uid() = reader_id) with check (auth.uid() = reader_id);

create policy "signed-in users flag articles as themselves" on article_flags
  for insert with check (auth.uid() = flagger_id);

-- Explicit grant needed alongside the policy: article_views has no select
-- policy (view logs shouldn't be publicly queryable), and without this
-- grant anon/authenticated inserts are rejected before the policy is even
-- evaluated.
grant insert on article_views to anon, authenticated;
create policy "anyone logs an article view" on article_views
  for insert to anon, authenticated with check (true);

insert into storage.buckets (id, name, public)
values ('article-covers', 'article-covers', true)
on conflict (id) do nothing;

create policy "authors manage their own article covers" on storage.objects
  for all using (
    bucket_id = 'article-covers'
    and exists (select 1 from articles where articles.id::text = (storage.foldername(name))[1] and articles.author_id = auth.uid())
  ) with check (
    bucket_id = 'article-covers'
    and exists (select 1 from articles where articles.id::text = (storage.foldername(name))[1] and articles.author_id = auth.uid())
  );

create policy "article covers are publicly viewable" on storage.objects
  for select using (bucket_id = 'article-covers');

-- Phase G: free-claim books + tiered chapter access (first 3 chapters
-- free, full book behind purchase-or-claim). price_cents = 0 is now a
-- distinct, valid state: "free, claimable" - distinct from null ("not
-- for sale") and >=50 ("real Stripe price"; 50c is Stripe's own USD
-- charge minimum, unrelated to the free tier).
alter table books add column if not exists chapter_count int not null default 0;

alter table books drop constraint if exists books_price_cents_check;
alter table books add constraint books_price_cents_check
  check (price_cents is null or price_cents = 0 or price_cents >= 50);

-- Denormalized because a plain count(*) against chapters would itself be
-- filtered by the same RLS that hides chapters 4+ from non-purchasers,
-- always reporting back "3" regardless of the book's real length. This
-- column lives on books, which stays fully public, so it always reports
-- the true total - same reasoning as articles.view_count in Phase F.
create or replace function bump_book_chapter_count() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update books set chapter_count = chapter_count + 1 where id = new.book_id;
  elsif tg_op = 'DELETE' then
    update books set chapter_count = chapter_count - 1 where id = old.book_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists chapters_bump_book_chapter_count on chapters;
create trigger chapters_bump_book_chapter_count after insert or delete on chapters
for each row execute function bump_book_chapter_count();

-- Replace the all-or-nothing chapters policy with a tiered pair. Postgres
-- OR-combines multiple permissive `for select` policies, so a purchaser
-- matches both: the free tier for chapters 1-3, and this one for the rest.
drop policy if exists "chapters are publicly readable" on chapters;

create policy "first three chapters are publicly readable" on chapters
  for select using (
    position < 3
    and exists (select 1 from books where books.id = chapters.book_id and books.is_published = true)
  );

-- Deliberately does not check is_published - a past purchaser keeps
-- access even if the creator later unpublishes, matching the existing
-- "buyers download pdfs they purchased" storage policy's precedent.
create policy "purchasers read all chapters of books they own" on chapters
  for select using (
    exists (
      select 1 from purchases
      where purchases.book_id = chapters.book_id
        and purchases.buyer_id = auth.uid()
        and purchases.status = 'succeeded'
    )
  );

-- Phase H: footer/purchase-flow UX fixes (no schema), content length
-- standards, a profiles.bio field, and reader comments on books/articles.

-- Content length standards. Generous, SEO/UX-informed hard caps (soft
-- warnings live client-side only) - see the user's supplied table. Existing
-- content is nowhere close to any of these (largest chapter ~58k chars,
-- largest article body ~8k chars), so a plain `add constraint` is safe
-- without `not valid`.
alter table books add constraint books_title_length check (char_length(title) <= 150);
alter table books add constraint books_synopsis_length check (synopsis is null or char_length(synopsis) <= 500);
alter table articles add constraint articles_title_length check (char_length(title) <= 150);
alter table articles add constraint articles_body_length check (char_length(body) <= 100000);
alter table chapters add constraint chapters_content_length check (char_length(content) <= 100000);

-- Whole-book length (sum of all chapters) can't be a plain `check` - it's a
-- cross-row constraint. Mirrors chapter_count's denormalized-column-plus-
-- trigger shape (Phase G): the trigger itself rejects (raises, rolling back
-- the whole transaction) an insert/update that would push the running total
-- past 2,000,000 chars.
alter table books add column if not exists total_chars int not null default 0;

create or replace function enforce_book_total_chars() returns trigger as $$
declare
  delta int;
  new_total int;
begin
  if tg_op = 'INSERT' then
    delta := char_length(new.content);
  elsif tg_op = 'UPDATE' then
    delta := char_length(new.content) - char_length(old.content);
  else
    delta := -char_length(old.content);
  end if;

  select total_chars + delta into new_total from books where id = coalesce(new.book_id, old.book_id);

  if new_total > 2000000 then
    raise exception 'This book would exceed the 2,000,000 character limit across all chapters.';
  end if;

  update books set total_chars = new_total where id = coalesce(new.book_id, old.book_id);
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists chapters_enforce_book_total_chars on chapters;
create trigger chapters_enforce_book_total_chars after insert or update or delete on chapters
for each row execute function enforce_book_total_chars();

-- profiles.bio: shown on public creator profiles and (eventually) next to
-- article/comment bylines. Same column-level-grant pattern as
-- username/display_name - added to the existing grant, not a new policy.
alter table profiles add column if not exists bio text;
alter table profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 1000);
grant update (username, display_name, bio) on profiles to authenticated;

-- Reader comments on books and articles. Same shape as reviews/
-- article_ratings (publicly readable, own-row write) plus a flags table
-- shaped like article_flags (insert-only, no select policy - dashboard-only
-- visibility) but deliberately WITHOUT the 10-flags/5-days auto-removal
-- trigger: that machinery was purpose-built for full articles, a single
-- comment is much lower-stakes, and manual removal is proportionate.
-- One level of nesting only (parent_comment_id), enforced client-side.
create table book_comments (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references books(id) on delete cascade,
  commenter_id uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references book_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  commenter_id uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references article_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One shared flags table for both comment types (content_type discriminates)
-- since flags never need to join back to the parent content's own columns.
create table comment_flags (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('book', 'article')),
  comment_id uuid not null,
  flagger_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (content_type, comment_id, flagger_id)
);

alter table book_comments enable row level security;
alter table article_comments enable row level security;
alter table comment_flags enable row level security;

create policy "book comments are publicly readable" on book_comments for select using (true);
create policy "readers manage their own book comments" on book_comments
  for insert with check (auth.uid() = commenter_id);
create policy "readers update their own book comments" on book_comments
  for update using (auth.uid() = commenter_id) with check (auth.uid() = commenter_id);
create policy "readers delete their own book comments" on book_comments
  for delete using (auth.uid() = commenter_id);

create policy "article comments are publicly readable" on article_comments for select using (true);
create policy "readers manage their own article comments" on article_comments
  for insert with check (auth.uid() = commenter_id);
create policy "readers update their own article comments" on article_comments
  for update using (auth.uid() = commenter_id) with check (auth.uid() = commenter_id);
create policy "readers delete their own article comments" on article_comments
  for delete using (auth.uid() = commenter_id);

create policy "signed-in users flag comments as themselves" on comment_flags
  for insert with check (auth.uid() = flagger_id);
-- No select policy: same reasoning as article_flags.
