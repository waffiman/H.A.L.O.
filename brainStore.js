/**
 * Brain store: user prompt + living strategy notes + analysis state.
 * Paths live under APP_ROOT/brain/ (agent cwd or dashboard APP_ROOT).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeRegionList } from './regionsGeo.js';
import {
  defaultBookingSchedule,
  normalizeBookingSchedule,
  validateBookingSchedule,
} from './bookingSchedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function brainDir(root = process.cwd()) {
  return path.join(root, 'brain');
}

function ensureBrainDir(root = process.cwd()) {
  const dir = brainDir(root);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function userPromptPath(root = process.cwd()) {
  return path.join(brainDir(root), 'user_prompt.md');
}

export function strategyNotesPath(root = process.cwd()) {
  return path.join(brainDir(root), 'strategy_notes.md');
}

export function analysisStatePath(root = process.cwd()) {
  return path.join(brainDir(root), 'analysis_state.json');
}

export function targetPortraitPath(root = process.cwd()) {
  return path.join(brainDir(root), 'target_portrait.md');
}

export function salesPolicyPath(root = process.cwd()) {
  return path.join(brainDir(root), 'sales_policy.json');
}

/** Allowed primary outcomes for reply → Active ✅. */
export const SALES_OUTCOMES = [
  {
    id: 'book_a_call',
    label: 'Book a call',
    hint: 'Active when they accept a concrete slot (Meet link / Calendar event optional)',
  },
  { id: 'purchase', label: 'Purchase', hint: 'Active when they buy or commit to pay' },
  { id: 'qualify', label: 'Qualify', hint: 'Active when fit + next step are confirmed' },
  { id: 'referral', label: 'Referral', hint: 'Active when they give an intro or warm referral' },
];

export function outcomeMeta(id) {
  return SALES_OUTCOMES.find((o) => o.id === id) || SALES_OUTCOMES[0];
}

export function readTargetPortrait(root = process.cwd()) {
  const p = targetPortraitPath(root);
  try {
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export function writeTargetPortrait(text, root = process.cwd()) {
  ensureBrainDir(root);
  fs.writeFileSync(targetPortraitPath(root), String(text ?? ''), 'utf8');
}

export function readSalesPolicy(root = process.cwd()) {
  const p = salesPolicyPath(root);
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const outcome = SALES_OUTCOMES.some((o) => o.id === raw.outcome) ? raw.outcome : 'book_a_call';
      let portrait = normalizePortrait(raw.portrait);
      if (isPortraitEmpty(portrait)) {
        const legacy = readTargetPortrait(root).trim();
        if (legacy) portrait = { ...portrait, need: legacy };
      }
      const booking = normalizeBookingSchedule(raw.booking);
      return {
        outcome,
        portrait,
        linkedInSearch: normalizeLinkedInSearchFields(raw.linkedInSearch),
        searchUrlOverride: String(raw.searchUrlOverride || '').trim(),
        booking,
        bookingComplete: validateBookingSchedule(booking).ok,
      };
    }
  } catch {
    /* fall through */
  }
  const legacy = readTargetPortrait(root).trim();
  const booking = defaultBookingSchedule();
  return {
    outcome: 'book_a_call',
    portrait: legacy ? { ...defaultPortrait(), need: legacy } : defaultPortrait(),
    linkedInSearch: defaultLinkedInSearchFields(),
    searchUrlOverride: '',
    booking,
    bookingComplete: false,
  };
}

export function writeSalesPolicy(policy, root = process.cwd()) {
  ensureBrainDir(root);
  const outcome = SALES_OUTCOMES.some((o) => o.id === policy?.outcome)
    ? policy.outcome
    : 'book_a_call';
  const portrait = normalizePortrait(policy?.portrait);
  const linkedInSearch = normalizeLinkedInSearchFields(policy?.linkedInSearch);
  const searchUrlOverride = String(policy?.searchUrlOverride || '').trim();
  const booking = normalizeBookingSchedule(policy?.booking);
  fs.writeFileSync(
    salesPolicyPath(root),
    JSON.stringify({ outcome, portrait, linkedInSearch, searchUrlOverride, booking }, null, 2),
    'utf8'
  );
  writeTargetPortrait(compilePortraitMarkdown(portrait), root);
}

export function defaultPortrait() {
  return {
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
}

/** LinkedIn People Search filters (Brain → Stage A connect). */
export function defaultLinkedInSearchFields() {
  return {
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
}

const CONNECTION_DEGREES = new Set(['2nd', '3rd_plus', '2nd_3rd', 'all', '1st']);
const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

export function normalizeLinkedInSearchFields(raw) {
  const base = defaultLinkedInSearchFields();
  if (!raw || typeof raw !== 'object') return base;
  const degree = String(raw.connectionDegree || base.connectionDegree).trim();
  return {
    connectionDegree: CONNECTION_DEGREES.has(degree) ? degree : base.connectionDegree,
    keywordsExtra: String(raw.keywordsExtra || '').trim(),
    currentCompany: String(raw.currentCompany || '').trim(),
    pastCompany: String(raw.pastCompany || '').trim(),
    school: String(raw.school || '').trim(),
    profileLanguage: String(raw.profileLanguage || '').trim(),
    currentTitle: String(raw.currentTitle || '').trim(),
    industryKeywords: String(raw.industryKeywords || '').trim(),
    seniority: arr(raw.seniority),
    functionArea: arr(raw.functionArea),
    yearsOfExperience: arr(raw.yearsOfExperience),
    companyHeadcount: arr(raw.companyHeadcount),
  };
}

function isPortraitEmpty(p) {
  if (!p || typeof p !== 'object') return true;
  return !(
    (p.roles && p.roles.length) ||
    (p.industries && p.industries.length) ||
    p.companySize ||
    (p.decisionMaker && p.decisionMaker.length) ||
    p.stage ||
    (p.regions && p.regions.length) ||
    p.budget ||
    p.urgency ||
    (p.painPoints && p.painPoints.length) ||
    (p.linkedinSignals && p.linkedinSignals.length) ||
    (p.need && String(p.need).trim()) ||
    (p.greenFlags && String(p.greenFlags).trim()) ||
    (p.nonFit && String(p.nonFit).trim())
  );
}

export function normalizePortrait(raw) {
  const base = defaultPortrait();
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
  const regions = normalizeRegionList(arr(raw.regions));
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

/** Human-readable block injected on reply mode (kept in target_portrait.md sync). */
export function compilePortraitMarkdown(portrait) {
  const p = normalizePortrait(portrait);
  const lines = [];
  if (p.roles.length) lines.push(`Roles: ${p.roles.join(', ')}.`);
  if (p.industries.length) lines.push(`Industries: ${p.industries.join(', ')}.`);
  if (p.companySize) lines.push(`Company size: ${p.companySize}.`);
  if (p.decisionMaker.length) lines.push(`Decision maker: ${p.decisionMaker.join(', ')}.`);
  if (p.stage) lines.push(`Stage: ${p.stage}.`);
  if (p.regions.length) lines.push(`Regions: ${p.regions.join(', ')}.`);
  if (p.budget) lines.push(`Budget signal: ${p.budget}.`);
  if (p.urgency) lines.push(`Urgency: ${p.urgency}.`);
  if (p.painPoints.length) lines.push(`Pain points: ${p.painPoints.join(', ')}.`);
  if (p.linkedinSignals.length) lines.push(`LinkedIn signals: ${p.linkedinSignals.join(', ')}.`);
  if (p.need) lines.push(`Need / offer fit: ${p.need}`);
  if (p.greenFlags) lines.push(`Green flags: ${p.greenFlags}`);
  if (p.nonFit) lines.push(`Clear non-fit → Lost: ${p.nonFit}`);
  return lines.join('\n\n');
}

/**
 * Compact Sales block for MODE reply only — portrait + outcome rules.
 * Keep short so OpenRouter / Gemini stay focused.
 */
export function buildSalesReplyBlock(root = process.cwd()) {
  const portrait = readTargetPortrait(root).trim();
  const { outcome, bookingComplete } = readSalesPolicy(root);
  const meta = outcomeMeta(outcome);
  const lines = [
    '## Sales policy (reply mode only — CRM status)',
    `Primary outcome: ${meta.label} (\`${meta.id}\`).`,
    `Active ✅ ONLY when this outcome is clearly achieved in the thread (${meta.hint}).`,
    'Anyone clearly outside the target portrait (after real engagement), or hard refusal / wrong person / hostile → Lost❌ (pick one lost_reason enum).',
    'Soft interest, maybe later, or still exploring → continue on Proposal 2️⃣ (not Active).',
    'lost_reason enum: not_interested | wrong_person | no_budget | bad_timing | has_solution | competitor | unsubscribe | hostile | non_fit | other',
  ];
  if (outcome === 'book_a_call') {
    lines.push(
      bookingComplete
        ? 'book_a_call: offer ONLY times from the Booking offers block (already in lead TZ). Soft yes-to-call ≠ Active. intent=book + booked_slot_id after they accept a listed slot → Active. Include Meet link only if provided in that block.'
        : 'book_a_call: host schedule incomplete — ask for THEIR availability; never invent clock times; do not set Active.'
    );
  } else {
    lines.push('Never invent meeting times or calendar slots unless the outcome requires it.');
  }
  if (portrait) {
    lines.push('', '### Target client portrait', portrait);
  } else {
    lines.push('', '### Target client portrait', '(not set — infer carefully from the playbook; prefer continue over Active)');
  }
  return lines.join('\n');
}

function migrateUserPromptIfNeeded(root = process.cwd()) {
  const dest = userPromptPath(root);
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8').trim()) return;
  ensureBrainDir(root);
  const legacy = [
    path.join(root, 'salesPlaybook.md'),
    path.join(__dirname, 'salesPlaybook.md'),
  ];
  for (const p of legacy) {
    try {
      if (fs.existsSync(p)) {
        fs.writeFileSync(dest, fs.readFileSync(p, 'utf8'), 'utf8');
        return;
      }
    } catch {
      /* try next */
    }
  }
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(
      dest,
      'You write LinkedIn messages for Mykhailo, Founder of WAFFi. Be human, specific, no placeholders.\n',
      'utf8'
    );
  }
}

export function readUserPrompt(root = process.cwd()) {
  migrateUserPromptIfNeeded(root);
  try {
    return fs.readFileSync(userPromptPath(root), 'utf8');
  } catch {
    return '';
  }
}

export function writeUserPrompt(text, root = process.cwd()) {
  ensureBrainDir(root);
  fs.writeFileSync(userPromptPath(root), String(text ?? ''), 'utf8');
}

export function readStrategyNotes(root = process.cwd()) {
  const p = strategyNotesPath(root);
  try {
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export function writeStrategyNotes(text, root = process.cwd()) {
  ensureBrainDir(root);
  const clean = String(text ?? '').replace(/^\uFEFF/, '').trim();
  fs.writeFileSync(strategyNotesPath(root), clean ? `${clean}\n` : '', 'utf8');
}

export function readAnalysisState(root = process.cwd()) {
  const p = analysisStatePath(root);
  try {
    if (!fs.existsSync(p)) return { lastRunAt: null, leadsAnalyzed: 0, lastSummary: '' };
    return { lastRunAt: null, leadsAnalyzed: 0, lastSummary: '', ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return { lastRunAt: null, leadsAnalyzed: 0, lastSummary: '' };
  }
}

export function writeAnalysisState(state, root = process.cwd()) {
  ensureBrainDir(root);
  fs.writeFileSync(analysisStatePath(root), JSON.stringify(state, null, 2), 'utf8');
}

export function isBrainAnalysisDue(root = process.cwd()) {
  if (process.env.BRAIN_ANALYSIS_ENABLED === '0') return false;
  const interval = Number(process.env.BRAIN_ANALYSIS_INTERVAL_MS || 604800000);
  const st = readAnalysisState(root);
  if (!st.lastRunAt) return true;
  const elapsed = Date.now() - Date.parse(st.lastRunAt);
  return Number.isFinite(elapsed) && elapsed >= interval;
}

/** System prefix for salesBrain: user prompt + optional strategy notes. */
export function loadBrainSystemPrefix(root = process.cwd()) {
  const user = readUserPrompt(root).trim();
  const notes = readStrategyNotes(root).trim();
  const parts = [];
  if (user) parts.push(user);
  if (notes) {
    parts.push(
      [
        '## Living strategy notes (from outreach analysis — follow when writing)',
        notes,
      ].join('\n')
    );
  }
  return parts.join('\n\n') || 'You write LinkedIn messages for Mykhailo, Founder of WAFFi.';
}

/**
 * Compose full system prompt: user prompt → mode adapter → [sales policy if reply] → strategy notes.
 */
export function composeBrainSystem({ modeBlock = '', mode = '', root = process.cwd() } = {}) {
  const user = readUserPrompt(root).trim();
  const notes = readStrategyNotes(root).trim();
  const parts = [];
  if (user) parts.push(user);
  if (modeBlock) parts.push(modeBlock);
  if (String(mode) === 'reply') {
    const sales = buildSalesReplyBlock(root).trim();
    if (sales) parts.push(sales);
  }
  if (notes) {
    parts.push(
      [
        '## Strategy notes (experience from past conversations — follow when writing)',
        notes,
      ].join('\n')
    );
  }
  return parts.join('\n\n') || 'You write LinkedIn messages for Mykhailo, Founder of WAFFi.';
}
