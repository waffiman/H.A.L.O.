-- HALO support chat — one thread per cabinet (workspace_id)
-- Run in Supabase SQL Editor. Safe to re-run.
-- After create: Database → Replication → enable Realtime for public.support_messages

create extension if not exists "pgcrypto";

-- Attention flags on tenants (red highlight in Table Editor / Support inbox)
alter table public.halo_tenants
  add column if not exists support_attention boolean not null default false;

alter table public.halo_tenants
  add column if not exists support_attention_at timestamptz;

alter table public.halo_tenants
  add column if not exists error_attention boolean not null default false;

alter table public.halo_tenants
  add column if not exists error_attention_at timestamptz;

alter table public.halo_tenants
  add column if not exists error_attention_until timestamptz;

alter table public.halo_tenants
  add column if not exists error_attention_reason text not null default '';

create index if not exists halo_tenants_support_attention_idx
  on public.halo_tenants (support_attention)
  where support_attention = true;

create index if not exists halo_tenants_error_attention_idx
  on public.halo_tenants (error_attention)
  where error_attention = true;

-- Messages: one chat per workspace (filter by workspace_id)
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  author text not null check (author in ('user', 'support')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_workspace_created_idx
  on public.support_messages (workspace_id, created_at asc);

alter table public.support_messages enable row level security;
-- Dashboard uses service_role server-side only (bypasses RLS).

-- Convenience view for support triage in Table Editor
create or replace view public.halo_support_inbox as
select
  t.workspace_id,
  t.email,
  t.display_name,
  t.company,
  t.subscription_status,
  t.support_attention,
  t.support_attention_at,
  t.error_attention,
  t.error_attention_at,
  t.error_attention_until,
  t.error_attention_reason,
  (
    select m.body
    from public.support_messages m
    where m.workspace_id = t.workspace_id
    order by m.created_at desc
    limit 1
  ) as last_message,
  (
    select m.created_at
    from public.support_messages m
    where m.workspace_id = t.workspace_id
    order by m.created_at desc
    limit 1
  ) as last_message_at
from public.halo_tenants t
where t.support_attention = true
   or (t.error_attention = true and (t.error_attention_until is null or t.error_attention_until > now()))
order by
  t.support_attention desc,
  t.support_attention_at desc nulls last,
  t.error_attention_at desc nulls last;

comment on table public.support_messages is
  'One support thread per workspace_id. Reply: INSERT author=support. Clear red support flag: UPDATE halo_tenants SET support_attention=false WHERE workspace_id=...';

comment on column public.halo_tenants.support_attention is
  'Red highlight: user sent a message. Clear after you read (dashboard mark-read or SQL).';

comment on column public.halo_tenants.error_attention is
  'Red highlight: cabinet error (+ Telegram). Auto-clears after error_attention_until (2 days).';
