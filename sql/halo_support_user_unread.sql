-- User unread badge for support FAB (run in Supabase SQL Editor). Safe to re-run.

alter table public.halo_tenants
  add column if not exists user_unread_support boolean not null default false;

alter table public.halo_tenants
  add column if not exists user_unread_support_at timestamptz;

-- When support replies (dashboard API or Table Editor insert), flag cabinet for FAB red dot
create or replace function public.support_messages_set_user_unread()
returns trigger
language plpgsql
as $$
begin
  if new.author = 'support' then
    update public.halo_tenants
    set
      user_unread_support = true,
      user_unread_support_at = coalesce(new.created_at, now())
    where workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_user_unread on public.support_messages;
create trigger support_messages_user_unread
  after insert on public.support_messages
  for each row execute function public.support_messages_set_user_unread();

comment on column public.halo_tenants.user_unread_support is
  'True when support sent a message the user has not opened yet. Cleared when user opens support chat.';
