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
grant select (id, role, display_name, username, bio, created_at, stripe_payouts_enabled, search_vector) on profiles to authenticated, anon;

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

-- Phase I: platform-Stripe fallback for creators who haven't finished
-- Connect onboarding yet. When held_for_creator = true, the full charge
-- landed in Orastories' own Stripe balance (no transfer_data on the
-- Checkout Session) rather than being blocked outright - this column is
-- the queryable record of what's owed to that creator once they connect.
-- No RLS changes needed: it's just another column on rows already covered
-- by the existing buyer/creator select policies.
alter table purchases add column if not exists held_for_creator boolean not null default false;
alter table tips add column if not exists held_for_creator boolean not null default false;

-- Contact page submissions. sender_id is nullable - the form is open to
-- anonymous visitors as well as signed-in readers, matching how the page
-- itself has always worked. No select policy: same reasoning as
-- article_flags/comment_flags - this is private correspondence to the site
-- owner (dashboard/service-role only), not public data.
create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 150),
  email text not null check (char_length(email) between 3 and 255),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);

alter table contact_messages enable row level security;

-- sender_id must be either null (anonymous) or the submitter's own id -
-- prevents a signed-in user from spoofing someone else's identity on a
-- message.
create policy "anyone sends a contact message" on contact_messages
  for insert to anon, authenticated
  with check (sender_id is null or sender_id = auth.uid());

-- Phase K: OraCoins - prepaid wallet tipping. Every tip today is a live
-- Stripe charge (2.9%+30c on a $1 tip is ~a third of it gone in fees, and
-- every tip is a fresh card charge a fraudster could use to test stolen
-- cards). Readers now buy OraCoins in fixed packs - one normal, low-risk
-- charge - then spend coins on tips with zero further Stripe involvement.
-- Book purchases are unchanged (still direct card charges).
--
-- A dedicated table rather than a profiles column: profiles is publicly
-- readable by row with privacy enforced via column-level grants (see
-- above), and coin_balance has no legitimate public-read case at all, so it
-- gets ordinary row-level RLS instead of retrofitting the grant exception.
create table wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  coin_balance int not null default 0 check (coin_balance >= 0),
  updated_at timestamptz not null default now()
);
alter table wallets enable row level security;
create policy "users view their own wallet" on wallets
  for select using (auth.uid() = user_id);
-- No insert/update policy for authenticated - balance only ever changes via
-- the security definer functions below, called by the webhook (service
-- role) or by the caller acting on their own row only (spend_coins_for_tip).

create table coin_purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete cascade,
  pack_id text not null,
  amount_cents int not null,
  coins_credited int not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  ip_address text,
  created_at timestamptz not null default now()
);
alter table coin_purchases enable row level security;
create policy "users view their own coin purchases" on coin_purchases
  for select using (auth.uid() = buyer_id);
-- No insert/update policy: same reasoning as tips/purchases - only the
-- create-coin-checkout and stripe-webhook Edge Functions (service role)
-- ever write here.

alter table purchases add column if not exists ip_address text;

-- Tips are now always coin-funded going forward; funded_by keeps the
-- historical 'card' rows distinguishable from new 'coins' ones.
alter table tips add column if not exists funded_by text not null default 'card' check (funded_by in ('card', 'coins'));

-- Every coin-tip is held_for_creator=true unconditionally (see
-- spend_coins_for_tip below) rather than settled instantly via
-- transfer_data, so both tips and purchases need a way to mark "this row's
-- money has already been swept into a real Stripe transfer" - payout_id
-- null means still outstanding.
alter table tips add column if not exists payout_id uuid references payouts(id) on delete set null;
alter table purchases add column if not exists payout_id uuid references payouts(id) on delete set null;
alter table payouts add column if not exists status text not null default 'pending' check (status in ('pending', 'paid', 'failed'));

-- Buyer-facing $0.30 processing-fee passthrough on book purchases (not coin
-- packs - a $10+ pack already amortizes 30c down to a few percent, the
-- exact problem OraCoins exists to avoid reintroducing). Tracked separately
-- from amount_cents, which keeps meaning "book price" everywhere else,
-- including the payout sweep below - the passthrough fee is never owed to
-- or split with the creator.
alter table purchases add column if not exists processing_fee_cents int not null default 0;

-- credit_coin_purchase: called once by stripe-webhook per successful
-- checkout.session.completed for a coin pack. Locks the row and no-ops if
-- it's already succeeded, so a retried/duplicate webhook delivery (a real
-- possibility on the live internet, unlike the sandbox) can never
-- double-credit a wallet.
create function credit_coin_purchase(p_purchase_id uuid, p_payment_intent_id text) returns void as $$
declare
  v_buyer_id uuid;
  v_coins int;
  v_status text;
begin
  select buyer_id, coins_credited, status into v_buyer_id, v_coins, v_status
    from coin_purchases where id = p_purchase_id for update;

  if v_buyer_id is null then
    raise exception 'coin_purchases row not found: %', p_purchase_id;
  end if;

  if v_status = 'succeeded' then
    return;
  end if;

  update coin_purchases set status = 'succeeded', stripe_payment_intent_id = p_payment_intent_id
    where id = p_purchase_id;

  insert into wallets (user_id, coin_balance) values (v_buyer_id, v_coins)
    on conflict (user_id) do update set coin_balance = wallets.coin_balance + excluded.coin_balance, updated_at = now();
end;
$$ language plpgsql security definer;

-- spend_coins_for_tip: the entire coin-tip mechanism. Derives the spender
-- from auth.uid() internally - never a client-supplied user id, which would
-- let one account drain another's wallet - and does the balance check and
-- decrement as a single atomic UPDATE ... WHERE coin_balance >= amount, the
-- standard race-safe pattern (two concurrent spends can't both succeed
-- against a balance that only covers one of them). Safe to call directly
-- from the client via supabase.rpc(): it only ever touches the caller's own
-- row and makes no Stripe call at all.
create function spend_coins_for_tip(p_book_id text, p_amount_coins int) returns uuid as $$
declare
  v_reader_id uuid := auth.uid();
  v_creator_id uuid;
  v_new_balance int;
  v_platform_fee int;
  v_tip_id uuid;
begin
  if v_reader_id is null then
    raise exception 'Not signed in';
  end if;
  if p_amount_coins is null or p_amount_coins <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select creator_id into v_creator_id from books where id = p_book_id;
  if v_creator_id is null then
    raise exception 'Book not found';
  end if;

  update wallets set coin_balance = coin_balance - p_amount_coins, updated_at = now()
    where user_id = v_reader_id and coin_balance >= p_amount_coins
    returning coin_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'Insufficient OraCoin balance';
  end if;

  v_platform_fee := round(p_amount_coins * 0.1);

  insert into tips (book_id, creator_id, reader_id, amount_cents, platform_fee_cents, status, held_for_creator, funded_by)
  values (p_book_id, v_creator_id, v_reader_id, p_amount_coins, v_platform_fee, 'succeeded', true, 'coins')
  returning id into v_tip_id;

  return v_tip_id;
end;
$$ language plpgsql security definer;

-- No prior direct-RPC-from-client precedent exists elsewhere in this
-- schema (everything else goes through Edge Functions), so this is made
-- explicit rather than assumed: only spend_coins_for_tip is ever called
-- directly by a signed-in reader's own client, and only it needs this.
-- credit_coin_purchase/claim_creator_payout are only ever called by the
-- service-role client inside Edge Functions, which bypasses grants entirely.
grant execute on function spend_coins_for_tip(text, int) to authenticated;

-- claim_creator_payout: called by the sweep-creator-payouts Edge Function
-- (service role, on a daily schedule). Locks and sums every unswept
-- (held_for_creator=true, payout_id is null) net-owed row across tips and
-- purchases for one creator; if under threshold, no-ops; otherwise creates
-- the payouts row and stamps payout_id on every claimed row in the same
-- transaction, so a retried/overlapping sweep run can never double-claim
-- the same earnings into two separate transfers.
create function claim_creator_payout(p_creator_id uuid, p_min_cents int) returns table(payout_id uuid, amount_cents int) as $$
declare
  v_amount int;
  v_payout_id uuid;
begin
  select coalesce(sum(t.amount_cents - t.platform_fee_cents), 0) into v_amount
    from tips t
    where t.creator_id = p_creator_id and t.status = 'succeeded' and t.held_for_creator = true and t.payout_id is null;

  v_amount := v_amount + coalesce((
    select sum(p.amount_cents - p.platform_fee_cents)
    from purchases p join books b on b.id = p.book_id
    where b.creator_id = p_creator_id and p.status = 'succeeded' and p.held_for_creator = true and p.payout_id is null
  ), 0);

  if v_amount < p_min_cents then
    return;
  end if;

  insert into payouts (creator_id, period_start, period_end, amount_cents)
  values (p_creator_id, now(), now(), v_amount)
  returning id into v_payout_id;

  update tips set payout_id = v_payout_id
    where creator_id = p_creator_id and status = 'succeeded' and held_for_creator = true and payout_id is null;

  update purchases set payout_id = v_payout_id
    where book_id in (select id from books where creator_id = p_creator_id)
      and status = 'succeeded' and held_for_creator = true and payout_id is null;

  payout_id := v_payout_id;
  amount_cents := v_amount;
  return next;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- Phase N — global slug registry
--
-- Books, articles, and usernames now all get bare root-level URLs
-- (orastories.com/{book-slug}, /{article-slug}, /{username}), which means
-- all three - plus the site's own static page names - share one flat
-- namespace and must never collide. This table is the single source of
-- truth for that: its primary key is what actually enforces cross-table
-- uniqueness, kept in sync by the triggers below. createBook()/createArticle()
-- (lib/creatorBooks.ts, lib/articles.ts) and claimUsername() (lib/username.ts)
-- already catch Postgres error 23505 (unique_violation) and show a friendly
-- "already taken" message - a registry conflict surfaces through that exact
-- same path with zero app-code changes needed.
-- ---------------------------------------------------------------------------

create table if not exists slug_registry (
  slug text primary key,
  kind text not null check (kind in ('book', 'article', 'profile', 'reserved')),
  created_at timestamptz not null default now()
);

alter table slug_registry enable row level security;

drop policy if exists "slug registry is publicly viewable" on slug_registry;
create policy "slug registry is publicly viewable" on slug_registry for select using (true);
grant select on slug_registry to anon, authenticated;

-- Reserved words: the site's own static pages/paths, never claimable by a
-- book, article, or username.
insert into slug_registry (slug, kind) values
  ('books', 'reserved'), ('blog', 'reserved'), ('reviews', 'reserved'), ('contact', 'reserved'),
  ('about', 'reserved'), ('privacy', 'reserved'), ('terms', 'reserved'), ('admin', 'reserved'),
  ('api', 'reserved'), ('index', 'reserved'), ('images', 'reserved'), ('styles', 'reserved'),
  ('scripts', 'reserved'), ('assets', 'reserved'), ('signin', 'reserved'), ('login', 'reserved'),
  ('signup', 'reserved')
on conflict (slug) do nothing;

-- Backfill existing content.
insert into slug_registry (slug, kind) select id, 'book' from books
  on conflict (slug) do nothing;
insert into slug_registry (slug, kind) select slug, 'article' from articles
  on conflict (slug) do nothing;
insert into slug_registry (slug, kind) select username, 'profile' from profiles where username is not null
  on conflict (slug) do nothing;

create or replace function sync_book_slug_registry() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if old.id is not distinct from new.id then
      return new;
    end if;
    delete from slug_registry where slug = old.id and kind = 'book';
  end if;
  insert into slug_registry (slug, kind) values (new.id, 'book');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists books_sync_slug_registry on books;
create trigger books_sync_slug_registry after insert or update of id on books
for each row execute function sync_book_slug_registry();

create or replace function release_book_slug_registry() returns trigger as $$
begin
  delete from slug_registry where slug = old.id and kind = 'book';
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists books_release_slug_registry on books;
create trigger books_release_slug_registry after delete on books
for each row execute function release_book_slug_registry();

create or replace function sync_article_slug_registry() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if old.slug is not distinct from new.slug then
      return new;
    end if;
    delete from slug_registry where slug = old.slug and kind = 'article';
  end if;
  insert into slug_registry (slug, kind) values (new.slug, 'article');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists articles_sync_slug_registry on articles;
create trigger articles_sync_slug_registry after insert or update of slug on articles
for each row execute function sync_article_slug_registry();

create or replace function release_article_slug_registry() returns trigger as $$
begin
  delete from slug_registry where slug = old.slug and kind = 'article';
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists articles_release_slug_registry on articles;
create trigger articles_release_slug_registry after delete on articles
for each row execute function release_article_slug_registry();

create or replace function sync_profile_slug_registry() returns trigger as $$
begin
  if old.username is not distinct from new.username then
    return new;
  end if;
  if old.username is not null then
    delete from slug_registry where slug = old.username and kind = 'profile';
  end if;
  if new.username is not null then
    insert into slug_registry (slug, kind) values (new.username, 'profile');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists profiles_sync_slug_registry on profiles;
create trigger profiles_sync_slug_registry after update of username on profiles
for each row execute function sync_profile_slug_registry();

-- ---------------------------------------------------------------------------
-- Phase N — publish-triggered rebuild
--
-- The static per-book/article/creator pages (scripts/generate-seo-pages.mjs)
-- only get (re)generated at build time - without this, a newly published
-- book or article has no working URL until the next code push or the
-- nightly 06:17 UTC cron in .github/workflows/static.yml. This fires a
-- GitHub Actions rebuild the moment something is actually published, so the
-- new URL is live within a couple minutes instead.
--
-- The GitHub PAT used to call the Actions API is stored in Supabase Vault
-- (Project Settings -> Vault in the dashboard), never in a plain table -
-- this function only ever references it by name. If the secret isn't set
-- yet, the publish just silently doesn't trigger an extra rebuild (the
-- nightly cron still covers it) rather than failing the publish itself.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;

-- Shared by every trigger below - the actual "call GitHub" step, with no
-- knowledge of which table/column changed. Each trigger function below
-- decides FOR ITSELF whether a rebuild is warranted, then calls this.
create or replace function fire_content_rebuild_dispatch() returns void as $$
declare
  v_pat text;
begin
  select decrypted_secret into v_pat from vault.decrypted_secrets where name = 'github_pat_content_publish';
  if v_pat is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/GoddyOra/Orastories/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_pat,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('event_type', 'content-published')
  );
end;
$$ language plpgsql security definer;

create or replace function trigger_content_rebuild() returns trigger as $$
begin
  if tg_op = 'UPDATE' and (old.is_published is not distinct from new.is_published or new.is_published is not true) then
    return new;
  end if;
  if tg_op = 'INSERT' and new.is_published is not true then
    return new;
  end if;
  perform fire_content_rebuild_dispatch();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists books_trigger_content_rebuild on books;
create trigger books_trigger_content_rebuild after insert or update of is_published on books
for each row execute function trigger_content_rebuild();

drop trigger if exists articles_trigger_content_rebuild on articles;
create trigger articles_trigger_content_rebuild after insert or update of is_published on articles
for each row execute function trigger_content_rebuild();

-- A creator's bio/display_name feeds directly into their static profile
-- page's meta description and JSON-LD (scripts/generate-seo-pages.mjs) - so
-- filling in a bio should get the same fast auto-rebuild as publishing a
-- book/article, not wait for the nightly cron. Also fires if role just
-- became 'creator' (a brand-new profile page needs to exist at all) or if
-- username changed (their URL itself just moved).
create or replace function trigger_profile_rebuild() returns trigger as $$
begin
  if new.role != 'creator' then
    return new;
  end if;
  if old.role = 'creator'
     and old.bio is not distinct from new.bio
     and old.display_name is not distinct from new.display_name
     and old.username is not distinct from new.username then
    return new;
  end if;
  perform fire_content_rebuild_dispatch();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists profiles_trigger_content_rebuild on profiles;
create trigger profiles_trigger_content_rebuild after update of bio, display_name, username, role on profiles
for each row execute function trigger_profile_rebuild();

-- ---------------------------------------------------------------------------
-- Phase O — site-wide search (books, articles, creators)
--
-- search_vector is a plain (non-generated) tsvector column, kept in sync by
-- an ordinary BEFORE INSERT/UPDATE trigger rather than a GENERATED ALWAYS AS
-- column - Postgres's generated-column immutability check rejects even a
-- correctly config-qualified to_tsvector() call (and any IMMUTABLE-labeled
-- wrapper around it), a well-known friction with that specific mechanism.
-- A trigger has no such restriction: this is the traditional, most
-- well-established way to maintain a full-text search column, and the same
-- pattern (trigger computes a derived column on write) already used for
-- slug_registry in Phase N. Weighted fields so a title match ranks above a
-- body-text match; the GIN index keeps @@ matches fast as the catalog grows.
-- ---------------------------------------------------------------------------

alter table books add column if not exists search_vector tsvector;

create or replace function update_book_search_vector() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.genre, '') || ' ' || coalesce(new.author, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.synopsis, '')), 'C');
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_search_vector_update on books;
create trigger books_search_vector_update before insert or update on books
for each row execute function update_book_search_vector();

update books set search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(genre, '') || ' ' || coalesce(author, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(synopsis, '')), 'C');

create index if not exists books_search_idx on books using gin(search_vector);

alter table articles add column if not exists search_vector tsvector;

create or replace function update_article_search_vector() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(coalesce(new.keywords, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.body, '')), 'C');
  return new;
end;
$$ language plpgsql;

drop trigger if exists articles_search_vector_update on articles;
create trigger articles_search_vector_update before insert or update on articles
for each row execute function update_article_search_vector();

update articles set search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', array_to_string(coalesce(keywords, '{}'), ' ')), 'B') ||
  setweight(to_tsvector('english', coalesce(body, '')), 'C');

create index if not exists articles_search_idx on articles using gin(search_vector);

alter table profiles add column if not exists search_vector tsvector;

create or replace function update_profile_search_vector() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.username, '') || ' ' || coalesce(new.display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.bio, '')), 'C');
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_search_vector_update on profiles;
create trigger profiles_search_vector_update before insert or update on profiles
for each row execute function update_profile_search_vector();

update profiles set search_vector =
  setweight(to_tsvector('english', coalesce(username, '') || ' ' || coalesce(display_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(bio, '')), 'C');

create index if not exists profiles_search_idx on profiles using gin(search_vector);

-- Reserve /search itself, same reasoning as the other reserved words seeded
-- in Phase N's slug_registry.
insert into slug_registry (slug, kind) values ('search', 'reserved')
  on conflict (slug) do nothing;

-- Deliberately NOT security definer: this only ever needs to see what the
-- calling role (anon or authenticated) could already see directly, and the
-- existing RLS policies on books/articles/profiles already enforce exactly
-- the right visibility (is_published, role = 'creator', etc.) - running as
-- the caller keeps that enforcement intact instead of needing to duplicate
-- it here by hand. Each branch is independently limited (not one global
-- limit after the union) so a flood of book matches can't crowd articles or
-- creators out of the results entirely.
create or replace function search_site(search_query text, per_category_limit int default 5)
returns table (kind text, slug text, title text, subtitle text, image text, rank real) as $$
  (
    select 'book', b.id, b.title, b.author, b.cover, ts_rank(b.search_vector, websearch_to_tsquery('english', search_query))
    from books b
    where b.is_published and b.price_cents is not null
      and b.search_vector @@ websearch_to_tsquery('english', search_query)
    order by ts_rank(b.search_vector, websearch_to_tsquery('english', search_query)) desc
    limit per_category_limit
  )
  union all
  (
    select 'article', a.slug, a.title, coalesce(p.display_name, p.username), a.cover_image_url,
      ts_rank(a.search_vector, websearch_to_tsquery('english', search_query))
    from articles a
    join profiles p on p.id = a.author_id
    where a.is_published
      and a.search_vector @@ websearch_to_tsquery('english', search_query)
    order by ts_rank(a.search_vector, websearch_to_tsquery('english', search_query)) desc
    limit per_category_limit
  )
  union all
  (
    select 'creator', pr.username, coalesce(pr.display_name, pr.username), '@' || pr.username, null,
      ts_rank(pr.search_vector, websearch_to_tsquery('english', search_query))
    from profiles pr
    where pr.role = 'creator' and pr.username is not null
      and pr.search_vector @@ websearch_to_tsquery('english', search_query)
    order by ts_rank(pr.search_vector, websearch_to_tsquery('english', search_query)) desc
    limit per_category_limit
  );
$$ language sql stable;

grant execute on function search_site(text, int) to anon, authenticated;
