-- Run once in Supabase → SQL Editor (safe to re-run)
alter table public.leads add column if not exists location text not null default '';
alter table public.leads add column if not exists timezone text not null default '';
alter table public.leads add column if not exists email text not null default '';
alter table public.leads add column if not exists lost_reason text not null default '';
alter table public.leads add column if not exists messenger_app text not null default '';
alter table public.leads add column if not exists messenger_value text not null default '';
