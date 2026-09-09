/** Shared message quality gates for ice / reply / closing. */



export function notionRichText(prop) {

  const arr = prop?.rich_text;

  if (!Array.isArray(arr) || !arr.length) return '';

  return arr.map((t) => t.plain_text || '').join('').trim();

}



export function isTemplateIceBreaker(text = '') {

  const t = String(text);

  if (t.length < 40) return true;

  if (/\[[^\]]{1,80}\]/.test(t)) return true;

  if (/\{(?:Your Name|Name|FirstName|Company|specific[^}]*)\}/i.test(t)) return true;

  if (/\b(?:Your Name|INSERT NAME|PLACEHOLDER)\b/i.test(t)) return true;

  if (/you've really set yourself apart in the industry/i.test(t)) return true;

  if (/This can really eat into your potential commissions/i.test(t)) return true;

  return false;

}



export function sanitizeIceBreaker(text = '') {

  let t = String(text).trim();

  t = t.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();

  t = t.replace(/\[(?:Your\s*Name|Sender(?:'s)?\s*Name|My Name|Full Name)\]/gi, 'Mykhailo');

  t = t.replace(/\{(?:Your\s*Name|Sender(?:'s)?\s*Name)\}/gi, 'Mykhailo');

  t = t.replace(

    /((?:Best(?:\s*regards)?|Cheers|Thanks|Warm regards|Kind regards)\s*,?\s*\n+)\s*(?:Your\s*Name|Sender)\s*$/i,

    '$1Mykhailo'

  );

  return normalizeDashes(t).trim();

}



/**

 * Mid-thread replies / closings: strip re-greetings and email-style sign-offs.

 */

export function stripMidThreadFormalities(text = '') {

  let t = String(text || '').trim();

  if (!t) return '';

  // Leading Hi/Hello/Hey/Dear Name…

  t = t.replace(

    /^(?:hi|hello|hey|dear)\s+[\w.'’-]+(?:\s+[\w.'’-]+)?\s*[,!.]?\s+/i,

    ''

  );

  // Trailing Cheers / Best / Regards (+ optional name)

  t = t.replace(

    /\n*(?:cheers|best(?:\s+regards)?|kind\s+regards|warm\s+regards|regards|thanks(?:\s+again)?|thank\s+you|sincerely|best\s+wishes)\s*,?\s*(?:\n+\s*[\w.'’-]+)?\s*$/i,

    ''

  );

  return t.trim();

}



/**

 * Hard filter: replace em/en/figure dashes (and --) with a single hyphen.

 * Applied to every outbound message before send.

 */

export function normalizeDashes(text = '') {

  return String(text)

    .replace(/[\u2014\u2013\u2012\u2015\u2E3A\u2E3B]/g, '-') // — – ‒ ― ⸺ ⸻

    .replace(/--+/g, '-');

}



export function hasRealIceBreaker(text = '') {

  const t = String(text || '').trim();

  if (!t || t === 'Hi!' || t.length < 40) return false;

  return !isTemplateIceBreaker(t);

}



/** Target size for one LinkedIn bubble (~1–2 short sentences, human-typed). */

const DEFAULT_DM_SPLIT_THRESHOLD = 220;

const DEFAULT_DM_SPLIT_MAX = 200;



/**

 * Weighted random bubble count by message kind.

 * ice: 2 most often, then 1, then 3 (rare). Max 3.

 * closing: 1 often, 2 less. Max 2.

 * reply: 1 usually, 2 rare. Max 2.

 */

export function pickRandomDmParts(kind = 'ice_breaker') {

  const k = String(kind || 'ice_breaker');

  const r = Math.random();

  if (k === 'reply') {

    return r < 0.82 ? 1 : 2;

  }

  if (k === 'closing_followup' || k === 'closing') {

    return r < 0.72 ? 1 : 2;

  }

  // ice_breaker: 2 ≫ 1 > 3

  if (r < 0.55) return 2;

  if (r < 0.85) return 1;

  return 3;

}



function splitLongParagraph(text, maxChunk) {

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text];

  const out = [];

  let buf = '';

  for (const raw of sentences) {

    const s = raw.trim();

    if (!s) continue;

    const candidate = buf ? `${buf} ${s}` : s;

    if (candidate.length <= maxChunk) {

      buf = candidate;

      continue;

    }

    if (buf) out.push(buf.trim());

    if (s.length <= maxChunk) {

      buf = s;

      continue;

    }

    // Last resort: word boundaries (rare for our ice copy)

    const words = s.split(/\s+/);

    buf = '';

    for (const w of words) {

      const next = buf ? `${buf} ${w}` : w;

      if (next.length <= maxChunk) buf = next;

      else {

        if (buf) out.push(buf.trim());

        buf = w;

      }

    }

  }

  if (buf.trim()) out.push(buf.trim());

  return out;

}



function mergeTinyChunks(chunks, minLen = 28) {

  if (chunks.length < 2) return chunks;

  const out = [...chunks];

  for (let i = out.length - 1; i > 0; i--) {

    if (out[i].length < minLen && out[i - 1].length + 1 + out[i].length <= DEFAULT_DM_SPLIT_MAX + 40) {

      out[i - 1] = `${out[i - 1]} ${out[i]}`.trim();

      out.splice(i, 1);

    }

  }

  return out;

}



/**

 * Split a long DM into logically complete bubbles (paragraphs, then sentences).

 * Part count is randomly weighted by kind (unless maxParts is forced).

 *

 * @param {string} text

 * @param {{ threshold?: number, maxChunk?: number, kind?: string, maxParts?: number }} opts

 *   kind: 'ice_breaker' | 'reply' | 'closing_followup'

 */

export function splitMessageForDm(text = '', opts = {}) {

  const threshold = Number(opts.threshold ?? process.env.DM_SPLIT_THRESHOLD ?? DEFAULT_DM_SPLIT_THRESHOLD);

  const maxChunk = Number(opts.maxChunk ?? process.env.DM_SPLIT_MAX_CHARS ?? DEFAULT_DM_SPLIT_MAX);

  const kind = String(opts.kind || opts.mode || 'ice_breaker');



  let targetParts =

    opts.maxParts != null ? Math.max(1, Number(opts.maxParts) || 1) : pickRandomDmParts(kind);



  const t = String(text || '').trim();

  if (!t) return [];



  // Too short to sensibly split — always one bubble

  if (t.length <= Math.min(threshold, 120) || targetParts === 1) return [t];



  const paragraphs = t.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

  let chunks = [];

  for (const p of paragraphs) {

    if (p.length <= maxChunk) chunks.push(p);

    else chunks.push(...splitLongParagraph(p, maxChunk));

  }

  chunks = mergeTinyChunks(chunks);

  if (!chunks.length) return [t];



  // Cap at what the text can naturally support

  targetParts = Math.min(targetParts, chunks.length);

  if (targetParts <= 1) return [t];

  if (chunks.length > targetParts) chunks = mergeToMaxParts(chunks, targetParts);

  return chunks;

}



/** Merge consecutive bubbles until count ≤ maxParts (prefer keeping later CTA separate). */

function mergeToMaxParts(chunks, maxParts) {

  if (chunks.length <= maxParts) return chunks;

  const out = [...chunks];

  while (out.length > maxParts) {

    // Merge the two shortest adjacent pair near the start (keep last bubble intact longer)

    let bestI = 0;

    let bestScore = Infinity;

    for (let i = 0; i < out.length - 1; i++) {

      // Prefer merging earlier bubbles so the last CTA stays distinct when possible

      const score = out[i].length + out[i + 1].length + i * 5;

      if (score < bestScore) {

        bestScore = score;

        bestI = i;

      }

    }

    out[bestI] = `${out[bestI]} ${out[bestI + 1]}`.trim();

    out.splice(bestI + 1, 1);

  }

  return out;

}


