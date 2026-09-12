-- Support chat image attachments (Supabase Storage + metadata columns)
-- Run in Supabase SQL Editor. Safe to re-run.
-- Dashboard uploads via service_role into bucket `support-media` (created automatically if missing).

alter table public.support_messages
  add column if not exists attachment_path text;

alter table public.support_messages
  add column if not exists attachment_mime text;

alter table public.support_messages
  add column if not exists attachment_name text;

alter table public.support_messages
  add column if not exists attachment_bytes int;

comment on column public.support_messages.attachment_path is
  'Path inside Storage bucket support-media. Served via dashboard /api/support/attachment/:id';

-- Optional: create private bucket in Dashboard → Storage → New bucket
-- Name: support-media
-- Public: off
-- File size limit: 2 MiB
-- Allowed MIME: image/*
