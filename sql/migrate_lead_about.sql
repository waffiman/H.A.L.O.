-- Run once in Supabase SQL editor (safe to re-run).
alter table public.leads add column if not exists headline text not null default '';
alter table public.leads add column if not exists company text not null default '';
alter table public.leads add column if not exists about text not null default '';
alter table public.leads add column if not exists extra_links jsonb not null default '[]'::jsonb;
alter table public.leads add column if not exists deep_researched_at timestamptz;
