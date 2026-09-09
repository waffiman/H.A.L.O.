/**
 * Unified sales brain: user prompt + strategy notes + mode adapter.
 *
 * Optional 3-role pipeline (default ON when keys exist):
 *   Researcher → Copywriter → Inspector
 * Prefer native Gemini (Google AI / Pro) when keys exist; OpenRouter as optional fallback.
 * Set BRAIN_PREFER_OPENROUTER=1 to use OpenRouter first (requires credits).
 * Public API unchanged: generateSalesMessage({ mode, lead, profile, thread }) → { text } | reply decision.
 * BRAIN_PIPELINE=0 forces the legacy single-shot cascade.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isTemplateIceBreaker,
  sanitizeIceBreaker,
  stripMidThreadFormalities,
} from './messageQuality.js';
import { composeBrainSystem, loadBrainSystemPrefix, readSalesPolicy } from './brainStore.js';
import { markBrainRoleHealth } from './brainLlmHealth.js';
import { normalizeLostReason } from './crm/leadFields.js';
import {
  buildBookingOffers,
  enforceBookACallDecision,
  formatBookingOffersForPrompt,
} from './bookingSchedule.js';
import { getMeetRoomUrl, meetLinkReady, notifyBookedCall, buildBookingCalendarAddLink } from './googleCalendar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOK_PATH = process.env.SALES_PLAYBOOK_PATH
  || path.join(process.cwd(), 'salesPlaybook.md')
  || path.join(__dirname, 'salesPlaybook.md');

const MODE_FALLBACKS = {
  ice_breaker: `MODE: ice_breaker
Write the FIRST LinkedIn message to this person.
Required: open with Hi <lead first name>,
Warm opener + gold nugget, relevant friction, concrete WAFFi-shaped angle, soft CTA.
Always end with a short sign-off on its own lines (e.g. Best, then your name from the playbook / user prompt).
Use the sender name from the playbook — never invent another name or leave placeholders.
Do NOT skip the greeting or the sign-off.
OUTPUT: ONLY the final message text. No analysis.`,

  reply: `MODE: reply
The lead already received our ice-breaker (and maybe more). They sent a new message — mid-thread.
Decide the next CRM move and optionally write a reply.
Return STRICT JSON only (no markdown fences):
{
  "intent": "continue" | "book" | "lost" | "hold",
  "reason": "short",
  "lost_reason": "not_interested" | "wrong_person" | "no_budget" | "bad_timing" | "has_solution" | "competitor" | "unsubscribe" | "hostile" | "non_fit" | "other",
  "booked_slot_id": "",
  "reply": "plain text message to send, or empty string if no send",
  "notes_append": "1-3 short bullets for CRM page notes",
  "status": "Proposal 2️⃣" | "Active ✅" | "Lost❌"
}
Rules:
- Follow Sales policy (target portrait + primary outcome) for status.
- book / Active ✅ ONLY if the primary outcome is clearly met. Soft interest = continue.
- For book_a_call: soft yes-to-a-call ≠ Active. Propose only from Booking offers. Set booked_slot_id to an exact id only when they accept that slot. Never invent times. Meet link only if provided in Booking offers.
- lost / Lost❌ for refusal, wrong person, hostile, unsubscribe, or clear non-fit outside the portrait.
- When intent is lost: set lost_reason to EXACTLY one enum value above (best single match). Omit or leave empty otherwise.
- continue / hold stay on Proposal 2️⃣
- reply must follow the playbook voice; no placeholders
- Do NOT greet again (no Hi/Hello/Hey). Do NOT sign off (no Cheers/Best/Regards + name).`,

  closing_followup: `MODE: closing_followup
They never replied after our outreach. This is the LAST soft touch in an existing thread, then we mark Lost.
Write a short, personalized closing message (not a generic template). Acknowledge silence lightly, leave the door open, do not pressure.
Do NOT greet again. Do NOT use a formal email sign-off (Cheers/Best/Regards + name).
OUTPUT: ONLY the final message text. No analysis.`,
};

const RESEARCHER_SYSTEM = `ROLE: Researcher for LinkedIn outreach (WAFFi / Mykhailo).
You do NOT write the final message.
Extract only usable facts and angles from the lead profile / thread.
OUTPUT plain text bullets only:
- Gold nugget (1 specific, verifiable detail)
- Likely friction / job pain (1–2 lines)
- WAFFi-shaped angle (how we help, without inventing facts)
- Soft CTA hint
- Tone notes (formal/casual)
No greetings. No full DM. No placeholders like [Name].`;

const INSPECTOR_SYSTEM = `ROLE: Inspector for LinkedIn outreach copy (WAFFi / Mykhailo).
You receive a draft message (or reply JSON). Improve quality without changing the sales intent.
Reject / fix: templates, placeholders, fake facts, stiff AI tone, hype, overlong walls of text.
Keep voice human, specific, LinkedIn-DM length.

If MODE is reply and input is JSON:
Return STRICT JSON with the same keys (intent, reason, lost_reason, booked_slot_id, reply, notes_append, status). You may tighten reply text.
When intent is lost, lost_reason MUST be one of: not_interested, wrong_person, no_budget, bad_timing, has_solution, competitor, unsubscribe, hostile, non_fit, other.
Do not invent meeting times; keep booked_slot_id empty unless the draft already had a valid one.

If MODE is ice_breaker or closing_followup:
OUTPUT ONLY the final message text (no labels, no analysis).
For ice_breaker: KEEP the greeting (Hi Name) and the closing sign-off (Best, + sender name). Do not strip them; add them if the draft is missing either.
For closing_followup and reply drafts: strip greetings and email sign-offs (no Hi Name, no Cheers/Best/Regards).`;

function loadModeBlock(mode) {
  const file = path.join(process.cwd(), 'prompts', `${mode}.md`);
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  } catch {
    /* fallback */
  }
  const alt = path.join(__dirname, 'prompts', `${mode}.md`);
  try {
    if (fs.existsSync(alt)) return fs.readFileSync(alt, 'utf8').trim();
  } catch {
    /* fallback */
  }
  return MODE_FALLBACKS[mode] || '';
}

/** @deprecated use loadBrainSystemPrefix — kept for migration fallback */
function loadPlaybook() {
  try {
    return loadBrainSystemPrefix(process.cwd());
  } catch {
    /* fall through */
  }
  const candidates = [
    PLAYBOOK_PATH,
    path.join(process.cwd(), 'salesPlaybook.md'),
    path.join(__dirname, 'salesPlaybook.md'),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch {
      /* try next */
    }
  }
  return 'You write LinkedIn messages for Mykhailo, Founder of WAFFi. Be human, specific, no placeholders.';
}

function buildUserContext({
  mode,
  lead = {},
  profile = {},
  thread = '',
  bookingUrl = '',
  researchBrief = '',
  bookingOffersBlock = '',
}) {
  const first = (lead.name || profile.name || '').trim().split(/\s+/)[0] || 'there';
  const leadTz = String(lead.timezone || profile.timezone || '').trim();
  const lines = [
    `MODE=${mode}`,
    `Lead name: ${lead.name || profile.name || ''}`,
    `First name: ${first}`,
    `LinkedIn: ${lead.url || ''}`,
    `Headline: ${profile.headline || lead.headline || ''}`,
    `Bio: ${profile.about || ''}`,
    `Company: ${profile.company || lead.company || ''}`,
    `Location: ${profile.location || lead.location || ''}`,
    leadTz ? `Lead timezone: ${leadTz}` : 'Lead timezone: (unknown — labels still use host TZ fallback)',
    `Top role: ${profile.topRole || ''}`,
    `Existing ice-breaker we already sent (if any):\n${lead.msg || lead.ice || '(none)'}`,
    `Lead notes from CRM page body:\n${lead.notesText || '(empty)'}`,
    `Thread transcript:\n${thread || '(none)'}`,
  ];
  if (bookingOffersBlock) {
    lines.push(bookingOffersBlock);
  } else if (bookingUrl) {
    lines.push(`Booking link to offer when appropriate: ${bookingUrl}`);
  } else if (mode === 'reply') {
    lines.push('Booking link: (none)');
  }
  if (researchBrief) {
    lines.push(`Researcher brief (use these angles; do not invent beyond profile):\n${researchBrief}`);
  }
  if (mode === 'ice_breaker') {
    lines.push(
      'Write the first message now using real facts only. Must start with Hi <First name>, and must end with Best, + your sender name from the playbook (no placeholders).'
    );
  } else if (mode === 'closing_followup') {
    lines.push(
      'Write the closing follow-up now. Personalized, soft close. No greeting, no sign-off.'
    );
  } else {
    lines.push(
      'Return JSON decision + reply now. Reply text: no greeting, no Cheers/Best/Regards signature.'
    );
  }
  return lines.join('\n');
}

async function callOpenAI(system, user, { json = false, maxTokens = 2048 } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const body = {
    model,
    temperature: 0.7,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 200)}`);
  }
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function callGemini(system, user, { apiKey = null, model = null, temperature = 0.7, maxTokens = 2048 } = {}) {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 200)}`);
  }
  return (data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '').trim();
}

async function callCohere(system, user, { temperature = 0.5, maxTokens = 1536 } = {}) {
  const key = process.env.COHERE_API_KEY || process.env.CO_API_KEY;
  if (!key) return null;
  const model = process.env.COHERE_MODEL || 'command-a-03-2025';
  const res = await fetch('https://api.cohere.ai/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Cohere ${res.status}: ${data?.message || JSON.stringify(data).slice(0, 200)}`);
  }
  const parts = data?.message?.content;
  if (Array.isArray(parts)) {
    return parts.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('').trim();
  }
  return String(data?.text || data?.message || '').trim();
}

/** Cost-efficient OpenRouter defaults for LinkedIn sales DM pipeline (Aug 2026). */
const OPENROUTER_DEFAULTS = {
  researcher: 'deepseek/deepseek-v4-flash',
  copywriter: 'google/gemini-2.5-flash',
  inspector: 'openai/gpt-4o-mini',
};

function openRouterEnabled() {
  return Boolean((process.env.OPENROUTER_API_KEY || '').trim());
}

function openRouterModel(role) {
  if (role === 'researcher') {
    return process.env.OPENROUTER_RESEARCHER_MODEL || OPENROUTER_DEFAULTS.researcher;
  }
  if (role === 'copywriter') {
    return process.env.OPENROUTER_COPYWRITER_MODEL || OPENROUTER_DEFAULTS.copywriter;
  }
  return process.env.OPENROUTER_INSPECTOR_MODEL || OPENROUTER_DEFAULTS.inspector;
}

function brainMaxTokens(role) {
  const global = Number(process.env.BRAIN_MAX_TOKENS);
  if (Number.isFinite(global) && global > 0) return Math.min(Math.floor(global), 8192);
  if (role === 'copywriter') {
    const n = Number(process.env.BRAIN_COPYWRITER_MAX_TOKENS);
    return Number.isFinite(n) && n > 0 ? n : 2048;
  }
  if (role === 'researcher') {
    const n = Number(process.env.BRAIN_RESEARCHER_MAX_TOKENS);
    return Number.isFinite(n) && n > 0 ? n : 1024;
  }
  const n = Number(process.env.BRAIN_INSPECTOR_MAX_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : 1536;
}

function geminiKeys() {
  const a = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const b = process.env.GEMINI_API_KEY_2 || '';
  return { researcher: a || b || null, copywriter: b || a || null };
}

/** Native Gemini model per pipeline role (Google AI / Pro keys). */
function geminiModelForRole(role) {
  const base = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (role === 'researcher') {
    return process.env.GEMINI_RESEARCHER_MODEL || 'gemini-2.0-flash-lite';
  }
  if (role === 'copywriter') {
    return process.env.GEMINI_COPYWRITER_MODEL || base;
  }
  return process.env.GEMINI_INSPECTOR_MODEL || base;
}

/** Prefer native Gemini when keys exist (Google Pro). OpenRouter only if BRAIN_PREFER_OPENROUTER=1. */
function geminiPreferred() {
  if (process.env.BRAIN_PREFER_OPENROUTER === '1') return false;
  if (process.env.BRAIN_PREFER_GEMINI === '0') return false;
  return Boolean(geminiKeys().researcher);
}

async function callOpenRouter(system, user, { model, temperature = 0.7, maxTokens = 2048 } = {}) {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) return null;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': (
        process.env.DASHBOARD_PUBLIC_URL ||
        process.env.PUBLIC_DASHBOARD_URL ||
        'https://halo.local'
      ).trim(),
      'X-Title': 'H.A.L.O. Sales Brain',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `OpenRouter ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 200)}`
    );
  }
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function callRoleGemini(role, system, user, { temperature = 0.7 } = {}) {
  const keys = geminiKeys();
  const maxTokens = brainMaxTokens(role);
  const model = geminiModelForRole(role);
  if (role === 'inspector') {
    try {
      const co = await callCohere(system, user, { temperature, maxTokens });
      if (co) return co;
    } catch (e) {
      console.error('Cohere inspector failed:', e.message);
    }
    return callGemini(system, user, {
      apiKey: keys.copywriter || keys.researcher,
      model,
      temperature,
      maxTokens,
    });
  }
  const apiKey = role === 'researcher' ? keys.researcher : keys.copywriter;
  return callGemini(system, user, { apiKey, model, temperature, maxTokens });
}

async function callRoleOpenRouter(role, system, user, { temperature = 0.7 } = {}) {
  if (!openRouterEnabled()) return null;
  const model = openRouterModel(role);
  const maxTokens = brainMaxTokens(role);
  return callOpenRouter(system, user, { model, temperature, maxTokens });
}

function openRouterFallbackModel() {
  return (
    (process.env.OPENROUTER_FALLBACK_MODEL || '').trim() ||
    (process.env.OPENROUTER_COPYWRITER_MODEL || '').trim() ||
    OPENROUTER_DEFAULTS.copywriter
  );
}

async function callRoleFallback(role, system, user, { temperature = 0.7 } = {}) {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  const model = openRouterFallbackModel();
  if (!key || !model) return null;
  return callOpenRouter(system, user, {
    model,
    temperature,
    maxTokens: brainMaxTokens(role),
  });
}

/**
 * Call a brain role: role-specific primary key, then optional shared OpenRouter fallback.
 * @param {'researcher'|'copywriter'|'inspector'} role
 */
async function callRole(role, system, user, { temperature = 0.7 } = {}) {
  try {
    const text = await callRoleGemini(role, system, user, { temperature });
    if (text) {
      markBrainRoleHealth(role, true, null, 'primary');
      return text;
    }
  } catch (e) {
    console.error(`Primary ${role} failed:`, e.message);
    markBrainRoleHealth(role, false, e.message, 'primary');
  }

  try {
    const fb = await callRoleFallback(role, system, user, { temperature });
    if (fb) {
      markBrainRoleHealth(role, true, null, 'fallback');
      return fb;
    }
  } catch (e) {
    console.error(`Fallback ${role} failed:`, e.message);
    markBrainRoleHealth(role, false, e.message, 'fallback');
  }
  return null;
}

function pipelineEnabled() {
  if (process.env.BRAIN_PIPELINE === '0') return false;
  const { researcher, copywriter } = geminiKeys();
  const inspector = (process.env.COHERE_API_KEY || process.env.CO_API_KEY || '').trim();
  return Boolean(researcher && copywriter && inspector);
}

function parseReplyJson(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(t);
  const intent = String(parsed.intent || 'continue').toLowerCase();
  let status = parsed.status || 'Proposal 2️⃣';
  if (intent === 'book') status = 'Active ✅';
  if (intent === 'lost') status = 'Lost❌';
  if (intent === 'continue' || intent === 'hold') status = 'Proposal 2️⃣';
  const reply = stripMidThreadFormalities(sanitizeIceBreaker(String(parsed.reply || '')));
  const lostReason =
    intent === 'lost' || status === 'Lost❌'
      ? normalizeLostReason(parsed.lost_reason || parsed.lostReason || parsed.reason, {
          fallback: 'other',
        })
      : '';
  return {
    intent,
    reason: String(parsed.reason || ''),
    lostReason,
    booked_slot_id: String(parsed.booked_slot_id || parsed.bookedSlotId || '').trim(),
    reply,
    notes_append: String(parsed.notes_append || ''),
    status,
    text: reply,
  };
}

function finalizeTextMode(mode, raw) {
  let text = sanitizeIceBreaker(raw);
  if (mode === 'closing_followup' || mode === 'closing' || mode === 'reply') {
    text = stripMidThreadFormalities(text);
  }
  if (isTemplateIceBreaker(text)) {
    throw new Error(`LLM returned template-like ${mode} — refusing`);
  }
  return { text, intent: mode, status: null, notes_append: '', reason: '' };
}

function finalizeReplyMode(raw) {
  const decision = parseReplyJson(raw);
  if (decision.reply && isTemplateIceBreaker(decision.reply)) {
    throw new Error('reply looks like template');
  }
  return decision;
}

/**
 * Fallback single-shot when pipeline fails.
 * Order: Gemini (key1) → Gemini (key2) → Cohere.
 * OpenAI only if OPENAI_API_KEY is set (this project normally does not use it).
 */
async function generateSingleShot(mode, system, user) {
  let raw = null;
  const keys = geminiKeys();

  // OpenAI is unused in this project; ignore leftover keys unless explicitly enabled.
  if (process.env.BRAIN_ALLOW_OPENAI === '1' && process.env.OPENAI_API_KEY) {
    try {
      raw = await callOpenAI(system, user, { json: mode === 'reply' });
    } catch (e) {
      console.error('OpenAI failed, trying Gemini:', e.message);
    }
  }

  if (!raw && keys.researcher) {
    try {
      raw = await callGemini(system, user, {
        apiKey: keys.researcher,
        model: geminiModelForRole('copywriter'),
        maxTokens: brainMaxTokens('copywriter'),
      });
    } catch (e) {
      console.error('Gemini (key1) failed:', e.message);
    }
  }
  if (!raw && keys.copywriter && keys.copywriter !== keys.researcher) {
    try {
      raw = await callGemini(system, user, {
        apiKey: keys.copywriter,
        model: geminiModelForRole('copywriter'),
        maxTokens: brainMaxTokens('copywriter'),
      });
    } catch (e) {
      console.error('Gemini (key2) failed:', e.message);
    }
  }
  if (!raw) {
    try {
      raw = await callCohere(system, user);
    } catch (e) {
      console.error('Cohere failed:', e.message);
      throw e;
    }
  }
  if (!raw) {
    throw new Error('No usable LLM key (GEMINI / COHERE) or all providers returned empty');
  }
  if (mode === 'reply') return finalizeReplyMode(raw);
  return finalizeTextMode(mode, raw);
}

/**
 * Researcher → Copywriter → Inspector.
 * Does not change composeBrainSystem / mode adapters — Copywriter still uses them.
 */
async function generateViaPipeline(mode, system, baseCtx) {
  const researchUser = buildUserContext({ ...baseCtx, researchBrief: '' });
  const via = geminiPreferred() ? 'Gemini/Cohere' : openRouterEnabled() ? 'OpenRouter' : 'Gemini/Cohere';
  const modelHint = geminiPreferred()
    ? ` | gemini=${geminiModelForRole('researcher')}/${geminiModelForRole('copywriter')}`
    : openRouterEnabled()
      ? ` | models=${openRouterModel('researcher')} / ${openRouterModel('copywriter')} / ${openRouterModel('inspector')}`
      : '';
  console.log(`Brain pipeline: Researcher → Copywriter → Inspector via ${via} | mode=${mode}${modelHint}`);

  let brief = '';
  try {
    brief = await callRole('researcher', RESEARCHER_SYSTEM, researchUser, { temperature: 0.4 });
  } catch (e) {
    console.error('Researcher failed:', e.message);
  }
  if (!brief || brief.length < 40) {
    console.log('Researcher brief weak/empty — falling back to single-shot');
    return null;
  }
  console.log(`Researcher brief: ${brief.length} chars`);

  const copyUser = buildUserContext({ ...baseCtx, researchBrief: brief });
  let draft = null;
  try {
    draft = await callRole('copywriter', system, copyUser, { temperature: 0.75 });
  } catch (e) {
    console.error('Copywriter failed:', e.message);
  }
  if (!draft) {
    console.log('Copywriter empty — falling back to single-shot');
    return null;
  }

  const inspectUser = [
    `MODE=${mode}`,
    `Researcher brief:\n${brief}`,
    `Draft to inspect:\n${draft}`,
    mode === 'reply'
      ? 'Return STRICT JSON only (same schema as MODE reply).'
      : 'Return ONLY the final LinkedIn message text.',
  ].join('\n\n');

  let inspected = null;
  try {
    inspected = await callRole('inspector', INSPECTOR_SYSTEM, inspectUser, { temperature: 0.35 });
  } catch (e) {
    console.error('Inspector failed:', e.message);
  }

  const finalRaw = (inspected && inspected.length >= 20 ? inspected : draft).trim();
  if (mode === 'reply') {
    try {
      return finalizeReplyMode(finalRaw);
    } catch (e) {
      console.error('Inspector reply JSON bad — trying draft JSON:', e.message);
      return finalizeReplyMode(draft);
    }
  }
  try {
    return finalizeTextMode(mode, finalRaw);
  } catch (e) {
    console.error('Inspector text rejected — trying draft:', e.message);
    return finalizeTextMode(mode, draft);
  }
}

/**
 * @param {{ mode: 'ice_breaker'|'reply'|'closing_followup', lead?: object, profile?: object, thread?: string, bookingUrl?: string }} opts
 */
export async function generateSalesMessage(opts) {
  const mode = opts.mode;
  const modeBlock = loadModeBlock(mode);
  if (!modeBlock) throw new Error(`Unknown salesBrain mode: ${mode}`);

  const system = composeBrainSystem({ modeBlock, mode });
  const meetUrl = getMeetRoomUrl() || opts.bookingUrl || process.env.WAFFI_BOOKING_URL || '';
  const policy = mode === 'reply' ? readSalesPolicy(process.cwd()) : null;
  let bookingOffers = [];
  let bookingOffersBlock = '';
  if (mode === 'reply' && policy?.outcome === 'book_a_call') {
    const leadTz = String(opts.lead?.timezone || opts.profile?.timezone || '').trim();
    const built = buildBookingOffers({
      schedule: policy.booking,
      leadTimezone: leadTz,
      limit: 5,
      horizonDays: 12,
      slotMinutes: 30,
      minNoticeMinutes: 12 * 60,
    });
    bookingOffers = built.offers || [];
    bookingOffersBlock = formatBookingOffersForPrompt(bookingOffers, {
      meetUrl,
      meetUrlReady: meetLinkReady(),
    });
  }

  const baseCtx = {
    mode,
    lead: opts.lead || {},
    profile: opts.profile || {},
    thread: opts.thread || '',
    bookingUrl: meetUrl,
    bookingOffersBlock,
  };
  const user = buildUserContext(baseCtx);

  let decision;
  if (pipelineEnabled()) {
    try {
      const piped = await generateViaPipeline(mode, system, baseCtx);
      if (piped) decision = piped;
    } catch (e) {
      console.error('Brain pipeline failed, falling back to single-shot:', e.message);
    }
  }
  if (!decision) {
    decision = await generateSingleShot(mode, system, user);
  }

  if (mode === 'reply' && policy?.outcome === 'book_a_call') {
    const slotIdPreview = String(decision.booked_slot_id || decision.bookedSlotId || '').trim();
    const offerPreview =
      String(decision.intent || '').toLowerCase() === 'book'
        ? bookingOffers.find((o) => o.id === slotIdPreview) || null
        : null;
    let calendarAddUrl = '';
    if (offerPreview) {
      const meet = meetUrl;
      calendarAddUrl = buildBookingCalendarAddLink({
        title: 'Scheduled call',
        startUtc: offerPreview.startUtc,
        description: meet
          ? `Join Google Meet:\n${meet}`
          : 'Call as agreed on LinkedIn.',
        location: meet,
        meetUrl: meet,
        timeZone: offerPreview.leadTimezone || '',
        durationMinutes: 30,
      }).url;
    }
    decision = enforceBookACallDecision(decision, {
      offers: bookingOffers,
      meetUrl,
      calendarAddUrl,
    });
    if (decision.status === 'Active ✅' && decision.bookedOffer) {
      const offer = decision.bookedOffer;
      decision.notes_append = [
        decision.notes_append,
        `booked ${offer.labelHost} / lead ${offer.labelLead}${meetUrl ? ` | meet ${meetUrl}` : ''}${calendarAddUrl ? ` | cal ${calendarAddUrl}` : ''}`,
      ]
        .filter(Boolean)
        .join(' | ');
      notifyBookedCall({ lead: opts.lead, offer, meetUrl }).catch((e) =>
        console.error('Booked-call notify:', e.message)
      );
    }
  }

  return decision;
}
