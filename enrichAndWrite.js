/**
 * Phase 0.5: Proposal 1️⃣ leads with Link but no Ice-breaker
 * → Apify profile scrape → salesBrain ice_breaker → Notion Name + Ice-breaker + Processing at (UTC)
 */
import * as crm from './crmStore.js';
import { generateSalesMessage } from './salesBrain.js';
import { hasRealIceBreaker, isTemplateIceBreaker, sanitizeIceBreaker } from './messageQuality.js';
import { timezoneFromLocation } from './locationTimezone.js';

export { hasRealIceBreaker, isTemplateIceBreaker, sanitizeIceBreaker };

const STATUS_PROPOSAL_1 = 'Proposal 1️⃣';
const APIFY_ACTOR = process.env.APIFY_ACTOR || 'apimaestro~linkedin-profile-detail';
const ENRICH_MAX = Number(process.env.ENRICH_MAX_PER_RUN || 10);
const APIFY_PAUSE_MS = Number(process.env.APIFY_PAUSE_MS || 2500);

function apifyTokens() {
  const tokens = [
    process.env.APIFY_TOKEN_1,
    process.env.APIFY_TOKEN_2,
    process.env.APIFY_TOKEN_3,
    process.env.APIFY_TOKEN,
  ].filter(Boolean);
  return [...new Set(tokens)];
}

/** LinkedIn URL → username/slug for Apify */
export function linkedInSlug(url = '') {
  try {
    const u = String(url).split('?')[0].split('#')[0];
    const m = u.match(/linkedin\.com\/in\/([^/]+)/i);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/\/$/, '');
  } catch {
    return null;
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch leads in Proposal 1️⃣ that still need Ice-breaker.
 */
export async function getLeadsNeedingEnrich() {
  const results = await crm.listByStatus(STATUS_PROPOSAL_1);

  const target = (process.env.TARGET_LINKEDIN_URL || '').trim().toLowerCase();
  const targetSlug = target
    ? target.replace(/\/+$/, '').split('/in/').pop()?.split(/[/?#]/)[0] || ''
    : '';

  return results
    .map((l) => ({
      id: l.id,
      name: l.name,
      url: l.url,
      ice: l.msg || '',
      processingAt: l.processingAt,
    }))
    .filter((l) => {
      if (!l.url.includes('linkedin.com') || hasRealIceBreaker(l.ice)) return false;
      if (!targetSlug) return true;
      const slug = l.url.replace(/\/+$/, '').split('/in/').pop()?.split(/[/?#]/)[0] || '';
      return slug.toLowerCase() === targetSlug;
    });
}

async function apifyFetchProfile(slug, token) {
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ includeEmail: true, username: slug }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apify non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text.slice(0, 200);
    const err = new Error(`Apify ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Apify returned empty dataset');
  }
  return data[0];
}

export async function scrapeLinkedInProfile(url) {
  const slug = linkedInSlug(url);
  if (!slug) throw new Error(`Bad LinkedIn URL: ${url}`);
  const tokens = apifyTokens();
  if (tokens.length === 0) throw new Error('No APIFY_TOKEN_1 / APIFY_TOKEN_2 in env');

  let lastErr;
  for (let i = 0; i < tokens.length; i++) {
    try {
      console.log(`Apify scrape slug=${slug} (token #${i + 1})`);
      const raw = await apifyFetchProfile(slug, tokens[i]);
      const b = raw.basic_info || {};
      const exp0 = Array.isArray(raw.experience) ? raw.experience[0] : null;
      const loc = b.location || {};
      const location =
        (typeof loc === 'string' ? loc : loc.full || loc.city || loc.country || '').trim() ||
        [loc.city, loc.country].filter(Boolean).join(', ').trim();
      const email = String(
        b.email ||
          b.emails?.[0] ||
          raw.email ||
          raw.emails?.[0] ||
          raw.contact_info?.email ||
          ''
      )
        .trim()
        .toLowerCase();
      const profile = {
        name: (b.fullname || raw.fullName || '').trim(),
        headline: (b.headline || '').trim(),
        about: (b.about || '').trim(),
        company: (b.current_company || exp0?.company || '').trim(),
        location,
        email,
        timezone: timezoneFromLocation(location),
        topRole: exp0 ? `${exp0.title || ''} at ${exp0.company || ''}`.trim() : '',
        slug,
      };
      if (!profile.name && !profile.headline) {
        throw new Error('Apify profile missing name and headline');
      }
      return profile;
    } catch (e) {
      lastErr = e;
      console.error(`Apify token #${i + 1} failed:`, e.message);
      if (e.status === 429 || e.status >= 500) continue;
      continue;
    }
  }
  throw lastErr || new Error('Apify failed');
}

/** @deprecated prefer generateSalesMessage({ mode: 'ice_breaker' }) */
export async function generateIceBreaker(profile) {
  const result = await generateSalesMessage({
    mode: 'ice_breaker',
    profile,
    lead: { name: profile.name },
  });
  return result.text;
}

/** True when LinkedIn/Apify returns "Kevin M." instead of a full last name. */
export function isAbbreviatedPersonName(name) {
  const parts = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (parts.length < 2) return false;
  return /^[a-z]\.?$/i.test(parts[parts.length - 1]);
}

/** Prefer a fuller display name over an abbreviated Apify/CRM variant. */
export function preferFullerPersonName(existingName, incomingName) {
  const a = String(existingName || '').replace(/\s+/g, ' ').trim();
  const b = String(incomingName || '').replace(/\s+/g, ' ').trim();
  if (!a) return b;
  if (!b) return a;
  if (isAbbreviatedPersonName(b) && !isAbbreviatedPersonName(a)) return a;
  if (isAbbreviatedPersonName(a) && !isAbbreviatedPersonName(b)) return b;
  // Same abbreviation quality — prefer longer / more tokens
  if (b.split(' ').length > a.split(' ').length) return b;
  if (b.length > a.length + 2) return b;
  return a;
}

/**
 * Enrich must not overwrite Name already set in CRM (e.g. after accept → Proposal 1️⃣).
 * Returns nameForNotion=null when CRM name should be kept; ice-breaker still uses CRM name.
 */
export function resolveEnrichDisplayName(crmName, apifyName) {
  const crm = String(crmName || '').replace(/\s+/g, ' ').trim();
  const apify = String(apifyName || '').replace(/\s+/g, ' ').trim();
  if (crm.length >= 2) {
    return { nameForNotion: null, nameForIce: crm, keptCrm: true };
  }
  const resolved = preferFullerPersonName(crm, apify) || apify;
  return {
    nameForNotion: resolved || null,
    nameForIce: resolved || apify,
    keptCrm: false,
  };
}

export async function updateNotionNameAndIceBreaker(
  pageId,
  { name, iceBreaker, location, timezone, email, setProcessingAt = false }
) {
  await crm.updateNameAndIceBreaker(pageId, {
    name,
    iceBreaker: iceBreaker?.slice(0, 2000),
    location: location != null ? String(location).trim().slice(0, 300) : undefined,
    timezone: timezone != null ? String(timezone).trim().slice(0, 64) : undefined,
    email: email != null ? String(email).trim().slice(0, 200) : undefined,
    setProcessingAt,
  });
}

/**
 * Enrich a single Proposal 1️⃣ lead (Apify + LLM ice-breaker).
 * @returns {{ ok: boolean, lead?: object, error?: string }}
 */
export async function enrichOneLead(lead) {
  if (!lead?.id || !lead?.url) return { ok: false, error: 'missing lead id/url' };
  if (apifyTokens().length === 0) return { ok: false, error: 'no Apify token' };
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return { ok: false, error: 'no LLM key' };
  }
  try {
    console.log(`Enriching: ${lead.url}`);
    const profile = await scrapeLinkedInProfile(lead.url);
    const apifyName = (profile.name || '').trim();
    const { nameForNotion, nameForIce, keptCrm } = resolveEnrichDisplayName(lead.name, apifyName);
    if (keptCrm && apifyName && apifyName !== nameForIce) {
      console.log(`  Name kept from CRM (acceptance): "${nameForIce}" (Apify had "${apifyName}")`);
    } else if (nameForNotion && nameForNotion !== apifyName) {
      console.log(
        `  Name keep/expand: Apify="${apifyName}" CRM="${lead.name || ''}" → "${nameForNotion}"`
      );
    }
    console.log(
      `  Profile: ${nameForIce || '(no name)'} | ${profile.company || profile.headline || ''}` +
        (profile.location ? ` | ${profile.location}` : '') +
        (profile.timezone ? ` | tz=${profile.timezone}` : '') +
        (profile.email ? ` | ${profile.email}` : '')
    );
    const ice = await generateIceBreaker({ ...profile, name: nameForIce || apifyName });
    const setProcessingAt = !lead.processingAt;
    await updateNotionNameAndIceBreaker(lead.id, {
      name: nameForNotion,
      iceBreaker: ice,
      location: profile.location || '',
      timezone: profile.timezone || '',
      email: profile.email || '',
      setProcessingAt,
    });
    console.log(
      `  Ice-breaker written (${ice.length} chars) — ${nameForIce || lead.url}` +
        (profile.location ? ` | location=${profile.location}` : '') +
        (profile.timezone ? ` | timezone=${profile.timezone}` : '') +
        (profile.email ? ` | email=${profile.email}` : '') +
        (setProcessingAt ? ' | Processing at=UTC now' : ' | Processing at kept') +
        (keptCrm ? ' | Name unchanged in CRM' : '')
    );
    await sleep(APIFY_PAUSE_MS);
    return {
      ok: true,
      lead: {
        ...lead,
        name: (nameForIce || lead.name || apifyName || '').trim(),
        company: profile.company || lead.company || '',
        headline: profile.headline || lead.headline || '',
        location: profile.location || lead.location || '',
        timezone: profile.timezone || lead.timezone || '',
        email: profile.email || lead.email || '',
        msg: ice,
        ice,
      },
    };
  } catch (e) {
    console.error(`  Enrich FAILED — ${lead.url}:`, e.message);
    await sleep(1000);
    return { ok: false, error: e.message };
  }
}

/**
 * Enrich all Proposal 1️⃣ leads missing a real Ice-breaker (capped per run).
 */
export async function enrichProposal1Leads() {
  console.log('--- Phase 0.5: Apify enrich + LLM Ice-breaker ---');
  if (apifyTokens().length === 0) {
    console.error('Phase 0.5 skipped: set APIFY_TOKEN_1 / APIFY_TOKEN_2');
    return { ok: 0, failed: 0, skipped: 0 };
  }
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Phase 0.5 skipped: set OPENAI_API_KEY or GEMINI_API_KEY');
    return { ok: 0, failed: 0, skipped: 0 };
  }

  const leads = await getLeadsNeedingEnrich();
  console.log(`Leads needing enrich: ${leads.length} (cap ${ENRICH_MAX})`);
  const batch = leads.slice(0, ENRICH_MAX);
  let ok = 0;
  let failed = 0;

  for (const lead of batch) {
    const result = await enrichOneLead(lead);
    if (result.ok) ok++;
    else failed++;
  }

  console.log(`[Enrich SUMMARY] ok: ${ok}, failed: ${failed}, remaining: ${Math.max(0, leads.length - batch.length)}`);
  return { ok, failed, skipped: Math.max(0, leads.length - batch.length) };
}
