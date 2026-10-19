-- Fetched upstream books and chapters, shared by every API instance so a cold
-- start does not re-buy text another instance already paid for (api.bible
-- bills per request). Each row carries its own expiry: api.bible's terms
-- require cached content to be refreshed at least every 30 days. ESV text is
-- never written here — Crossway forbids storing it.
create table public.scripture_cache (
  key text primary key check (char_length(key) between 1 and 300),
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index scripture_cache_expires_idx on public.scripture_cache (expires_at);

-- Only the API's service-role key may read or write: with no policies, RLS
-- denies anon and authenticated outright, so the anon key cannot plant text
-- that would then be printed as scripture.
alter table public.scripture_cache enable row level security;
revoke all on public.scripture_cache from anon, authenticated, public;
