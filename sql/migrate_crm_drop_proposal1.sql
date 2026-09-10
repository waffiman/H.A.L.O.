-- HALO CRM: remove Proposal 1️⃣; rename Proposal 2️⃣ → Conversation 💬
-- Run in Supabase SQL Editor. Safe to re-run.

-- 1) Migrate existing rows
-- Former Proposal 1️⃣ stay messageable under Lead😴 (enrich + ice), not pending invites.
update public.leads
set
  status = 'Lead😴',
  notes = case
    when coalesce(notes, '') like '%ready for enrich + ice%' then notes
    when coalesce(notes, '') = '' then '[migrated] Accepted connection — ready for enrich + ice (Lead😴)'
    else notes || E'\n[migrated] Accepted connection — ready for enrich + ice (Lead😴)'
  end
where status in ('Proposal 1️⃣', 'Proposal 1');

update public.leads
set status = 'Conversation 💬'
where status in ('Proposal 2️⃣', 'Proposal 2');

-- 2) Replace CHECK constraint (name may vary by project)
-- Note: avoid SELECT … INTO … LIMIT — PL/pgSQL in Supabase rejects that form.
do $$
declare
  r record;
begin
  for r in
    select con.conname as cname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'leads'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.leads drop constraint %I', r.cname);
  end loop;

  alter table public.leads drop constraint if exists leads_status_check;

  alter table public.leads
    add constraint leads_status_check
    check (status in (
      'Lead😴',
      'Conversation 💬',
      'Active ✅',
      'Lost❌'
    ));
end $$;
