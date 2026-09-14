/**
 * Phase 0.5: messageable Lead😴 with Link but no Ice-breaker
 * → Apify profile scrape → salesBrain ice_breaker → CRM Name + Ice-breaker + Processing at (UTC)
 */
import * as crm from './crmStore.js';
import { generateSalesMessage } from './salesBrain.js';
import { hasRealIceBreaker, isTemplateIceBreaker, sanitizeIceBreaker } from './messageQuality.js';
import { timezoneFromLocation } from './locationTimezone.js';
import { STATUS_LEAD, isLeadReadyForIcePipeline } from './crm/constants.js';

export { hasRealIceBreaker, isTemplateIceBreaker, sanitizeIceBreaker };

const APIFY_ACTOR = process.env.APIFY_ACTOR || 'apimaestro~linkedin-profile-detail';
const ENRICH_MAX = Number(process.env.ENRICH_MAX_PER_RUN || 10);
const APIFY_PAUSE_MS = Number(process.env.APIFY_PAUSE_MS || 2500);

function apifyTokens() {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const v = String(raw || '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  // Shared platform pool: APIFY_TOKEN_1 … APIFY_TOKEN_20 (failover when quota hits)
  for (let i = 1; i <= 20; i++) add(process.env[`APIFY_TOKEN_${i}`]);
  add(process.env.APIFY_TOKEN);
  for (const part of String(process.env.APIFY_TOKENS || '').split(/[,\s]+/)) add(part);
  return out;
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
 * Fetch messageable Lead😴 that still need Ice-breaker (accepted / ready marker / ice leftovers).
 */
export async function getLeadsNeedingEnrich() {
  const results = await crm.listByStatus(STATUS_LEAD);

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
      notes: l.notes || '',
      processingAt: l.processingAt,
    }))
    .filter((l) => {
      if (!l.url.includes('linkedin.com') || hasRealIceBreaker(l.ice)) return false;
      if (!isLeadReadyForIcePipeline(l, { hasIce: () => false })) return false;
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

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return [v];
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    if (typeof v === 'string' && !v.trim()) continue;
    return v;
  }
  return null;
}

function skillLabels(skills) {
  return asArray(skills)
    .map((s) => {
      if (typeof s === 'string') return s.trim();
      if (!s || typeof s !== 'object') return '';
      return String(s.name || s.title || s.skill || s.label || '').trim();
    })
    .filter(Boolean);
}

/**
 * Normalize Apify `apimaestro/linkedin-profile-detail` (and compatible) raw item
 * into a scoring/ice profile. Keeps every useful section the actor returns.
 */
export function normalizeApifyProfile(raw, slug = '') {
  const b = raw?.basic_info && typeof raw.basic_info === 'object' ? raw.basic_info : {};
  const exp = asArray(raw?.experience ?? b.experience);
  const exp0 = exp[0] || null;
  const edu = asArray(raw?.education ?? b.education);
  const certifications = asArray(
    raw?.certifications ?? raw?.certificate ?? raw?.licenses_and_certifications ?? b.certifications
  );
  const languages = asArray(raw?.languages ?? b.languages);
  const skills = skillLabels(raw?.skills ?? b.skills ?? raw?.top_skills);
  const projects = asArray(raw?.projects ?? b.projects);
  const honors = asArray(raw?.honors ?? raw?.honors_and_awards ?? raw?.awards ?? b.honors);
  const volunteer = asArray(raw?.volunteer ?? raw?.volunteer_experience ?? b.volunteer);
  const publications = asArray(raw?.publications ?? b.publications);
  const courses = asArray(raw?.courses ?? b.courses);
  const recommendations = asArray(raw?.recommendations ?? b.recommendations);
  const organizations = asArray(raw?.organizations ?? b.organizations);

  const loc = b.location || raw?.location || {};
  const location =
    (typeof loc === 'string' ? loc : loc.full || loc.city || loc.country || '').trim() ||
    [loc.city, loc.country].filter(Boolean).join(', ').trim();

  const email = String(
    pickFirst(
      b.email,
      b.emails?.[0],
      raw?.email,
      raw?.emails?.[0],
      raw?.contact_info?.email,
      raw?.email_resolution?.email
    ) || ''
  )
    .trim()
    .toLowerCase();

  const employeeCount = Number(
    pickFirst(
      b.company_employee_count,
      b.employee_count,
      raw?.company_employee_count,
      b.current_company_employee_count,
      exp0?.company_employee_count,
      exp0?.employee_count
    )
  );

  const companyObj =
    (typeof b.current_company === 'object' && b.current_company) ||
    (typeof exp0?.company === 'object' && exp0.company) ||
    null;
  const companyName = String(
    pickFirst(
      typeof b.current_company === 'string' ? b.current_company : null,
      companyObj?.name,
      typeof exp0?.company === 'string' ? exp0.company : null,
      b.company
    ) || ''
  ).trim();

  const profile = {
    name: String(pickFirst(b.fullname, raw?.fullName, raw?.name) || '').trim(),
    firstName: String(pickFirst(b.first_name, b.firstName, raw?.firstName) || '').trim(),
    lastName: String(pickFirst(b.last_name, b.lastName, raw?.lastName) || '').trim(),
    headline: String(pickFirst(b.headline, raw?.headline) || '').trim(),
    about: String(pickFirst(b.about, b.summary, raw?.about, raw?.summary) || '').trim(),
    company: companyName,
    companyUrn: String(pickFirst(companyObj?.urn, companyObj?.id, b.current_company_urn) || '').trim(),
    companyUrl: String(pickFirst(companyObj?.url, companyObj?.linkedin_url, b.current_company_url) || '').trim(),
    industry: String(
      pickFirst(
        b.industry,
        raw?.industry,
        b.current_company_industry,
        companyObj?.industry,
        exp0?.industry
      ) || ''
    ).trim(),
    employeeCount: Number.isFinite(employeeCount) && employeeCount > 0 ? employeeCount : null,
    companySizeText: String(
      pickFirst(
        b.company_size,
        b.current_company_size,
        raw?.company_size,
        companyObj?.company_size,
        companyObj?.size
      ) || ''
    ).trim(),
    location,
    country: String(pickFirst(typeof loc === 'object' ? loc.country : null, b.country) || '').trim(),
    city: String(pickFirst(typeof loc === 'object' ? loc.city : null, b.city) || '').trim(),
    email,
    timezone: timezoneFromLocation(location),
    topRole: exp0
      ? `${exp0.title || exp0.position || ''} at ${
          typeof exp0.company === 'string' ? exp0.company : exp0.company?.name || companyName
        }`.trim()
      : '',
    currentTitle: String(
      pickFirst(exp0?.title, exp0?.position, b.occupation, b.job_title, raw?.position) || ''
    ).trim(),
    connectionCount: Number(
      pickFirst(b.connection_count, b.connections, raw?.connection_count, raw?.connections)
    ) || null,
    followerCount: Number(pickFirst(b.follower_count, b.followers, raw?.follower_count, raw?.followers)) || null,
    experience: exp,
    education: edu,
    certifications,
    languages,
    skills,
    projects,
    honors,
    volunteer,
    publications,
    courses,
    recommendations,
    organizations,
    hasPhoto: Boolean(
      b.profile_picture_url || b.profile_picture || raw?.profilePic || raw?.profile_pic_url
    ),
    profilePicture: String(
      pickFirst(b.profile_picture_url, b.profile_picture, raw?.profilePic, raw?.profile_pic_url) || ''
    ),
    publicIdentifier: String(pickFirst(b.public_identifier, b.publicIdentifier, slug) || slug).trim(),
    linkedinUrl: String(
      pickFirst(b.profile_url, b.url, raw?.url, slug ? `https://www.linkedin.com/in/${slug}/` : null) ||
        ''
    ).trim(),
    slug,
    // Full actor payload for LLM scoring (no truncation of sections).
    apifyRaw: raw && typeof raw === 'object' ? raw : {},
  };
  return profile;
}

export async function scrapeLinkedInProfile(url) {
  const slug = linkedInSlug(url);
  if (!slug) throw new Error(`Bad LinkedIn URL: ${url}`);
  const tokens = apifyTokens();
  if (tokens.length === 0) throw new Error('No shared Apify tokens in env (APIFY_TOKEN_1…)');

  let lastErr;
  for (let i = 0; i < tokens.length; i++) {
    try {
      console.log(`Apify scrape slug=${slug} (token #${i + 1})`);
      const raw = await apifyFetchProfile(slug, tokens[i]);
      const profile = normalizeApifyProfile(raw, slug);
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
 * Enrich must not overwrite Name already set in CRM (e.g. after accept → Lead ready).
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
  {
    name,
    iceBreaker,
    location,
    timezone,
    email,
    leadScore,
    scoreBreakdown,
    setProcessingAt = false,
  }
) {
  await crm.updateNameAndIceBreaker(pageId, {
    name,
    iceBreaker: iceBreaker?.slice(0, 2000),
    location: location != null ? String(location).trim().slice(0, 300) : undefined,
    timezone: timezone != null ? String(timezone).trim().slice(0, 64) : undefined,
    email: email != null ? String(email).trim().slice(0, 200) : undefined,
    leadScore,
    scoreBreakdown,
    setProcessingAt,
  });
}

/**
 * Enrich a single messageable Lead😴 (Apify + LLM ice-breaker).
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
        (profile.email ? ` | ${profile.email}` : '') +
        (profile.skills?.length ? ` | skills=${profile.skills.length}` : '') +
        (profile.experience?.length ? ` | exp=${profile.experience.length}` : '')
    );
    // Immediately after Apify: ICP score, then ice-breaker (same run — never deferred).
    let leadScore = null;
    let scoreBreakdown = null;
    try {
      const { scoreLead } = await import('./leadScoring.js');
      const { readSalesPolicy } = await import('./brainStore.js');
      const scored = await scoreLead(profile, readSalesPolicy());
      leadScore = scored.score;
      scoreBreakdown = scored.breakdown;
      console.log(`  Lead score: ${leadScore}/10 (${scored.breakdown?.source || 'rubric'})`);
    } catch (e) {
      console.error('  Lead score skipped:', e.message);
    }
    const ice = await generateIceBreaker({ ...profile, name: nameForIce || apifyName });
    const setProcessingAt = !lead.processingAt;
    await updateNotionNameAndIceBreaker(lead.id, {
      name: nameForNotion,
      iceBreaker: ice,
      location: profile.location || '',
      timezone: profile.timezone || '',
      email: profile.email || '',
      leadScore,
      scoreBreakdown,
      setProcessingAt,
    });
    console.log(
      `  Ice-breaker written (${ice.length} chars) — ${nameForIce || lead.url}` +
        (profile.location ? ` | location=${profile.location}` : '') +
        (profile.timezone ? ` | timezone=${profile.timezone}` : '') +
        (profile.email ? ` | email=${profile.email}` : '') +
        (leadScore != null ? ` | score=${leadScore}` : '') +
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
        leadScore,
        scoreBreakdown,
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
 * Enrich all messageable Lead😴 missing a real Ice-breaker (capped per run).
 */
export async function enrichProposal1Leads() {
  console.log('--- Phase 0.5: Apify enrich + LLM Ice-breaker ---');
  if (apifyTokens().length === 0) {
    console.error('Phase 0.5 skipped: no shared Apify tokens (APIFY_TOKEN_1…)');
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
