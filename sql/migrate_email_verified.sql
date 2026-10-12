-- Email verification for HALO cabinets. Safe to re-run.
alter table public.halo_tenants
  add column if not exists email_verified boolean not null default false;

alter table public.halo_tenants
  add column if not exists email_verified_at timestamptz;

-- Existing cabinets (pre-migration) are trusted.
update public.halo_tenants
set email_verified = true,
    email_verified_at = coalesce(email_verified_at, now())
where email_verified = false
  and created_at < now() - interval '1 minute';

comment on column public.halo_tenants.email_verified is
  'True after the operator confirmed ownership of email (signup link/code). Required for login and password reset.';
