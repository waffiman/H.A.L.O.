const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10 7h8v-8h-8v8z"/></svg>',
  crm: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.5 8.5A2 2 0 1 1 6.5 4.5a2 2 0 0 1 0 4zM4.75 10h3.5V20h-3.5V10zM13 10.2c1.4-1.5 3.7-1.6 5.2-.3.8.7 1.3 1.8 1.3 3V20h-3.5v-5.5c0-1-.4-1.7-1.3-1.7-.9 0-1.4.6-1.4 1.7V20H9.8V10h3.4v.2z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 4.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5zm6.25-.75a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1zM12 9.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v6h3v-6h2.6l.4-3H13v-2c0-.6.4-1 1-1z"/></svg>',
  integrations: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="9" r="3.1" fill="currentColor"/><path fill="currentColor" d="M6.4 18.1c1.45-2.35 3.35-3.45 5.6-3.45s4.15 1.1 5.6 3.45C16 19.15 14.1 19.75 12 19.75s-4-.6-5.6-1.65z"/></svg>',
  billing: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>',
  general: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="9" r="3.1" fill="currentColor"/><path fill="currentColor" d="M6.4 18.1c1.45-2.35 3.35-3.45 5.6-3.45s4.15 1.1 5.6 3.45C16 19.15 14.1 19.75 12 19.75s-4-.6-5.6-1.65z"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 3.18 6 2.67v4.6c0 3.9-2.5 7.54-6 8.86-3.5-1.32-6-4.96-6-8.86v-4.6l6-2.67zM11 7v2h2V7h-2zm0 4v6h2v-6h-2z"/></svg>',
  brain: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.5 3C10.12 3 8.9 3.73 8.18 4.84 6.86 5.17 5.75 6.38 5.75 7.85c0 .52.14 1.01.39 1.43C4.68 10.42 4.25 11.38 4.25 12.42c0 2.07 1.68 3.75 3.75 3.75.35 0 .68-.05 1-.14.61.81 1.57 1.29 2.62 1.29 1.05 0 2.01-.48 2.62-1.29.32.09.65.14 1 .14 2.07 0 3.75-1.68 3.75-3.75 0-1.04-.43-2-.89-2.64.25-.42.39-.91.39-1.43 0-1.47-1.11-2.68-2.43-3.01C14.1 3.73 12.88 3 11.5 3zm0 2c.55 0 1.04.28 1.33.71-.4-.15-.82-.23-1.26-.23-1.05 0-1.98.55-2.5 1.38-.22-.36-.57-.61-.99-.73.28-.72 1-1.23 1.84-1.23h1.58zm1 0h1.58c.84 0 1.56.51 1.84 1.23-.42.12-.77.37-.99.73-.52-.83-1.45-1.38-2.5-1.38-.44 0-.86.08-1.26.23.29-.43.78-.71 1.33-.71zM8.5 11a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm7 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm-3.5 2.75c.97 0 1.75.78 1.75 1.75 0 .2-.03.39-.09.57-.44-.32-.98-.5-1.56-.5-.58 0-1.12.18-1.56.5-.06-.18-.09-.37-.09-.57 0-.97.78-1.75 1.75-1.75z"/></svg>',
  /** Transparent-bg Notion mark (from user asset); inverted via CSS on dark UI */
  notionImg: '<img src="/notion-icon.png" alt="" class="notion-btn-icon" width="14" height="14" />',
  supabase: '<svg class="supabase-btn-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M13.4 2.1c.4-.7 1.5-.4 1.5.4v7.2h6.2c.8 0 1.2 1 .6 1.5l-10.1 10.7c-.4.5-1.3.1-1.2-.5l1.1-7h-6.3c-.8 0-1.2-1-.6-1.5L13.4 2.1z"/></svg>',
  faq: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>',
};
const LEADS_PER_CYCLE_LABEL = 'Connection invites per Stage A';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', title: 'Overview, stages, channels' },
  { id: 'crm', label: 'CRM', title: 'Pipeline, leads, and CRM backend' },
  { id: 'linkedin', label: 'LinkedIn', title: 'LinkedIn channel settings and session' },
  { id: 'instagram', label: 'Instagram', title: 'Instagram channel (coming soon)' },
  { id: 'facebook', label: 'Facebook', title: 'Facebook channel (coming soon)' },
  { id: 'profile', label: 'Profile', title: 'Account, billing, and integrations' },
  { id: 'brain', label: 'Brain', title: 'Sales Brain — master prompt and strategy analysis' },
  { id: 'faq', label: 'FAQ', title: 'Setup guide and quick answers' },
];

let settings = null;
let counts = null;
let page = 'dashboard';
/** @type {{ email?: string, workspaceId?: string, role?: string, displayName?: string, userUnreadSupport?: boolean } | null} */
let haloMe = null;
/** Working copy of Book-a-call weekly schedule (Sales Brain). */
let brainBookingDraft = null;
const BOOKING_WEEK_DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
];
const BOOKING_TZ_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];
let revealed = {};
let openIntegrationGroups = {};
/** Profile accordion: 'general' | 'integrations' | 'billing' | '' */
let openProfileTile = '';
const CRM_STATUSES = ['Lead😴', 'Conversation 💬', 'Active ✅', 'Lost❌'];
const CRM_LOST_REASONS = [
  { id: 'not_interested', label: 'Not interested' },
  { id: 'wrong_person', label: 'Wrong person' },
  { id: 'no_budget', label: 'No budget' },
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'has_solution', label: 'Already has a solution' },
  { id: 'competitor', label: 'Went with competitor' },
  { id: 'unsubscribe', label: 'Asked to stop / unsubscribe' },
  { id: 'hostile', label: 'Hostile / rude' },
  { id: 'non_fit', label: 'Outside ICP / non-fit' },
  { id: 'no_reply', label: 'No reply (silence)' },
  { id: 'other', label: 'Other' },
];
const CRM_MESSENGER_APPS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'viber', label: 'Viber' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'phone', label: 'Phone' },
];
const CRM_CARD_PROP_DEFS = [
  { id: 'link', label: 'Link' },
  { id: 'location', label: 'Location' },
  { id: 'email', label: 'Email' },
  { id: 'ice', label: 'Ice-breaker' },
  { id: 'last', label: 'Last contact' },
  { id: 'body', label: 'Body' },
];
const CRM_FIELD_DEFS = [
  { id: 'name', label: 'Name', type: 'text' },
  { id: 'url', label: 'Link', type: 'text' },
  { id: 'location', label: 'Location', type: 'text' },
  { id: 'timezone', label: 'Timezone', type: 'text' },
  { id: 'email', label: 'Email', type: 'text' },
  { id: 'lostReason', label: 'Lost reason', type: 'text' },
  { id: 'status', label: 'Status', type: 'status' },
  { id: 'msg', label: 'Ice-breaker', type: 'text' },
  { id: 'processingAt', label: 'Last contact', type: 'date' },
  { id: 'notes', label: 'Conversation', type: 'text' },
];
const CRM_FILTER_OPS = {
  text: [
    { id: 'contains', label: 'Contains' },
    { id: 'not_contains', label: 'Does not contain' },
    { id: 'is', label: 'Is exactly' },
    { id: 'is_not', label: 'Is not' },
    { id: 'starts_with', label: 'Starts with' },
    { id: 'ends_with', label: 'Ends with' },
    { id: 'is_empty', label: 'Is empty' },
    { id: 'is_not_empty', label: 'Is not empty' },
  ],
  status: [
    { id: 'is', label: 'Is' },
    { id: 'is_not', label: 'Is not' },
    { id: 'is_any_of', label: 'Is any of' },
    { id: 'is_none_of', label: 'Is none of' },
    { id: 'is_empty', label: 'Is empty' },
    { id: 'is_not_empty', label: 'Is not empty' },
  ],
  date: [
    { id: 'is', label: 'Is on' },
    { id: 'before', label: 'Is before' },
    { id: 'after', label: 'Is after' },
    { id: 'on_or_before', label: 'Is on or before' },
    { id: 'on_or_after', label: 'Is on or after' },
    { id: 'is_empty', label: 'Is empty' },
    { id: 'is_not_empty', label: 'Is not empty' },
    { id: 'within_last', label: 'Within last N days' },
    { id: 'older_than', label: 'More than N days ago' },
  ],
};
const CRM_CARD_PROPS_KEY = 'halo_crm_kanban_props';
const CRM_PINNED_KEY = 'halo_crm_pinned_ids';
const CRM_SORT_KEY = 'halo_crm_kanban_sort';
const CRM_FILTERS_KEY = 'halo_crm_kanban_filters';

function loadCrmCardProps() {
  const defaults = { link: true, location: true, email: false, ice: true, last: false, body: false };
  try {
    const raw = JSON.parse(localStorage.getItem(CRM_CARD_PROPS_KEY) || '{}');
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

function saveCrmCardProps(props) {
  try {
    localStorage.setItem(CRM_CARD_PROPS_KEY, JSON.stringify(props));
  } catch {
    /* ignore */
  }
}

function loadCrmPinnedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(CRM_PINNED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveCrmPinnedIds(ids) {
  try {
    localStorage.setItem(CRM_PINNED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function isCrmPinned(id) {
  return crmPinnedIds.has(String(id));
}

function toggleCrmPin(id) {
  const key = String(id);
  if (crmPinnedIds.has(key)) crmPinnedIds.delete(key);
  else crmPinnedIds.add(key);
  saveCrmPinnedIds(crmPinnedIds);
}

function loadCrmSort() {
  const defaults = {
    primary: { field: 'processingAt', dir: 'desc' },
    secondary: { field: 'name', dir: 'asc' },
    pinnedFirst: true,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(CRM_SORT_KEY) || '{}');
    return {
      primary: { ...defaults.primary, ...(raw.primary || {}) },
      secondary: raw.secondary === null ? null : { ...defaults.secondary, ...(raw.secondary || {}) },
      pinnedFirst: raw.pinnedFirst !== false,
    };
  } catch {
    return defaults;
  }
}

function saveCrmSort(sort) {
  try {
    localStorage.setItem(CRM_SORT_KEY, JSON.stringify(sort));
  } catch {
    /* ignore */
  }
}

function loadCrmFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(CRM_FILTERS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveCrmFilters(filters) {
  try {
    localStorage.setItem(CRM_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

function crmFieldDef(fieldId) {
  return CRM_FIELD_DEFS.find((f) => f.id === fieldId) || CRM_FIELD_DEFS[0];
}

function crmLeadFieldValue(lead, fieldId) {
  if (!lead) return '';
  if (fieldId === 'url') return String(lead.url || '').trim();
  if (fieldId === 'location') return String(lead.location || '').trim();
  if (fieldId === 'timezone') return String(lead.timezone || '').trim();
  if (fieldId === 'email') return String(lead.email || '').trim();
  if (fieldId === 'lostReason') return String(lead.lostReason || '').trim();
  if (fieldId === 'msg') return String(lead.msg || '').trim();
  if (fieldId === 'notes') return String(lead.notes || '').trim();
  if (fieldId === 'processingAt') return lead.processingAt || '';
  if (fieldId === 'status') return String(lead.status || '').trim();
  return String(lead.name || '').trim();
}

function crmFilterNeedsValue(op) {
  return !['is_empty', 'is_not_empty'].includes(op);
}

function crmDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function crmDaysAgo(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 86400000;
}

function crmEvaluateFilter(lead, rule) {
  if (!rule?.field || !rule?.op) return true;
  const def = crmFieldDef(rule.field);
  const raw = crmLeadFieldValue(lead, rule.field);
  const val = String(rule.value || '').trim();
  const lower = raw.toLowerCase();
  const valLower = val.toLowerCase();

  if (def.type === 'status') {
    const statuses = val.split(',').map((s) => s.trim()).filter(Boolean);
    if (rule.op === 'is_empty') return !raw;
    if (rule.op === 'is_not_empty') return Boolean(raw);
    if (rule.op === 'is') return raw === val;
    if (rule.op === 'is_not') return raw !== val;
    if (rule.op === 'is_any_of') return statuses.includes(raw);
    if (rule.op === 'is_none_of') return !statuses.includes(raw);
    return true;
  }

  if (def.type === 'date') {
    if (rule.op === 'is_empty') return !raw;
    if (rule.op === 'is_not_empty') return Boolean(raw);
    const days = Number(val);
    if (rule.op === 'within_last') return raw && !Number.isNaN(days) && crmDaysAgo(raw) <= days;
    if (rule.op === 'older_than') return raw && !Number.isNaN(days) && crmDaysAgo(raw) > days;
    const leadDay = crmDateOnly(raw);
    const ruleDay = val.slice(0, 10);
    if (!leadDay && rule.op !== 'is_empty') return false;
    if (rule.op === 'is') return leadDay === ruleDay;
    if (rule.op === 'before') return leadDay < ruleDay;
    if (rule.op === 'after') return leadDay > ruleDay;
    if (rule.op === 'on_or_before') return leadDay <= ruleDay;
    if (rule.op === 'on_or_after') return leadDay >= ruleDay;
    return true;
  }

  if (rule.op === 'is_empty') return !raw;
  if (rule.op === 'is_not_empty') return Boolean(raw);
  if (rule.op === 'contains') return lower.includes(valLower);
  if (rule.op === 'not_contains') return !lower.includes(valLower);
  if (rule.op === 'is') return lower === valLower;
  if (rule.op === 'is_not') return lower !== valLower;
  if (rule.op === 'starts_with') return lower.startsWith(valLower);
  if (rule.op === 'ends_with') return lower.endsWith(valLower);
  return true;
}

function crmApplyLeadFilters(leads, filters = crmFilters) {
  const active = (filters || []).filter((r) => {
    if (!r.field || !r.op) return false;
    if (crmFilterNeedsValue(r.op) && !String(r.value || '').trim()) return false;
    return true;
  });
  if (!active.length) return leads;
  return leads.filter((lead) => active.every((rule) => crmEvaluateFilter(lead, rule)));
}

function crmCompareLeads(a, b, fieldId, dir) {
  const def = crmFieldDef(fieldId);
  const mul = dir === 'desc' ? -1 : 1;
  const av = crmLeadFieldValue(a, fieldId);
  const bv = crmLeadFieldValue(b, fieldId);

  if (def.type === 'date') {
    const at = av ? new Date(av).getTime() : 0;
    const bt = bv ? new Date(bv).getTime() : 0;
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return (at - bt) * mul;
  }

  if (def.type === 'status') {
    const ai = CRM_STATUSES.indexOf(av);
    const bi = CRM_STATUSES.indexOf(bv);
    const aIdx = ai === -1 ? 999 : ai;
    const bIdx = bi === -1 ? 999 : bi;
    return (aIdx - bIdx) * mul;
  }

  return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * mul;
}

function crmSortLeadList(leads, sort = crmSort) {
  const list = [...leads];
  list.sort((a, b) => {
    if (sort.pinnedFirst) {
      const pa = isCrmPinned(a.id) ? 0 : 1;
      const pb = isCrmPinned(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    let cmp = crmCompareLeads(a, b, sort.primary.field, sort.primary.dir);
    if (cmp !== 0) return cmp;
    if (sort.secondary?.field) {
      cmp = crmCompareLeads(a, b, sort.secondary.field, sort.secondary.dir);
      if (cmp !== 0) return cmp;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
  return list;
}

function crmProcessLeadList(leads) {
  return crmSortLeadList(crmApplyLeadFilters(leads));
}

function crmActiveFilterCount() {
  return crmFilters.filter((r) => r.field && r.op && (crmFilterNeedsValue(r.op) ? String(r.value || '').trim() : true)).length;
}

function crmSettingsBadgeHtml() {
  const n = crmActiveFilterCount();
  if (!n) return '';
  return `<span class="crm-settings-badge" title="${n} active filter(s)">${n}</span>`;
}

let crmViewMode = 'kanban';
let crmStatusFilter = '';
let crmSearchQ = '';
let crmPage = 1;
let crmLeads = [];
let crmTotal = 0;
let crmKanban = {};
let crmKanbanTotals = {};
let crmLoading = false;
let crmDrawerLead = null;
let crmDrawerTab = 'general';
let crmSelectedIds = new Set();
let crmKanbanDragId = null;
let crmCardProps = loadCrmCardProps();
let crmPinnedIds = loadCrmPinnedIds();
let crmSort = loadCrmSort();
let crmFilters = loadCrmFilters();
let crmSettingsPanel = 'root';
let notifyOpen = false;
let notifications = { items: [], unread: 0 };
let linkedInLoginPoll = null;

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');
const navEl = document.getElementById('nav');
const navBrainSlot = document.getElementById('nav-brain-slot');
const toastEl = document.getElementById('toast');
const bellBadge = document.getElementById('bell-badge');
const notifyPanel = document.getElementById('notify-panel');
const notifyBackdrop = document.getElementById('notify-backdrop');
const notifyList = document.getElementById('notify-list');
const topActions = document.querySelector('.top-actions');

function toast(msg, err = false, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('err', 'warn', 'sticky');
  toastEl.classList.toggle('err', !!err);
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  if (ms > 0) toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function toastWarn(msg, ms = 0) {
  toastEl.textContent = msg;
  toastEl.classList.remove('err', 'hidden');
  toastEl.classList.add('warn');
  if (ms === 0) toastEl.classList.add('sticky');
  else toastEl.classList.remove('sticky');
  clearTimeout(toast._t);
  if (ms > 0) toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

let linkedInChallengeAlerted = false;
let linkedInTitleFlash = null;
const LI_DOC_TITLE = () => document.title.replace(/^⚠\s*/, '').split(' · ')[0] || 'H.A.L.O.';

function browserNotify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'linkedin-signin-challenge', requireInteraction: true });
  } catch {
    /* ignore */
  }
}

function startLinkedInTitleAlert() {
  if (linkedInTitleFlash) return;
  const base = LI_DOC_TITLE();
  let on = false;
  linkedInTitleFlash = setInterval(() => {
    document.title = on ? base : '⚠ Approve in LinkedIn app';
    on = !on;
  }, 1100);
}

function stopLinkedInTitleAlert() {
  if (linkedInTitleFlash) clearInterval(linkedInTitleFlash);
  linkedInTitleFlash = null;
}

const LI_CHALLENGE_COPY = {
  app_approval: {
    title: 'Action required: approve in LinkedIn app',
    body: 'Open the LinkedIn app on your phone and tap Yes / Approve on the sign-in request. This page updates automatically — no need to sign in again.',
    toast: 'Open LinkedIn app → tap Approve on the sign-in request',
    notifyTitle: 'LinkedIn sign-in waiting',
    notifyBody: 'Tap Approve in your LinkedIn app now',
  },
  pin: {
    title: 'Verification code needed',
    body: 'LinkedIn sent a code. Open the repair page below to enter it, or check SMS / email.',
    toast: 'LinkedIn wants a verification code — open repair page',
    notifyTitle: 'LinkedIn verification code',
    notifyBody: 'Enter the code on the repair page',
  },
  captcha: {
    title: 'Security check required',
    body: 'Complete the security step on the repair page below.',
    toast: 'LinkedIn security check — open repair page',
    notifyTitle: 'LinkedIn security check',
    notifyBody: 'Complete verification on the repair page',
  },
  generic: {
    title: 'Extra verification needed',
    body: 'LinkedIn needs another step. Open the repair page below and follow the instructions.',
    toast: 'LinkedIn needs verification — open repair page',
    notifyTitle: 'LinkedIn verification',
    notifyBody: 'Open the repair page in H.A.L.O.',
  },
};

function showLinkedInChallengeUI(st, els) {
  const kind = st.challengeKind || 'app_approval';
  const copy = LI_CHALLENGE_COPY[kind] || LI_CHALLENGE_COPY.generic;
  const { statusEl, bannerEl, repairLink } = els;
  if (bannerEl) {
    bannerEl.classList.remove('hidden');
    const t = bannerEl.querySelector('.li-challenge-title');
    const b = bannerEl.querySelector('.li-challenge-body');
    if (t) t.textContent = copy.title;
    if (b) b.textContent = copy.body;
  }
  if (statusEl) statusEl.textContent = '';
  if (repairLink && st.token) {
    repairLink.href = `/repair.html?token=${encodeURIComponent(st.token)}`;
  }
}

function hideLinkedInChallengeUI(els) {
  const { bannerEl } = els;
  if (bannerEl) bannerEl.classList.add('hidden');
  stopLinkedInTitleAlert();
  toastEl.classList.remove('warn', 'sticky');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || data.output || `HTTP ${res.status}`);
  return data;
}

function switchEl(id, checked, title) {
  return `<label class="switch" title="${escapeAttr(title || 'Toggle')}">
    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
    <span class="slider"></span>
  </label>`;
}

function unitSelect(id, unit) {
  return `<select id="${id}" title="Interval unit">
    <option value="minutes" ${unit === 'minutes' ? 'selected' : ''}>minutes</option>
    <option value="hours" ${unit === 'hours' ? 'selected' : ''}>hours</option>
    <option value="days" ${unit === 'days' ? 'selected' : ''}>days</option>
  </select>`;
}

const NAV_GROUPS = [
  { label: 'Overview', ids: ['dashboard', 'crm'] },
  { label: 'Channels', ids: ['linkedin', 'instagram', 'facebook'] },
  { label: 'Settings', ids: ['profile'] },
  { label: 'Help', ids: ['faq'] },
];
function setPageHeader(title, subtitle = '') {
  titleEl.textContent = title;
  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
    subtitleEl.style.display = subtitle ? 'block' : 'none';
  }
}

function crmMetricClass(key) {
  if (key.startsWith('Lead')) return 'metric-lead';
  if (key.startsWith('Conversation') || key.startsWith('Proposal 2')) return 'metric-p2';
  if (key.startsWith('Active')) return 'metric-active';
  if (key.startsWith('Lost')) return 'metric-lost';
  return '';
}

function crmStatusColor(key) {
  if (key.startsWith('Lead')) return '#9b9a97';
  if (key.startsWith('Conversation') || key.startsWith('Proposal 2')) return '#9a6dd7';
  if (key.startsWith('Active')) return '#4dab9a';
  if (key.startsWith('Lost')) return '#e03e3e';
  return '#6b7280';
}

function crmStatusShortLabel(key) {
  if (key.startsWith('Lead')) return 'Lead';
  if (key.startsWith('Conversation') || key.startsWith('Proposal 2')) return 'Chat';
  if (key.startsWith('Active')) return 'Active';
  if (key.startsWith('Lost')) return 'Lost';
  return key;
}

/** SaaS-style donut + legend for dashboard CRM snapshot. */
function buildCrmSnapshotDonut(counts = {}) {
  const rows = CRM_STATUSES.map((key) => ({
    key,
    short: crmStatusShortLabel(key),
    val: Number(counts[key]) || 0,
    color: crmStatusColor(key),
    cls: crmMetricClass(key),
  }));
  const total = rows.reduce((s, r) => s + r.val, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs =
    total === 0
      ? `<circle class="dash-donut-empty" cx="54" cy="54" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="11"/>`
      : rows
          .filter((row) => row.val > 0)
          .map((row) => {
            const len = (row.val / total) * c;
            const dash = `${len} ${c - len}`;
            const el = `<circle class="dash-donut-seg" data-status="${escapeAttr(row.key)}" cx="54" cy="54" r="${r}" fill="none" stroke="${row.color}" stroke-width="11" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" stroke-linecap="butt" transform="rotate(-90 54 54)"/>`;
            offset += len;
            return el;
          })
          .join('');

  const legend = rows
    .map((row) => {
      const pct = total ? Math.round((row.val / total) * 100) : 0;
      return `<button type="button" class="dash-donut-legend-item ${row.cls}" data-status="${escapeAttr(row.key)}" title="${escapeAttr(row.key)} · ${row.val} leads (${pct}%)">
        <span class="dash-donut-swatch" style="background:${row.color}"></span>
        <span class="dash-donut-legend-name">${escapeHtml(row.short)}</span>
        <span class="dash-donut-legend-nums"><strong>${row.val}</strong><span class="muted">${pct}%</span></span>
      </button>`;
    })
    .join('');

  return `
    <div class="dash-donut-layout" id="dash-crm-donut">
      <div class="dash-donut-visual">
        <svg class="dash-donut-svg" viewBox="0 0 108 108" width="96" height="96" aria-hidden="true">
          <circle cx="54" cy="54" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="11"/>
          ${arcs}
        </svg>
        <div class="dash-donut-center">
          <div class="dash-donut-total" id="dash-donut-total">${total}</div>
          <div class="dash-donut-total-label" id="dash-donut-label">leads</div>
        </div>
      </div>
      <div class="dash-donut-legend">${legend}</div>
    </div>`;
}

function bindCrmSnapshotDonut() {
  const root = document.getElementById('dash-crm-donut');
  if (!root) return;
  const totalEl = document.getElementById('dash-donut-total');
  const labelEl = document.getElementById('dash-donut-label');
  const baseTotal = totalEl?.textContent || '0';
  const items = [...root.querySelectorAll('.dash-donut-legend-item')];
  const segs = [...root.querySelectorAll('.dash-donut-seg')];

  const setActive = (status, hover) => {
    root.classList.toggle('is-hovering', !!status);
    items.forEach((el) => el.classList.toggle('is-active', !!status && el.dataset.status === status));
    segs.forEach((el) => el.classList.toggle('is-active', !!status && el.dataset.status === status));
    segs.forEach((el) => el.classList.toggle('is-dim', !!status && el.dataset.status !== status));
    if (!totalEl || !labelEl) return;
    if (!status || !hover) {
      totalEl.textContent = baseTotal;
      labelEl.textContent = 'leads';
      return;
    }
    const item = items.find((el) => el.dataset.status === status);
    const strong = item?.querySelector('strong')?.textContent || '0';
    totalEl.textContent = strong;
    labelEl.textContent = crmStatusShortLabel(status);
  };

  items.forEach((el) => {
    el.addEventListener('mouseenter', () => setActive(el.dataset.status, true));
    el.addEventListener('mouseleave', () => setActive(null, false));
    el.addEventListener('focus', () => setActive(el.dataset.status, true));
    el.addEventListener('blur', () => setActive(null, false));
    el.addEventListener('click', () => {
      page = 'crm';
      render();
    });
  });
  segs.forEach((el) => {
    el.addEventListener('mouseenter', () => setActive(el.dataset.status, true));
    el.addEventListener('mouseleave', () => setActive(null, false));
  });
}

function crmMetricTile(key, val, { clickable = false, active = false } = {}) {
  const cls = crmMetricClass(key);
  const inner = `<h3>${key}</h3><div class="metric">${val ?? '—'}</div>`;
  if (!clickable) {
    return `<div class="tile metric-tile ${cls}" title="${escapeAttr(key)}">${inner}</div>`;
  }
  return `<button type="button" class="tile metric-tile ${cls} crm-metric-click${active ? ' crm-metric-active' : ''}" data-crm-status="${escapeAttr(key)}" title="Filter by ${escapeAttr(key)}">${inner}</button>`;
}

function openSupabaseBtn(url, { sm = false } = {}) {
  const href = url || 'https://supabase.com/dashboard';
  const size = sm ? ' btn-sm' : '';
  return `<a class="btn btn-supabase${size}" href="${escapeAttr(href)}" target="_blank" rel="noopener" title="Open Supabase project">${ICONS.supabase}<span>Open Supabase</span></a>`;
}

function crmInAppEnabled(s = settings) {
  return s?.crmBackend === 'supabase' && s?.notionConfigured;
}

function formatCrmDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function crmStatusBadge(status) {
  const cls = crmMetricClass(status);
  return `<span class="crm-status-badge ${cls}">${escapeHtml(status)}</span>`;
}

function crmTextPreview(text, max = 80) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function crmLinkLabel(url) {
  const u = String(url || '').trim();
  if (!u) return '—';
  return u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

function crmBodyPreview(notes) {
  const t = String(notes || '').trim();
  if (!t) return '—';
  const line = t.split('\n').map((l) => l.trim()).find(Boolean) || t;
  return escapeHtml(crmTextPreview(line, 120));
}

function crmKanbanCardHtml(lead) {
  const props = [];
  if (crmCardProps.link) {
    const link = crmLinkLabel(lead.url);
    props.push(
      `<div class="crm-prop"><span class="crm-prop-label">Link</span><span class="crm-prop-val" title="${escapeAttr(lead.url || '')}">${link !== '—' ? escapeHtml(crmTextPreview(link, 36)) : '—'}</span></div>`
    );
  }
  if (crmCardProps.location) {
    const loc = crmTextPreview(lead.location, 48);
    props.push(
      `<div class="crm-prop"><span class="crm-prop-label">Loc</span><span class="crm-prop-val" title="${escapeAttr(lead.location || '')}">${loc ? escapeHtml(loc) : '—'}</span></div>`
    );
  }
  if (crmCardProps.email) {
    const em = crmTextPreview(lead.email, 40);
    props.push(
      `<div class="crm-prop"><span class="crm-prop-label">Email</span><span class="crm-prop-val" title="${escapeAttr(lead.email || '')}">${em ? escapeHtml(em) : '—'}</span></div>`
    );
  }
  if (crmCardProps.ice) {
    const ice = crmTextPreview(lead.msg, 72);
    props.push(
      `<div class="crm-prop"><span class="crm-prop-label">Ice</span><span class="crm-prop-val">${ice ? escapeHtml(ice) : '—'}</span></div>`
    );
  }
  if (crmCardProps.last) {
    const proc = lead.processingAt ? formatCrmDate(lead.processingAt) : '—';
    props.push(
      `<div class="crm-prop"><span class="crm-prop-label">Last</span><span class="crm-prop-val">${escapeHtml(proc)}</span></div>`
    );
  }
  if (crmCardProps.body) {
    const bodyRaw = String(lead.notes || '').trim();
    const bodyLine = bodyRaw
      ? escapeHtml(crmTextPreview(bodyRaw.split('\n').find((l) => l.trim()) || bodyRaw, 72))
      : '<span class="muted">Empty</span>';
    props.push(
      `<div class="crm-prop crm-prop-body"><span class="crm-prop-label">Body</span><span class="crm-prop-val">${bodyLine}</span></div>`
    );
  }
  return `<div class="crm-kanban-card${props.length ? '' : ' crm-kanban-card-compact'}${isCrmPinned(lead.id) ? ' is-pinned' : ''}" draggable="true" data-lead-id="${escapeAttr(lead.id)}" data-lead-status="${escapeAttr(lead.status)}" title="Drag to move · click to open">
    <div class="crm-kanban-card-top">
      <div class="crm-kanban-card-name">${isCrmPinned(lead.id) ? '<span class="crm-pin-mark" title="Pinned" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M16 3a1 1 0 0 1 1 1v2.17l1.55.78a1 1 0 0 1 .45 1.34l-2.2 4.4V19a1 1 0 1 1-2 0v-2.31l-2.2-4.4a1 1 0 0 1 .45-1.34L15 6.17V4a1 1 0 0 1 1-1z"/></svg></span>' : ''}${escapeHtml(lead.name || 'Untitled')}</div>
      <div class="crm-card-menu">
        <button type="button" class="crm-card-menu-btn" data-crm-menu-toggle="${escapeAttr(lead.id)}" title="Lead actions" aria-label="Lead actions" aria-expanded="false">⋯</button>
        <div class="crm-card-menu-drop hidden" data-crm-menu-drop="${escapeAttr(lead.id)}" role="menu">
          <button type="button" role="menuitem" data-crm-pin="${escapeAttr(lead.id)}">${isCrmPinned(lead.id) ? 'Unpin lead' : 'Pin lead'}</button>
          <button type="button" role="menuitem" class="crm-card-menu-danger" data-crm-delete="${escapeAttr(lead.id)}">Delete lead</button>
        </div>
      </div>
    </div>
    ${props.length ? `<div class="crm-kanban-card-props">${props.join('')}</div>` : ''}
  </div>`;
}

function crmKanbanCardsForStatus(status) {
  const cards = [...(crmKanban[status] || [])];
  const needle = crmSearchQ.toLowerCase();
  const searched = needle
    ? cards.filter(
        (l) =>
          String(l.name || '').toLowerCase().includes(needle) ||
          String(l.url || '').toLowerCase().includes(needle) ||
          String(l.msg || '').toLowerCase().includes(needle) ||
          String(l.notes || '').toLowerCase().includes(needle)
      )
    : cards;
  return crmProcessLeadList(searched);
}

function crmFilterOpOptions(fieldId, selectedOp) {
  const def = crmFieldDef(fieldId);
  const ops = CRM_FILTER_OPS[def.type] || CRM_FILTER_OPS.text;
  return ops
    .map((op) => `<option value="${escapeAttr(op.id)}"${op.id === selectedOp ? ' selected' : ''}>${escapeHtml(op.label)}</option>`)
    .join('');
}

function crmFilterValueInput(rule, idx) {
  const def = crmFieldDef(rule.field);
  if (!crmFilterNeedsValue(rule.op)) return '';
  if (def.type === 'status' && (rule.op === 'is_any_of' || rule.op === 'is_none_of')) {
    const picked = new Set(String(rule.value || '').split(',').map((s) => s.trim()).filter(Boolean));
    const checks = CRM_STATUSES.map(
      (st) => `<label class="crm-filter-status-opt"><input type="checkbox" data-crm-filter-status="${escapeAttr(st)}" data-crm-filter-idx="${idx}"${picked.has(st) ? ' checked' : ''} /><span>${escapeHtml(st)}</span></label>`
    ).join('');
    return `<div class="crm-filter-status-grid" data-crm-filter-value-wrap="${idx}">${checks}</div>`;
  }
  if (def.type === 'status') {
    const opts = CRM_STATUSES.map(
      (st) => `<option value="${escapeAttr(st)}"${st === rule.value ? ' selected' : ''}>${escapeHtml(st)}</option>`
    ).join('');
    return `<select class="crm-settings-select" data-crm-filter-value="${idx}"><option value="">Pick status…</option>${opts}</select>`;
  }
  if (def.type === 'date' && !['within_last', 'older_than'].includes(rule.op)) {
    const v = String(rule.value || '').slice(0, 10);
    return `<input type="date" class="crm-settings-input" data-crm-filter-value="${idx}" value="${escapeAttr(v)}" />`;
  }
  if (def.type === 'date') {
    return `<input type="number" min="1" class="crm-settings-input crm-settings-input-narrow" data-crm-filter-value="${idx}" placeholder="Days" value="${escapeAttr(rule.value || '')}" />`;
  }
  return `<input type="text" class="crm-settings-input" data-crm-filter-value="${idx}" placeholder="Value…" value="${escapeAttr(rule.value || '')}" />`;
}

function crmFilterRuleHtml(rule, idx) {
  const fieldOpts = CRM_FIELD_DEFS.map(
    (f) => `<option value="${escapeAttr(f.id)}"${f.id === rule.field ? ' selected' : ''}>${escapeHtml(f.label)}</option>`
  ).join('');
  return `<div class="crm-filter-rule" data-crm-filter-idx="${idx}">
    <div class="crm-filter-rule-top">
      <select class="crm-settings-select" data-crm-filter-field="${idx}">${fieldOpts}</select>
      <select class="crm-settings-select" data-crm-filter-op="${idx}">${crmFilterOpOptions(rule.field, rule.op)}</select>
      <button type="button" class="crm-filter-remove" data-crm-filter-remove="${idx}" title="Remove filter" aria-label="Remove filter">×</button>
    </div>
    ${crmFilterValueInput(rule, idx)}
  </div>`;
}

function crmSortFieldOptions(selected) {
  return CRM_FIELD_DEFS.map(
    (f) => `<option value="${escapeAttr(f.id)}"${f.id === selected ? ' selected' : ''}>${escapeHtml(f.label)}</option>`
  ).join('');
}

function crmSettingsPanelHtml(panel) {
  if (panel === 'properties') {
    const checks = CRM_CARD_PROP_DEFS.map(
      (p) => `<label class="crm-prop-toggle">
        <input type="checkbox" data-crm-prop="${p.id}"${crmCardProps[p.id] ? ' checked' : ''} />
        <span>${escapeHtml(p.label)}</span>
      </label>`
    ).join('');
    return `<div class="crm-settings-head">
      <button type="button" class="crm-settings-back" data-crm-settings-panel="root" aria-label="Back">←</button>
      <span>Properties</span>
    </div>
    <p class="crm-settings-hint muted">Choose fields shown on kanban card previews.</p>
    <div class="crm-settings-section-body">${checks}</div>`;
  }

  if (panel === 'sort') {
    const secEnabled = Boolean(crmSort.secondary?.field);
    return `<div class="crm-settings-head">
      <button type="button" class="crm-settings-back" data-crm-settings-panel="root" aria-label="Back">←</button>
      <span>Sort</span>
    </div>
    <p class="crm-settings-hint muted">Order cards within each column (and table rows on this page).</p>
    <div class="crm-settings-section-body">
      <label class="crm-settings-row">
        <span class="crm-settings-label">Primary</span>
        <select class="crm-settings-select" id="crm-sort-primary-field">${crmSortFieldOptions(crmSort.primary.field)}</select>
        <select class="crm-settings-select crm-settings-select-narrow" id="crm-sort-primary-dir">
          <option value="asc"${crmSort.primary.dir === 'asc' ? ' selected' : ''}>A → Z</option>
          <option value="desc"${crmSort.primary.dir === 'desc' ? ' selected' : ''}>Z → A</option>
        </select>
      </label>
      <label class="crm-prop-toggle">
        <input type="checkbox" id="crm-sort-secondary-enable"${secEnabled ? ' checked' : ''} />
        <span>Then sort by</span>
      </label>
      <div class="crm-settings-sub${secEnabled ? '' : ' hidden'}" id="crm-sort-secondary-wrap">
        <label class="crm-settings-row">
          <span class="crm-settings-label">Secondary</span>
          <select class="crm-settings-select" id="crm-sort-secondary-field">${crmSortFieldOptions(crmSort.secondary?.field || 'name')}</select>
          <select class="crm-settings-select crm-settings-select-narrow" id="crm-sort-secondary-dir">
            <option value="asc"${crmSort.secondary?.dir === 'asc' ? ' selected' : ''}>A → Z</option>
            <option value="desc"${crmSort.secondary?.dir === 'desc' ? ' selected' : ''}>Z → A</option>
          </select>
        </label>
      </div>
      <label class="crm-prop-toggle">
        <input type="checkbox" id="crm-sort-pinned"${crmSort.pinnedFirst ? ' checked' : ''} />
        <span>Pinned leads first</span>
      </label>
      <p class="crm-settings-note muted">Dates: A→Z = oldest first. Status: pipeline order (Lead → Lost).</p>
    </div>`;
  }

  if (panel === 'filter') {
    if (!crmFilters.length) {
      return `<div class="crm-settings-head">
        <button type="button" class="crm-settings-back" data-crm-settings-panel="root" aria-label="Back">←</button>
        <span>Filter</span>
      </div>
      <p class="crm-settings-hint muted">Show only leads matching all rules. Rules apply to loaded kanban cards and the current table page.</p>
      <div class="crm-settings-section-body">
        <p class="crm-settings-empty muted">No filters yet.</p>
      </div>
      <div class="crm-settings-foot">
        <button type="button" class="btn ghost btn-sm" id="crm-filter-add">+ Add rule</button>
      </div>`;
    }
    return `<div class="crm-settings-head">
      <button type="button" class="crm-settings-back" data-crm-settings-panel="root" aria-label="Back">←</button>
      <span>Filter</span>
    </div>
    <p class="crm-settings-hint muted">Show only leads matching all rules below.</p>
    <div class="crm-settings-section-body" id="crm-filter-rules">${crmFilters.map((r, i) => crmFilterRuleHtml(r, i)).join('')}</div>
    <div class="crm-settings-foot">
      <button type="button" class="btn ghost btn-sm" id="crm-filter-add">+ Add rule</button>
      <button type="button" class="btn ghost btn-sm" id="crm-filter-clear">Clear all</button>
    </div>`;
  }

  const filterN = crmActiveFilterCount();
  const sortLabel = `${crmFieldDef(crmSort.primary.field).label} (${crmSort.primary.dir === 'desc' ? '↓' : '↑'})`;
  const propsOn = CRM_CARD_PROP_DEFS.filter((p) => crmCardProps[p.id]).length;
  return `<div class="crm-settings-head crm-settings-head-root"><span>View settings</span></div>
    <div class="crm-settings-nav">
      <button type="button" class="crm-settings-nav-item" data-crm-settings-panel="properties">
        <span class="crm-settings-nav-title">Properties</span>
        <span class="crm-settings-nav-meta muted">${propsOn} on card</span>
        <span class="crm-settings-chevron" aria-hidden="true">›</span>
      </button>
      <button type="button" class="crm-settings-nav-item" data-crm-settings-panel="sort">
        <span class="crm-settings-nav-title">Sort</span>
        <span class="crm-settings-nav-meta muted">${escapeHtml(sortLabel)}</span>
        <span class="crm-settings-chevron" aria-hidden="true">›</span>
      </button>
      <button type="button" class="crm-settings-nav-item" data-crm-settings-panel="filter">
        <span class="crm-settings-nav-title">Filter</span>
        <span class="crm-settings-nav-meta muted">${filterN ? `${filterN} active` : 'None'}</span>
        <span class="crm-settings-chevron" aria-hidden="true">›</span>
      </button>
    </div>`;
}

function crmCardPropsMenuHtml() {
  return `<div class="crm-props-menu" id="crm-props-menu">
    <button type="button" class="crm-props-gear" id="crm-props-toggle" title="View settings" aria-label="View settings" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.89 14.5a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>
      ${crmSettingsBadgeHtml()}
    </button>
    <div class="crm-props-dropdown hidden" id="crm-props-dropdown" role="dialog" aria-label="CRM view settings">
      <div id="crm-settings-panel">${crmSettingsPanelHtml(crmSettingsPanel)}</div>
    </div>
  </div>`;
}

function paintCrmSettingsPanel(panel = crmSettingsPanel) {
  crmSettingsPanel = panel;
  const el = document.getElementById('crm-settings-panel');
  if (!el) return;
  el.innerHTML = crmSettingsPanelHtml(panel);
  bindCrmSettingsPanel();
}

function bindCrmSettingsPanel() {
  const panel = crmSettingsPanel;
  document.querySelectorAll('[data-crm-settings-panel]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      paintCrmSettingsPanel(btn.getAttribute('data-crm-settings-panel') || 'root');
    };
  });

  if (panel === 'properties') {
    document.querySelectorAll('[data-crm-prop]').forEach((input) => {
      input.onchange = () => {
        crmCardProps[input.dataset.crmProp] = input.checked;
        saveCrmCardProps(crmCardProps);
        paintCrmLeadsPanel();
        updateCrmSettingsBadge();
      };
    });
    return;
  }

  if (panel === 'sort') {
    const applySort = () => {
      const secOn = document.getElementById('crm-sort-secondary-enable')?.checked;
      crmSort = {
        primary: {
          field: document.getElementById('crm-sort-primary-field')?.value || 'name',
          dir: document.getElementById('crm-sort-primary-dir')?.value || 'asc',
        },
        secondary: secOn
          ? {
              field: document.getElementById('crm-sort-secondary-field')?.value || 'name',
              dir: document.getElementById('crm-sort-secondary-dir')?.value || 'asc',
            }
          : null,
        pinnedFirst: document.getElementById('crm-sort-pinned')?.checked !== false,
      };
      saveCrmSort(crmSort);
      paintCrmLeadsPanel();
    };
    document.getElementById('crm-sort-secondary-enable')?.addEventListener('change', (e) => {
      document.getElementById('crm-sort-secondary-wrap')?.classList.toggle('hidden', !e.target.checked);
      applySort();
    });
    ['crm-sort-primary-field', 'crm-sort-primary-dir', 'crm-sort-secondary-field', 'crm-sort-secondary-dir', 'crm-sort-pinned'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', applySort);
    });
    return;
  }

  if (panel === 'filter') {
    const persistFilters = () => {
      saveCrmFilters(crmFilters);
      paintCrmLeadsPanel();
      updateCrmSettingsBadge();
    };

    const rebuildRuleValue = (idx) => {
      const rule = crmFilters[idx];
      if (!rule) return;
      const wrap = document.querySelector(`[data-crm-filter-idx="${idx}"]`);
      const oldVal = wrap?.querySelector('[data-crm-filter-value-wrap], [data-crm-filter-value]');
      const parent = wrap;
      oldVal?.remove();
      if (parent) parent.insertAdjacentHTML('beforeend', crmFilterValueInput(rule, idx));
      bindFilterRule(idx);
    };

    const bindFilterRule = (idx) => {
      document.querySelector(`[data-crm-filter-field="${idx}"]`)?.addEventListener('change', (e) => {
        const def = crmFieldDef(e.target.value);
        const ops = CRM_FILTER_OPS[def.type] || CRM_FILTER_OPS.text;
        crmFilters[idx].field = e.target.value;
        crmFilters[idx].op = ops[0]?.id || 'contains';
        crmFilters[idx].value = '';
        const opSel = document.querySelector(`[data-crm-filter-op="${idx}"]`);
        if (opSel) opSel.innerHTML = crmFilterOpOptions(crmFilters[idx].field, crmFilters[idx].op);
        rebuildRuleValue(idx);
        persistFilters();
      });
      document.querySelector(`[data-crm-filter-op="${idx}"]`)?.addEventListener('change', (e) => {
        crmFilters[idx].op = e.target.value;
        if (!crmFilterNeedsValue(crmFilters[idx].op)) crmFilters[idx].value = '';
        rebuildRuleValue(idx);
        persistFilters();
      });
      document.querySelector(`[data-crm-filter-value="${idx}"]`)?.addEventListener('input', (e) => {
        crmFilters[idx].value = e.target.value;
        persistFilters();
      });
      document.querySelector(`[data-crm-filter-value="${idx}"]`)?.addEventListener('change', (e) => {
        crmFilters[idx].value = e.target.value;
        persistFilters();
      });
      document.querySelectorAll(`[data-crm-filter-status][data-crm-filter-idx="${idx}"]`).forEach((cb) => {
        cb.onchange = () => {
          const picked = [...document.querySelectorAll(`[data-crm-filter-status][data-crm-filter-idx="${idx}"]:checked`)].map(
            (el) => el.getAttribute('data-crm-filter-status')
          );
          crmFilters[idx].value = picked.join(',');
          persistFilters();
        };
      });
      document.querySelector(`[data-crm-filter-remove="${idx}"]`)?.addEventListener('click', () => {
        crmFilters.splice(idx, 1);
        paintCrmSettingsPanel('filter');
        persistFilters();
      });
    };

    crmFilters.forEach((_, idx) => bindFilterRule(idx));

    document.getElementById('crm-filter-add')?.addEventListener('click', () => {
      crmFilters.push({ field: 'name', op: 'contains', value: '' });
      paintCrmSettingsPanel('filter');
    });
    if (crmFilters.length) {
      document.getElementById('crm-filter-clear')?.addEventListener('click', () => {
        crmFilters = [];
        paintCrmSettingsPanel('filter');
        persistFilters();
      });
    }
  }
}

function updateCrmSettingsBadge() {
  const gear = document.getElementById('crm-props-toggle');
  if (!gear) return;
  gear.querySelector('.crm-settings-badge')?.remove();
  const badge = crmSettingsBadgeHtml();
  if (badge) gear.insertAdjacentHTML('beforeend', badge);
}

function crmKanbanHtml() {
  const c = counts?.counts || {};
  const searching = Boolean(crmSearchQ);
  return `<div class="crm-kanban">${CRM_STATUSES.map((status) => {
    const cards = crmKanbanCardsForStatus(status);
    const totalAll = c[status] != null ? c[status] : (crmKanban[status] || []).length;
    const countLabel = searching ? String(cards.length) : String(totalAll);
    const truncated = !searching && (crmKanban[status] || []).length < totalAll;
    return `<div class="crm-kanban-col ${crmMetricClass(status)}" data-kanban-status="${escapeAttr(status)}">
      <div class="crm-kanban-head">
        <h4>${escapeHtml(status)}</h4>
        <span class="crm-kanban-count" title="${searching ? `${cards.length} match(es)` : `${(crmKanban[status] || []).length} loaded · ${totalAll} total`}">${escapeHtml(countLabel)}</span>
      </div>
      <div class="crm-kanban-cards" data-drop-status="${escapeAttr(status)}">${cards.length
        ? cards.map((lead) => crmKanbanCardHtml(lead)).join('')
        : `<p class="crm-kanban-empty muted">${searching ? 'No matches' : 'Drop here'}</p>`}</div>
      ${truncated ? `<p class="crm-kanban-truncated muted">Showing ${(crmKanban[status] || []).length} of ${totalAll} · search to find any</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function crmBulkBarHtml() {
  const n = crmSelectedIds.size;
  if (!n) return '';
  const statusOpts = CRM_STATUSES.map(
    (st) => `<option value="${escapeAttr(st)}">${escapeHtml(st)}</option>`
  ).join('');
  return `<div class="crm-bulk-bar">
    <span class="crm-bulk-count">${n} selected</span>
    <select id="crm-bulk-status" class="crm-bulk-select" title="Move to status">
      <option value="">Move to…</option>${statusOpts}
    </select>
    <button type="button" class="btn primary btn-sm" id="crm-bulk-apply">Apply</button>
    <button type="button" class="btn ghost bad btn-sm" id="crm-bulk-delete">Delete</button>
    <button type="button" class="btn ghost btn-sm" id="crm-bulk-clear">Clear</button>
  </div>`;
}

function crmTableRowsHtml(leads) {
  const rows = crmProcessLeadList(leads);
  if (!rows.length) {
    return `<tr class="crm-empty-row"><td colspan="7">${crmActiveFilterCount() ? 'No leads match filters' : 'No leads found'}</td></tr>`;
  }
  return rows
    .map(
      (lead) => `<tr data-lead-id="${escapeAttr(lead.id)}" title="Open lead">
        <td class="crm-check-col" onclick="event.stopPropagation()">
          <input type="checkbox" class="crm-row-check" data-lead-id="${escapeAttr(lead.id)}"${crmSelectedIds.has(lead.id) ? ' checked' : ''} aria-label="Select lead" />
        </td>
        <td><strong>${escapeHtml(lead.name || 'Untitled')}</strong></td>
        <td class="crm-link-cell">${lead.url ? `<a href="${escapeAttr(lead.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(crmTextPreview(crmLinkLabel(lead.url), 48))}</a>` : '—'}</td>
        <td>${crmStatusBadge(lead.status)}</td>
        <td><span class="crm-ice-preview">${escapeHtml(crmTextPreview(lead.msg, 120) || '—')}</span></td>
        <td class="muted">${formatCrmDate(lead.processingAt)}</td>
        <td><span class="crm-body-preview">${crmBodyPreview(lead.notes)}</span></td>
      </tr>`
    )
    .join('');
}

function crmTableHtml() {
  const totalPages = Math.max(1, Math.ceil(crmTotal / 50));
  const pageIds = crmLeads.map((l) => l.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => crmSelectedIds.has(id));
  return `${crmBulkBarHtml()}<div class="crm-table-wrap">
    <table class="crm-table">
      <thead><tr>
        <th class="crm-check-col"><input type="checkbox" id="crm-select-all"${allPageSelected ? ' checked' : ''} title="Select all on page" aria-label="Select all on page" /></th>
        <th>Name</th><th>Link</th><th>Status</th><th>Ice-breaker</th><th>Processing at</th><th>Body</th>
      </tr></thead>
      <tbody>${crmTableRowsHtml(crmLeads)}</tbody>
    </table>
  </div>
  <div class="crm-pagination">
    <button type="button" class="btn ghost btn-sm" id="crm-prev" ${crmPage <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="muted">Page ${crmPage} of ${totalPages} · ${crmTotal} lead${crmTotal === 1 ? '' : 's'}</span>
    <button type="button" class="btn ghost btn-sm" id="crm-next" ${crmPage >= totalPages ? 'disabled' : ''}>Next</button>
  </div>`;
}

function crmDrawerHtml(lead) {
  if (!lead) return '';
  const tab = crmDrawerTab === 'conversation' ? 'conversation' : 'general';
  const statusOpts = CRM_STATUSES.map(
    (st) => `<option value="${escapeAttr(st)}"${st === lead.status ? ' selected' : ''}>${escapeHtml(st)}</option>`
  ).join('');
  const lostOpts = [
    '<option value="">—</option>',
    ...CRM_LOST_REASONS.map(
      (r) =>
        `<option value="${escapeAttr(r.id)}"${lead.lostReason === r.id ? ' selected' : ''}>${escapeHtml(r.label)}</option>`
    ),
  ].join('');
  const msgOpts = [
    '<option value="">—</option>',
    ...CRM_MESSENGER_APPS.map(
      (a) =>
        `<option value="${escapeAttr(a.id)}"${lead.messengerApp === a.id ? ' selected' : ''}>${escapeHtml(a.label)}</option>`
    ),
  ].join('');
  const bodyLen = String(lead.notes || '').trim().length;
  const notesBody = bodyLen
    ? escapeHtml(lead.notes)
    : '<span class="muted">No messages yet — conversation will appear here after outreach.</span>';
  return `<div id="crm-drawer-backdrop" class="crm-drawer-backdrop"></div>
    <aside id="crm-drawer" class="crm-drawer" role="dialog" aria-label="Lead details">
      <header class="crm-drawer-head">
        <div class="crm-drawer-head-main">
          <p class="crm-drawer-kicker">${lead.__draft || !lead.id ? 'New lead' : 'Lead record'}</p>
          <h3>${escapeHtml(lead.name || (lead.__draft ? 'Untitled' : 'Untitled'))}</h3>
          <div class="crm-drawer-badges">${crmStatusBadge(lead.status)}${lead.processingAt ? `<span class="crm-drawer-meta muted">${escapeHtml(formatCrmDate(lead.processingAt))}</span>` : ''}</div>
        </div>
        <button type="button" class="ob-close" id="crm-drawer-close" aria-label="Close">×</button>
      </header>
      <div class="crm-drawer-tabs" role="tablist">
        <button type="button" class="crm-drawer-tab${tab === 'general' ? ' active' : ''}" data-crm-tab="general" role="tab" aria-selected="${tab === 'general'}">General</button>
        <button type="button" class="crm-drawer-tab${tab === 'conversation' ? ' active' : ''}" data-crm-tab="conversation" role="tab" aria-selected="${tab === 'conversation'}">Conversation</button>
      </div>
      <div class="crm-drawer-body">
        <div class="crm-drawer-pane${tab === 'general' ? '' : ' hidden'}" data-crm-pane="general">
          <section class="crm-drawer-section">
            <h4 class="crm-drawer-section-title">Properties</h4>
            <div class="crm-drawer-grid">
              <label class="field">Name<input type="text" id="crm-d-name" value="${escapeAttr(lead.name || '')}" placeholder="Optional — enrich fills later" /></label>
              <label class="field">Status<select id="crm-d-status">${statusOpts}</select></label>
              <label class="field crm-drawer-field-wide">Link ${lead.__draft || !lead.id ? '<span class="crm-req" title="Required">*</span>' : ''}<input type="url" id="crm-d-url" value="${escapeAttr(lead.url || '')}" placeholder="https://linkedin.com/in/…" required /></label>
              <label class="field">Location<input type="text" id="crm-d-location" value="${escapeAttr(lead.location || '')}" /></label>
              <label class="field">Timezone<input type="text" id="crm-d-timezone" value="${escapeAttr(lead.timezone || '')}" /></label>
              <label class="field">Email<input type="email" id="crm-d-email" value="${escapeAttr(lead.email || '')}" /></label>
              <label class="field">Lost reason<select id="crm-d-lost-reason">${lostOpts}</select></label>
              <label class="field">Messenger<select id="crm-d-messenger-app">${msgOpts}</select></label>
              <label class="field crm-drawer-field-wide">Phone / profile link<input type="text" id="crm-d-messenger-value" value="${escapeAttr(lead.messengerValue || '')}" /></label>
            </div>
          </section>
          <section class="crm-drawer-section">
            <h4 class="crm-drawer-section-title">Ice-breaker</h4>
            <p class="crm-drawer-hint muted">First outbound DM — Stage A writes here before send.</p>
            <label class="field"><textarea id="crm-d-msg" rows="5" class="crm-field-text">${escapeHtml(lead.msg || '')}</textarea></label>
          </section>
        </div>
        <div class="crm-drawer-pane${tab === 'conversation' ? '' : ' hidden'}" data-crm-pane="conversation">
          <section class="crm-drawer-section crm-drawer-section-body">
            <div class="crm-drawer-section-head">
              <h4 class="crm-drawer-section-title">Conversation</h4>
              <span class="crm-body-count muted" id="crm-d-notes-count">${bodyLen ? `${bodyLen.toLocaleString('en-US')} chars` : 'Empty'}</span>
            </div>
            <p class="crm-drawer-hint muted">Live chat log between H.A.L.O. and this lead. Updated automatically by the agent — not editable here.</p>
            <div id="crm-d-notes" class="crm-body-field crm-conversation-log" aria-readonly="true">${notesBody}</div>
          </section>
        </div>
      </div>
      <footer class="crm-drawer-foot">
        ${lead.__draft || !lead.id ? '' : '<button type="button" class="btn ghost bad" id="crm-d-delete">Delete</button>'}
        <button type="button" class="btn primary" id="crm-d-save">${lead.__draft || !lead.id ? 'Create lead' : 'Save changes'}</button>
      </footer>
    </aside>`;
}

async function fetchCrmLeads() {
  crmLoading = true;
  paintCrmLeadsPanel();
  try {
    if (crmViewMode === 'kanban') {
      // Page safely — never request a range past total (avoids PostgREST 416).
      const all = [];
      let pageNum = 1;
      let total = Infinity;
      const pageSize = 200;
      while (pageNum <= 20) {
        const from = (pageNum - 1) * pageSize;
        if (Number.isFinite(total) && from >= total) break;
        const params = new URLSearchParams({ page: String(pageNum), limit: String(pageSize) });
        if (crmSearchQ) params.set('q', crmSearchQ);
        const data = await api(`/api/crm/leads?${params}`);
        const batch = data.leads || [];
        total = Number(data.total);
        if (!Number.isFinite(total)) total = all.length + batch.length;
        all.push(...batch);
        if (!batch.length || batch.length < pageSize || all.length >= total) break;
        pageNum += 1;
      }
      crmKanban = Object.fromEntries(CRM_STATUSES.map((st) => [st, []]));
      crmKanbanTotals = Object.fromEntries(CRM_STATUSES.map((st) => [st, 0]));
      for (const lead of all) {
        let st = lead.status;
        if (st === 'Proposal 1️⃣' || st === 'Proposal 1') st = 'Lead😴';
        if (st === 'Proposal 2️⃣' || st === 'Proposal 2') st = 'Conversation 💬';
        st = CRM_STATUSES.includes(st) ? st : 'Lead😴';
        lead.status = st;
        crmKanban[st].push(lead);
      }
      for (const st of CRM_STATUSES) {
        crmKanbanTotals[st] = crmKanban[st].length;
      }
    } else {
      if (!Number.isFinite(crmPage) || crmPage < 1) crmPage = 1;
      const params = new URLSearchParams({ page: String(crmPage), limit: '50' });
      if (crmStatusFilter) params.set('status', crmStatusFilter);
      if (crmSearchQ) params.set('q', crmSearchQ);
      let data;
      try {
        data = await api(`/api/crm/leads?${params}`);
      } catch (err) {
        if (/not satisfiable|PGRST103/i.test(String(err.message || ''))) {
          crmPage = 1;
          params.set('page', '1');
          data = await api(`/api/crm/leads?${params}`);
        } else {
          throw err;
        }
      }
      crmLeads = data.leads || [];
      crmTotal = data.total || 0;
      const maxPage = Math.max(1, Math.ceil((crmTotal || 0) / 50));
      if (crmPage > maxPage) {
        crmPage = maxPage;
        params.set('page', String(crmPage));
        data = await api(`/api/crm/leads?${params}`);
        crmLeads = data.leads || [];
        crmTotal = data.total || 0;
      }
    }
  } catch (e) {
    toast(e.message || 'Failed to load CRM leads', true);
    crmLeads = [];
    crmTotal = 0;
    crmKanban = {};
    crmKanbanTotals = {};
  } finally {
    crmLoading = false;
    paintCrmLeadsPanel();
  }
}

function paintCrmLeadsPanel() {
  const root = document.getElementById('crm-leads-root');
  if (!root) return;
  if (crmLoading) {
    root.innerHTML = '<div class="crm-loading">Loading leads…</div>';
    return;
  }
  root.innerHTML =
    crmViewMode === 'kanban'
      ? `<div class="crm-leads-panel crm-leads-panel-kanban">${crmKanbanHtml()}</div>`
      : `<div class="crm-leads-panel">${crmTableHtml()}</div>`;
  bindCrmLeadsEvents();
}

function openCrmDrawer(leadOrId) {
  let lead = null;
  if (leadOrId && typeof leadOrId === 'object' && leadOrId.__draft) {
    lead = leadOrId;
  } else if (typeof leadOrId === 'object' && leadOrId?.id) {
    lead = leadOrId;
  } else {
    lead =
      crmLeads.find((l) => l.id === leadOrId) ||
      CRM_STATUSES.flatMap((st) => crmKanban[st] || []).find((l) => l.id === leadOrId);
  }
  if (!lead) return;
  crmDrawerLead = { ...lead };
  crmDrawerTab = 'general';
  const slot = document.getElementById('crm-drawer-slot');
  if (!slot) return;
  slot.innerHTML = crmDrawerHtml(crmDrawerLead);
  bindCrmDrawerEvents();
}

function closeCrmDrawer() {
  crmDrawerLead = null;
  crmDrawerTab = 'general';
  const slot = document.getElementById('crm-drawer-slot');
  if (slot) slot.innerHTML = '';
}

function bindCrmDrawerEvents() {
  document.getElementById('crm-drawer-close')?.addEventListener('click', closeCrmDrawer);
  document.getElementById('crm-drawer-backdrop')?.addEventListener('click', closeCrmDrawer);
  document.getElementById('crm-d-save')?.addEventListener('click', saveCrmDrawer);
  document.getElementById('crm-d-delete')?.addEventListener('click', deleteCrmDrawer);
  document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
    btn.onclick = () => {
      crmDrawerTab = btn.dataset.crmTab === 'conversation' ? 'conversation' : 'general';
      document.querySelectorAll('[data-crm-tab]').forEach((b) => {
        const on = b.dataset.crmTab === crmDrawerTab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('[data-crm-pane]').forEach((pane) => {
        pane.classList.toggle('hidden', pane.dataset.crmPane !== crmDrawerTab);
      });
    };
  });
  const notes = document.getElementById('crm-d-notes');
  const countEl = document.getElementById('crm-d-notes-count');
  if (notes && countEl) {
    const raw = notes.textContent || '';
    const n = raw.trim().length;
    countEl.textContent = n ? `${n.toLocaleString('en-US')} chars` : 'Empty';
  }
}

async function saveCrmDrawer() {
  const patch = {
    name: document.getElementById('crm-d-name')?.value || '',
    url: document.getElementById('crm-d-url')?.value || '',
    status: document.getElementById('crm-d-status')?.value || 'Lead😴',
    msg: document.getElementById('crm-d-msg')?.value || '',
    location: document.getElementById('crm-d-location')?.value || '',
    timezone: document.getElementById('crm-d-timezone')?.value || '',
    email: document.getElementById('crm-d-email')?.value || '',
    lostReason: document.getElementById('crm-d-lost-reason')?.value || '',
    messengerApp: document.getElementById('crm-d-messenger-app')?.value || '',
    messengerValue: document.getElementById('crm-d-messenger-value')?.value || '',
  };
  const link = String(patch.url || '').trim();
  if (!link || !/linkedin\.com\/in\//i.test(link)) {
    toast('LinkedIn profile Link is required (https://www.linkedin.com/in/…)', true);
    document.getElementById('crm-d-url')?.focus();
    return;
  }
  try {
    if (crmDrawerLead?.__draft || !crmDrawerLead?.id) {
      const data = await api('/api/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...patch,
          name: patch.name || 'New lead',
          status: 'Lead😴',
          url: link,
          processingAt: crmDrawerLead?.processingAt || new Date().toISOString(),
        }),
      });
      closeCrmDrawer();
      counts = await api('/api/notion/counts').catch(() => counts);
      await fetchCrmLeads();
      if (data.lead) openCrmDrawer(data.lead);
      toast('Lead created as Lead😴 — Stage A will check connect / accept next run');
      return;
    }
    await api(`/api/crm/leads/${crmDrawerLead.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    closeCrmDrawer();
    counts = await api('/api/notion/counts').catch(() => counts);
    await fetchCrmLeads();
    toast('Lead saved');
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteCrmDrawer() {
  if (!crmDrawerLead?.id || crmDrawerLead.__draft) {
    closeCrmDrawer();
    return;
  }
  if (!window.confirm('Delete this lead permanently?')) return;
  try {
    await api(`/api/crm/leads/${crmDrawerLead.id}`, { method: 'DELETE', body: '{}' });
    closeCrmDrawer();
    counts = await api('/api/notion/counts').catch(() => counts);
    await fetchCrmLeads();
    toast('Lead deleted');
  } catch (e) {
    toast(e.message, true);
  }
}

function bindCrmLeadsEvents() {
  document.querySelectorAll('tr[data-lead-id]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('a, input, button, label')) return;
      openCrmDrawer(el.dataset.leadId);
    };
  });

  document.querySelectorAll('.crm-row-check').forEach((input) => {
    input.onchange = () => {
      if (input.checked) crmSelectedIds.add(input.dataset.leadId);
      else crmSelectedIds.delete(input.dataset.leadId);
      paintCrmLeadsPanel();
    };
  });

  const selectAll = document.getElementById('crm-select-all');
  if (selectAll) {
    selectAll.onchange = () => {
      for (const lead of crmLeads) {
        if (selectAll.checked) crmSelectedIds.add(lead.id);
        else crmSelectedIds.delete(lead.id);
      }
      paintCrmLeadsPanel();
    };
  }

  document.getElementById('crm-bulk-clear')?.addEventListener('click', () => {
    crmSelectedIds.clear();
    paintCrmLeadsPanel();
  });

  document.getElementById('crm-bulk-apply')?.addEventListener('click', () => runCrmBulkStatus());
  document.getElementById('crm-bulk-delete')?.addEventListener('click', () => runCrmBulkDelete());

  document.getElementById('crm-prev')?.addEventListener('click', () => {
    if (crmPage > 1) {
      crmPage -= 1;
      fetchCrmLeads();
    }
  });
  document.getElementById('crm-next')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(crmTotal / 50));
    if (crmPage < totalPages) {
      crmPage += 1;
      fetchCrmLeads();
    }
  });

  if (crmViewMode === 'kanban') {
    bindCrmKanbanDragDrop();
    bindCrmCardMenus();
  }
}

async function runCrmBulkStatus() {
  const status = document.getElementById('crm-bulk-status')?.value || '';
  if (!status) {
    toast('Pick a status first', true);
    return;
  }
  const ids = [...crmSelectedIds];
  if (!ids.length) return;
  try {
    const data = await api('/api/crm/leads/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'status', status, ids }),
    });
    crmSelectedIds.clear();
    counts = await api('/api/notion/counts').catch(() => counts);
    await fetchCrmLeads();
    toast(`Updated ${data.count || ids.length} lead(s)`);
  } catch (e) {
    toast(e.message, true);
  }
}

async function runCrmBulkDelete() {
  const ids = [...crmSelectedIds];
  if (!ids.length) return;
  if (!window.confirm(`Delete ${ids.length} lead(s) permanently?`)) return;
  try {
    const data = await api('/api/crm/leads/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', ids }),
    });
    crmSelectedIds.clear();
    counts = await api('/api/notion/counts').catch(() => counts);
    await fetchCrmLeads();
    toast(`Deleted ${data.count || ids.length} lead(s)`);
  } catch (e) {
    toast(e.message, true);
  }
}

function bindCrmKanbanDragDrop() {
  let suppressClick = false;

  document.querySelectorAll('.crm-kanban-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      if (e.target.closest('.crm-card-menu')) {
        e.preventDefault();
        return;
      }
      suppressClick = true;
      crmKanbanDragId = card.dataset.leadId;
      card.classList.add('crm-kanban-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.leadId);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('crm-kanban-dragging');
      document.querySelectorAll('.crm-kanban-drop-over').forEach((el) => el.classList.remove('crm-kanban-drop-over'));
      crmKanbanDragId = null;
      setTimeout(() => {
        suppressClick = false;
      }, 80);
    });
    card.addEventListener('click', (e) => {
      if (suppressClick) return;
      if (e.target.closest('.crm-card-menu')) return;
      openCrmDrawer(card.dataset.leadId);
    });
  });

  document.querySelectorAll('[data-drop-status]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('crm-kanban-drop-over');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('crm-kanban-drop-over');
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('crm-kanban-drop-over');
      const leadId = e.dataTransfer.getData('text/plain') || crmKanbanDragId;
      const newStatus = zone.dataset.dropStatus;
      if (!leadId || !newStatus) return;
      await moveKanbanLead(leadId, newStatus);
    });
  });
}

function closeAllCrmCardMenus() {
  document.querySelectorAll('.crm-card-menu-drop').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('.crm-card-menu-btn').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.crm-kanban-card.crm-card-menu-open').forEach((card) => card.classList.remove('crm-card-menu-open'));
}

function bindCrmCardMenus() {
  document.querySelectorAll('[data-crm-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.crm-kanban-card');
      const drop = btn.closest('.crm-card-menu')?.querySelector('.crm-card-menu-drop');
      if (!drop) return;
      const willOpen = drop.classList.contains('hidden');
      closeAllCrmCardMenus();
      if (willOpen) {
        drop.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
        card?.classList.add('crm-card-menu-open');
      }
    });
  });

  document.querySelectorAll('[data-crm-pin]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-crm-pin');
      toggleCrmPin(id);
      closeAllCrmCardMenus();
      paintCrmLeadsPanel();
      toast(isCrmPinned(id) ? 'Lead pinned to top' : 'Lead unpinned');
    });
  });

  document.querySelectorAll('[data-crm-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-crm-delete');
      closeAllCrmCardMenus();
      if (!window.confirm('Delete this lead permanently?')) return;
      try {
        await api(`/api/crm/leads/${id}`, { method: 'DELETE', body: '{}' });
        crmPinnedIds.delete(String(id));
        saveCrmPinnedIds(crmPinnedIds);
        counts = await api('/api/notion/counts').catch(() => counts);
        await fetchCrmLeads();
        toast('Lead deleted');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  if (!window.__haloCrmCardMenuOutside) {
    window.__haloCrmCardMenuOutside = true;
    document.addEventListener('click', () => closeAllCrmCardMenus());
  }
}

async function moveKanbanLead(leadId, newStatus) {
  const oldStatus = CRM_STATUSES.find((st) => (crmKanban[st] || []).some((l) => l.id === leadId));
  if (!oldStatus || oldStatus === newStatus) return;

  const lead = (crmKanban[oldStatus] || []).find((l) => l.id === leadId);
  if (!lead) return;

  crmKanban[oldStatus] = (crmKanban[oldStatus] || []).filter((l) => l.id !== leadId);
  crmKanban[newStatus] = [{ ...lead, status: newStatus }, ...(crmKanban[newStatus] || [])];
  paintCrmLeadsPanel();

  try {
    await api(`/api/crm/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    counts = await api('/api/notion/counts').catch(() => counts);
    const tiles = document.querySelectorAll('[data-crm-status] .metric');
    if (counts?.counts) {
      tiles.forEach((el, i) => {
        const st = CRM_STATUSES[i];
        if (st && counts.counts[st] != null) el.textContent = counts.counts[st];
      });
      document.querySelectorAll('.crm-kanban-count').forEach((el, i) => {
        const st = CRM_STATUSES[i];
        if (st) el.textContent = (crmKanban[st] || []).length;
      });
    }
  } catch (e) {
    toast(e.message, true);
    await fetchCrmLeads();
  }
}

function bindCrmToolbar() {
  document.querySelectorAll('[data-crm-view]').forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.crmView;
      if (mode === crmViewMode) return;
      crmViewMode = mode;
      crmPage = 1;
      if (mode === 'kanban') crmSelectedIds.clear();
      renderCrm();
    };
  });
  document.querySelectorAll('[data-crm-status]').forEach((btn) => {
    btn.onclick = () => {
      const st = btn.dataset.crmStatus;
      crmStatusFilter = crmStatusFilter === st ? '' : st;
      crmPage = 1;
      renderCrm();
    };
  });
  const searchInput = document.getElementById('crm-search');
  if (searchInput) {
    searchInput.value = crmSearchQ;
    let searchTimer;
    searchInput.oninput = () => {
      clearTimeout(searchTimer);
      crmSearchQ = searchInput.value.trim();
      if (crmViewMode === 'kanban' && !crmLoading) paintCrmLeadsPanel();
      searchTimer = setTimeout(() => {
        crmPage = 1;
        fetchCrmLeads();
      }, 280);
    };
  }

  const propsBtn = document.getElementById('crm-props-toggle');
  const propsDrop = document.getElementById('crm-props-dropdown');
  if (propsBtn && propsDrop) {
    propsBtn.onclick = (e) => {
      e.stopPropagation();
      const open = !propsDrop.classList.contains('hidden');
      if (open) {
        propsDrop.classList.add('hidden');
        propsBtn.setAttribute('aria-expanded', 'false');
        crmSettingsPanel = 'root';
      } else {
        propsDrop.classList.remove('hidden');
        propsBtn.setAttribute('aria-expanded', 'true');
        paintCrmSettingsPanel('root');
      }
    };
    propsDrop.onclick = (e) => e.stopPropagation();
    if (!window.__haloCrmPropsOutside) {
      window.__haloCrmPropsOutside = true;
      document.addEventListener('click', () => {
        const drop = document.getElementById('crm-props-dropdown');
        const btn = document.getElementById('crm-props-toggle');
        if (!drop || drop.classList.contains('hidden')) return;
        drop.classList.add('hidden');
        btn?.setAttribute('aria-expanded', 'false');
        crmSettingsPanel = 'root';
      });
    }
  }

  document.getElementById('crm-add-lead')?.addEventListener('click', () => {
    openCrmDrawer({
      __draft: true,
      id: null,
      name: '',
      url: '',
      status: 'Lead😴',
      msg: '',
      notes: '',
      location: '',
      timezone: '',
      email: '',
      lostReason: '',
      messengerApp: '',
      messengerValue: '',
      processingAt: new Date().toISOString(),
    });
  });
}

function crmMetricChip(key, val) {
  const cls = crmMetricClass(key);
  return `<div class="crm-chip ${cls}" title="${escapeAttr(key)}">
    <span class="crm-chip-label">${key}</span>
    <span class="crm-chip-val">${val ?? '—'}</span>
  </div>`;
}

function openNotionBtn(url, { sm = false } = {}) {
  const href = url || '#';
  const size = sm ? ' btn-sm' : '';
  return `<a class="btn btn-notion${size}" href="${escapeAttr(href)}" target="_blank" rel="noopener" title="Open Notion CRM">${ICONS.notionImg}<span>Open Notion</span></a>`;
}

function pageSection(title, hint, inner) {
  return `<section class="page-section">
    <div class="page-section-head">
      <h2 class="section-title" title="${escapeAttr(hint || title)}">${title}</h2>
      ${hint ? `<span class="section-hint">${escapeHtml(hint)}</span>` : ''}
    </div>
    ${inner}
  </section>`;
}

function navWarnBadge(title) {
  return `<span class="nav-warn-badge" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <path fill="#fff" d="M12 7.25a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1zm0 9.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/>
    </svg>
  </span>`;
}

function navProblemDot(title) {
  return `<span class="nav-problem-dot" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"></span>`;
}

function renderNav() {
  const byId = Object.fromEntries(NAV.map((n) => [n.id, n]));
  const integrationsProblem = settings?.integrationsHasProblem === true;
  const linkedinProblem = settings?.linkedinSessionOk === false;
  navEl.innerHTML = NAV_GROUPS.map((g) => {
    const items = g.ids
      .map((id) => byId[id])
      .filter(Boolean)
      .map((n) => {
        const linkedinWarn = n.id === 'linkedin' && linkedinProblem;
        const profileWarn = n.id === 'profile' && integrationsProblem;
        const warn = linkedinWarn || profileWarn;
        const badge = linkedinWarn
          ? navWarnBadge('LinkedIn session inactive')
          : profileWarn
            ? navProblemDot('Credentials need attention')
            : '';
        return `<button type="button" class="nav-item ${page === n.id ? 'active' : ''}${warn ? ' nav-item-warn' : ''}" data-page="${n.id}" title="${escapeAttr(n.title)}">
      <span class="nav-ico">${ICONS[n.id] || ''}</span><span class="label-text">${n.label}</span>${badge}
    </button>`;
      })
      .join('');
    if (!items) return '';
    return `<div class="nav-group"><div class="nav-group-label">${g.label}</div>${items}</div>`;
  }).join('');
  navEl.querySelectorAll('[data-page]').forEach((btn) => {
    btn.onclick = () => {
      page = btn.dataset.page;
      if (page === 'profile') {
        openProfileTile = '';
        const h = (location.hash || '').replace(/^#/, '');
        if (/^(profile-)?(general|integrations|billing|admin)$/.test(h)) {
          history.replaceState(null, '', location.pathname + location.search);
        }
      }
      setNavOpen(false);
      render();
    };
  });

  const brain = byId.brain;
  if (navBrainSlot && brain) {
    const active = page === 'brain' ? ' active' : '';
    navBrainSlot.innerHTML = `<div class="sidebar-brain-glow${active}">
      <button type="button" class="sidebar-brain-btn${active}" data-page="brain" title="${escapeAttr(brain.title)}">
        <span class="nav-ico">${ICONS.brain}</span>
        <span class="label-text">${brain.label}</span>
      </button>
    </div>`;
    navBrainSlot.querySelector('[data-page="brain"]').onclick = () => {
      page = 'brain';
      setNavOpen(false);
      render();
    };
  }
}

function setNavOpen(open) {
  const on = !!open;
  document.body.classList.toggle('nav-open', on);
  const backdrop = document.getElementById('nav-backdrop');
  const menuBtn = document.getElementById('btn-menu');
  if (backdrop) {
    backdrop.classList.toggle('hidden', !on);
    backdrop.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
  if (menuBtn) menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on && notifyOpen) setNotifyOpen(false);
}

function updateBell() {
  const n = notifications.unread || 0;
  if (n > 0) {
    bellBadge.textContent = n > 99 ? '99+' : String(n);
    bellBadge.classList.remove('hidden');
  } else {
    bellBadge.classList.add('hidden');
  }
}

function formatNotifyTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    // Dashboard UI is English — do not follow the browser OS locale.
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString('en-US');
  }
}

function linkifyNotifyMessage(text) {
  const escaped = escapeHtml(text || '');
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function renderNotifyPanel() {
  const items = notifications.items || [];
  notifyList.innerHTML = items.length
    ? items
        .map(
          (it) => `<div class="notify-item sev-${escapeAttr(it.severity || 'info')} ${it.read ? '' : 'unread'}" data-id="${escapeAttr(it.id)}" title="Click to mark as read">
            <div class="n-title">${escapeHtml(it.title)}</div>
            <div class="n-msg">${linkifyNotifyMessage(it.message)}</div>
            <div class="n-meta">${escapeHtml(formatNotifyTime(it.createdAt))}${it.read ? ' · read' : ''}</div>
          </div>`
        )
        .join('')
    : `<div class="muted">No notifications</div>`;

  notifyList.querySelectorAll('.notify-item').forEach((el) => {
    el.onclick = async (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest('a')) return;
      try {
        const data = await api(`/api/notifications/${el.dataset.id}/read`, { method: 'POST', body: '{}' });
        notifications = listFrom(data, notifications);
        if (data.item) {
          const idx = notifications.items.findIndex((i) => i.id === data.item.id);
          if (idx >= 0) notifications.items[idx] = data.item;
        }
        notifications.unread = data.unread ?? notifications.items.filter((i) => !i.read).length;
        updateBell();
        renderNotifyPanel();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
}

function listFrom(data, prev) {
  if (data.items) return { items: data.items, unread: data.unread || 0 };
  return prev;
}

async function refreshNotifications() {
  try {
    const data = await api('/api/notifications');
    notifications = { items: data.items || [], unread: data.unread || 0 };
    updateBell();
    if (notifyOpen) renderNotifyPanel();
  } catch {
    /* ignore */
  }
}

/** Persist switch toggles immediately and keep in-memory settings in sync */
async function persistSwitches(patch) {
  try {
    const data = await api('/api/settings/switches', { method: 'POST', body: JSON.stringify(patch) });
    settings = data.settings;
    // keep local channel/stage flags consistent
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

function bindSwitchAutosave() {
  const master = document.getElementById('master');
  const stageA = document.getElementById('stageA');
  const stageB = document.getElementById('stageB');
  const chLi = document.getElementById('ch-linkedin');
  const chIg = document.getElementById('ch-instagram');
  const chFb = document.getElementById('ch-facebook');

  const persistAndRefresh = async (patch) => {
    await persistSwitches(patch);
    if (page === 'dashboard' || page === 'linkedin') render();
  };

  if (master) {
    master.onchange = async () => {
      const on = master.checked;
      // Master ON → both stages ON; Master OFF → both stages OFF
      if (stageA) stageA.checked = on;
      if (stageB) stageB.checked = on;
      settings.masterEnabled = on;
      settings.stageA.enabled = on;
      settings.stageB.enabled = on;
      await persistAndRefresh({
        masterEnabled: on,
        stageAEnabled: on,
        stageBEnabled: on,
        _masterSource: true,
        channels: {
          linkedin: chLi ? chLi.checked : settings.channels.linkedin,
          instagram: chIg ? chIg.checked : settings.channels.instagram,
          facebook: chFb ? chFb.checked : settings.channels.facebook,
        },
      });
    };
  }

  const onStageSwitch = async () => {
    const aOn = stageA ? stageA.checked : settings.stageA.enabled;
    const bOn = stageB ? stageB.checked : settings.stageB.enabled;
    // Master is ON only when BOTH stages are on
    if (master) master.checked = aOn && bOn;
    settings.masterEnabled = aOn && bOn;
    settings.stageA.enabled = aOn;
    settings.stageB.enabled = bOn;
    await persistAndRefresh({
      stageAEnabled: aOn,
      stageBEnabled: bOn,
      channels: {
        linkedin: chLi ? chLi.checked : settings.channels.linkedin,
        instagram: chIg ? chIg.checked : settings.channels.instagram,
        facebook: chFb ? chFb.checked : settings.channels.facebook,
      },
    });
  };

  if (stageA) stageA.onchange = onStageSwitch;
  if (stageB) stageB.onchange = onStageSwitch;

  const onChannel = async () => {
    await persistAndRefresh({
      channels: {
        linkedin: chLi ? chLi.checked : settings.channels.linkedin,
        instagram: chIg ? chIg.checked : settings.channels.instagram,
        facebook: chFb ? chFb.checked : settings.channels.facebook,
      },
    });
  };
  [chLi, chIg, chFb].forEach((el) => {
    if (el) el.onchange = onChannel;
  });
}

function channelTile(key, label, enabled, { comingSoon = false, leadsPerCycle = null, leadsPerCycleLabel = null, leadsEditable = true } = {}) {
  const cycleLabel = leadsPerCycleLabel || LEADS_PER_CYCLE_LABEL;
  const title = comingSoon
    ? `${label} placeholder channel`
    : `Enable or disable ${label} outreach channel`;
  const leadsRow =
    leadsPerCycle != null && !comingSoon && leadsEditable
      ? `<label class="field field-tight channel-leads-field" title="${escapeAttr(cycleLabel)}">
          <span class="channel-stat-label">${escapeHtml(cycleLabel)}</span>
          <input type="number" id="dashConnectInvites" class="sync-max-input" min="1" max="100" step="1" value="${Number(leadsPerCycle) || 1}" />
        </label>`
      : leadsPerCycle != null
        ? `<div class="channel-stat" title="${escapeAttr(cycleLabel)}">
            <span class="channel-stat-label">${escapeHtml(cycleLabel)}</span>
            <span class="channel-stat-val">${leadsPerCycle}</span>
          </div>`
        : '';
  return `<div class="tile" title="${escapeAttr(title)}">
    <h3 title="${escapeAttr(title)}">${label} ${comingSoon ? '<span class="badge off">soon</span>' : enabled ? '<span class="badge">active</span>' : '<span class="badge off">off</span>'}</h3>
    ${leadsRow}
    <div class="row">${switchEl(`ch-${key}`, enabled, title)}
      <span class="muted">${enabled ? 'On' : 'Off'}</span>
    </div>
  </div>`;
}

function infoTip(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return `<span class="info-tip" tabindex="0">
    <span class="info-tip-ico" aria-hidden="true">i</span>
    <span class="info-tip-bubble" role="tooltip">${escapeHtml(t)}</span>
  </span>`;
}

function renderDashboard() {
  const s = settings;
  const c = counts?.counts || {};
  setPageHeader('Dashboard', 'CRM health, stages, and channels');
  titleEl.title = 'Overview';
  const stageAInfo = s.stageA.hint || 'Stage A: find leads, send ice-breakers, and connection invites.';
  const stageBInfo = s.stageB.hint || 'Stage B: read inbox replies and run silence follow-ups.';
  const silenceInfo = 'After N business days without a reply, mark the lead Lost. Toggle skips Saturday/Sunday when counting.';
  view.innerHTML = `
    <div class="dash-top-split">
      <div class="dash-crm-hero card">
        <div class="dash-crm-hero-top">
          <h3 class="dash-section-label">CRM snapshot</h3>
          <button type="button" class="btn ghost btn-sm dash-crm-open-btn" id="goto-crm" title="Open CRM page">CRM</button>
        </div>
        <div class="dash-crm-body">
          ${buildCrmSnapshotDonut(c)}
        </div>
      </div>

      <div class="dash-stage-rail">
        <div class="tile tile-compact dash-rail-master">
          <div class="tile-compact-head">
            <h3>Master ${s.masterEnabled ? '<span class="badge">both on</span>' : '<span class="badge off">off</span>'}</h3>
            ${switchEl('master', s.masterEnabled, 'Enable both stages')}
          </div>
        </div>
        <div class="dash-stage-pair">
          <div class="tile tile-compact">
            <div class="tile-compact-head">
              <h3>Stage A ${infoTip(stageAInfo)}</h3>
              ${switchEl('stageA', s.stageA.enabled, stageAInfo)}
            </div>
            <div class="interval-row" title="Stage A interval">
              <input type="number" id="stageAValue" min="1" step="1" value="${s.stageA.intervalValue}" />
              ${unitSelect('stageAUnit', s.stageA.intervalUnit)}
            </div>
          </div>
          <div class="tile tile-compact">
            <div class="tile-compact-head">
              <h3>Stage B ${infoTip(stageBInfo)}</h3>
              ${switchEl('stageB', s.stageB.enabled, stageBInfo)}
            </div>
            <div class="interval-row" title="Stage B interval">
              <input type="number" id="stageBValue" min="6" step="1" value="${s.stageB.intervalValue}" />
              ${unitSelect('stageBUnit', s.stageB.intervalUnit)}
            </div>
          </div>
        </div>
        <div class="tile tile-compact dash-rail-silence">
          <div class="tile-compact-head">
            <h3>Silence ${infoTip(silenceInfo)}</h3>
            ${switchEl('silenceWeekends', s.silenceSkipWeekends, 'Skip weekends when counting silence days')}
          </div>
          <label class="field field-tight" title="Silence business days">
            <input type="number" id="silenceDays" min="1" step="1" value="${s.silenceBusinessDays}" />
          </label>
        </div>
      </div>
    </div>

    <div class="dash-channels-row">
      ${channelTile('linkedin', 'LinkedIn', s.channels.linkedin, {
        leadsPerCycle: s.linkedin.connectMaxPerRun,
        leadsPerCycleLabel: LEADS_PER_CYCLE_LABEL,
        leadsEditable: true,
      })}
      ${channelTile('instagram', 'Instagram', s.channels.instagram, { comingSoon: true })}
      ${channelTile('facebook', 'Facebook', s.channels.facebook, { comingSoon: true })}
    </div>

    <div class="card analytics-canvas" id="analytics-canvas">
      <div class="analytics-toolbar">
        <div class="analytics-tabs" role="tablist">
          <button type="button" class="analytics-tab active" data-tab="pipeline">Pipeline</button>
          <button type="button" class="analytics-tab" data-tab="outreach">Outreach</button>
          <button type="button" class="analytics-tab" data-tab="health">Session</button>
        </div>
        <div class="analytics-controls">
          <select id="analytics-range" title="Timeframe">
            <option value="7d">7 days</option>
            <option value="30d" selected>30 days</option>
            <option value="90d">90 days</option>
            <option value="24h">24 hours</option>
          </select>
        </div>
      </div>
      <div class="analytics-metrics" id="analytics-metrics"></div>
      <div class="analytics-plot-wrap">
        <canvas id="analytics-plot" width="900" height="320" aria-label="Analytics chart"></canvas>
        <p class="muted analytics-note" id="analytics-note"></p>
      </div>
    </div>
  `;
  const gotoCrm = document.getElementById('goto-crm');
  if (gotoCrm) gotoCrm.onclick = () => { page = 'crm'; render(); };
  bindCrmSnapshotDonut();
  bindSwitchAutosave();
  bindConnectInvitesAutosave();
  bindConnectInvitesWarn();
  bindStageBIntervalGuard();
  bindAnalyticsCanvas();
}

function bindStageBIntervalGuard() {
  const valueEl = document.getElementById('stageBValue');
  const unitEl = document.getElementById('stageBUnit');
  if (!valueEl || !unitEl) return;
  const refresh = () => {
    if (unitEl.value === 'minutes') {
      valueEl.min = '6';
      if (Number(valueEl.value) > 0 && Number(valueEl.value) <= 5) valueEl.value = '6';
    } else {
      valueEl.min = '1';
    }
  };
  unitEl.addEventListener('change', refresh);
  valueEl.addEventListener('change', refresh);
  refresh();
}

let analyticsState = {
  tab: 'pipeline',
  range: '30d',
  enabled: {},
  series: null,
};

async function bindAnalyticsCanvas() {
  const root = document.getElementById('analytics-canvas');
  if (!root) return;

  root.querySelectorAll('.analytics-tab').forEach((btn) => {
    btn.onclick = () => {
      analyticsState.tab = btn.dataset.tab;
      root.querySelectorAll('.analytics-tab').forEach((b) => b.classList.toggle('active', b === btn));
      analyticsState.enabled = {};
      loadAndDrawAnalytics();
    };
  });
  const rangeEl = document.getElementById('analytics-range');
  if (rangeEl) {
    rangeEl.value = analyticsState.range;
    rangeEl.onchange = () => {
      analyticsState.range = rangeEl.value;
      loadAndDrawAnalytics();
    };
  }
  await loadAndDrawAnalytics();
}

async function loadAndDrawAnalytics() {
  const metricsEl = document.getElementById('analytics-metrics');
  const noteEl = document.getElementById('analytics-note');
  const canvas = document.getElementById('analytics-plot');
  if (!canvas) return;
  try {
    const data = await api(
      `/api/analytics/series?tab=${encodeURIComponent(analyticsState.tab)}&range=${encodeURIComponent(analyticsState.range)}`
    );
    analyticsState.series = data;
    if (!Object.keys(analyticsState.enabled).length) {
      for (const m of data.metrics || []) analyticsState.enabled[m.id] = true;
      // Pipeline default: hide Lost (scale) unless user enables
      if (analyticsState.tab === 'pipeline') analyticsState.enabled.lost = false;
    }
    if (metricsEl) {
      metricsEl.innerHTML = (data.metrics || [])
        .map((m) => {
          const on = analyticsState.enabled[m.id] !== false;
          return `<label class="analytics-metric ${on ? 'on' : ''}" title="Toggle ${escapeAttr(m.label)}">
            <input type="checkbox" data-metric="${escapeAttr(m.id)}" ${on ? 'checked' : ''} />
            <span class="swatch" style="background:${escapeAttr(m.color)}"></span>
            ${escapeHtml(m.label)}
          </label>`;
        })
        .join('');
      metricsEl.querySelectorAll('[data-metric]').forEach((input) => {
        input.onchange = () => {
          analyticsState.enabled[input.dataset.metric] = input.checked;
          drawAnalyticsChart(analyticsState.series);
          metricsEl.querySelectorAll('.analytics-metric').forEach((lab) => {
            const id = lab.querySelector('[data-metric]')?.dataset.metric;
            lab.classList.toggle('on', !!analyticsState.enabled[id]);
          });
        };
      });
    }
    if (noteEl) noteEl.textContent = data.note || '';
    drawAnalyticsChart(data);
  } catch (e) {
    if (noteEl) noteEl.textContent = e.message;
  }
}

function hexToRgba(hex, alpha) {
  const h = String(hex || '#888').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function smoothLinePoints(points, xAt, yAt, metricId) {
  return points.map((p, i) => ({
    x: xAt(i),
    y: yAt(p[metricId]),
    v: Number(p[metricId] || 0),
  }));
}

function traceSmoothLine(ctx, pts) {
  if (pts.length === 0) return;
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x, pts[0].y);
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

function drawAnalyticsChart(data) {
  const canvas = document.getElementById('analytics-plot');
  if (!canvas || !data) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const cssH = 320;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 48, r: 20, t: 22, b: 40 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;
  const points = data.points || [];
  const metrics = (data.metrics || []).filter((m) => analyticsState.enabled[m.id] !== false);

  // chart panel
  const panelR = 14;
  ctx.fillStyle = 'rgba(18, 22, 28, 0.72)';
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  roundRect(ctx, pad.l - 8, pad.t - 10, w + 16, h + 28, panelR);
  ctx.fill();
  ctx.stroke();

  // grid + y-axis
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
  }

  if (!points.length || !metrics.length) {
    ctx.fillStyle = '#9aa0a6';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('No data for this view yet', pad.l + 12, pad.t + h / 2);
    return;
  }

  let maxY = 1;
  for (const p of points) {
    for (const m of metrics) {
      const v = Number(p[m.id] || 0);
      if (v > maxY) maxY = v;
    }
  }
  maxY = Math.ceil(maxY * 1.12) || 1;

  ctx.fillStyle = 'rgba(154, 160, 166, 0.85)';
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(maxY - (maxY * i) / 4);
    const y = pad.t + (h * i) / 4;
    ctx.fillText(String(val), 8, y + 4);
  }

  const n = points.length;
  const xAt = (i) => pad.l + (n === 1 ? w / 2 : (w * i) / (n - 1));
  const yAt = (v) => pad.t + h - (h * Number(v || 0)) / maxY;
  const baselineY = pad.t + h;

  for (const m of metrics) {
    const pts = smoothLinePoints(points, xAt, yAt, m.id);
    if (!pts.length) continue;

    // area fill
    const grad = ctx.createLinearGradient(0, pad.t, 0, baselineY);
    grad.addColorStop(0, hexToRgba(m.color, 0.22));
    grad.addColorStop(1, hexToRgba(m.color, 0));
    ctx.beginPath();
    traceSmoothLine(ctx, pts);
    ctx.lineTo(pts[pts.length - 1].x, baselineY);
    ctx.lineTo(pts[0].x, baselineY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // stroke
    ctx.beginPath();
    traceSmoothLine(ctx, pts);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // end dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.fillStyle = m.color;
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.arc(last.x, last.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const labelIdx = n === 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
  ctx.fillStyle = 'rgba(154, 160, 166, 0.9)';
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  for (const i of labelIdx) {
    const t = points[i]?.t || '';
    const label = analyticsState.range === '24h' ? t.slice(11, 16) : t.slice(5, 10);
    ctx.fillText(label, xAt(i) - 14, cssH - 14);
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function brainIco(kind) {
  const svgs = {
    prompt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    mode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  };
  return `<span class="brain-ico brain-ico-${kind}" aria-hidden="true">${svgs[kind] || ''}</span>`;
}

function strategyNotesStatus(b, st, notesEmpty) {
  const summary = String(st.lastSummary || '');
  const low = summary.toLowerCase();
  if (/error|fail|429|quota|insufficient|denied|timeout|refused/.test(low)) {
    return { kind: 'issue', label: 'Issue', title: summary || 'Last analysis had a problem' };
  }
  if (!b.analysisEnabled) {
    return { kind: 'paused', label: 'Paused', title: 'Analysis is off' };
  }
  if (notesEmpty) {
    return { kind: 'waiting', label: 'Waiting', title: 'Notes empty — waiting for first successful run' };
  }
  if (!st.lastRunAt) {
    return { kind: 'waiting', label: 'Waiting', title: 'Analysis enabled but never run yet' };
  }
  return { kind: 'live', label: 'Live', title: `Updated ${st.lastRunAt}` };
}

function notesPreviewLine(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'No notes yet — will fill after analysis';
  return t.length > 100 ? `${t.slice(0, 100)}…` : t;
}

/** Mode adapter prompts — editable in Sales Brain carousel (with master prompt). */
const BRAIN_MODE_PROMPTS = [
  {
    id: 'ice_breaker',
    title: 'Ice breaker',
    hint: 'First LinkedIn DM to a new connection. Layered on your playbook: greeting, hook, friction, CTA, and sign-off.',
  },
  {
    id: 'reply',
    title: 'Reply',
    hint: 'Mid-thread when the lead wrote back. JSON output: intent, CRM status, reply text — no greeting or sign-off.',
  },
  {
    id: 'closing_followup',
    title: 'Closing follow-up',
    hint: 'Last soft touch before Lost when they never replied. Short, personalized close — no greeting or sign-off.',
  },
];

const BRAIN_PROMPT_CARDS = [
  {
    id: 'master',
    title: 'Master prompt',
    hint: 'Core playbook — voice, offer, and rules for every message. Mode adapters stack on top.',
    isMaster: true,
  },
  ...BRAIN_MODE_PROMPTS.map((m) => ({ ...m, isMaster: false })),
];

const PORTRAIT_ROLES = [
  'Founder',
  'CEO',
  'Agency owner',
  'Coach',
  'Realtor',
  'Creator',
  'Operator',
  'Consultant',
];
const PORTRAIT_STAGES = [
  { id: 'pre_revenue', label: 'Pre-revenue' },
  { id: 'early', label: 'Early stage' },
  { id: 'growth', label: 'Growth' },
  { id: 'established', label: 'Established' },
];
const PORTRAIT_REGIONS_FALLBACK = [
  'USA',
  'Canada',
  'UK',
  'North America',
  'Europe',
  'Global',
  'Remote',
];
const PORTRAIT_BUDGET = [
  { id: 'bootstrapped', label: 'Bootstrapped' },
  { id: 'has_budget', label: 'Has budget' },
  { id: 'unknown', label: 'Unknown' },
];
const PORTRAIT_INDUSTRIES = [
  'SaaS',
  'Agency',
  'Coaching',
  'Real estate',
  'E-commerce',
  'Creator economy',
  'Professional services',
  'Healthcare',
  'Finance',
];
const PORTRAIT_COMPANY_SIZE = [
  { id: 'solo', label: 'Solo' },
  { id: '2_10', label: '2–10' },
  { id: '11_50', label: '11–50' },
  { id: '51_200', label: '51–200' },
  { id: '200_plus', label: '200+' },
];
const PORTRAIT_DECISION_MAKER = ['Founder', 'CEO', 'Marketing lead', 'Ops / COO', 'Product lead'];
const PORTRAIT_PAIN_POINTS = [
  'Low leads',
  'Manual admin',
  'No website',
  'Outdated site',
  'Need app / dashboard',
  'Unclear offer',
];
const PORTRAIT_URGENCY = [
  { id: 'exploring', label: 'Exploring' },
  { id: 'active', label: 'Active project' },
  { id: 'asap', label: 'ASAP' },
];
const PORTRAIT_LINKEDIN = ['Active poster', 'Open to DM', 'Recently hiring', 'Launching offer'];

const LI_CONNECTION_DEGREE = [
  { id: '2nd', label: '2nd' },
  { id: '3rd_plus', label: '3rd+' },
  { id: '2nd_3rd', label: '2nd & 3rd+' },
  { id: 'all', label: 'All (not 1st)' },
];
const LI_PROFILE_LANGUAGES = [
  { id: '', label: 'Any language' },
  { id: 'en', label: 'English' },
  { id: 'uk', label: 'Ukrainian' },
  { id: 'de', label: 'German' },
  { id: 'fr', label: 'French' },
  { id: 'es', label: 'Spanish' },
  { id: 'pl', label: 'Polish' },
];
const LI_SENIORITY = [
  { id: 'intern', label: 'Intern' },
  { id: 'entry', label: 'Entry' },
  { id: 'associate', label: 'Associate' },
  { id: 'mid_senior', label: 'Mid-Senior' },
  { id: 'director', label: 'Director' },
  { id: 'executive', label: 'Executive' },
];
const LI_FUNCTION = [
  { id: 'sales', label: 'Sales' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'business_dev', label: 'Business Dev' },
  { id: 'product', label: 'Product' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Finance' },
  { id: 'consulting', label: 'Consulting' },
  { id: 'entrepreneurship', label: 'Entrepreneurship' },
  { id: 'it', label: 'IT' },
  { id: 'hr', label: 'HR' },
  { id: 'legal', label: 'Legal' },
];
const LI_YEARS_EXPERIENCE = [
  { id: 'lt1', label: '< 1 yr' },
  { id: 'y1_2', label: '1–2 yr' },
  { id: 'y3_5', label: '3–5 yr' },
  { id: 'y6_10', label: '6–10 yr' },
  { id: 'gt10', label: '10+ yr' },
];
const LI_COMPANY_HEADCOUNT = [
  { id: '1_10', label: '1–10' },
  { id: '11_50', label: '11–50' },
  { id: '51_200', label: '51–200' },
  { id: '201_500', label: '201–500' },
  { id: '501_1000', label: '501–1K' },
  { id: '1001_5000', label: '1K–5K' },
  { id: '5001_10000', label: '5K–10K' },
  { id: '10001_plus', label: '10K+' },
];

function normalizeLinkedInSearchFromSettings(raw) {
  const base = {
    connectionDegree: '2nd',
    keywordsExtra: '',
    currentCompany: '',
    pastCompany: '',
    school: '',
    profileLanguage: '',
    currentTitle: '',
    industryKeywords: '',
    seniority: [],
    functionArea: [],
    yearsOfExperience: [],
    companyHeadcount: [],
  };
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    seniority: Array.isArray(raw.seniority) ? raw.seniority : [],
    functionArea: Array.isArray(raw.functionArea) ? raw.functionArea : [],
    yearsOfExperience: Array.isArray(raw.yearsOfExperience) ? raw.yearsOfExperience : [],
    companyHeadcount: Array.isArray(raw.companyHeadcount) ? raw.companyHeadcount : [],
  };
}

function brainInfoIcon(hint) {
  return `<span class="brain-info" tabindex="0" title="${escapeAttr(hint)}" aria-label="${escapeAttr(hint)}">
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"/></svg>
  </span>`;
}

function getRegionGroups() {
  const groups = window.HALO_REGIONS?.groups;
  if (Array.isArray(groups) && groups.length) return groups;
  return [
    {
      label: 'Regions',
      items: PORTRAIT_REGIONS_FALLBACK.map((id) => ({ id, label: id })),
    },
  ];
}

function knownRegionChipIds() {
  const ids = new Set();
  for (const group of getRegionGroups()) {
    for (const item of group.items || []) ids.add(item.id);
  }
  return ids;
}

function normalizeRegionLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const aliases = window.HALO_REGIONS?.aliases || {};
  if (aliases[s]) return aliases[s];
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(aliases)) {
    if (k.toLowerCase() === lower) return v;
  }
  return s;
}

function parseCustomRegions(raw) {
  return [...new Set(String(raw || '').split(/[,;|]/).map((x) => normalizeRegionLabel(x.trim())).filter(Boolean))];
}

function portraitRegionsPicker(selected) {
  const sel = Array.isArray(selected) ? selected.map(normalizeRegionLabel) : [];
  const known = knownRegionChipIds();
  const customVals = sel.filter((r) => !known.has(r));
  let html = '<div class="brain-regions-picker"><div class="brain-chip-row brain-regions-chips" data-portrait-field="regions" data-multi="1">';
  for (const group of getRegionGroups()) {
    html += `<div class="brain-region-group-label">${escapeHtml(group.label)}</div>`;
    for (const opt of group.items || []) {
      const on = sel.includes(opt.id);
      html += `<button type="button" class="brain-chip${on ? ' is-active' : ''}" data-value="${escapeAttr(opt.id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(opt.label)}</button>`;
    }
  }
  html += '</div></div>';
  html += `<label class="field brain-regions-custom-field" title="Extra locations — comma-separated">
    <span class="brain-portrait-field-label">Additional regions</span>
    <input type="text" id="brain-regions-custom" class="input-compact" value="${escapeAttr(customVals.join(', '))}" placeholder="e.g. Baltic states, Dubai, Baltic EU" />
  </label>`;
  return html;
}

function portraitChipRow(field, options, selected, multi = true) {
  const sel = multi
    ? Array.isArray(selected)
      ? selected
      : []
    : [selected].filter(Boolean);
  return `<div class="brain-chip-row" data-portrait-field="${escapeAttr(field)}" data-multi="${multi ? '1' : '0'}">
    ${options
      .map((opt) => {
        const id = typeof opt === 'string' ? opt : opt.id;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = multi ? sel.includes(id) : sel[0] === id;
        return `<button type="button" class="brain-chip${on ? ' is-active' : ''}" data-value="${escapeAttr(id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
      })
      .join('')}
  </div>`;
}

function portraitBlock(title, hint, inner) {
  return `<div class="brain-portrait-block">
    <div class="brain-portrait-block-head">
      <span class="brain-portrait-block-title">${escapeHtml(title)}</span>
      ${hint ? brainInfoIcon(hint) : ''}
    </div>
    <div class="brain-portrait-block-body">${inner}</div>
  </div>`;
}

function portraitField(label, hint, content) {
  return `<div class="brain-portrait-field">
    <div class="brain-portrait-field-label">
      <span>${escapeHtml(label)}</span>
      ${hint ? brainInfoIcon(hint) : ''}
    </div>
    <div class="brain-portrait-field-body">${content}</div>
  </div>`;
}

function normalizePortraitFromSettings(raw) {
  const base = {
    roles: [],
    industries: [],
    companySize: '',
    decisionMaker: [],
    stage: '',
    regions: [],
    budget: '',
    urgency: '',
    painPoints: [],
    linkedinSignals: [],
    need: '',
    greenFlags: '',
    nonFit: 'No decision power, hard refusal, wrong persona, or clearly outside this portrait',
  };
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
  const aliases = window.HALO_REGIONS?.aliases || { US: 'USA', 'United States': 'USA', 'United Kingdom': 'UK' };
  const regions = [...new Set(arr(raw.regions).map((r) => normalizeRegionLabel(aliases[r] || r)).filter(Boolean))];
  return {
    roles: arr(raw.roles),
    industries: arr(raw.industries),
    companySize: String(raw.companySize || '').trim(),
    decisionMaker: arr(raw.decisionMaker),
    stage: String(raw.stage || '').trim(),
    regions,
    budget: String(raw.budget || '').trim(),
    urgency: String(raw.urgency || '').trim(),
    painPoints: arr(raw.painPoints),
    linkedinSignals: arr(raw.linkedinSignals),
    need: String(raw.need || '').trim(),
    greenFlags: String(raw.greenFlags || '').trim(),
    nonFit: String(raw.nonFit || base.nonFit).trim(),
  };
}

function liChipRow(field, options, selected, multi = true) {
  const sel = multi
    ? Array.isArray(selected)
      ? selected
      : []
    : [selected].filter(Boolean);
  return `<div class="brain-chip-row" data-li-field="${escapeAttr(field)}" data-multi="${multi ? '1' : '0'}">
    ${options
      .map((opt) => {
        const id = typeof opt === 'string' ? opt : opt.id;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = multi ? sel.includes(id) : sel[0] === id;
        return `<button type="button" class="brain-chip${on ? ' is-active' : ''}" data-value="${escapeAttr(id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
      })
      .join('')}
  </div>`;
}

function collectLiChipField(field) {
  const row = document.querySelector(`[data-li-field="${field}"]`);
  if (!row) return [];
  if (row.dataset.multi === '1') {
    return [...row.querySelectorAll('.brain-chip.is-active')].map((c) => c.dataset.value);
  }
  const one = row.querySelector('.brain-chip.is-active')?.dataset.value;
  return one ? [one] : [];
}

function collectPortraitChipField(field) {
  const row = document.querySelector(`[data-portrait-field="${field}"]`);
  if (!row) {
    const multiFields = new Set([
      'roles',
      'industries',
      'decisionMaker',
      'regions',
      'painPoints',
      'linkedinSignals',
    ]);
    return multiFields.has(field) ? [] : '';
  }
  if (row.dataset.multi === '1') {
    return [...row.querySelectorAll('.brain-chip.is-active')].map((c) => c.dataset.value);
  }
  return row.querySelector('.brain-chip.is-active')?.dataset.value || '';
}

function collectLinkedInSearchFromDom() {
  const row = document.querySelector('[data-li-field="connectionDegree"]');
  let connectionDegree = '2nd';
  if (row) {
    connectionDegree = row.querySelector('.brain-chip.is-active')?.dataset.value || '2nd';
  }
  return {
    connectionDegree,
    keywordsExtra: document.getElementById('brain-li-keywords-extra')?.value?.trim() || '',
    currentCompany: document.getElementById('brain-li-current-company')?.value?.trim() || '',
    pastCompany: document.getElementById('brain-li-past-company')?.value?.trim() || '',
    school: document.getElementById('brain-li-school')?.value?.trim() || '',
    profileLanguage: document.getElementById('brain-li-language')?.value || '',
    currentTitle: document.getElementById('brain-li-current-title')?.value?.trim() || '',
    industryKeywords: document.getElementById('brain-li-industry')?.value?.trim() || '',
    seniority: collectLiChipField('seniority'),
    functionArea: collectLiChipField('functionArea'),
    yearsOfExperience: collectLiChipField('yearsOfExperience'),
    companyHeadcount: collectLiChipField('companyHeadcount'),
  };
}
function collectPortraitFromDom() {
  const portrait = normalizePortraitFromSettings({});
  portrait.roles = collectPortraitChipField('roles');
  portrait.industries = collectPortraitChipField('industries');
  portrait.companySize = collectPortraitChipField('companySize');
  portrait.decisionMaker = collectPortraitChipField('decisionMaker');
  portrait.stage = collectPortraitChipField('stage');
  portrait.regions = [
    ...new Set([
      ...collectPortraitChipField('regions'),
      ...parseCustomRegions(document.getElementById('brain-regions-custom')?.value),
    ]),
  ];
  portrait.budget = collectPortraitChipField('budget');
  portrait.urgency = collectPortraitChipField('urgency');
  portrait.painPoints = collectPortraitChipField('painPoints');
  portrait.linkedinSignals = collectPortraitChipField('linkedinSignals');
  portrait.need = document.getElementById('brain-portrait-need')?.value?.trim() || '';
  portrait.greenFlags = document.getElementById('brain-portrait-green')?.value?.trim() || '';
  portrait.nonFit = document.getElementById('brain-portrait-nonfit')?.value?.trim() || '';
  return portrait;
}

function initPortraitForm() {
  view.querySelectorAll('.brain-chip-row').forEach((row) => {
    row.querySelectorAll('.brain-chip').forEach((chip) => {
      chip.onclick = () => {
        const multi = row.dataset.multi === '1';
        if (multi) {
          chip.classList.toggle('is-active');
          chip.setAttribute('aria-pressed', chip.classList.contains('is-active') ? 'true' : 'false');
        } else {
          row.querySelectorAll('.brain-chip').forEach((c) => {
            const on = c === chip;
            c.classList.toggle('is-active', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        }
      };
    });
  });
}

function initBrainPromptCarousel() {
  const root = document.getElementById('brain-prompt-carousel');
  if (!root) return;
  const panel = root.closest('#brain-sec-instructions') || root.parentElement;
  const viewport = root.querySelector('.brain-mode-viewport');
  const track = root.querySelector('.brain-mode-track');
  const cards = [...root.querySelectorAll('.brain-mode-card')];
  const tabs = [...(panel?.querySelectorAll('.brain-prompt-tab') || [])];
  const dots = [...root.querySelectorAll('.brain-mode-dot')];
  if (!track || !cards.length) return;
  let idx = 0;

  function goTo(i) {
    idx = Math.max(0, Math.min(cards.length - 1, i));
    track.style.transform = `translateX(-${idx * 100}%)`;
    cards.forEach((c, j) => c.classList.toggle('is-active', j === idx));
    tabs.forEach((t, j) => {
      t.classList.toggle('is-active', j === idx);
      t.setAttribute('aria-selected', j === idx ? 'true' : 'false');
    });
    dots.forEach((d, j) => {
      d.classList.toggle('is-active', j === idx);
      d.setAttribute('aria-selected', j === idx ? 'true' : 'false');
    });
    const prev = root.querySelector('.brain-mode-prev');
    const next = root.querySelector('.brain-mode-next');
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx === cards.length - 1;
  }

  root.querySelector('.brain-mode-prev')?.addEventListener('click', () => goTo(idx - 1));
  root.querySelector('.brain-mode-next')?.addEventListener('click', () => goTo(idx + 1));
  tabs.forEach((t) => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      const i = Number(t.dataset.index);
      goTo(Number.isFinite(i) ? i : 0);
    });
  });
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

  let touchStartX = 0;
  viewport?.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0]?.screenX ?? 0;
    },
    { passive: true }
  );
  viewport?.addEventListener(
    'touchend',
    (e) => {
      const dx = (e.changedTouches[0]?.screenX ?? 0) - touchStartX;
      if (Math.abs(dx) > 48) goTo(dx < 0 ? idx + 1 : idx - 1);
    },
    { passive: true }
  );

  goTo(0);
  root._goToPrompt = goTo;
}

function defaultBookingDayClient() {
  return { mode: 'free', intervals: [{ start: '00:00', end: '23:59' }] };
}

function normalizeBookingClient(raw) {
  const tz =
    String(raw?.timezone || '').trim() ||
    (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC') ||
    'UTC';
  const days = {};
  for (const d of BOOKING_WEEK_DAYS) {
    const src = raw?.days?.[d.id] || {};
    const mode = ['busy', 'free', 'intervals'].includes(src.mode) ? src.mode : 'free';
    const intervals = Array.isArray(src.intervals)
      ? src.intervals
          .map((iv) => ({
            start: String(iv?.start || '').trim(),
            end: String(iv?.end || '').trim(),
          }))
          .filter((iv) => /^\d{2}:\d{2}$/.test(iv.start) && /^\d{2}:\d{2}$/.test(iv.end))
      : [];
    days[d.id] = {
      mode,
      intervals: intervals.length ? intervals : [{ start: '00:00', end: '23:59' }],
    };
  }
  return { timezone: tz, days };
}

function validateBookingClient(raw) {
  return { ok: true, missing: [], schedule: normalizeBookingClient(raw) };
}

function ensureBrainBookingDraft() {
  if (!brainBookingDraft) brainBookingDraft = normalizeBookingClient(settings?.brain?.booking);
  return brainBookingDraft;
}

function bookingCompleteFromDraft() {
  return validateBookingClient(ensureBrainBookingDraft()).ok;
}

function closeBookCallModal() {
  document.getElementById('book-call-modal')?.remove();
}

const BOOK_SLOTS = 48;

function minsToHhmm(mins) {
  const m = Math.max(0, Math.min(24 * 60 - 1, mins));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function hhmmToSlot(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return Math.floor(((h || 0) * 60 + (m || 0)) / 30);
}

function dayToAvailabilityBits(day) {
  const bits = new Array(BOOK_SLOTS).fill(false);
  if (!day || day.mode === 'free' || !day.mode) return bits;
  if (day.mode === 'busy') {
    bits.fill(true);
    return bits;
  }
  for (const iv of day.intervals || []) {
    const a = hhmmToSlot(iv.start);
    const [eh, em] = String(iv.end || '0:0').split(':').map(Number);
    const b = Math.ceil(((eh || 0) * 60 + (em || 0)) / 30);
    for (let i = a; i < b && i < BOOK_SLOTS; i++) bits[i] = true;
  }
  return bits;
}

function availabilityBitsToDay(bits) {
  const on = bits.filter(Boolean).length;
  if (on === 0) return { mode: 'free', intervals: [{ start: '00:00', end: '23:59' }] };
  if (on === BOOK_SLOTS) return { mode: 'busy', intervals: [{ start: '00:00', end: '23:59' }] };
  const intervals = [];
  let i = 0;
  while (i < BOOK_SLOTS) {
    if (!bits[i]) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < BOOK_SLOTS && bits[i]) i += 1;
    intervals.push({
      start: minsToHhmm(start * 30),
      end: minsToHhmm(i * 30 >= 24 * 60 ? 23 * 60 + 59 : i * 30),
    });
  }
  return { mode: 'intervals', intervals };
}

function bookTimelineScaleHtml() {
  const marks = [];
  for (let h = 0; h <= 24; h += 1) {
    marks.push(`<span class="book-scale-mark" style="left:${(h / 24) * 100}%">${h === 24 ? '24' : String(h)}</span>`);
  }
  return `<div class="book-scale" aria-hidden="true">${marks.join('')}</div>`;
}

function renderBookDayRow(dayId, label, day) {
  const bits = dayToAvailabilityBits(day);
  const cells = bits
    .map(
      (on, i) =>
        `<button type="button" class="book-cell${on ? ' is-on' : ''}" data-slot="${i}" aria-pressed="${on ? 'true' : 'false'}" title="${minsToHhmm(i * 30)}"></button>`
    )
    .join('');
  const hint = bits.every((b) => !b) ? 'Free all day' : bits.every(Boolean) ? 'Busy all day' : 'Custom hours';
  return `<div class="book-day" data-day="${dayId}">
    <div class="book-day-head">
      <span class="book-day-label">${escapeHtml(label)}</span>
      <span class="book-day-hint muted" data-day-hint>${hint}</span>
    </div>
    <div class="book-strip" data-book-strip role="group" aria-label="${escapeAttr(label)} availability">${cells}</div>
    ${bookTimelineScaleHtml()}
  </div>`;
}

function updateBookDayHint(dayEl) {
  const cells = [...dayEl.querySelectorAll('.book-cell')];
  const on = cells.filter((c) => c.classList.contains('is-on')).length;
  const hint = dayEl.querySelector('[data-day-hint]');
  if (!hint) return;
  hint.textContent = on === 0 ? 'Free all day' : on === BOOK_SLOTS ? 'Busy all day' : 'Custom hours';
}

function setBookCell(cell, on) {
  cell.classList.toggle('is-on', on);
  cell.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function wireBookDayControls(modal) {
  let painting = false;
  let paintOn = true;
  const applyAt = (cell) => {
    if (!cell?.classList.contains('book-cell')) return;
    setBookCell(cell, paintOn);
    updateBookDayHint(cell.closest('.book-day'));
  };
  modal.querySelectorAll('[data-book-strip]').forEach((strip) => {
    strip.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.book-cell');
      if (!cell) return;
      e.preventDefault();
      painting = true;
      paintOn = !cell.classList.contains('is-on');
      strip.setPointerCapture?.(e.pointerId);
      applyAt(cell);
    });
    strip.addEventListener('pointermove', (e) => {
      if (!painting) return;
      applyAt(document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.book-cell'));
    });
    const stop = () => {
      painting = false;
    };
    strip.addEventListener('pointerup', stop);
    strip.addEventListener('pointercancel', stop);
    strip.addEventListener('lostpointercapture', stop);
  });
}

function collectBookingFromModal(root) {
  const timezone = root.querySelector('#book-tz')?.value?.trim() || 'UTC';
  const days = {};
  for (const d of BOOKING_WEEK_DAYS) {
    const bits = new Array(BOOK_SLOTS).fill(false);
    root.querySelectorAll(`[data-day="${d.id}"] .book-cell`).forEach((cell) => {
      const i = Number(cell.getAttribute('data-slot'));
      if (Number.isFinite(i) && cell.classList.contains('is-on')) bits[i] = true;
    });
    days[d.id] = availabilityBitsToDay(bits);
  }
  return { timezone, days };
}

const BOOK_EDIT_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>';

function openBookCallSettingsModal({ activateOnSave = false } = {}) {
  closeBookCallModal();
  const draft = ensureBrainBookingDraft();
  const meetSaved = String(settings.googleCalendar?.meetUrl || '').trim();
  const tzOpts = [...new Set([draft.timezone, ...BOOKING_TZ_OPTIONS].filter(Boolean))];
  const daysHtml = BOOKING_WEEK_DAYS.map((d) =>
    renderBookDayRow(d.id, d.label, draft.days[d.id] || defaultBookingDayClient())
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'book-call-modal';
  modal.className = 'book-call-modal';
  modal.innerHTML = `
    <div class="book-call-backdrop" data-book-close></div>
    <div class="book-call-panel" role="dialog" aria-modal="true" aria-labelledby="book-call-title">
      <header class="book-call-head">
        <div>
          <h3 id="book-call-title">Book a call — availability</h3>
          <p class="muted book-call-sub">Paint half-hour blocks you’re free. Empty day = free 24h · full day = busy. Click or drag.</p>
        </div>
        <button type="button" class="btn ghost btn-sm" data-book-close title="Close">×</button>
      </header>
      <div class="book-call-body">
        <label class="field book-tz-field">
          <span class="field-label">Your timezone</span>
          <select id="book-tz" class="book-tz-select">
            ${tzOpts.map((tz) => `<option value="${escapeAttr(tz)}" ${tz === draft.timezone ? 'selected' : ''}>${escapeHtml(tz)}</option>`).join('')}
          </select>
        </label>
        <label class="field book-meet-field" title="Google Meet room URL">
          <span class="field-label">Google Meet room URL <span class="muted">(optional)</span></span>
          <input type="url" id="book-meet-url" placeholder="Paste your Google Meet room link — calls with leads happen here" value="${escapeAttr(meetSaved)}" autocomplete="off" />
        </label>
        <div class="book-week">${daysHtml}</div>
        <p class="book-err muted" id="book-call-err" hidden></p>
      </div>
      <footer class="book-call-foot">
        <button type="button" class="btn ghost" data-book-close>Cancel</button>
        <button type="button" class="btn" id="book-call-save">Save schedule</button>
      </footer>
    </div>`;
  document.body.appendChild(modal);
  wireBookDayControls(modal);

  modal.querySelectorAll('[data-book-close]').forEach((el) => el.addEventListener('click', () => closeBookCallModal()));
  modal.querySelector('#book-call-save')?.addEventListener('click', async () => {
    brainBookingDraft = validateBookingClient(collectBookingFromModal(modal)).schedule;
    const meetUrl = String(modal.querySelector('#book-meet-url')?.value || '').trim();
    if (!settings.googleCalendar) settings.googleCalendar = {};
    settings.googleCalendar.meetUrl = meetUrl;
    settings.googleCalendar.ready = Boolean(meetUrl);
    try {
      const patch = { integrations: { GOOGLE_MEET_URL: meetUrl } };
      if (!meetUrl) patch.removeIntegrationKeys = ['GOOGLE_MEET_URL'];
      const data = await api('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
      settings = data.settings;
      if (settings.notifications) notifications = settings.notifications;
    } catch (e) {
      toast(e.message, true);
      return;
    }
    if (activateOnSave) {
      const hidden = document.getElementById('brain-outcome');
      if (hidden) hidden.value = 'book_a_call';
      document.querySelectorAll('[data-outcome]').forEach((b2) => {
        const on = b2.getAttribute('data-outcome') === 'book_a_call';
        b2.classList.toggle('is-active', on);
        b2.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    closeBookCallModal();
    toast('Availability saved — click Save in the top bar to persist the weekly schedule');
    renderBrain();
  });
}


function highlightBrainJump(key) {
  const map = {
    prompt: 'brain-sec-instructions',
    mode: 'brain-sec-instructions',
    sales: 'brain-sec-sales',
    notes: 'brain-sec-learning',
  };
  const id = map[key];
  const el = id ? document.getElementById(id) : null;
  if (!el) return;
  document.querySelectorAll('.brain-panel-highlight').forEach((n) => n.classList.remove('brain-panel-highlight'));
  document.querySelectorAll('.brain-flow-step.is-jump').forEach((n) => n.classList.remove('is-jump'));
  el.classList.add('brain-panel-highlight');
  const step = document.querySelector(`[data-brain-jump="${key}"]`);
  if (step) step.classList.add('is-jump');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (key === 'notes') {
    const details = el.querySelector('.brain-notes-details');
    if (details) details.open = true;
  }
  if (key === 'mode') {
    const carousel = document.getElementById('brain-prompt-carousel');
    if (carousel?._goToPrompt) carousel._goToPrompt(1);
  }
  clearTimeout(highlightBrainJump._t);
  highlightBrainJump._t = setTimeout(() => {
    el.classList.remove('brain-panel-highlight');
    if (step) step.classList.remove('is-jump');
  }, 1600);
}

function renderBrain() {
  const b = settings.brain || {};
  const pr = settings.prompts || {};
  const st = b.analysisState || {};
  const notesEmpty = !String(b.strategyNotes || '').trim();
  const outcome = b.outcome || 'book_a_call';
  const portrait = normalizePortraitFromSettings(b.portrait);
  const liSearch = normalizeLinkedInSearchFromSettings(b.linkedInSearch);
  const searchOverride = b.searchUrlOverride || '';
  const ps = b.prospectSearch || {};
  const ns = strategyNotesStatus(b, st, notesEmpty);
  const preview = notesPreviewLine(b.strategyNotes);

  const promptTabsHtml = BRAIN_PROMPT_CARDS.map(
    (c, i) =>
      `<button type="button" class="brain-prompt-tab${i === 0 ? ' is-active' : ''}" data-index="${i}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" title="${escapeAttr(c.hint)}">${escapeHtml(c.title)}</button>`
  ).join('');

  const promptCardsHtml = BRAIN_PROMPT_CARDS.map((c, i) => {
    if (c.isMaster) {
      return `
      <article class="brain-mode-card${i === 0 ? ' is-active' : ''}" data-prompt-index="${i}">
        <textarea id="brain-user-prompt" class="textarea-brain textarea-brain-mode" rows="14" title="Master prompt">${escapeHtml(b.userPrompt || '')}</textarea>
      </article>`;
    }
    return `
      <article class="brain-mode-card${i === 0 ? ' is-active' : ''}" data-prompt-index="${i}">
        <textarea
          id="brain-prompt-${escapeAttr(c.id)}"
          class="textarea-brain textarea-brain-mode"
          rows="14"
          data-prompt-key="${escapeAttr(c.id)}"
          title="${escapeAttr(c.title)} mode prompt"
        >${escapeHtml(pr[c.id] || '')}</textarea>
      </article>`;
  }).join('');

  const promptDotsHtml = BRAIN_PROMPT_CARDS.map(
    (c, i) =>
      `<button type="button" class="brain-mode-dot${i === 0 ? ' is-active' : ''}" aria-label="${escapeAttr(c.title)}" aria-selected="${i === 0 ? 'true' : 'false'}"></button>`
  ).join('');

  setPageHeader('Sales Brain', 'Master prompt · modes · target portrait · strategy notes');
  titleEl.title = 'Sales Brain';
  view.innerHTML = `
    <div class="brain-page">
      <section class="brain-hero brain-hero-compact" title="Message composition stack">
        <ol class="brain-flow" aria-label="Message composition stack">
          <li>
            <button type="button" class="brain-flow-step" data-brain-jump="prompt" title="Master prompt">
              <span class="brain-flow-ico">${brainIco('prompt')}</span>
              <span class="brain-flow-label">Master</span>
            </button>
          </li>
          <li>
            <button type="button" class="brain-flow-step" data-brain-jump="mode" title="Mode adapters">
              <span class="brain-flow-ico">${brainIco('mode')}</span>
              <span class="brain-flow-label">Modes</span>
            </button>
          </li>
          <li>
            <button type="button" class="brain-flow-step" data-brain-jump="sales" title="Target portrait & outcome">
              <span class="brain-flow-ico">${brainIco('sales')}</span>
              <span class="brain-flow-label">Sales</span>
            </button>
          </li>
          <li>
            <button type="button" class="brain-flow-step" data-brain-jump="notes" title="Learning / notes">
              <span class="brain-flow-ico">${brainIco('notes')}</span>
              <span class="brain-flow-label">Notes</span>
            </button>
          </li>
        </ol>
      </section>

      <div class="brain-grid">
        <section class="brain-panel brain-panel-prompts" id="brain-sec-instructions" title="Instructions — master & mode prompts">
          <header class="brain-panel-head brain-panel-head-compact">
            <h3 class="brain-panel-title">${brainIco('prompt')} Instructions ${brainInfoIcon('Master prompt sets voice and rules. Mode tabs adapt ice / reply / closing.')}</h3>
          </header>
          <div class="brain-prompt-tabs" role="tablist" aria-label="Prompt layers">${promptTabsHtml}</div>
          <div class="brain-mode-carousel" id="brain-prompt-carousel">
            <button type="button" class="brain-mode-nav brain-mode-prev" aria-label="Previous prompt" title="Previous">‹</button>
            <div class="brain-mode-viewport">
              <div class="brain-mode-track">${promptCardsHtml}</div>
            </div>
            <button type="button" class="brain-mode-nav brain-mode-next" aria-label="Next prompt" title="Next">›</button>
            <div class="brain-mode-dots" role="tablist" aria-label="Prompt">${promptDotsHtml}</div>
          </div>
        </section>

        <section class="brain-panel brain-panel-sales" id="brain-sec-sales" title="Sales — who we sell to and what we want">
          <header class="brain-panel-head brain-panel-head-compact">
            <h3 class="brain-panel-title">${brainIco('sales')} Sales ${brainInfoIcon('Target portrait & desired outcome — injected only on inbound replies (Reply mode).')}</h3>
          </header>
          <div class="brain-prospect-preview">
            <label class="field-label-inline" for="brain-search-url-override">LinkedIn People URL override (optional) ${brainInfoIcon('Paste a LinkedIn People URL from your browser for exact facets. Leave empty to auto-build from portrait + filters below.')}</label>
            <input type="url" id="brain-search-url-override" class="input-compact" value="${escapeAttr(searchOverride)}" placeholder="${escapeAttr(ps.searchUrl || 'https://www.linkedin.com/search/results/people/…')}" title="Leave empty to auto-build from portrait" />
          </div>
          <div class="brain-li-filters">
            <span class="field-label-inline">LinkedIn People filters ${brainInfoIcon('Maps to LinkedIn search facets. Roles/Industries/Regions above also feed keywords & location.')}</span>
            ${portraitField('Connections', 'Who you can invite from search.', `<div class="brain-chip-row" data-li-field="connectionDegree" data-multi="0">${LI_CONNECTION_DEGREE.map((opt) => {
              const on = liSearch.connectionDegree === opt.id;
              return `<button type="button" class="brain-chip${on ? ' is-active' : ''}" data-value="${escapeAttr(opt.id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(opt.label)}</button>`;
            }).join('')}</div>`)}
            <div class="brain-portrait-field-row">
              ${portraitField('Extra keywords', null, `<input type="text" id="brain-li-keywords-extra" class="input-compact" value="${escapeAttr(liSearch.keywordsExtra)}" placeholder="e.g. B2B SaaS, launch" />`)}
              ${portraitField('Profile language', null, `<select id="brain-li-language" class="input-compact">${LI_PROFILE_LANGUAGES.map((l) => `<option value="${escapeAttr(l.id)}"${liSearch.profileLanguage === l.id ? ' selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}</select>`)}
            </div>
            <div class="brain-portrait-field-row">
              ${portraitField('Current company', 'Name as on LinkedIn — added to keywords.', `<input type="text" id="brain-li-current-company" class="input-compact" value="${escapeAttr(liSearch.currentCompany)}" placeholder="Company name" />`)}
              ${portraitField('Past company', null, `<input type="text" id="brain-li-past-company" class="input-compact" value="${escapeAttr(liSearch.pastCompany)}" placeholder="Past employer" />`)}
            </div>
            <div class="brain-portrait-field-row">
              ${portraitField('Current title', 'LinkedIn title facet — exact job title filter.', `<input type="text" id="brain-li-current-title" class="input-compact" value="${escapeAttr(liSearch.currentTitle)}" placeholder="e.g. Founder, CEO" />`)}
              ${portraitField('Industry', 'Keywords only — for strict industry URN use URL override.', `<input type="text" id="brain-li-industry" class="input-compact" value="${escapeAttr(liSearch.industryKeywords)}" placeholder="e.g. Software, Marketing" />`)}
            </div>
            ${portraitField('School', null, `<input type="text" id="brain-li-school" class="input-compact" value="${escapeAttr(liSearch.school)}" placeholder="University / school" />`)}
            ${portraitField('Seniority', 'LinkedIn seniority facet.', liChipRow('seniority', LI_SENIORITY, liSearch.seniority, true))}
            ${portraitField('Function', 'LinkedIn function facet.', liChipRow('functionArea', LI_FUNCTION, liSearch.functionArea, true))}
            <div class="brain-portrait-field-row">
              ${portraitField('Years of experience', null, liChipRow('yearsOfExperience', LI_YEARS_EXPERIENCE, liSearch.yearsOfExperience, true))}
              ${portraitField('Company headcount', 'LinkedIn headcount facet (distinct from portrait company size).', liChipRow('companyHeadcount', LI_COMPANY_HEADCOUNT, liSearch.companyHeadcount, true))}
            </div>
          </div>
          <div class="brain-portrait-compact">
            ${portraitBlock(
              'Who',
              'Job titles, industries, and who signs off on a project.',
              `
              ${portraitField('Roles', 'Titles you target — pick all that apply.', portraitChipRow('roles', PORTRAIT_ROLES, portrait.roles, true))}
              ${portraitField('Industries', null, portraitChipRow('industries', PORTRAIT_INDUSTRIES, portrait.industries, true))}
              <div class="brain-portrait-field-row">
                ${portraitField('Company size', null, portraitChipRow('companySize', PORTRAIT_COMPANY_SIZE, portrait.companySize, false))}
                ${portraitField('Decision maker', null, portraitChipRow('decisionMaker', PORTRAIT_DECISION_MAKER, portrait.decisionMaker, true))}
              </div>
            `
            )}
            ${portraitBlock(
              'Context',
              'Stage, budget, geography, and timing.',
              `
              <div class="brain-portrait-field-row">
                ${portraitField('Stage', null, portraitChipRow('stage', PORTRAIT_STAGES, portrait.stage, false))}
                ${portraitField('Budget', null, portraitChipRow('budget', PORTRAIT_BUDGET, portrait.budget, false))}
              </div>
              ${portraitField('Regions', 'Pick countries/regions or type more below (comma-separated).', portraitRegionsPicker(portrait.regions))}
              ${portraitField('Urgency', null, portraitChipRow('urgency', PORTRAIT_URGENCY, portrait.urgency, false))}
            `
            )}
            ${portraitBlock(
              'Fit signals',
              'Why they need you — used on inbound replies only.',
              `
              ${portraitField('Pain points', null, portraitChipRow('painPoints', PORTRAIT_PAIN_POINTS, portrait.painPoints, true))}
              ${portraitField('LinkedIn signals', 'Profile cues that suggest good fit.', portraitChipRow('linkedinSignals', PORTRAIT_LINKEDIN, portrait.linkedinSignals, true))}
              ${portraitField('Need / offer fit', 'One short paragraph — what you deliver for this persona.', `<textarea id="brain-portrait-need" class="textarea-brain textarea-brain-xs" rows="2" title="Need / offer fit">${escapeHtml(portrait.need)}</textarea>`)}
              <details class="brain-portrait-more">
                <summary>More signals</summary>
                ${portraitField('Green flags', null, `<input type="text" id="brain-portrait-green" class="input-compact" value="${escapeAttr(portrait.greenFlags)}" placeholder="e.g. asks pricing, mentions launch" />`)}
              </details>
            `
            )}
            ${portraitBlock(
              'Disqualifiers',
              'When to mark Lost instead of pushing.',
              `
              ${portraitField('Non-fit → Lost', null, `<textarea id="brain-portrait-nonfit" class="textarea-brain textarea-brain-xs" rows="2" title="Non-fit rules">${escapeHtml(portrait.nonFit)}</textarea>`)}
            `
            )}
          </div>
          <div class="brain-outcome-block brain-outcome-block-separated">
            <div class="brain-portrait-field-label">Outcome</div>
            <input type="hidden" id="brain-outcome" value="${escapeAttr(outcome)}" />
            <div class="brain-outcome-grid brain-outcome-grid-compact" role="group" aria-label="Desired sales outcome">
              ${[
                ['book_a_call', 'Book a call', 'Push toward a meeting'],
                ['purchase', 'Purchase', 'Move toward buying'],
                ['qualify', 'Qualify', 'Fit, budget, timing'],
                ['referral', 'Referral', 'Ask for intros'],
              ]
                .map(([id, label, hint]) => {
                  const isBook = id === 'book_a_call';
                  const complete = isBook ? bookingCompleteFromDraft() : true;
                  const warn = isBook && outcome === 'book_a_call' && !complete;
                  return `
                <div class="brain-outcome-wrap${isBook ? ' has-book-settings' : ''}">
                  <button type="button" class="brain-outcome-card brain-outcome-card-compact${outcome === id ? ' is-active' : ''}${warn ? ' needs-schedule' : ''}" data-outcome="${id}" aria-pressed="${outcome === id ? 'true' : 'false'}" title="${escapeAttr(hint)}">
                    <span class="brain-outcome-card-label">${label}</span>
                    ${warn ? '<span class="brain-outcome-warn" title="Complete weekly availability">!</span>' : ''}
                  </button>
                  ${
                    isBook
                      ? `<button type="button" class="brain-outcome-gear" data-book-settings title="Edit Book a call availability">${BOOK_EDIT_ICON}</button>`
                      : ''
                  }
                </div>`;
                })
                .join('')}
            </div>
            ${
              outcome === 'book_a_call' && !bookingCompleteFromDraft()
                ? '<p class="muted brain-book-hint">Complete weekly availability before Save — every day needs free, busy, or intervals.</p>'
                : ''
            }
          </div>
        </section>

        <section class="brain-panel brain-panel-learn" id="brain-sec-learning" title="Learning — analysis and strategy notes">
          <header class="brain-panel-head brain-panel-head-compact">
            <h3 class="brain-panel-title">${brainIco('notes')} Learning ${brainInfoIcon('Periodic analysis writes living strategy notes from CRM history.')}</h3>
          </header>
          <div class="brain-learn-row">
            <div class="brain-analysis-card" title="Periodic strategy analysis">
              <div class="tile-head">
                <h3>Analysis</h3>
                ${switchEl('brainAnalysis', !!b.analysisEnabled, 'Run Brain analysis on interval')}
              </div>
              <div class="row gap brain-interval">
                <span class="muted">Every</span>
                <input type="number" id="brainIntervalValue" min="1" value="${escapeAttr(b.analysisIntervalValue ?? 7)}" title="Interval value" />
                ${unitSelect('brainIntervalUnit', b.analysisIntervalUnit || 'days')}
              </div>
              <p class="muted brain-last-run">${st.lastRunAt ? `Last: ${escapeHtml(st.lastRunAt)}` : 'Never run'}${st.lastSummary ? ` · ${escapeHtml(st.lastSummary)}` : ''}</p>
            </div>
            <details class="brain-notes-details">
              <summary class="brain-notes-summary" title="${escapeAttr(ns.title)}">
                <span class="brain-notes-summary-left">
                  ${brainIco('notes')}
                  <span>Strategy notes</span>
                  <span class="brain-live-badge brain-live-${ns.kind}" title="${escapeAttr(ns.title)}">
                    <span class="brain-live-dot" aria-hidden="true"></span>
                    ${escapeHtml(ns.label)}
                  </span>
                </span>
                <span class="brain-notes-preview muted" title="Preview — click to expand">${escapeHtml(preview)}</span>
              </summary>
              <pre class="strategy-notes-pre strategy-notes-collapsible" title="Current strategy notes">${escapeHtml(b.strategyNotes || '(empty — fills after the first analysis run)')}</pre>
            </details>
          </div>
        </section>
      </div>
    </div>
  `;

  view.querySelectorAll('[data-outcome]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-outcome');
      if (id === 'book_a_call' && !bookingCompleteFromDraft()) {
        openBookCallSettingsModal({ activateOnSave: true });
        return;
      }
      const hidden = document.getElementById('brain-outcome');
      if (hidden) hidden.value = id;
      view.querySelectorAll('[data-outcome]').forEach((b2) => {
        const on = b2.getAttribute('data-outcome') === id;
        b2.classList.toggle('is-active', on);
        b2.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    };
  });
  view.querySelector('[data-book-settings]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openBookCallSettingsModal({ activateOnSave: true });
  });

  view.querySelectorAll('[data-brain-jump]').forEach((btn) => {
    btn.onclick = () => highlightBrainJump(btn.getAttribute('data-brain-jump'));
  });

  initPortraitForm();
  initBrainPromptCarousel();
}

function renderCrm() {
  const s = settings;
  const inApp = crmInAppEnabled(s);

  if (!s.notionConfigured) {
    setPageHeader('CRM', 'Connect Supabase to track leads');
    titleEl.title = 'CRM setup';
    view.innerHTML = `
      <div class="card card-hero" title="Connect Supabase CRM">
        <h3>Connect Supabase CRM</h3>
        <p class="muted card-lead">One guided setup: run the SQL schema in Supabase, then paste Project URL and service_role key. H.A.L.O. stores leads with Name, Link, Status, Ice-breaker, Processing at, and Body.</p>
        <div class="row section-actions">
          <button type="button" class="btn btn-supabase" id="btn-supabase-connect-crm">${ICONS.supabase}<span>Connect Supabase</span></button>
        </div>
      </div>`;
    document.getElementById('btn-supabase-connect-crm')?.addEventListener('click', () => {
      window.HaloSupabaseConnect?.openConnect();
    });
    return;
  }

  if (inApp) {
    setPageHeader('CRM', 'Kanban pipeline · drag cards to change status');
    titleEl.title = 'Supabase CRM';
    view.innerHTML = `
      <div class="crm-toolbar">
        <div class="crm-toolbar-left">
          <div class="crm-view-toggle" role="group" aria-label="View mode">
            <button type="button" data-crm-view="kanban" class="${crmViewMode === 'kanban' ? 'active' : ''}" title="Kanban view">Kanban</button>
            <button type="button" data-crm-view="table" class="${crmViewMode === 'table' ? 'active' : ''}" title="Table view">Table</button>
          </div>
          ${crmStatusFilter ? `<button type="button" class="btn ghost btn-sm" id="crm-clear-filter">Clear filter · ${escapeHtml(crmStatusFilter)}</button>` : ''}
        </div>
        <div class="crm-toolbar-right">
          ${crmCardPropsMenuHtml()}
          <label class="field crm-search-field">
            <span class="sr-only">Search leads</span>
            <input type="search" id="crm-search" placeholder="Search name or link…" />
          </label>
          <button type="button" class="btn primary btn-sm" id="crm-add-lead" title="Add lead">+ Lead</button>
        </div>
      </div>
      <div id="crm-leads-root"><div class="crm-loading">Loading leads…</div></div>
      <div id="crm-drawer-slot"></div>`;
    bindCrmToolbar();
    document.getElementById('crm-clear-filter')?.addEventListener('click', () => {
      crmStatusFilter = '';
      crmPage = 1;
      renderCrm();
    });
    fetchCrmLeads();
    return;
  }

  setPageHeader('CRM', 'Connect Supabase to manage leads');
  titleEl.title = 'CRM';
  view.innerHTML = `
    <div class="card card-hero">
      <h3>Supabase not connected</h3>
      <p class="muted card-lead">Open the guided setup to run SQL and paste your Project URL + service_role key.</p>
      <div class="row section-actions">
        <button type="button" class="btn btn-supabase" id="btn-supabase-connect-crm-fallback">${ICONS.supabase}<span>Connect Supabase</span></button>
      </div>
    </div>`;
  document.getElementById('btn-supabase-connect-crm-fallback')?.addEventListener('click', () => {
    window.HaloSupabaseConnect?.openConnect();
  });
}

function renderLinkedIn() {
  const s = settings;
  const sess = s.session || {};
  const ok = sess.ok === true && !sess.needsCookieRepair && s.cookies.present;
  setPageHeader('LinkedIn', 'Session and Stage A prospecting');
  titleEl.title = 'LinkedIn channel';

  const channelStrip = `<div class="li-channel-strip">
      <div class="li-channel-strip-copy">
        <strong>Channel</strong>
        <span class="muted">Stage A / Stage B outreach</span>
        ${s.channels.linkedin ? '<span class="badge">active</span>' : '<span class="badge off">off</span>'}
      </div>
      ${switchEl('ch-linkedin', s.channels.linkedin, 'Enable LinkedIn channel')}
    </div>`;

  const sessionCard = ok
    ? `<div class="card li-session-card li-session-active" title="LinkedIn session is active">
        <div class="li-session-head">
          <span class="li-brand-icon" aria-hidden="true">${ICONS.linkedin}</span>
          <div class="li-session-head-text">
            <h3>LinkedIn session <span class="badge">Active</span></h3>
            <p class="muted card-lead">Server Chromium signed in · ${s.cookies.count} cookies${sess.updatedAt ? ` · verified ${escapeHtml(sess.updatedAt)}` : ''}</p>
          </div>
        </div>
        ${channelStrip}
      </div>`
    : `<div class="card li-session-card li-session-inactive" title="Sign in to LinkedIn for H.A.L.O.">
        <div class="li-session-head">
          <span class="li-brand-icon" aria-hidden="true">${ICONS.linkedin}</span>
          <div class="li-session-head-text">
            <h3>LinkedIn session <span class="badge bad">Inactive</span></h3>
            <p class="muted card-lead">Sign in below. Approve the request in your LinkedIn app if asked.</p>
            ${sess.reason ? `<p class="muted" style="font-size:0.78rem;margin-top:6px">Reason: ${escapeHtml(sess.reason)}</p>` : ''}
          </div>
        </div>
        <form id="li-session-form" class="li-session-form" autocomplete="on">
          <label class="field" for="li-username">Email or phone
            <input id="li-username" name="username" type="text" autocomplete="username" autocorrect="off" autocapitalize="off" spellcheck="false" required />
          </label>
          <label class="field" for="li-password">Password
            <div class="pass-wrap">
              <input id="li-password" name="password" type="password" autocomplete="current-password" required />
              <button type="button" class="pass-toggle" id="li-pass-toggle" aria-label="Show password">Show</button>
            </div>
          </label>
          <div class="row section-actions">
            <button type="submit" class="btn primary" id="li-signin-btn"><span class="btn-spinner" aria-hidden="true"></span><span class="btn-label">Sign in</span></button>
          </div>
          <p class="muted" id="li-session-status" role="status"></p>
          <div class="li-session-challenge-banner hidden" id="li-session-challenge-banner" role="alert" aria-live="assertive">
            <div class="li-challenge-pulse" aria-hidden="true"></div>
            <div class="li-challenge-copy">
              <strong class="li-challenge-title">Action required</strong>
              <p class="li-challenge-body">Waiting for LinkedIn…</p>
              <p class="li-challenge-foot">
                Optional: <a id="li-repair-link" href="#" target="_blank" rel="noopener">open repair page</a> for screenshot / code entry.
              </p>
            </div>
          </div>
        </form>
        ${channelStrip}
      </div>`;

  view.innerHTML = `
    <div class="li-page">
      ${sessionCard}
      <div class="li-main-grid">
        <div class="tile tile-stage-a" title="Stage A prospecting">
          <h3>Stage A prospecting</h3>
          <p class="muted stage-a-flow-hint">Each run: check <strong>Lead😴</strong> accepts → enrich &amp; ice (still Lead) → <strong>Conversation 💬</strong> → send <strong>N</strong> invites → <strong>Lead😴</strong>.</p>
          <div class="li-stage-a-body">
            <div class="li-stage-a-row">
              <span class="li-stage-a-label">Portrait invites</span>
              ${switchEl('portraitProspecting', s.linkedin.portraitProspecting, 'Send connection invites from Brain portrait search')}
            </div>
            <label class="field" title="Connection invites per Stage A">
              ${LEADS_PER_CYCLE_LABEL}
              <input type="number" id="connectInvitesPerRun" min="1" max="100" step="1" value="${s.linkedin.connectMaxPerRun ?? 15}" ${s.linkedin.portraitProspecting ? '' : 'disabled'} />
            </label>
            <div class="field-warn" id="connectInvitesWarn" role="status">
              Recommended <strong>10–15</strong> / run (warns above 15). Manual CRM Link leads share this budget and go first.
            </div>
            <div class="li-stage-a-row" style="margin-top:4px">
              <span class="li-stage-a-label">Expire Lead😴 if not accepted</span>
              ${switchEl('connectAcceptExpire', s.linkedin.connectAcceptExpire !== false, 'Expire Lead😴 if connect not accepted')}
            </div>
            <label class="field" title="Days without accept before Lost">
              Days to wait for connect accept
              <input type="number" id="connectAcceptWaitDays" min="1" max="365" step="1" value="${Number(s.linkedin.connectAcceptWaitDays ?? 21) || 21}" ${(s.linkedin.portraitProspecting && s.linkedin.connectAcceptExpire !== false) ? '' : 'disabled'} />
            </label>
            <p class="muted li-expire-hint">Default <strong>21</strong> days → <strong>Lost❌</strong> (not deleted). Switch off to keep Lead😴 forever. Never expires leads still waiting for our invite.</p>
          </div>
        </div>
        <div class="tile li-side-tile" title="Test filter">
          <h3>Test filter</h3>
          <p class="muted" style="font-size:0.78rem;margin:0 0 8px">Optional. Limit Stage A/B to one profile while debugging.</p>
          <label class="field" title="Profile URL filter"><input type="url" id="targetUrl" value="${escapeAttr(s.linkedin.targetUrl || '')}" placeholder="https://www.linkedin.com/in/..." /></label>
        </div>
      </div>
    </div>
  `;
  bindSwitchAutosave();
  bindConnectInvitesWarn();
  bindConnectInvitesAutosave();
  bindConnectAcceptExpireControls();
  bindPortraitProspectingToggle();
  bindLinkedInSessionForm();
}

function bindConnectAcceptExpireControls() {
  const sw = document.getElementById('connectAcceptExpire');
  const days = document.getElementById('connectAcceptWaitDays');
  const portrait = document.getElementById('portraitProspecting');
  if (!sw) return;

  const syncEnabled = () => {
    const portraitOn = portrait?.checked !== false;
    sw.disabled = !portraitOn;
    if (days) days.disabled = !(portraitOn && sw.checked);
  };

  const saveExpire = async (patch) => {
    if (!settings.linkedin) settings.linkedin = {};
    Object.assign(settings.linkedin, patch);
    const data = await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ linkedin: patch }),
    });
    settings = data.settings;
    if (settings.notifications) notifications = settings.notifications;
  };

  sw.onchange = async () => {
    syncEnabled();
    try {
      await saveExpire({ connectAcceptExpire: sw.checked });
      toast(sw.checked ? 'Lead😴 expire on' : 'Lead😴 expire off');
    } catch (e) {
      toast(e.message, true);
      sw.checked = !sw.checked;
      syncEnabled();
    }
  };

  if (days) {
    const commitDays = async () => {
      let n = Math.round(Number(days.value));
      if (!Number.isFinite(n) || n < 1) n = 21;
      n = Math.min(365, n);
      days.value = String(n);
      try {
        await saveExpire({ connectAcceptWaitDays: n });
        toast(`Wait ${n} days for connect accept`);
      } catch (e) {
        toast(e.message, true);
      }
    };
    days.addEventListener('change', commitDays);
    days.addEventListener('blur', commitDays);
  }
  syncEnabled();
}

function bindPortraitProspectingToggle() {
  const sw = document.getElementById('portraitProspecting');
  const input = document.getElementById('connectInvitesPerRun');
  const waitInput = document.getElementById('connectAcceptWaitDays');
  const expireSw = document.getElementById('connectAcceptExpire');
  if (!sw) return;
  sw.onchange = async () => {
    if (input) input.disabled = !sw.checked;
    if (expireSw) expireSw.disabled = !sw.checked;
    if (waitInput) waitInput.disabled = !(sw.checked && expireSw?.checked);
    const on = sw.checked;
    if (!settings.linkedin) settings.linkedin = {};
    settings.linkedin.portraitProspecting = on;
    try {
      const data = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ linkedin: { portraitProspecting: on } }),
      });
      settings = data.settings;
      if (settings.notifications) notifications = settings.notifications;
      render();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

function bindLinkedInSessionForm() {
  const form = document.getElementById('li-session-form');
  if (!form) return;
  const passEl = document.getElementById('li-password');
  const statusEl = document.getElementById('li-session-status');
  const bannerEl = document.getElementById('li-session-challenge-banner');
  const repairLink = document.getElementById('li-repair-link');
  const btn = document.getElementById('li-signin-btn');
  const toggle = document.getElementById('li-pass-toggle');
  const challengeEls = { statusEl, bannerEl, repairLink };

  if (toggle && passEl) {
    toggle.onclick = () => {
      const show = passEl.type === 'password';
      passEl.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('li-username')?.value?.trim() || '';
    const password = passEl?.value || '';
    if (!username || !password) {
      if (statusEl) statusEl.textContent = 'Enter email/phone and password.';
      return;
    }
    linkedInChallengeAlerted = false;
    hideLinkedInChallengeUI(challengeEls);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
    }
    if (statusEl) statusEl.textContent = 'Starting remote Chromium…';
    try {
      const res = await api('/api/linkedin/session/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (statusEl) statusEl.textContent = 'Signing in on remote Chromium…';
      if (repairLink && res.url) repairLink.href = res.url;
      pollLinkedInLogin(res.token, challengeEls);
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message;
      toast(err.message, true);
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-loading');
      }
    }
  });
}

function pollLinkedInLogin(token, challengeEls = {}) {
  if (linkedInLoginPoll) clearTimeout(linkedInLoginPoll);
  const statusEl = challengeEls.statusEl || document.getElementById('li-session-status');
  const bannerEl = challengeEls.bannerEl || document.getElementById('li-session-challenge-banner');
  const repairLink = challengeEls.repairLink || document.getElementById('li-repair-link');
  const els = { statusEl, bannerEl, repairLink };
  const btn = document.getElementById('li-signin-btn');
  let pollN = 0;

  const tick = async () => {
    if (page !== 'linkedin') {
      linkedInLoginPoll = null;
      stopLinkedInTitleAlert();
      return;
    }
    try {
      pollN++;
      const st = await api('/api/linkedin/session/login/status?token=' + encodeURIComponent(token));
      st.token = token;
      try {
        const data = await api('/api/settings');
        if (data.settings?.session?.ok === true && data.settings?.cookies?.present) {
          linkedInChallengeAlerted = false;
          hideLinkedInChallengeUI(els);
          settings = data.settings;
          if (settings.notifications) notifications = settings.notifications;
          updateBell();
          toast('LinkedIn session Active');
          render();
          return;
        }
      } catch {
        /* ignore */
      }
      if (st.status === 'captured' || st.liAtCaptured) {
        linkedInChallengeAlerted = false;
        hideLinkedInChallengeUI(els);
        if (statusEl) statusEl.textContent = 'Session restored.';
        toast('LinkedIn session Active');
        const data = await api('/api/settings');
        settings = data.settings;
        if (settings.notifications) notifications = settings.notifications;
        updateBell();
        render();
        return;
      }
      if (st.status === 'credential_error' || (st.lastSignInError && /wrong email or password/i.test(st.lastSignInError || ''))) {
        linkedInChallengeAlerted = false;
        hideLinkedInChallengeUI(els);
        stopLinkedInTitleAlert();
        const msg = st.lastSignInError || st.error || 'Wrong email or password — try again.';
        if (statusEl) statusEl.textContent = msg;
        toast(msg, true, 8000);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        }
        linkedInLoginPoll = null;
        return;
      }
      if (st.status === 'error' || st.status === 'timeout') {
        linkedInChallengeAlerted = false;
        hideLinkedInChallengeUI(els);
        if (statusEl) statusEl.textContent = st.error || st.status;
        toast(st.error || 'Login timed out', true, 6000);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        }
        return;
      }
      if (st.stale && !st.workerAlive) {
        linkedInChallengeAlerted = false;
        hideLinkedInChallengeUI(els);
        if (statusEl) statusEl.textContent = 'Login worker stopped — click Sign in again.';
        toast('Login worker stopped — press Sign in again', true, 8000);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        }
        linkedInLoginPoll = null;
        try {
          const data = await api('/api/settings');
          settings = data.settings;
          render();
        } catch {
          render();
        }
        return;
      }
      if (st.uiMode === 'challenge' || (st.challengeSince && !st.liAtCaptured && st.status === 'running')) {
        const kind = st.challengeKind || 'app_approval';
        const copy = LI_CHALLENGE_COPY[kind] || LI_CHALLENGE_COPY.generic;
        showLinkedInChallengeUI(st, els);
        startLinkedInTitleAlert();
        if (!linkedInChallengeAlerted) {
          linkedInChallengeAlerted = true;
          toastWarn(copy.toast, 0);
          browserNotify(copy.notifyTitle, copy.notifyBody);
        }
        if (statusEl) statusEl.textContent = 'Approve in LinkedIn app — waiting for server…';
      } else if (statusEl) {
        if (st.lastSignInError && st.status === 'running') {
          statusEl.textContent = st.lastSignInError;
          // Surface repair page so user can see what Chromium sees
          if (bannerEl && repairLink) {
            const copy = LI_CHALLENGE_COPY.generic;
            bannerEl.classList.remove('hidden');
            const t = bannerEl.querySelector('.li-challenge-title');
            const b = bannerEl.querySelector('.li-challenge-body');
            if (t) t.textContent = 'Login did not finish';
            if (b) {
              b.textContent =
                st.lastSignInError +
                ' Open the repair page to see the live screenshot. If LinkedIn shows a password error, fix credentials and try again.';
            }
            repairLink.href = `/repair.html?token=${encodeURIComponent(token)}`;
          }
        } else {
          statusEl.textContent = st.status === 'running' ? 'Signing in on server…' : 'Status: ' + (st.status || '…');
        }
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message;
    }
    linkedInLoginPoll = setTimeout(tick, 1200);
  };
  tick();
}

function bindConnectInvitesWarn() {
  const input = document.getElementById('connectInvitesPerRun');
  const warn = document.getElementById('connectInvitesWarn');
  if (!input || !warn) return;
  const refresh = () => {
    const n = Number(input.value);
    warn.classList.toggle('field-warn--high', Number.isFinite(n) && n > 15);
  };
  input.addEventListener('input', refresh);
  refresh();
}

/** Dashboard ↔ LinkedIn "Connection invites per Stage A" in sync. */
function bindConnectInvitesAutosave() {
  const inputs = [
    document.getElementById('dashConnectInvites'),
    document.getElementById('connectInvitesPerRun'),
  ].filter(Boolean);
  if (!inputs.length) return;

  const updateWarn = (raw) => {
    const n = Number(raw);
    const warn = document.getElementById('connectInvitesWarn');
    if (warn) warn.classList.toggle('field-warn--high', Number.isFinite(n) && n > 15);
  };

  const syncPeers = (source, raw) => {
    inputs.forEach((el) => {
      if (el === source || document.activeElement === el) return;
      if (el.value !== raw) el.value = raw;
    });
  };

  const normalize = (raw) => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(10, Math.round(n)));
  };

  const applySaved = (n) => {
    if (!settings.linkedin) settings.linkedin = {};
    settings.linkedin.connectMaxPerRun = n;
    inputs.forEach((el) => {
      if (document.activeElement === el) return;
      const s = String(n);
      if (el.value !== s) el.value = s;
    });
    updateWarn(n);
  };

  const commit = async (input) => {
    let n = normalize(input.value);
    if (n == null) {
      n = Number(settings.linkedin?.connectMaxPerRun) || 2;
    }
    input.value = String(n);
    syncPeers(input, input.value);
    applySaved(n);
    try {
      const data = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ linkedin: { connectMaxPerRun: n } }),
      });
      settings = data.settings;
      if (settings.notifications) notifications = settings.notifications;
      const next = Number(settings.linkedin?.connectMaxPerRun);
      if (Number.isFinite(next)) applySaved(next);
    } catch (e) {
      toast(e.message, true);
    }
  };

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      syncPeers(input, input.value);
      updateWarn(input.value);
    });
    input.addEventListener('change', () => { void commit(input); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });

  updateWarn(settings.linkedin?.connectMaxPerRun ?? inputs[0].value);
}

function bindSyncCapWarn() {
  const input = document.getElementById('syncMaxNew');
  const warn = document.getElementById('syncMaxWarn');
  if (!input || !warn) return;
  const refresh = () => {
    const n = Number(input.value);
    warn.classList.toggle('field-warn--high', Number.isFinite(n) && n > 15);
  };
  input.addEventListener('input', refresh);
  refresh();
}

/** Keep Dashboard ↔ LinkedIn "New leads per cycle" in sync. */
function bindSyncMaxNewAutosave() {
  const inputs = [
    document.getElementById('dashSyncMaxNew'),
    document.getElementById('syncMaxNew'),
  ].filter(Boolean);
  if (!inputs.length) return;

  const maxScroll = Number(settings?.linkedin?.syncMaxScrolls || 80);

  const updateWarn = (raw) => {
    const n = Number(raw);
    const warn = document.getElementById('syncMaxWarn');
    if (warn) warn.classList.toggle('field-warn--high', Number.isFinite(n) && n > 15);
  };

  const syncPeers = (source, raw) => {
    inputs.forEach((el) => {
      if (el === source || document.activeElement === el) return;
      if (el.value !== raw) el.value = raw;
    });
  };

  const normalize = (raw) => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(maxScroll, Math.round(n)));
  };

  const applySaved = (n) => {
    if (!settings.linkedin) settings.linkedin = {};
    settings.linkedin.syncMaxNew = n;
    inputs.forEach((el) => {
      if (document.activeElement === el) return;
      const s = String(n);
      if (el.value !== s) el.value = s;
    });
    updateWarn(n);
  };

  const commit = async (input) => {
    let n = normalize(input.value);
    if (n == null) {
      n = Number(settings.linkedin?.syncMaxNew) || 3;
    }
    input.value = String(n);
    syncPeers(input, input.value);
    applySaved(n);
    try {
      const data = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ linkedin: { syncMaxNew: n } }),
      });
      settings = data.settings;
      if (settings.notifications) notifications = settings.notifications;
      const next = Number(settings.linkedin?.syncMaxNew);
      if (Number.isFinite(next)) applySaved(next);
    } catch (e) {
      toast(e.message, true);
    }
  };

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      syncPeers(input, input.value);
      updateWarn(input.value);
    });
    input.addEventListener('change', () => { void commit(input); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });

  updateWarn(settings.linkedin?.syncMaxNew ?? inputs[0].value);
}

function renderFaq() {
  setPageHeader('FAQ', 'Answers and how H.A.L.O. works');
  titleEl.title = 'FAQ';

  const tiles = [
    {
      id: 'setup',
      cat: 'Getting started',
      q: 'First-time setup',
      short: '5-step guided walkthrough',
      keywords: 'setup onboarding first time start guide linkedin keys',
      openSetup: true,
      body: '',
    },
    {
      id: 'statuses',
      cat: 'CRM',
      q: 'CRM statuses',
      short: 'Lead → Conversation → Active / Lost',
      keywords: 'crm status pipeline lead conversation active lost proposal',
      body: `<ul>
        <li><strong>Lead😴</strong> — invite sent / waiting, or accepted and in enrich+ice (before first DM).</li>
        <li><strong>Conversation 💬</strong> — ice DM already sent; Stage B watches the thread.</li>
        <li><strong>Active ✅</strong> — sales outcome met (e.g. call booked).</li>
        <li><strong>Lost❌</strong> — dead / declined / silence path.</li>
      </ul>`,
    },
    {
      id: 'session',
      cat: 'LinkedIn',
      q: 'Session died?',
      short: 'Re-sign in; do not browse in parallel',
      keywords: 'session linkedin login cookie died inactive sign in',
      body: `<p>Open <strong>LinkedIn</strong> in the dashboard and sign in again (email/password + app approval if asked).</p>
        <p><strong>Do not</strong> open that LinkedIn account in your personal browser while Stage A/B runs — parallel use is the #1 way to kill <code>li_at</code>.</p>`,
    },
    {
      id: 'cookies',
      cat: 'LinkedIn',
      q: 'li_at keeps dying',
      short: 'Parallel use and long scrolls',
      keywords: 'li_at cookie session kill parallel my network scroll',
      body: `<ul>
        <li>Do not use the same LinkedIn account personally while the VPS agent is running.</li>
        <li>Do not keep Playwright open during Apify enrich (the agent already closes the browser).</li>
        <li>Do not open public <code>/in/</code> profiles or mwlite for DM — desktop messaging only.</li>
        <li>After pasting EditThisCookie JSON, close the LinkedIn tab immediately.</li>
      </ul>`,
    },
    {
      id: 'acceptance',
      cat: 'Stage A',
      q: 'How accepts are detected',
      short: 'Profile link first, then My Network',
      keywords: 'acceptance accept connect lead sleep my connections profile link manual lead',
      body: `<p>Each Stage A opens each <strong>Lead😴</strong> CRM <strong>Link</strong> and reads Connect / Pending / Message on the profile card. Accepted → stay <strong>Lead😴</strong> and run enrich + ice, then move to <strong>Conversation 💬</strong>.</p>
        <p>If some remain unchecked, My Connections (Recently added) is a fallback (scroll capped). Manual <strong>+ Lead</strong> with only a Link works the same: already connected → enrich/ice next run; Connect still available → invite sent (uses invite budget).</p>`,
    },
    {
      id: 'stage-a',
      cat: 'Stage A',
      q: 'Stage A not sending?',
      short: 'Session, toggle, enrich, limits',
      keywords: 'stage a ice dm send enrich invite limit',
      body: `<ul>
        <li>LinkedIn session must be green.</li>
        <li>Stage A toggle on; LinkedIn channel on; outreach not paused.</li>
        <li>Lead must be messageable <strong>Lead😴</strong> (accepted) with a real ice-breaker.</li>
        <li>Connection-invite caps and LinkedIn daily limits still apply.</li>
      </ul>`,
    },
    {
      id: 'stage-b',
      cat: 'Stage B',
      q: 'Stage B / inbox',
      short: 'Unread replies; ads skipped',
      keywords: 'stage b inbox reply silence unread',
      body: `<p>Stage B checks existing chats on your interval. Real lead replies get LLM answers; sponsored threads are skipped.</p>
        <p>If idle: confirm Stage B is on, session is alive, and there are Conversation 💬 leads with threads.</p>`,
    },
    {
      id: 'save-restart',
      cat: 'Dashboard',
      q: 'Save vs restart',
      short: 'Save = next run · Restart = now',
      keywords: 'save restart apply settings cycle',
      body: `<p><strong>Save</strong> writes settings for the next scheduled run.</p>
        <p><strong>Save and restart</strong> restarts the agent so stages can run immediately.</p>`,
    },
    {
      id: 'telegram',
      cat: 'Integrations',
      q: 'Telegram alerts',
      short: 'Start bot → paste Chat ID',
      keywords: 'telegram bot chat id notify waffi',
      body: `<p>Open <a href="https://t.me/notioncalen_bot" target="_blank" rel="noopener">@notioncalen_bot</a>, tap <strong>Start</strong>, paste Chat ID under Profile → Integrations → Telegram, then Save.</p>`,
    },
    {
      id: 'book-a-call',
      cat: 'Sales Brain',
      q: 'Book a call outcome',
      short: 'Slots → Active; calendar invite link',
      keywords: 'book a call calendar meet google availability slot active outcome',
      body: `<p>Outcome <strong>Book a call</strong> opens availability (pencil on the card). Paint half-hour blocks you’re free — empty day = free 24h, full day = busy.</p>
        <p>When a lead wants a call, the brain proposes only precomputed slots in the <strong>lead’s timezone</strong>. Soft “yes to a call” stays Conversation 💬. After they accept a concrete slot → <strong>Active ✅</strong>.</p>
        <p>Optional <strong>Google Meet room URL</strong> lives in the availability popup (above the week grid). After accept, the lead gets a <em>calendar invite</em> link (Meet is inside the event if you set a room). Telegram / dashboard notice: lead name, time in <strong>your</strong> timezone, and the same add-to-calendar link.</p>
        <p>Dry-run gate: <code>node scripts/test-book-a-call-flow.js</code> (add <code>--live</code> for one real LLM reply).</p>`,
    },
    {
      id: 'google-calendar',
      cat: 'Sales Brain',
      q: 'Google Meet for Book a call',
      short: 'Meet URL in availability popup',
      keywords: 'google calendar meet oauth refresh token event room book a call',
      body: `<p>Brain → Book a call ⚙ → paste your standing <strong>Meet room URL</strong> (optional). No Calendar OAuth.</p>
        <p>When a lead hits <strong>Active ✅</strong>, Telegram shows their name, the call time in your timezone, and an add-to-calendar link (ICS with reminders when the public dashboard URL is set).</p>`,
    },
    {
      id: 'supabase',
      cat: 'Integrations',
      q: 'Supabase paused?',
      short: 'Free tier sleeps after ~7 days',
      keywords: 'supabase pause wake keepalive crm empty',
      body: `<p>If stages are off (or intervals &gt; 7 days), Pause guard sends a read-only wake ping every ~5 days.</p>
        <p>If CRM looks empty after a long pause, wake the project in Supabase once, then refresh HALO.</p>`,
    },
    {
      id: 'apify',
      cat: 'Stage A',
      q: 'Apify / enrich',
      short: 'Included with HALO — no setup',
      keywords: 'apify enrich quota token scrape profile',
      body: `<p>Stage A enrich uses a shared Apify pool (HALO platform) for profile context, location, email (if available), and ice-breaker inputs. You do not configure Apify tokens.</p>
        <p>If enrich fails with quota errors, contact WAFFi support — we rotate additional Apify accounts server-side.</p>`,
    },
    {
      id: 'brain',
      cat: 'Sales Brain',
      q: 'Brain vs prompts',
      short: 'Portrait steers · prompts write',
      keywords: 'brain sales portrait outcome prompts learning',
      body: `<p><strong>Sales</strong> (portrait, filters, outcome) steers targeting and Active/Lost.</p>
        <p>For <strong>Book a call</strong>, see the FAQ tile “Book a call outcome” (slots + optional Meet URL in the availability popup).</p>
        <p>Prompt files shape wording. Learning notes improve future copy from CRM outcomes.</p>`,
    },
  ];

  const tileHtml = (t) => `<button type="button" class="faq-tile" role="listitem" data-faq-id="${escapeAttr(t.id)}" data-faq-keys="${escapeAttr(`${t.cat} ${t.q} ${t.short} ${t.keywords || ''}`)}" aria-haspopup="${t.openSetup ? 'false' : 'dialog'}">
            <span class="faq-tile-cat">${escapeHtml(t.cat)}</span>
            <span class="faq-tile-q">${escapeHtml(t.q)}</span>
            <span class="faq-tile-short muted">${escapeHtml(t.short)}</span>
          </button>`;

  view.innerHTML = `
    <div class="faq-page">
      <div class="faq-search-wrap">
        <input type="search" id="faq-search" class="faq-search" placeholder="Search topics…" autocomplete="off" aria-label="Search FAQ" />
      </div>
      <div class="faq-grid" role="list" id="faq-grid">
        ${tiles.map(tileHtml).join('')}
      </div>
      <p class="faq-empty muted hidden" id="faq-empty">No topics match that search.</p>
      <div id="faq-modal" class="faq-modal hidden" aria-hidden="true">
        <div class="faq-modal-backdrop" data-faq-close></div>
        <div class="faq-modal-panel" role="dialog" aria-modal="true" aria-labelledby="faq-modal-title">
          <header class="faq-modal-head">
            <div>
              <p class="faq-modal-cat muted" id="faq-modal-cat"></p>
              <h3 id="faq-modal-title"></h3>
            </div>
            <button type="button" class="ob-close" data-faq-close aria-label="Close">×</button>
          </header>
          <div class="faq-modal-body" id="faq-modal-body"></div>
        </div>
      </div>
    </div>`;

  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
  const modal = document.getElementById('faq-modal');
  const openFaq = (id) => {
    const t = byId[id];
    if (!t) return;
    if (t.openSetup) {
      if (typeof window.haloOpenSetupGuide === 'function') window.haloOpenSetupGuide();
      else toast('Setup guide loading…', false, 2000);
      return;
    }
    if (!modal) return;
    document.getElementById('faq-modal-cat').textContent = t.cat;
    document.getElementById('faq-modal-title').textContent = t.q;
    document.getElementById('faq-modal-body').innerHTML = t.body;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  };
  const closeFaq = () => {
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
  };
  view.querySelectorAll('[data-faq-id]').forEach((btn) => {
    btn.addEventListener('click', () => openFaq(btn.dataset.faqId));
  });
  view.querySelectorAll('[data-faq-close]').forEach((el) => {
    el.addEventListener('click', closeFaq);
  });

  const search = document.getElementById('faq-search');
  const empty = document.getElementById('faq-empty');
  const filterTiles = () => {
    const q = String(search?.value || '')
      .trim()
      .toLowerCase();
    let visible = 0;
    view.querySelectorAll('.faq-tile').forEach((btn) => {
      const hay = String(btn.dataset.faqKeys || '').toLowerCase();
      const show = !q || q.split(/\s+/).every((w) => hay.includes(w));
      btn.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    empty?.classList.toggle('hidden', visible > 0);
  };
  search?.addEventListener('input', filterTiles);

  const onEsc = (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeFaq();
  };
  document.addEventListener('keydown', onEsc);
  view._faqCleanup = () => document.removeEventListener('keydown', onEsc);
}

function formatSupportTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function resizeSupportInput(el = supportInput) {
  if (!el) return;
  el.style.height = 'auto';
  const next = Math.min(132, Math.max(38, el.scrollHeight));
  el.style.height = `${next}px`;
}

const supportPanel = document.getElementById('support-panel');
const supportBackdrop = document.getElementById('support-backdrop');
const supportMessagesEl = document.getElementById('support-messages');
const supportForm = document.getElementById('support-form');
const supportInput = document.getElementById('support-input');
const supportFab = document.getElementById('btn-support-fab');
const supportFabDot = document.getElementById('support-fab-dot');

let supportOpen = false;
let supportWorkspaceId = '';
/** @type {EventSource | null} */
let supportEs = null;
let supportPollTimer = null;
let supportBadgeTimer = null;
const supportSeenIds = new Set();

function setSupportFabUnread(on) {
  supportFabDot?.classList.toggle('hidden', !on);
  if (haloMe) haloMe.userUnreadSupport = !!on;
}

async function refreshSupportFabBadge() {
  try {
    const data = await api('/api/support/status');
    setSupportFabUnread(data.unreadFromSupport === true);
  } catch {
    /* ignore when signed out */
  }
}

function stopSupportLive() {
  if (supportEs) {
    try {
      supportEs.close();
    } catch {
      /* ignore */
    }
    supportEs = null;
  }
  if (supportPollTimer) {
    clearInterval(supportPollTimer);
    supportPollTimer = null;
  }
}

/** Poll while chat is open if EventSource fails — no Supabase Realtime required. */
function startSupportPollFallback() {
  if (supportPollTimer || !supportOpen) return;
  supportPollTimer = setInterval(async () => {
    if (!supportOpen) return;
    try {
      const q = supportWorkspaceId ? `?workspaceId=${encodeURIComponent(supportWorkspaceId)}` : '';
      const data = await api(`/api/support/messages${q}`);
      renderSupportMessages(data.messages || []);
    } catch {
      /* ignore */
    }
  }, 20000);
}

function pulseSupportFab() {
  if (!supportFab) return;
  supportFab.classList.remove('is-pressing');
  // reflow so re-click restarts animation
  void supportFab.offsetWidth;
  supportFab.classList.add('is-pressing');
  window.setTimeout(() => supportFab.classList.remove('is-pressing'), 700);
}

function supportAttachmentUrl(m, workspaceId = '') {
  if (!m?.attachment?.url && !m?.id) return '';
  const base = m.attachment?.url || `/api/support/attachment/${m.id}`;
  const ws = String(workspaceId || supportWorkspaceId || adminSelectedWs || '').trim();
  if (!ws) return base;
  return `${base}${base.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(ws)}`;
}

function supportMessageBodyHtml(m, workspaceId = '') {
  const text = m.body ? `<div>${escapeHtml(m.body)}</div>` : '';
  const media = m.attachment
    ? `<a href="${escapeAttr(supportAttachmentUrl(m, workspaceId))}" target="_blank" rel="noopener noreferrer">
        <img class="support-bubble-media" src="${escapeAttr(supportAttachmentUrl(m, workspaceId))}" alt="${escapeAttr(m.attachment.name || 'image')}" loading="lazy" />
      </a>`
    : '';
  return `${media}${text}`;
}

const SUPPORT_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** @type {{ mime: string, name: string, base64: string, previewUrl: string } | null} */
let supportPendingImage = null;
/** @type {{ mime: string, name: string, base64: string, previewUrl: string } | null} */
let adminPendingImage = null;

function clearSupportPendingImage() {
  if (supportPendingImage?.previewUrl) URL.revokeObjectURL(supportPendingImage.previewUrl);
  supportPendingImage = null;
  const box = document.getElementById('support-attach-preview');
  if (box) {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
  const input = document.getElementById('support-attach-input');
  if (input) input.value = '';
}

function clearAdminPendingImage() {
  if (adminPendingImage?.previewUrl) URL.revokeObjectURL(adminPendingImage.previewUrl);
  adminPendingImage = null;
  const box = document.getElementById('admin-attach-preview');
  if (box) {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
  const input = document.getElementById('admin-attach-input');
  if (input) input.value = '';
}

function renderAttachPreview(hostId, pending, onClear) {
  const box = document.getElementById(hostId);
  if (!box) return;
  if (!pending) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <img src="${escapeAttr(pending.previewUrl)}" alt="" />
    <span>${escapeHtml(pending.name)} · ${Math.round((pending.base64.length * 0.75) / 1024)} KB</span>
    <button type="button" class="support-attach-clear" title="Remove attachment" aria-label="Remove attachment">×</button>`;
  box.querySelector('.support-attach-clear')?.addEventListener('click', onClear);
}

async function readImageFileAsAttachment(file) {
  if (!file) return null;
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Only image files are allowed');
  }
  if (file.size > SUPPORT_MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${Math.round(SUPPORT_MAX_IMAGE_BYTES / (1024 * 1024))} MB)`);
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return {
    mime: file.type || 'image/jpeg',
    name: file.name || 'image',
    base64: btoa(binary),
    previewUrl: URL.createObjectURL(file),
  };
}

function renderSupportMessages(messages) {
  if (!supportMessagesEl) return;
  const list = Array.isArray(messages) ? messages : [];
  supportSeenIds.clear();
  list.forEach((m) => m?.id && supportSeenIds.add(m.id));
  if (!list.length) {
    supportMessagesEl.innerHTML =
      '<p class="support-empty">No messages yet. Ask anything about H.A.L.O. — we reply here.</p>';
    return;
  }
  supportMessagesEl.innerHTML = list
    .map((m) => {
      const who = m.author === 'support' ? 'Support' : 'You';
      const cls = m.author === 'support' ? 'support' : 'user';
      return `<div class="support-bubble ${cls}" data-id="${escapeAttr(m.id || '')}">
        ${supportMessageBodyHtml(m, supportWorkspaceId)}
        <span class="s-meta">${escapeHtml(who)} · ${escapeHtml(formatSupportTime(m.createdAt))}</span>
      </div>`;
    })
    .join('');
  supportMessagesEl.scrollTop = supportMessagesEl.scrollHeight;
}

function appendSupportMessage(m) {
  if (!m?.id || supportSeenIds.has(m.id) || !supportMessagesEl) return;
  supportSeenIds.add(m.id);
  const empty = supportMessagesEl.querySelector('.support-empty');
  if (empty) empty.remove();
  const who = m.author === 'support' ? 'Support' : 'You';
  const cls = m.author === 'support' ? 'support' : 'user';
  supportMessagesEl.insertAdjacentHTML(
    'beforeend',
    `<div class="support-bubble ${cls}" data-id="${escapeAttr(m.id)}">
      ${supportMessageBodyHtml(m, supportWorkspaceId)}
      <span class="s-meta">${escapeHtml(who)} · ${escapeHtml(formatSupportTime(m.createdAt))}</span>
    </div>`
  );
  supportMessagesEl.scrollTop = supportMessagesEl.scrollHeight;
  if (m.author === 'support' && supportOpen) {
    api('/api/support/mark-read', { method: 'POST', body: '{}' }).catch(() => {});
    setSupportFabUnread(false);
  } else if (m.author === 'support' && !supportOpen) {
    setSupportFabUnread(true);
  }
}

function startSupportLive(workspaceId) {
  stopSupportLive();
  const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  try {
    supportEs = new EventSource(`/api/support/stream${q}`);
    supportEs.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'snapshot') renderSupportMessages(data.messages || []);
        else if (data.type === 'message' && data.message) appendSupportMessage(data.message);
      } catch {
        /* ignore */
      }
    };
    supportEs.onerror = () => {
      if (supportEs) {
        try {
          supportEs.close();
        } catch {
          /* ignore */
        }
        supportEs = null;
      }
      startSupportPollFallback();
    };
  } catch {
    startSupportPollFallback();
  }
}

async function openSupportChat() {
  const ws = String(haloMe?.workspaceId || '').trim();
  supportWorkspaceId = ws;
  const titleEl = document.getElementById('support-title');
  const subEl = document.getElementById('support-sub');
  if (titleEl) titleEl.textContent = 'Support';
  if (subEl) subEl.textContent = 'Chat with WAFFi';

  supportOpen = true;
  supportPanel?.classList.remove('hidden');
  supportBackdrop?.classList.remove('hidden');
  supportFab?.classList.add('is-chat-open');
  setNotifyOpen(false);
  setNavOpen(false);

  api('/api/support/mark-read', { method: 'POST', body: '{}' })
    .then(() => setSupportFabUnread(false))
    .catch(() => {});

  try {
    const data = await api('/api/support/messages');
    renderSupportMessages(data.messages || []);
  } catch (e) {
    if (supportMessagesEl) {
      supportMessagesEl.innerHTML = `<p class="support-empty">${escapeHtml(e.message || 'Failed to load chat')}</p>`;
    }
  }
  startSupportLive(ws);
  resizeSupportInput();
  supportInput?.focus();
}

function closeSupportChat() {
  supportOpen = false;
  supportPanel?.classList.add('hidden');
  supportBackdrop?.classList.add('hidden');
  supportFab?.classList.remove('is-chat-open');
  stopSupportLive();
}

function toggleSupportChat() {
  pulseSupportFab();
  if (supportOpen) closeSupportChat();
  else openSupportChat();
}

async function sendSupportChatMessage(e) {
  e?.preventDefault?.();
  const body = String(supportInput?.value || '').trim();
  const image = supportPendingImage
    ? { mime: supportPendingImage.mime, name: supportPendingImage.name, base64: supportPendingImage.base64 }
    : null;
  if (!body && !image) return;
  const btn = document.getElementById('btn-support-send');
  if (btn) btn.disabled = true;
  try {
    const data = await api('/api/support/messages', {
      method: 'POST',
      body: JSON.stringify({ body, image }),
    });
    if (supportInput) supportInput.value = '';
    resizeSupportInput();
    clearSupportPendingImage();
    if (data.message) appendSupportMessage(data.message);
  } catch (err) {
    toast(err.message || 'Send failed', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderComing(name) {
  setPageHeader(name, `${name} channel — coming soon`);
  titleEl.title = `${name} coming soon`;
  view.innerHTML = `<div class="coming" title="${escapeAttr(name)} not connected yet">
    <svg class="coming-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
    <strong>${name}</strong><br/>Coming soon
    <span class="coming-sub">This channel is being developed and will be available in a future update.</span>
  </div>`;
}

function secretBlockHtml(it) {
  const shown = revealed[it.key];
  const display = shown ? shown : it.secret ? it.masked || (it.set ? '••••••••' : '—') : it.value || '—';
  const problemCls = it.problem ? 'secret-block--problem' : '';
  return `<div class="secret-block ${problemCls}" data-key="${escapeAttr(it.key)}">
    <div class="secret-head">
      <div class="key" title="${escapeAttr(it.label)}">${escapeHtml(it.label)}${it.required ? ' <span class="req-star" title="Required">*</span>' : ''}</div>
      <div class="row secret-actions">
        ${it.secret ? `<button type="button" class="btn ghost btn-sm" data-reveal="${escapeAttr(it.key)}" title="Show or hide secret">${shown ? 'Hide' : 'Show'}</button>
           <button type="button" class="btn ghost btn-sm" data-copy="${escapeAttr(it.key)}" title="Copy secret">Copy</button>` : ''}
        <button type="button" class="btn danger btn-sm" data-remove="${escapeAttr(it.key)}" title="Remove on Save">Remove</button>
      </div>
    </div>
    ${it.problem ? `<div class="secret-problem">${escapeHtml(it.problem)}</div>` : ''}
    <div class="val">${escapeHtml(display)}</div>
    <label class="field" title="Set new value for ${escapeAttr(it.key)}">
      <input type="${it.secret ? 'password' : 'text'}" data-set="${escapeAttr(it.key)}" placeholder="New value" autocomplete="off" />
    </label>
  </div>`;
}

/** Curated models — grouped for dropdowns (Google → OpenAI → Claude → Other). */
const MODEL_GROUP_GOOGLE_GEMINI = {
  label: 'Google Gemini',
  options: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — best quality' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — recommended' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite — fast / cheap' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — extract' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
  ],
};

const MODEL_GROUP_GOOGLE_OR = {
  label: 'Google',
  options: [
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'google/gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { id: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'google/gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  ],
};

const MODEL_GROUP_OPENAI_OR = {
  label: 'OpenAI',
  options: [
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini — recommended' },
    { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'openai/o3-mini', label: 'o3-mini' },
    { id: 'openai/o1-mini', label: 'o1-mini' },
    { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'openai/gpt-4.1-nano', label: 'GPT-4.1 nano' },
  ],
};

const MODEL_GROUP_CLAUDE_OR = {
  label: 'Anthropic Claude',
  options: [
    { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
    { id: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
    { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku — natural tone' },
  ],
};

const MODEL_GROUP_OTHER_OR = {
  label: 'Other',
  options: [
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash — cheapest' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
    { id: 'qwen/qwen3.7-flash', label: 'Qwen 3.7 Flash' },
    { id: 'mistralai/mistral-large', label: 'Mistral Large' },
  ],
};

const GEMINI_MODEL_GROUPS = [MODEL_GROUP_GOOGLE_GEMINI];
const COHERE_MODEL_GROUPS = [
  {
    label: 'Cohere',
    options: [
      { id: 'command-a-03-2025', label: 'command-a-03-2025 — recommended' },
      { id: 'command-r-plus', label: 'command-r-plus' },
      { id: 'command-r', label: 'command-r' },
      { id: 'command-r7b-12-2024', label: 'command-r7b-12-2024' },
      { id: 'command-light', label: 'command-light' },
    ],
  },
];
const FALLBACK_MODEL_GROUPS = [
  MODEL_GROUP_GOOGLE_OR,
  MODEL_GROUP_OPENAI_OR,
  MODEL_GROUP_CLAUDE_OR,
  MODEL_GROUP_OTHER_OR,
];

const APIFY_DEFAULT_ACTOR = 'apimaestro~linkedin-profile-detail';

function apifyActorStoreUrl(actorId = APIFY_DEFAULT_ACTOR) {
  const raw = String(actorId || APIFY_DEFAULT_ACTOR).trim();
  const slug = raw.includes('~') ? raw.replace('~', '/') : raw.replace('/', '~').replace('~', '/');
  if (slug.includes('/')) {
    const [user, name] = slug.split('/');
    return `https://apify.com/${user}/${name}`;
  }
  return `https://apify.com/store`;
}

function flattenModelGroups(groups) {
  return groups.flatMap((g) => g.options);
}

function modelSelectHtml(dataSet, current, groups, fallbackId) {
  const flat = flattenModelGroups(groups);
  const cur = (current || '').trim() || fallbackId || flat[0]?.id || '';
  const known = flat.some((o) => o.id === cur);
  const grouped = groups
    .map(
      (g) =>
        `<optgroup label="${escapeAttr(g.label)}">${g.options
          .map(
            (o) =>
              `<option value="${escapeAttr(o.id)}"${o.id === cur ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
          )
          .join('')}</optgroup>`
    )
    .join('');
  const custom = !known && cur
    ? `<option value="${escapeAttr(cur)}" selected>${escapeHtml(cur)} (current)</option>`
    : '';
  return `<select class="llm-model-select" data-set="${escapeAttr(dataSet)}" title="Choose model">${custom}${grouped}</select>`;
}

const LLM_ROLE_ICONS = {
  researcher:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M14.5 14.5L20 20"/></svg>',
  copywriter:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4l10-10-4-4L4 16v4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M13 6l4 4"/></svg>',
  inspector:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9 12h6"/></svg>',
};

const INTEGRATION_GROUP_INTRO = {
  Telegram:
    'Optional push alerts on your phone — uses the shared WAFFi Telegram bot (no bot setup on your side).',
};

function llmInfoIcon(hint) {
  return `<span class="llm-info" tabindex="0" title="${escapeAttr(hint)}" aria-label="${escapeAttr(hint)}">
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"/></svg>
  </span>`;
}

function llmWarnIcon(title) {
  return `<span class="llm-role-warn" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <path fill="#fff" d="M12 7.25a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1zm0 9.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/>
    </svg>
  </span>`;
}

function llmKeyField(api, label = 'API key') {
  if (!api) return '';
  return `<label class="field" title="${escapeAttr(api.label)}">${label}
    <div class="llm-input-row">
      <input type="password" data-set="${escapeAttr(api.key)}" placeholder="${api.set ? '•••••••• (set)' : 'Paste key'}" autocomplete="off" />
      <button type="button" class="btn ghost btn-sm" data-reveal="${escapeAttr(api.key)}" title="Show">${revealed[api.key] ? 'Hide' : 'Show'}</button>
      <button type="button" class="btn ghost btn-sm" data-copy="${escapeAttr(api.key)}" title="Copy">Copy</button>
      <button type="button" class="btn danger btn-sm" data-remove="${escapeAttr(api.key)}" title="Remove">×</button>
    </div>
    ${revealed[api.key] != null ? `<div class="val">${escapeHtml(revealed[api.key] || '')}</div>` : api.set ? `<div class="val muted">${escapeHtml(api.masked || '••••')}</div>` : ''}
  </label>`;
}

const LLM_ROLE_DEFS = [
  {
    id: 'researcher',
    title: 'Researcher',
    hint: 'Reads lead profiles and threads. Extracts facts, pain points, and angles — never writes the final DM.',
    apiKey: 'GEMINI_API_KEY',
    modelKey: 'GEMINI_RESEARCHER_MODEL',
    modelGroups: GEMINI_MODEL_GROUPS,
    modelDefault: 'gemini-2.0-flash-lite',
    accent: 'researcher',
  },
  {
    id: 'copywriter',
    title: 'Copywriter',
    hint: 'Writes ice-breakers, replies, and follow-ups in your voice using the Researcher brief.',
    apiKey: 'GEMINI_API_KEY_2',
    modelKey: 'GEMINI_COPYWRITER_MODEL',
    modelGroups: GEMINI_MODEL_GROUPS,
    modelDefault: 'gemini-2.5-flash',
    accent: 'copywriter',
  },
  {
    id: 'inspector',
    title: 'Inspector',
    hint: 'Quality gate — checks tone, facts, and compliance before a message is sent.',
    apiKey: 'COHERE_API_KEY',
    modelKey: 'COHERE_MODEL',
    modelGroups: COHERE_MODEL_GROUPS,
    modelDefault: 'command-a-03-2025',
    accent: 'inspector',
  },
];

function renderLlmIntegrationsBody(items) {
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  const health = settings.brainLlmHealth || {};

  const rolesHtml = LLM_ROLE_DEFS.map((role) => {
    const api = byKey[role.apiKey];
    const model = byKey[role.modelKey];
    if (!api) return '';
    const runtimeFail = health[role.id]?.ok === false;
    const problem = api.problem || model?.problem || (runtimeFail ? health[role.id]?.error : null);
  return `<article class="llm-role-card llm-role-${role.accent}${problem ? ' llm-role-error' : ''}" data-llm-role="${role.id}">
      <header class="llm-role-head">
        <span class="llm-role-ico" aria-hidden="true">${LLM_ROLE_ICONS[role.id] || ''}</span>
        <div class="llm-role-head-copy">
          <h4 class="llm-role-title">${escapeHtml(role.title)} ${llmInfoIcon(role.hint)}</h4>
          <p class="llm-role-sub muted">Primary brain role · API key required</p>
        </div>
        ${problem ? llmWarnIcon(problem) : ''}
      </header>
      ${problem ? `<div class="secret-problem">${escapeHtml(problem)}</div>` : ''}
      ${llmKeyField(api)}
      <label class="field">Model
        ${modelSelectHtml(role.modelKey, model?.value, role.modelGroups, role.modelDefault)}
      </label>
    </article>`;
  }).join('');

  const fbKey = byKey.OPENROUTER_API_KEY;
  const fbModel = byKey.OPENROUTER_FALLBACK_MODEL;
  const fallbackHtml =
    fbKey && fbModel
      ? `<article class="llm-role-card llm-role-fallback">
      <header class="llm-role-head">
        <div class="llm-role-head-copy">
          <h4 class="llm-role-title">Shared fallback ${llmInfoIcon('Optional. If any brain role fails, H.A.L.O. retries once with this API key and model.')}</h4>
          <p class="llm-role-sub muted">Optional backup model</p>
        </div>
      </header>
      ${llmKeyField(fbKey, 'Fallback API key')}
      <label class="field">Fallback model
        ${modelSelectHtml('OPENROUTER_FALLBACK_MODEL', fbModel.value, FALLBACK_MODEL_GROUPS, 'google/gemini-2.5-flash')}
      </label>
    </article>`
      : '';

  const hiddenKeys = new Set([
    ...LLM_ROLE_DEFS.flatMap((r) => [r.apiKey, r.modelKey]),
    'OPENROUTER_API_KEY',
    'OPENROUTER_FALLBACK_MODEL',
  ]);
  const extras = items.filter((it) => !hiddenKeys.has(it.key));

  return `<p class="llm-intro muted">Three roles power every message. Each needs its own API key (they can be the same value). Automation stays paused until all three are set.</p>
    <div class="llm-roles-stack">${rolesHtml}</div>
    ${fallbackHtml}
    ${extras.length ? `<div class="llm-extras">${extras.map(secretBlockHtml).join('')}</div>` : ''}`;
}

function renderSupabaseKeepaliveBlock() {
  const ka = settings.supabaseKeepalive;
  if (!ka || ka.reason === 'not_supabase') return '';

  const reasonLabels = {
    agent_covers_crm: 'Agent touches CRM often enough — no wake pings needed.',
    linkedin_channel_off: 'LinkedIn channel is off — automation will not hit Supabase.',
    outreach_paused: 'Outreach is paused — automation will not hit Supabase.',
    both_stages_off: 'Both stages are off — automation will not hit Supabase.',
    both_intervals_over_week: 'Both stage intervals are longer than 7 days.',
    stage_a_interval_over_week: 'Stage A interval is longer than 7 days.',
    stage_b_interval_over_week: 'Stage B interval is longer than 7 days.',
  };
  const reasonText = reasonLabels[ka.reason] || '';

  if (!ka.active) {
    return `<div class="sc-keepalive sc-keepalive-idle muted">
      <p class="sc-keepalive-title">Pause guard</p>
      <p class="sc-keepalive-desc">${escapeHtml(reasonText)}</p>
    </div>`;
  }

  const lastPing = ka.lastPingAt
    ? `Last wake ping: ${new Date(ka.lastPingAt).toLocaleString('en-US')}${ka.lastOk === false ? ' (failed)' : ''}`
    : 'No wake ping yet';
  const nextDue =
    ka.nextPingDue === 'soon'
      ? 'Next ping: soon'
      : ka.nextPingDue
        ? `Next ping: ${new Date(ka.nextPingDue).toLocaleString('en-US')}`
        : '';
  const errLine = ka.lastError ? `<p class="sc-keepalive-err">${escapeHtml(ka.lastError)}</p>` : '';
  const busyLine = ka.automationBusy
    ? '<p class="sc-keepalive-busy muted">Deferred while automation is running.</p>'
    : '';

  return `<div class="sc-keepalive sc-keepalive-active">
    <p class="sc-keepalive-title"><span class="sc-keepalive-dot"></span> Pause guard active</p>
    <p class="sc-keepalive-desc">Free-tier Supabase pauses after ~7 days without traffic. The dashboard sends a read-only ping every ${ka.intervalDays} days when the agent would not touch CRM — no writes, no stage runs.</p>
    <p class="sc-keepalive-meta muted">${escapeHtml(reasonText)}</p>
    <p class="sc-keepalive-meta muted">${escapeHtml(lastPing)}${nextDue ? ` · ${escapeHtml(nextDue)}` : ''}</p>
    ${errLine}
    ${busyLine}
  </div>`;
}

function renderSupabaseIntegrationsBody(items) {
  const configured = settings.crmBackend === 'supabase' && settings.notionConfigured;
  const connectBtn = configured
    ? `<button type="button" class="btn btn-supabase" id="btn-supabase-connect-open" disabled aria-disabled="true" title="CRM already connected">${ICONS.supabase}<span>Connect Supabase</span></button>`
    : `<button type="button" class="btn btn-supabase" id="btn-supabase-connect-open">${ICONS.supabase}<span>Connect Supabase</span></button>`;
  const steps = configured
    ? `<p class="integ-group-intro muted">CRM connected. To rotate keys, edit credentials below and click <strong>Save</strong>.</p>`
    : `<p class="integ-group-intro muted">One wizard covers everything: create the <code>leads</code> table (SQL), paste Project URL + service_role, then Connect CRM. Skipping the SQL step will fail until you run it.</p>`;

  return `<div class="sc-inline-setup">
    ${steps}
    <div class="row section-actions sc-setup-actions">
      ${connectBtn}
    </div>
    ${configured ? '<p class="sc-connected-pill"><span class="sc-connected-dot"></span> Connected</p>' : ''}
    ${configured ? renderSupabaseKeepaliveBlock() : ''}
    <details class="nc-manual-advanced">
      <summary class="muted">Advanced — edit credentials manually (requires Save)</summary>
      <div class="nc-manual-fields">${items.map(secretBlockHtml).join('')}</div>
    </details>
  </div>`;
}

function renderTelegramIntegrationsBody(items) {
  const tg = settings.telegram || {};
  const botUrl = tg.waffiBotUrl || 'https://t.me/notioncalen_bot';
  const botUser = tg.waffiBotUsername || 'notioncalen_bot';
  const botPhoto = tg.botPhotoUrl || '/api/telegram/bot-avatar';
  const botPhotoFallback = tg.botPhotoFallback || '/waffi-telegram-bot.png';
  const chatVal = tg.notifyChat || '';
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  const chatMeta = byKey.TELEGRAM_NOTIFY_CHAT;

  return `<div class="tg-setup">
    <p class="integ-group-intro muted">${INTEGRATION_GROUP_INTRO.Telegram}</p>
    <ol class="tg-setup-steps">
      <li>Open the WAFFi bot in Telegram and tap <strong>Start</strong> — it will reply with your Chat ID.</li>
    </ol>
    <div class="tg-bot-tile">
      <div class="tg-bot-tile-main">
        <img class="tg-bot-avatar" src="${escapeAttr(botPhoto)}" width="48" height="48" alt="" onerror="this.onerror=null;this.src='${escapeAttr(botPhotoFallback)}'" />
        <div class="tg-bot-meta">
          <div class="tg-bot-name">WAFFi</div>
          <div class="tg-bot-handle">@${escapeHtml(botUser)}</div>
        </div>
      </div>
      <a class="tg-bot-open" href="${escapeAttr(botUrl)}" target="_blank" rel="noopener noreferrer">Open in Telegram</a>
    </div>
    <ol class="tg-setup-steps tg-setup-steps-second" start="2">
      <li>Paste your Chat ID below and click <strong>Save</strong> in the top bar.</li>
    </ol>
    <label class="field tg-chat-field" title="Telegram Chat ID">
      <span class="field-label">Chat ID</span>
      <input type="text" data-set="TELEGRAM_NOTIFY_CHAT" placeholder="e.g. 123456789" value="${escapeAttr(chatVal)}" autocomplete="off" inputmode="numeric" />
      <span class="field-hint tg-chat-hint">The bot sent this number to you in Telegram right after Start.</span>
    </label>
    ${chatMeta?.problem ? `<div class="secret-problem">${escapeHtml(chatMeta.problem)}</div>` : ''}
    ${chatVal ? '<p class="tg-connected-pill"><span class="sc-connected-dot"></span> Notifications connected</p>' : ''}
  </div>`;
}

function profileTileFromHash() {
  const hash = (location.hash || '').replace(/^#/, '');
  if (hash === 'integrations' || hash === 'profile-integrations') return 'integrations';
  if (hash === 'billing' || hash === 'profile-billing') return 'billing';
  if (hash === 'general' || hash === 'profile-general') return 'general';
  if (hash === 'admin' || hash === 'profile-admin') return 'admin';
  return '';
}

function getHaloTheme() {
  try {
    return localStorage.getItem('halo_theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyHaloTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.documentElement.style.colorScheme = next;
  try {
    localStorage.setItem('halo_theme', next);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'light' ? '#f2f4f7' : '#090b0e';
}

function openProfileSection(id) {
  openProfileTile = id || '';
  if (id) location.hash = `profile-${id}`;
  else if (/^#?(profile-)?(general|integrations|billing|admin)$/.test(location.hash || '')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  renderProfile();
}

function renderProfile() {
  const section = openProfileTile || profileTileFromHash();
  openProfileTile = section;
  const titles = {
    general: ['General', 'Account details for this cabinet'],
    integrations: ['Integrations', 'API keys, LLM, Telegram'],
    billing: ['Billing', 'Trial, subscription, and Stripe'],
    admin: ['Admin', 'HALO cabinets, leads, and support inbox'],
  };
  if (section && titles[section]) setPageHeader(titles[section][0], titles[section][1]);
  else setPageHeader('Profile', 'Account, billing, and integrations');
  titleEl.title = section && titles[section] ? titles[section][1] : 'Account, billing, and integrations';
  view.innerHTML = `<div class="card"><p class="muted">Loading account…</p></div>`;
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((me) => {
      if (!me?.ok) {
        view.innerHTML = `<div class="card"><p class="muted">Sign in required. <a href="/login.html">Sign in</a></p></div>`;
        return;
      }
      const t = me.tenant || {};
      const limit = t.trialLeadLimit || 50;
      const leads = me.leadCount || 0;
      const status = t.subscriptionStatus || 'trial';
      const trialEnded = me.trialEnded === true;
      const integProblem = settings?.integrationsHasProblem === true;
      const displayName = String(t.displayName || '').trim();
      const showAdmin = me.isWaffiAdmin === true;

      const backBtn = `
        <button type="button" class="profile-back" id="btn-profile-back" aria-label="Back to Profile">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14.7 6.3a1 1 0 0 1 0 1.4L10.4 12l4.3 4.3a1 1 0 1 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0z"/></svg>
          <span>Back to Profile</span>
        </button>`;

      const wireBillingAndLogout = () => {
        document.getElementById('btn-stripe-checkout')?.addEventListener('click', async () => {
          try {
            const data = await api('/api/billing/checkout', { method: 'POST', body: '{}' });
            if (data.url) location.href = data.url;
            else toast(data.error || 'Stripe not configured', true);
          } catch (e) {
            toast(e.message, true);
          }
        });
        document.getElementById('btn-stripe-portal')?.addEventListener('click', async () => {
          try {
            const data = await api('/api/billing/portal', { method: 'POST', body: '{}' });
            if (data.url) location.href = data.url;
            else toast(data.error || 'Stripe not configured', true);
          } catch (e) {
            toast(e.message, true);
          }
        });
        document.getElementById('btn-logout-cabinet')?.addEventListener('click', async () => {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
          location.href = '/login.html';
        });
        api('/api/billing/status')
          .then((st) => {
            const hint = document.getElementById('stripe-billing-hint');
            if (!hint) return;
            hint.textContent = st.configured
              ? 'Stripe is configured — Subscribe opens Checkout; Manage opens Customer Portal.'
              : 'Stripe not configured yet. Add STRIPE_SECRET_KEY + STRIPE_PRICE_ID (+ optional STRIPE_WEBHOOK_SECRET) to VPS .env, then restart dashboard.';
          })
          .catch(() => {});
      };

      if (section === 'general' || section === 'integrations' || section === 'billing' || section === 'admin') {
        if (section === 'admin' && !showAdmin) {
          view.innerHTML = `<div class="card"><p class="muted">Admin is only available on the WAFFi cabinet.</p></div>`;
          return;
        }
        const generalBody = `
          <div class="grid-2" style="gap:12px">
            <div><span class="muted">Name</span><div>${escapeHtml(displayName || '—')}</div></div>
            <div><span class="muted">Email</span><div>${escapeHtml(t.email || '')}</div></div>
            <div><span class="muted">Company</span><div>${escapeHtml(t.company || '—')}</div></div>
            <div><span class="muted">Workspace</span><div><code>${escapeHtml(t.workspaceId || '')}</code></div></div>
            <div><span class="muted">Role</span><div>${escapeHtml(t.role || 'user')}</div></div>
          </div>
          <div class="theme-toggle-row" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
            <div class="tile-compact-head" style="margin:0">
              <div>
                <h3 style="margin:0;font-size:0.95rem">Appearance</h3>
                <p class="hint" style="margin:4px 0 0">Light theme for the whole H.A.L.O. dashboard</p>
              </div>
              ${switchEl('halo-theme-light', getHaloTheme() === 'light', 'Use light theme')}
            </div>
          </div>
          <div style="margin-top:16px">
            <button type="button" class="btn ghost" id="btn-logout-cabinet">Sign out of cabinet</button>
          </div>`;
        const billingBody = `
          <p class="muted card-lead">Trial includes ${limit} CRM leads. Status: <strong>${escapeHtml(status)}</strong>${trialEnded ? ' · trial limit reached' : ''}.</p>
          <p style="margin:10px 0 16px">Leads in this cabinet: <strong>${leads}</strong> / ${status === 'active' ? '∞' : limit}</p>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <button type="button" class="btn" id="btn-stripe-checkout">Subscribe with Stripe</button>
            <button type="button" class="btn ghost" id="btn-stripe-portal">Manage billing</button>
          </div>
          <p class="muted" id="stripe-billing-hint" style="margin-top:12px;font-size:0.82rem">Stripe keys are not required yet — buttons show a clear message until you add them to .env.</p>`;
        const body =
          section === 'general'
            ? generalBody
            : section === 'billing'
              ? billingBody
              : section === 'admin'
                ? `<div id="profile-admin-body"><p class="muted">Loading cabinets…</p></div>`
                : `<div id="profile-integrations-body" class="profile-integrations-page"></div>`;
        const wide = section === 'integrations' || section === 'admin';
        view.innerHTML = `
          <div class="profile-page${wide ? ' profile-page-wide' : ''}">
            ${backBtn}
            <div class="profile-page-card card${wide ? ' profile-page-card-flush' : ''}">${body}</div>
          </div>`;
        document.getElementById('btn-profile-back')?.addEventListener('click', () => openProfileSection(''));
        if (section === 'integrations') {
          const host = document.getElementById('profile-integrations-body');
          if (host) {
            host.innerHTML = buildIntegrationsMarkup();
            wireIntegrationsUi(host);
          }
        } else if (section === 'admin') {
          renderAdminPanel(document.getElementById('profile-admin-body'));
        } else {
          wireBillingAndLogout();
          const themeSw = document.getElementById('halo-theme-light');
          if (themeSw) {
            themeSw.onchange = () => {
              applyHaloTheme(themeSw.checked ? 'light' : 'dark');
              toast(themeSw.checked ? 'Light theme on' : 'Dark theme on');
            };
          }
        }
        return;
      }

      const tileBtn = (id, label, icon, hint, extraWarn = false) => {
        const warn =
          (id === 'integrations' && integProblem) || extraWarn
            ? `<span class="integ-warn profile-tile-warn" title="Needs attention"><svg class="integ-warn-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path fill="#fff" d="M12 7.25a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1zm0 9.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg></span>`
            : '';
        return `
        <button type="button" class="profile-tile profile-tile-link" data-profile-tile="${id}">
          <span class="profile-tile-ico" aria-hidden="true">${icon}</span>
          <span class="profile-tile-meta">
            <span class="profile-tile-title">${escapeHtml(label)}</span>
            <span class="profile-tile-hint muted">${escapeHtml(hint)}</span>
          </span>
          ${warn}
          <span class="profile-tile-chevron" aria-hidden="true"></span>
        </button>`;
      };

      view.innerHTML = `
        <div class="profile-tiles" id="profile-tiles">
          ${tileBtn('general', 'General', ICONS.general, 'Account details for this cabinet')}
          ${tileBtn('integrations', 'Integrations', ICONS.integrations, 'API keys, LLM, Telegram')}
          ${tileBtn('billing', 'Billing', ICONS.billing, 'Trial, subscription, and Stripe')}
          ${showAdmin ? tileBtn('admin', 'Admin', ICONS.admin, 'Cabinets, leads, and support inbox') : ''}
        </div>`;

      view.querySelectorAll('[data-profile-tile]').forEach((el) => {
        el.addEventListener('click', () => openProfileSection(el.dataset.profileTile));
      });
    })
    .catch((e) => {
      view.innerHTML = `<div class="card"><p class="muted">${escapeHtml(e.message)}</p></div>`;
    });
}

let adminSelectedWs = '';
let adminPollTimer = null;
const adminSeenIds = new Set();

function stopAdminChatLive() {
  if (adminPollTimer) {
    clearInterval(adminPollTimer);
    adminPollTimer = null;
  }
}

function formatAdminSubStatus(status) {
  const s = String(status || 'trial').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'past_due') return 'Past due';
  if (s === 'canceled') return 'Canceled';
  return 'Trial';
}

function wireAdminMessageDeletes(host) {
  if (!host) return;
  host.querySelectorAll('[data-admin-del-msg]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-admin-del-msg');
      if (!id) return;
      if (!window.confirm('Delete this message permanently from Supabase?')) return;
      try {
        await api(`/api/admin/support/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
        adminSeenIds.delete(id);
        btn.closest('.admin-msg-row')?.remove();
        if (host && !host.querySelector('.admin-msg-row')) {
          host.innerHTML = '<p class="support-empty">No messages yet in this cabinet thread.</p>';
        }
      } catch (err) {
        toast(err.message || 'Delete failed', true);
      }
    });
  });
}

function renderAdminMessages(host, messages) {
  if (!host) return;
  const list = Array.isArray(messages) ? messages : [];
  adminSeenIds.clear();
  list.forEach((m) => m?.id && adminSeenIds.add(m.id));
  if (!list.length) {
    host.innerHTML = '<p class="support-empty">No messages yet in this cabinet thread.</p>';
    return;
  }
  host.innerHTML = list.map((m) => adminMessageHtml(m)).join('');
  host.scrollTop = host.scrollHeight;
  wireAdminMessageDeletes(host);
}

function updateAdminDeleteButton() {
  const btn = document.getElementById('btn-admin-delete-cabinets');
  if (!btn) return;
  const n = document.querySelectorAll('#admin-list-browse input[data-admin-check]:checked').length;
  btn.classList.toggle('hidden', n === 0);
  btn.disabled = n === 0;
  btn.textContent = n ? `Delete selected (${n})` : 'Delete selected';
}

function showAdminCabinetList() {
  document.getElementById('admin-cabinet-list')?.classList.remove('is-focus-mode');
  adminSelectedWs = '';
  stopAdminChatLive();
  clearAdminPendingImage();
  const title = document.getElementById('admin-chat-title');
  const sub = document.getElementById('admin-chat-sub');
  const box = document.getElementById('admin-chat-messages');
  if (title) title.textContent = 'Select a cabinet';
  if (sub) sub.textContent = 'Open a user to view history and reply';
  if (box) box.innerHTML = '<p class="support-empty">Pick a cabinet on the left to open support chat.</p>';
}

function fillAdminFocusCard(meta = {}) {
  const host = document.getElementById('admin-focus-body');
  if (!host) return;
  host.innerHTML = `
    <h3>${escapeHtml(meta.displayName || meta.email || meta.workspaceId || 'Cabinet')}</h3>
    <div class="admin-focus-meta muted">${escapeHtml(meta.email || '—')}</div>
    <div class="admin-focus-meta"><code>${escapeHtml(meta.workspaceId || '')}</code></div>
    <div class="admin-focus-stats">
      <span class="admin-pill admin-pill-${escapeAttr(String(meta.subscriptionStatus || 'trial'))}">${escapeHtml(formatAdminSubStatus(meta.subscriptionStatus))}</span>
      <span class="admin-cabinet-leads">${Number(meta.leadCount) || 0} leads</span>
      ${meta.isDefault ? '<span class="muted">WAFFi</span>' : ''}
    </div>
    ${meta.problem ? `<div class="admin-problem">${escapeHtml(meta.problem)}</div>` : ''}
    ${
      meta.lastPreview
        ? `<div class="admin-cabinet-preview muted">Last: ${meta.lastPreview}</div>`
        : '<div class="muted" style="font-size:0.78rem">No messages yet</div>'
    }
  `;
}

function adminMessageHtml(m) {
  const who = m.author === 'support' ? 'You (support)' : 'User';
  const cls = m.author === 'support' ? 'support' : 'user';
  return `<div class="support-bubble ${cls} admin-msg-row" data-id="${escapeAttr(m.id || '')}">
    <button type="button" class="admin-msg-del" data-admin-del-msg="${escapeAttr(m.id || '')}" title="Delete message" aria-label="Delete message">×</button>
    ${supportMessageBodyHtml(m, adminSelectedWs)}
    <span class="s-meta">${escapeHtml(who)} · ${escapeHtml(formatSupportTime(m.createdAt))}</span>
  </div>`;
}

async function openAdminCabinetChat(workspaceId, meta = {}) {
  const ws = String(workspaceId || '').trim();
  if (!ws) return;
  adminSelectedWs = ws;
  document.getElementById('admin-cabinet-list')?.classList.add('is-focus-mode');
  fillAdminFocusCard(meta);
  const title = document.getElementById('admin-chat-title');
  const sub = document.getElementById('admin-chat-sub');
  const box = document.getElementById('admin-chat-messages');
  if (title) title.textContent = meta.displayName || meta.email || ws;
  if (sub) sub.textContent = `${meta.email || '—'} · ${ws}`;
  stopAdminChatLive();
  try {
    await api('/api/admin/support/mark-read', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: ws }),
    });
  } catch {
    /* ignore */
  }
  try {
    const data = await api(`/api/support/messages?workspaceId=${encodeURIComponent(ws)}`);
    renderAdminMessages(box, data.messages || []);
  } catch (e) {
    if (box) box.innerHTML = `<p class="support-empty">${escapeHtml(e.message || 'Failed to load chat')}</p>`;
  }
  adminPollTimer = setInterval(async () => {
    if (!adminSelectedWs) return;
    try {
      const data = await api(`/api/support/messages?workspaceId=${encodeURIComponent(adminSelectedWs)}`);
      renderAdminMessages(box, data.messages || []);
    } catch {
      /* ignore */
    }
  }, 8000);
  document.getElementById('admin-chat-input')?.focus();
}

async function sendAdminChatMessage(e) {
  e?.preventDefault?.();
  const ws = adminSelectedWs;
  const input = document.getElementById('admin-chat-input');
  const body = String(input?.value || '').trim();
  const image = adminPendingImage
    ? { mime: adminPendingImage.mime, name: adminPendingImage.name, base64: adminPendingImage.base64 }
    : null;
  if (!ws || (!body && !image)) return;
  const btn = document.getElementById('btn-admin-send');
  if (btn) btn.disabled = true;
  try {
    const data = await api('/api/support/messages', {
      method: 'POST',
      body: JSON.stringify({ body, workspaceId: ws, image }),
    });
    if (input) {
      input.value = '';
      resizeSupportInput(input);
    }
    clearAdminPendingImage();
    if (data.message) {
      const box = document.getElementById('admin-chat-messages');
      if (box && data.message.id && !adminSeenIds.has(data.message.id)) {
        adminSeenIds.add(data.message.id);
        const empty = box.querySelector('.support-empty');
        if (empty) empty.remove();
        box.insertAdjacentHTML('beforeend', adminMessageHtml(data.message));
        wireAdminMessageDeletes(box);
        box.scrollTop = box.scrollHeight;
      }
    }
  } catch (err) {
    toast(err.message || 'Send failed', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteSelectedAdminCabinets(host) {
  const checked = [...document.querySelectorAll('#admin-list-browse input[data-admin-check]:checked')];
  const ids = checked.map((el) => el.value).filter(Boolean);
  if (!ids.length) return;
  const labels = checked
    .map((el) => el.closest('.admin-cabinet-row')?.dataset?.name || el.value)
    .slice(0, 8)
    .join(', ');
  const more = ids.length > 8 ? ` (+${ids.length - 8} more)` : '';
  if (
    !window.confirm(
      `Permanently delete ${ids.length} cabinet(s)?\n\n${labels}${more}\n\nThis removes the tenant, all their leads, and support chat history. WAFFi (default) cannot be deleted.`
    )
  ) {
    return;
  }
  try {
    const out = await api('/api/admin/cabinets/delete', {
      method: 'POST',
      body: JSON.stringify({ workspaceIds: ids }),
    });
    toast(`Deleted ${out.deleted?.length || ids.length} cabinet(s)`);
    if (ids.includes(adminSelectedWs)) {
      adminSelectedWs = '';
      stopAdminChatLive();
    }
    await renderAdminPanel(host);
  } catch (err) {
    toast(err.message || 'Delete failed', true);
  }
}

async function renderAdminPanel(host) {
  if (!host) return;
  stopAdminChatLive();
  adminSelectedWs = '';
  clearAdminPendingImage();
  host.innerHTML = '<p class="muted">Loading cabinets…</p>';
  try {
    const data = await api('/api/admin/overview');
    const cabinets = data.cabinets || [];
    const rows = cabinets
      .map((c) => {
        const name = c.displayName || c.email || c.workspaceId;
        const preview = c.lastMessage?.body
          ? escapeHtml(String(c.lastMessage.body).slice(0, 90))
          : c.lastMessage?.attachment
            ? '<span class="muted">[image]</span>'
            : '<span class="muted">No messages yet</span>';
        const problem = c.hasProblem
          ? `<div class="admin-problem">${escapeHtml(c.problem)}</div>`
          : '';
        const locked = c.isDefault === true;
        const meta = encodeURIComponent(
          JSON.stringify({
            displayName: name,
            email: c.email || '',
            workspaceId: c.workspaceId,
            subscriptionStatus: c.subscriptionStatus || 'trial',
            leadCount: Number(c.leadCount) || 0,
            isDefault: !!c.isDefault,
            problem: c.problem || '',
            lastPreview: c.lastMessage?.body
              ? String(c.lastMessage.body).slice(0, 90)
              : c.lastMessage?.attachment
                ? '[image]'
                : '',
          })
        );
        return `<div class="admin-cabinet-row${c.unreadFromUser ? ' is-unread' : ''}" data-ws="${escapeAttr(c.workspaceId)}" data-email="${escapeAttr(c.email || '')}" data-name="${escapeAttr(name)}" data-meta="${meta}">
          <label class="admin-cabinet-check" title="${locked ? 'WAFFi cabinet cannot be deleted' : 'Select cabinet'}">
            <input type="checkbox" data-admin-check value="${escapeAttr(c.workspaceId)}" ${locked ? 'disabled' : ''} />
          </label>
          <button type="button" class="admin-cabinet-hit" data-admin-open="${escapeAttr(c.workspaceId)}">
            <span class="admin-unread-dot${c.unreadFromUser ? '' : ' hidden'}" aria-hidden="true"></span>
            <span class="admin-cabinet-compact">
              <strong>${escapeHtml(name)}</strong>
              <span class="admin-pill admin-pill-${escapeAttr(String(c.subscriptionStatus || 'trial'))}">${escapeHtml(formatAdminSubStatus(c.subscriptionStatus))}</span>
              <span class="admin-cabinet-leads">${Number(c.leadCount) || 0} leads</span>
            </span>
          </button>
        </div>`;
      })
      .join('');

    host.innerHTML = `
      <div class="admin-panel">
        <div class="admin-stats">
          <div class="admin-stat"><span class="muted">Cabinets</span><strong>${Number(data.totalCabinets) || 0}</strong></div>
          <div class="admin-stat"><span class="muted">Total leads</span><strong>${Number(data.totalLeads) || 0}</strong></div>
          <div class="admin-stat"><span class="muted">Unread chats</span><strong>${Number(data.unreadThreads) || 0}</strong></div>
          <div class="admin-stat"><span class="muted">Problems</span><strong>${Number(data.problemCabinets) || 0}</strong></div>
        </div>
        <div class="admin-split">
          <div class="admin-list" id="admin-cabinet-list">
            <div id="admin-list-browse">
              <div class="admin-list-toolbar">
                <span class="muted" style="font-size:0.78rem">Cabinets</span>
                <button type="button" class="btn danger btn-sm hidden" id="btn-admin-delete-cabinets" disabled>Delete selected</button>
              </div>
              ${rows || '<p class="muted" style="padding:12px">No cabinets yet.</p>'}
            </div>
            <div class="admin-list-focus" id="admin-list-focus">
              <div class="admin-focus-head">
                <button type="button" class="btn ghost btn-sm" id="btn-admin-back-list">← All cabinets</button>
              </div>
              <div class="admin-focus-body" id="admin-focus-body"></div>
            </div>
          </div>
          <div class="admin-chat">
            <div class="admin-chat-head">
              <div>
                <strong id="admin-chat-title">Select a cabinet</strong>
                <div class="muted admin-chat-sub" id="admin-chat-sub">Open a user to view history and reply</div>
              </div>
              <button type="button" class="btn ghost btn-sm" id="btn-admin-refresh">Refresh</button>
            </div>
            <div id="admin-chat-messages" class="admin-chat-messages support-messages">
              <p class="support-empty">Pick a cabinet on the left to open support chat.</p>
            </div>
            <form id="admin-chat-form" class="support-compose admin-compose" autocomplete="off">
              <button type="submit" class="support-send" id="btn-admin-send" title="Send reply" aria-label="Send reply">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="currentColor" d="M3.4 20.6 21 12 3.4 3.4l.1 6.8L15 12 3.5 13.8l-.1 6.8z"/>
                </svg>
              </button>
              <div class="support-compose-main">
                <div id="admin-attach-preview" class="support-attach-preview hidden"></div>
                <div class="support-input-shell">
                  <textarea id="admin-chat-input" rows="1" maxlength="4000" placeholder="Reply to this cabinet…" aria-label="Admin reply"></textarea>
                  <label class="support-attach" title="Attach image" aria-label="Attach image">
                    <input type="file" id="admin-attach-input" accept="image/*" hidden />
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path fill="currentColor" d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1z"/>
                    </svg>
                  </label>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>`;

    host.querySelectorAll('[data-admin-open]').forEach((el) => {
      el.addEventListener('click', () => {
        const row = el.closest('.admin-cabinet-row');
        let meta = {
          email: row?.dataset?.email,
          displayName: row?.dataset?.name,
          workspaceId: el.dataset.adminOpen,
        };
        try {
          meta = { ...meta, ...JSON.parse(decodeURIComponent(row?.dataset?.meta || '{}')) };
        } catch {
          /* ignore */
        }
        openAdminCabinetChat(el.dataset.adminOpen, meta);
      });
    });
    host.querySelectorAll('input[data-admin-check]').forEach((el) => {
      el.addEventListener('click', (e) => e.stopPropagation());
      el.addEventListener('change', updateAdminDeleteButton);
    });
    document.getElementById('btn-admin-back-list')?.addEventListener('click', () => showAdminCabinetList());
    document.getElementById('btn-admin-delete-cabinets')?.addEventListener('click', () =>
      deleteSelectedAdminCabinets(host)
    );
    document.getElementById('btn-admin-refresh')?.addEventListener('click', () => renderAdminPanel(host));
    const form = document.getElementById('admin-chat-form');
    const input = document.getElementById('admin-chat-input');
    form?.addEventListener('submit', sendAdminChatMessage);
    input?.addEventListener('input', () => resizeSupportInput(input));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAdminChatMessage(e);
      }
    });
    document.getElementById('admin-attach-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        adminPendingImage = await readImageFileAsAttachment(file);
        renderAttachPreview('admin-attach-preview', adminPendingImage, clearAdminPendingImage);
      } catch (err) {
        clearAdminPendingImage();
        toast(err.message || 'Could not attach image', true);
      }
    });
    resizeSupportInput(input);
    updateAdminDeleteButton();
  } catch (e) {
    host.innerHTML = `<p class="muted">${escapeHtml(e.message || 'Failed to load admin overview')}</p>`;
  }
}

function buildIntegrationsMarkup() {
  const groups = {};
  for (const item of settings?.integrations || []) {
    // Shared HALO Supabase — tenants do not connect their own project
    if (item.group === 'Supabase') continue;
    (groups[item.group] ||= []).push(item);
  }
  const order = ['LLM', 'Telegram'];
  const groupNames = [
    ...order.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !order.includes(g) && g !== 'Google Calendar' && g !== 'Supabase'),
  ];

  const warnIcon =
    '<svg class="integ-warn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path fill="#fff" d="M12 7.25a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1zm0 9.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>';

  return groupNames
    .map((group) => {
      const items = groups[group] || [];
      const hasProblem = items.some((it) => it.problem);
      const body = renderIntegrationsGroupBody(group, items);
      return `
      <section class="integ-section ${hasProblem ? 'has-problem' : ''}" data-group="${escapeAttr(group)}">
        <div class="integ-section-head">
          <span class="integ-section-left">
            <span class="integ-group-title">${escapeHtml(group)}</span>
            <span class="muted integ-count">${items.length}</span>
          </span>
          ${hasProblem ? `<span class="integ-warn" title="One or more credentials need attention">${warnIcon}</span>` : ''}
        </div>
        <div class="integ-body">${body}</div>
      </section>`;
    })
    .join('');
}

function wireIntegrationsUi(root = view) {
  root.querySelector('#btn-supabase-connect-open')?.addEventListener('click', () => {
    if (root.querySelector('#btn-supabase-connect-open')?.disabled) return;
    window.HaloSupabaseConnect?.openConnect();
  });

  root.querySelectorAll('[data-reveal]').forEach((btn) => {
    btn.onclick = async () => {
      const key = btn.dataset.reveal;
      if (revealed[key]) {
        delete revealed[key];
        render();
        return;
      }
      try {
        const data = await api('/api/secrets/reveal', { method: 'POST', body: JSON.stringify({ key }) });
        revealed[key] = data.value || '';
        render();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
  root.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = async () => {
      const key = btn.dataset.copy;
      try {
        let val = revealed[key];
        if (val == null) {
          const data = await api('/api/secrets/reveal', { method: 'POST', body: JSON.stringify({ key }) });
          val = data.value || '';
          revealed[key] = val;
        }
        await navigator.clipboard.writeText(val);
        toast('Copied');
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
  root.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => {
      btn.dataset.pendingRemove = '1';
      btn.textContent = 'Will remove';
    };
  });
}

function renderIntegrations() {
  // Legacy nav target → Profile → Integrations
  page = 'profile';
  location.hash = '#profile-integrations';
  renderProfile();
}

function renderIntegrationsGroupBody(group, items) {
  if (group === 'LLM') return renderLlmIntegrationsBody(items);
  if (group === 'Telegram') return renderTelegramIntegrationsBody(items);
  if (group === 'Supabase') return renderSupabaseIntegrationsBody(items);
  return items.map(secretBlockHtml).join('');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function collectPatch() {
  const patch = { channels: {}, linkedin: {}, prompts: {}, integrations: {}, removeIntegrationKeys: [] };

  if (page === 'dashboard') {
    const master = document.getElementById('master');
    const stageA = document.getElementById('stageA');
    const stageB = document.getElementById('stageB');
    if (master) patch.masterEnabled = master.checked;
    if (stageA) patch.stageAEnabled = stageA.checked;
    if (stageB) patch.stageBEnabled = stageB.checked;
    const av = document.getElementById('stageAValue');
    const au = document.getElementById('stageAUnit');
    const bv = document.getElementById('stageBValue');
    const bu = document.getElementById('stageBUnit');
    if (av && au) {
      patch.stageAIntervalValue = av.value;
      patch.stageAIntervalUnit = au.value;
    }
    if (bv && bu) {
      patch.stageBIntervalValue = bv.value;
      patch.stageBIntervalUnit = bu.value;
    }
    const sd = document.getElementById('silenceDays');
    const sw = document.getElementById('silenceWeekends');
    if (sd) patch.silenceBusinessDays = sd.value;
    if (sw) patch.silenceSkipWeekends = sw.checked;
    const li = document.getElementById('ch-linkedin');
    const ig = document.getElementById('ch-instagram');
    const fb = document.getElementById('ch-facebook');
    if (li) patch.channels.linkedin = li.checked;
    if (ig) patch.channels.instagram = ig.checked;
    if (fb) patch.channels.facebook = fb.checked;
  }

  if (page === 'brain') {
    const outcomeVal = document.getElementById('brain-outcome')?.value || 'book_a_call';
    const booking = ensureBrainBookingDraft();
    if (outcomeVal === 'book_a_call' && !validateBookingClient(booking).ok) {
      toast('Complete Book a call availability for every weekday first', true);
      openBookCallSettingsModal({ activateOnSave: true });
      return null;
    }
    patch.brain = {
      userPrompt: document.getElementById('brain-user-prompt')?.value ?? '',
      portrait: collectPortraitFromDom(),
      linkedInSearch: collectLinkedInSearchFromDom(),
      outcome: outcomeVal,
      searchUrlOverride: document.getElementById('brain-search-url-override')?.value?.trim() ?? '',
      booking,
    };
    document.querySelectorAll('[data-prompt-key]').forEach((ta) => {
      const key = ta.dataset.promptKey;
      if (key) patch.prompts[key] = ta.value;
    });
    const ba = document.getElementById('brainAnalysis');
    if (ba) patch.brainAnalysisEnabled = ba.checked;
    const bv = document.getElementById('brainIntervalValue');
    const bu = document.getElementById('brainIntervalUnit');
    if (bv && bu) {
      patch.brainAnalysisIntervalValue = bv.value;
      patch.brainAnalysisIntervalUnit = bu.value;
    }
  }

  if (page === 'crm') {
    const u = document.getElementById('notionCrmUrl');
    if (u) patch.notionCrmUrl = u.value.trim();
  }

  if (page === 'linkedin') {
    const li = document.getElementById('ch-linkedin');
    if (li) patch.channels.linkedin = li.checked;
    patch.linkedin = {
      targetUrl: document.getElementById('targetUrl')?.value || '',
      portraitProspecting: document.getElementById('portraitProspecting')?.checked,
      connectMaxPerRun: document.getElementById('connectInvitesPerRun')?.value,
      connectAcceptExpire: document.getElementById('connectAcceptExpire')?.checked,
      connectAcceptWaitDays: document.getElementById('connectAcceptWaitDays')?.value,
    };
  }

  if (page === 'profile') {
    view.querySelectorAll('[data-set]').forEach((el) => {
      if (el.tagName === 'SELECT' || el.value) patch.integrations[el.dataset.set] = el.value;
    });
    view.querySelectorAll('[data-remove][data-pending-remove="1"]').forEach((btn) => {
      patch.removeIntegrationKeys.push(btn.dataset.remove);
    });
  }

  return patch;
}

async function save({ restart = false } = {}) {
  if (restart && settings) {
    if (settings.llmRolesConfigured === false) {
      toast('Add Researcher, Copywriter, and Inspector API keys in Profile → Integrations → LLM before restarting.', true, 7000);
      page = 'profile';
      openProfileTile = 'integrations';
      location.hash = '#profile-integrations';
      openIntegrationGroups.LLM = true;
      render();
      return;
    }
  }
  const applyBtn = document.getElementById('btn-apply');
  const saveBtn = document.getElementById('btn-save');
  const loadingBtn = restart ? applyBtn : saveBtn;
  loadingBtn?.classList.add('is-loading');
  if (saveBtn) saveBtn.disabled = true;
  if (applyBtn) applyBtn.disabled = true;
  try {
    const patch = collectPatch();
    if (!patch) return;
    const data = await api('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
    settings = data.settings;
    brainBookingDraft = normalizeBookingClient(settings.brain?.booking);
    if (settings.notifications) notifications = settings.notifications;
    updateBell();
    if (restart) {
      const r = await api('/api/agent/restart', { method: 'POST', body: '{}' });
      const msg = r.ok
        ? r.hint
          ? `Saved — H.A.L.O. restarted. ${r.hint}`
          : 'Saved — H.A.L.O. restarted.'
        : `Saved, restart failed: ${r.output || r.error || ''}`.slice(0, 160);
      toast(msg, !r.ok, 8000);
      refreshNotifications().catch(() => {});
    } else toast('Saved — next cycle will use these settings');
    render();
  } catch (e) {
    toast(e.message, true, 6000);
  } finally {
    loadingBtn?.classList.remove('is-loading');
    if (saveBtn) saveBtn.disabled = false;
    if (applyBtn) applyBtn.disabled = false;
  }
}

function setNotifyOpen(open) {
  notifyOpen = !!open;
  notifyPanel.classList.toggle('hidden', !notifyOpen);
  if (notifyBackdrop) notifyBackdrop.classList.toggle('hidden', !notifyOpen);
  if (notifyOpen) {
    setNavOpen(false);
    renderNotifyPanel();
  }
}

function updateSaveVisibility() {
  if (!topActions) return;
  const hide = page === 'instagram' || page === 'facebook' || page === 'faq';
  topActions.classList.toggle('no-save', hide);
}

function render() {
  if (typeof view._faqCleanup === 'function') {
    view._faqCleanup();
    view._faqCleanup = null;
  }
  renderNav();
  setNotifyOpen(notifyOpen);
  updateSaveVisibility();
  if (page === 'dashboard') renderDashboard();
  else if (page === 'crm') renderCrm();
  else if (page === 'linkedin') renderLinkedIn();
  else if (page === 'instagram') renderComing('Instagram');
  else if (page === 'facebook') renderComing('Facebook');
  else if (page === 'integrations') renderIntegrations();
  else if (page === 'profile') renderProfile();
  else if (page === 'brain') renderBrain();
  else if (page === 'faq') renderFaq();
}

async function boot() {
  applyHaloTheme(getHaloTheme());
  document.getElementById('btn-save').onclick = () => save({ restart: false });
  document.getElementById('btn-apply').onclick = () => save({ restart: true });
  document.getElementById('btn-bell').onclick = () => setNotifyOpen(!notifyOpen);
  if (notifyBackdrop) notifyBackdrop.onclick = () => setNotifyOpen(false);
  const closeBtn = document.getElementById('btn-notify-close');
  if (closeBtn) closeBtn.onclick = () => setNotifyOpen(false);
  document.getElementById('btn-support-close')?.addEventListener('click', () => closeSupportChat());
  supportBackdrop?.addEventListener('click', () => closeSupportChat());
  supportFab?.addEventListener('click', () => toggleSupportChat());
  supportForm?.addEventListener('submit', sendSupportChatMessage);
  supportInput?.addEventListener('input', () => resizeSupportInput());
  supportInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendSupportChatMessage(e);
    }
  });
  document.getElementById('support-attach-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      supportPendingImage = await readImageFileAsAttachment(file);
      renderAttachPreview('support-attach-preview', supportPendingImage, clearSupportPendingImage);
    } catch (err) {
      clearSupportPendingImage();
      toast(err.message || 'Could not attach image', true);
    }
  });
  resizeSupportInput();
  const menuBtn = document.getElementById('btn-menu');
  const navBackdrop = document.getElementById('nav-backdrop');
  const navClose = document.getElementById('btn-nav-close');
  if (menuBtn) menuBtn.onclick = () => setNavOpen(!document.body.classList.contains('nav-open'));
  if (navBackdrop) navBackdrop.onclick = () => setNavOpen(false);
  if (navClose) navClose.onclick = () => setNavOpen(false);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setNavOpen(false);
      setNotifyOpen(false);
      closeSupportChat();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) setNavOpen(false);
  });
  document.getElementById('btn-read-all').onclick = async () => {
    try {
      const data = await api('/api/notifications/read-all', { method: 'POST', body: '{}' });
      notifications.unread = 0;
      notifications.items = (notifications.items || []).map((i) => ({ ...i, read: true }));
      updateBell();
      renderNotifyPanel();
      toast('All read');
    } catch (e) {
      toast(e.message, true);
    }
  };

  try {
    const [s, c, n] = await Promise.all([
      api('/api/settings'),
      api('/api/notion/counts').catch(() => ({ counts: {} })),
      api('/api/notifications').catch(() => ({ items: [], unread: 0 })),
    ]);
    settings = s.settings;
    brainBookingDraft = normalizeBookingClient(settings.brain?.booking);
    counts = c;
    notifications = { items: n.items || settings.notifications?.items || [], unread: n.unread || settings.notifications?.unread || 0 };
    if (window.HaloSupabaseConnect) {
      window.HaloSupabaseConnect.init({
        api,
        isConfigured: () => settings?.crmBackend === 'supabase' && settings?.notionConfigured,
        onConnected: async (data) => {
          if (data?.settings) settings = data.settings;
          else {
            const fresh = await api('/api/settings');
            settings = fresh.settings;
          }
          counts = await api('/api/notion/counts').catch(() => ({ counts: {} }));
          render();
          toast('Supabase CRM connected');
        },
      });
    }
    updateBell();
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json());
      if (me?.ok) {
        haloMe = me.tenant || null;
        setSupportFabUnread(me.tenant?.userUnreadSupport === true);
        if (me.trialEnded) {
          let ban = document.getElementById('halo-trial-banner');
          if (!ban) {
            ban = document.createElement('div');
            ban.id = 'halo-trial-banner';
            ban.style.cssText =
              'position:sticky;top:0;z-index:50;background:#7f1d1d;color:#fecaca;padding:10px 16px;text-align:center;font-size:0.88rem;border-bottom:1px solid #991b1b';
            ban.textContent = `Trial ended (${me.leadCount}/${me.tenant?.trialLeadLimit || 50} leads). New leads blocked until upgrade.`;
            document.body.prepend(ban);
          }
        }
      }
    } catch {
      /* optional auth/me */
    }
    const pageParam = new URLSearchParams(location.search).get('page');
    if (pageParam && NAV.some((n) => n.id === pageParam)) page = pageParam;
    render();
    setInterval(refreshNotifications, 30000);
    refreshSupportFabBadge().catch(() => {});
    if (supportBadgeTimer) clearInterval(supportBadgeTimer);
    supportBadgeTimer = setInterval(() => {
      if (!supportOpen) refreshSupportFabBadge().catch(() => {});
    }, 60000);
  } catch (e) {
    view.innerHTML = `<div class="coming">Failed to load: ${escapeHtml(e.message)}</div>`;
  }
}

boot();
