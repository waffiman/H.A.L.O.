/** Shared CRM status labels — must match Notion / OVERVIEW.md §3 */
export const CRM_STATUSES = [
  'Lead😴',
  'Proposal 1️⃣',
  'Proposal 2️⃣',
  'Active ✅',
  'Lost❌',
];

export const STATUS_LEAD = 'Lead😴';
export const STATUS_PROPOSAL_1 = 'Proposal 1️⃣';
export const STATUS_PROPOSAL_2 = 'Proposal 2️⃣';
export const STATUS_ACTIVE = 'Active ✅';
export const STATUS_LOST = 'Lost❌';

export function crmBackend() {
  const raw = String(process.env.CRM_BACKEND || 'notion').trim().toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'notion';
}

export function workspaceId() {
  return String(process.env.WORKSPACE_ID || 'default').trim() || 'default';
}
