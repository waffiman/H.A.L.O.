/**
 * Stage B helpers: LLM decisions + notes for Conversation 💬 inbox / silence.
 * Browser navigation stays in index.js (do not fork sendMessageToLead).
 */
import { generateSalesMessage } from './salesBrain.js';
import { readPageBodyText, appendPageNote } from './notionNotes.js';

/** Lowercase, strip punctuation, collapse spaces. */
export function normalizePersonName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy person-name match for CRM lookup from LinkedIn inbox sender labels.
 * Accepts exact, "First Last" vs "First M. Last", or shared first+last tokens.
 */
export function namesMatch(a, b) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(' ').filter((t) => t.length > 1);
  const tb = nb.split(' ').filter((t) => t.length > 1);
  if (!ta.length || !tb.length) return false;
  // Require first token match + at least one other shared token (usually last name)
  if (ta[0] !== tb[0]) return false;
  if (ta.length === 1 || tb.length === 1) return ta[0] === tb[0] && ta[0].length >= 4;
  const setB = new Set(tb.slice(1));
  return ta.slice(1).some((t) => setB.has(t));
}

/**
 * Strict inbound detection.
 * Prefer direction === 'inbound' from DOM sender attribution.
 * If direction is unknown for the last message → NOT inbound (avoid false replies).
 *
 * @param {Array<string|{text:string, direction?:string, from?:string}>} messages
 * @param {string[]} ourTexts ice-breaker / prior outbound texts
 */
export function threadHasInbound(messages = [], ourTexts = []) {
  if (!Array.isArray(messages) || messages.length === 0) return false;

  const normalized = messages.map((m) => {
    if (typeof m === 'string') return { text: m.trim(), direction: 'unknown', from: '' };
    return {
      text: String(m.text || '').trim(),
      direction: m.direction || 'unknown',
      from: m.from || '',
    };
  }).filter((m) => m.text.length > 1);

  if (!normalized.length) return false;

  const last = normalized[normalized.length - 1];

  // Primary: explicit DOM direction
  if (last.direction === 'outbound') return false;
  if (last.direction === 'inbound') {
    // Extra guard: don't treat our ice as inbound if mislabeled
    if (looksLikeOurOutbound(last.text, ourTexts)) return false;
    return true;
  }

  // direction unknown → conservative: only inbound if clearly NOT our text AND short reply-like
  if (looksLikeOurOutbound(last.text, ourTexts)) return false;
  if (last.text.length > 350) return false;
  if (/best(?:\s*of luck)?,\s*mykhailo/i.test(last.text)) return false;
  // Unknown sender + ambiguous text → do NOT claim inbound
  return false;
}

function looksLikeOurOutbound(text, ourTexts = []) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = norm(text);
  if (!t) return false;
  if (/best(?:\s*of luck)?,\s*mykhailo/i.test(text)) return true;
  for (const ours of ourTexts) {
    const o = norm(ours);
    if (!o) continue;
    const head = o.slice(0, Math.min(90, o.length));
    if (head.length >= 40 && (t.includes(head) || o.includes(t.slice(0, Math.min(90, t.length))))) {
      return true;
    }
    if (o.slice(0, 50) && t.startsWith(o.slice(0, 40))) return true;
  }
  // Typical ice opener length + Hi Name pattern from us
  if (/^hi\s+\w+/i.test(text) && text.length > 280) return true;
  return false;
}

export function formatThreadForPrompt(messages = []) {
  return messages
    .map((m) => {
      if (typeof m === 'string') return m;
      const who = m.direction === 'inbound' ? 'LEAD' : m.direction === 'outbound' ? 'ME' : '???';
      return `[${who}${m.from ? ` ${m.from}` : ''}] ${m.text}`;
    })
    .join('\n---\n');
}

export async function decideReplyForLead(lead, { thread = '' } = {}) {
  const notesText = await readPageBodyText(lead.id).catch(() => '');
  const decision = await generateSalesMessage({
    mode: 'reply',
    lead: { ...lead, notesText, msg: lead.msg },
    thread,
  });
  return { ...decision, notesText };
}

export async function craftClosingFollowup(lead) {
  const notesText = await readPageBodyText(lead.id).catch(() => '');
  const result = await generateSalesMessage({
    mode: 'closing_followup',
    lead: { ...lead, notesText, msg: lead.msg },
    thread: '(no reply from lead)',
  });
  return { text: result.text, notesText };
}

export async function noteAfterSend(pageId, mode, extra = '') {
  const bits = [`mode=${mode}`, extra].filter(Boolean).join(' | ');
  await appendPageNote(pageId, bits);
}
