-- LinkedIn ICP lead score (safe to re-run)
alter table public.leads add column if not exists lead_score integer;
alter table public.leads add column if not exists score_breakdown jsonb;

comment on column public.leads.lead_score is 'ICP fit 1–10 from enrich vs Brain portrait (LinkedIn)';
comment on column public.leads.score_breakdown is 'Per-signal score breakdown JSON';
