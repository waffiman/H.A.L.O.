/** Shared CRM status labels — must match Supabase CHECK / OVERVIEW.md §3 */
export const CRM_STATUSES = [
  'Lead😴',
  'Conversation 💬',
  'Active ✅',
  'Lost❌',
];

export const STATUS_LEAD = 'Lead😴';
/** Active post-ice conversation queue (formerly Proposal 2️⃣). */
export const STATUS_CONVERSATION = 'Conversation 💬';
export const STATUS_ACTIVE = 'Active ✅';
export const STATUS_LOST = 'Lost❌';

/** @deprecated Use STATUS_CONVERSATION — kept as alias for older call sites. */
export const STATUS_PROPOSAL_2 = STATUS_CONVERSATION;

/**
 * @deprecated Proposal 1️⃣ removed — enrich + ice now run on Lead😴.
 * Alias kept only so legacy getLeads(STATUS_PROPOSAL_1) does not crash; prefer STATUS_LEAD.
 */
export const STATUS_PROPOSAL_1 = STATUS_LEAD;

/** Appended to notes when a Lead😴 is accepted / already connected and may be enriched + iced. */
export const LEAD_READY_MARKER = 'ready for enrich + ice';

export function leadHasReadyMarker(notesOrLead) {
  const notes =
    typeof notesOrLead === 'string'
      ? notesOrLead
      : String(notesOrLead?.notes || '');
  return notes.includes(LEAD_READY_MARKER);
}

/**
 * Lead😴 that may run Apify enrich + ice (not pending invites).
 * Ice-ready leftovers, acceptance promote this run, or ready marker in notes.
 */
export function isLeadReadyForIcePipeline(lead, { promotedIds, hasIce } = {}) {
  if (!lead) return false;
  if (promotedIds && lead.id && promotedIds.has(lead.id)) return true;
  if (leadHasReadyMarker(lead)) return true;
  if (typeof hasIce === 'function' ? hasIce(lead.msg || lead.ice) : Boolean(hasIce)) {
    return true;
  }
  return false;
}

/** Map legacy Notion/Supabase labels → current canonical status. */
export function normalizeCrmStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return STATUS_LEAD;
  if (s === 'Proposal 1️⃣' || s === 'Proposal 1') return STATUS_LEAD;
  if (s === 'Proposal 2️⃣' || s === 'Proposal 2' || s === STATUS_PROPOSAL_2) return STATUS_CONVERSATION;
  if (CRM_STATUSES.includes(s)) return s;
  return s;
}

export function crmBackend() {
  const raw = String(process.env.CRM_BACKEND || 'notion').trim().toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'notion';
}

export function workspaceId() {
  return String(process.env.WORKSPACE_ID || 'default').trim() || 'default';
}
