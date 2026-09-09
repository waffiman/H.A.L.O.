-- HALO tenants (cabinets) — one Supabase project, many workspaces
-- Safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists public.halo_tenants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  workspace_id text not null unique,
  display_name text not null default '',
  company text not null default '',
  role text not null default 'user'
    check (role in ('owner', 'user', 'support')),
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'past_due', 'canceled')),
  trial_lead_limit int not null default 50,
  stripe_customer_id text not null default '',
  stripe_subscription_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists halo_tenants_email_uidx
  on public.halo_tenants (lower(email));

create index if not exists halo_tenants_workspace_idx
  on public.halo_tenants (workspace_id);

create or replace function public.set_halo_tenants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists halo_tenants_set_updated_at on public.halo_tenants;
create trigger halo_tenants_set_updated_at
  before update on public.halo_tenants
  for each row execute function public.set_halo_tenants_updated_at();

alter table public.halo_tenants enable row level security;
-- service_role bypasses RLS; dashboard uses service_role server-side only
