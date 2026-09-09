-- HALO CRM leads (1:1 with Notion pipeline — OVERVIEW.md §3)
-- Safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text unique,
  workspace_id text not null default 'default',
  name text not null default '',
  link text,
  status text not null
    check (status in (
      'Lead😴',
      'Proposal 1️⃣',
      'Proposal 2️⃣',
      'Active ✅',
      'Lost❌'
    )),
  ice_breaker text not null default '',
  location text not null default '',
  timezone text not null default '',
  email text not null default '',
  lost_reason text not null default '',
  messenger_app text not null default '',
  messenger_value text not null default '',
  processing_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe re-run migrations for existing projects
alter table public.leads add column if not exists location text not null default '';
alter table public.leads add column if not exists timezone text not null default '';
alter table public.leads add column if not exists email text not null default '';
alter table public.leads add column if not exists lost_reason text not null default '';
alter table public.leads add column if not exists messenger_app text not null default '';
alter table public.leads add column if not exists messenger_value text not null default '';

create unique index if not exists leads_workspace_link_uidx
  on public.leads (workspace_id, link)
  where link is not null and link <> '';

create index if not exists leads_workspace_status_idx
  on public.leads (workspace_id, status);

create index if not exists leads_workspace_name_idx
  on public.leads (workspace_id, name);

create or replace function public.set_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_leads_updated_at();

alter table public.leads enable row level security;

-- service_role bypasses RLS; no anon policies (dashboard/agent use service_role server-side only)
