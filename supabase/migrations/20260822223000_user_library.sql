-- Named page layouts (every journal setting except translation).
create table public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index designs_user_id_idx on public.designs (user_id);
create index designs_user_updated_idx on public.designs (user_id, updated_at desc);

-- Saved journal sessions: passage selection + a Design snapshot. Not PDFs.
create table public.journal_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  book_id text not null check (book_id ~ '^[A-Z0-9]{3}$'),
  start_chapter text not null check (start_chapter ~ '^\d{1,3}$'),
  start_verse text not null check (start_verse ~ '^\d{1,3}$'),
  end_chapter text not null check (end_chapter ~ '^\d{1,3}$'),
  end_verse text not null check (end_verse ~ '^\d{1,3}$'),
  design jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_files_user_id_idx on public.journal_files (user_id);
create index journal_files_user_updated_idx on public.journal_files (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger designs_set_updated_at
  before update on public.designs
  for each row execute function public.set_updated_at();

create trigger journal_files_set_updated_at
  before update on public.journal_files
  for each row execute function public.set_updated_at();

alter table public.designs enable row level security;
alter table public.journal_files enable row level security;

create policy designs_owner_all
  on public.designs
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy journal_files_owner_all
  on public.journal_files
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.designs from anon, public;
revoke all on public.journal_files from anon, public;
grant select, insert, update, delete on public.designs to authenticated;
grant select, insert, update, delete on public.journal_files to authenticated;
