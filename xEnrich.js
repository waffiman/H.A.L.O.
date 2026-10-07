/**
 * Stage A step 2 — enrich an X Lead😴 via apidojo/twitter-user-scraper.
 * Writes name, location, timezone, email, headline, About, extra links, and a profile note. No ice, no score, no DM.
 * Tokens: APIFY_TOKEN_1…20, then APIFY_TOKEN / APIFY_TOKENS. Quota and auth errors
 * move to the next token.
 */
import { apifyTokens } from './enrichAndWrite.js';
import { xHandleFromUrl, channelFromUrl } from './leadChannel.js';
import { STATUS_LEAD, leadHasReadyMarker } from './crm/constants.js';
import * as crm from './crmStore.js';
import { timezoneFromLocation } from './locationTimezone.js';

const ACTOR = process.env.APIFY_X_ACTOR || 'apidojo~twitter-user-scraper';
export const X_ENRICH_MARKER = 'X profile enriched';

function isQuotaOrAuth(err) {
  const status = Number(err?.status || 0);
  if (status === 401 || status === 402 || status === 403 || status === 429 || status >= 500) return true;
  return /credit|quota|usage|insufficient|hard limit|platform-feature|too many|unauthorized/i.test(
    String(err?.message || '')
  );
}

function pickEmail(raw) {
  const direct = String(raw?.email || raw?.publicEmail || '').trim();
  if (direct.includes('@')) return direct.slice(0, 200);
  const bio = String(raw?.description || '');
  const m = bio.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].slice(0, 200) : '';
}

function pickWebsite(raw) {
  const urls = raw?.entities?.url?.urls;
  if (Array.isArray(urls) && urls[0]) {
    return String(urls[0].expanded_url || urls[0].url || '').trim();
  }
  return String(raw?.website || '').trim();
}

/** X often puts a domain in location. That is not a city and must not become CRM Location. */
function placeOrSite(rawLocation) {
  const value = String(rawLocation || '').replace(/\s+/g, ' ').trim();
  if (!value) return { location: '', site: '' };
  const compact = value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!/\s/.test(value) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(compact)) {
    return { location: '', site: value.startsWith('http') ? value : `https://${compact}` };
  }
  return { location: value.slice(0, 300), site: '' };
}

export function normalizeXProfile(raw, handle) {
  const name = String(raw?.name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const placed = placeOrSite(raw?.location);
  const location = placed.location;
  const description = String(raw?.description || '').replace(/\s+/g, ' ').trim();
  const professional = raw?.professional && typeof raw.professional === 'object' ? raw.professional : null;
  const website = (pickWebsite(raw) || placed.site).slice(0, 300);
  const categories = Array.isArray(professional?.category)
    ? professional.category.map((item) => String(item?.name || '').trim()).filter(Boolean)
    : [];
  const expanded = [];
  for (const group of [raw?.entities?.description?.urls, raw?.entities?.url?.urls]) {
    if (!Array.isArray(group)) continue;
    for (const item of group) expanded.push(item?.expanded_url || item?.url || '');
  }
  return {
    handle: String(raw?.userName || handle || '').replace(/^@/, ''),
    name,
    location,
    timezone: location ? timezoneFromLocation(location) || '' : '',
    email: pickEmail(raw),
    website,
    headline: (categories.join(', ') || String(professional?.professional_type || '')).trim().slice(0, 300),
    company: '',
    linkCandidates: [placed.site, website, raw?.location, ...expanded],
    description: description.slice(0, 800),
    followers: Number(raw?.followers) || 0,
    following: Number(raw?.following) || 0,
    canDm: raw?.canDm === true,
    protected: raw?.protected === true,
    isVerified: raw?.isVerified === true,
    isBlueVerified: raw?.isBlueVerified === true,
    createdAt: String(raw?.createdAt || '').trim(),
    statusesCount: Number(raw?.statusesCount) || 0,
    professionalType: String(professional?.professional_type || '').trim(),
    rawKeys: raw && typeof raw === 'object' ? Object.keys(raw).sort() : [],
  };
}

async function apifyFetchHandle(handle, token) {
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      twitterHandles: [handle, handle, handle, handle, handle],
      getFollowers: false,
      getFollowing: false,
      maxItems: 5,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(`Apify non-JSON (${res.status}): ${text.slice(0, 180)}`);
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text.slice(0, 180);
    const err = new Error(`Apify ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Apify returned empty dataset');
  }
  const want = handle.toLowerCase();
  const match = data.find((row) => String(row?.userName || '').toLowerCase() === want && row?.type !== 'tweet');
  return match || data.find((row) => row?.type !== 'tweet') || data[0];
}

export async function scrapeXProfile(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(clean)) throw new Error(`Bad X handle: ${handle}`);
  const tokens = apifyTokens();
  if (!tokens.length) throw new Error('No shared Apify tokens in env (APIFY_TOKEN_1…)');
  let lastErr;
  for (let i = 0; i < tokens.length; i++) {
    try {
      console.log(`X Apify @${clean} actor=${ACTOR} (token #${i + 1}/${tokens.length})`);
      const raw = await apifyFetchHandle(clean, tokens[i]);
      const profile = normalizeXProfile(raw, clean);
      if (!profile.name && !profile.description) {
        throw new Error('Apify X profile missing name and bio');
      }
      console.log(`X Apify fields: ${profile.rawKeys.join(', ')}`);
      return profile;
    } catch (e) {
      lastErr = e;
      console.error(`X Apify token #${i + 1} failed:`, e.message);
      if (!isQuotaOrAuth(e)) throw e;
    }
  }
  throw lastErr || new Error('Apify X failed');
}

function profileNote(profile) {
  const verified = profile.isBlueVerified ? 'blue' : profile.isVerified ? 'legacy' : 'no';
  const lines = [
    X_ENRICH_MARKER,
    profile.description ? `bio: ${profile.description}` : '',
    profile.website ? `website: ${profile.website}` : '',
    `followers: ${profile.followers} following: ${profile.following}`,
    `canDm: ${profile.canDm} protected: ${profile.protected} verified: ${verified}`,
    profile.createdAt ? `joined: ${profile.createdAt}` : '',
    profile.professionalType ? `professional: ${profile.professionalType}` : '',
    profile.statusesCount ? `posts: ${profile.statusesCount}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export async function enrichOneXLead(lead) {
  const handle = xHandleFromUrl(lead?.url || '');
  if (!handle) return { ok: false, error: 'not an X url' };
  try {
    const profile = await scrapeXProfile(handle);
    await crm.patchLead(lead.id, {
      name: profile.name || undefined,
      location: profile.location || undefined,
      timezone: profile.timezone || undefined,
      email: profile.email || undefined,
    });
    const { writeBasicEnrichCard, maybeDeepResearch } = await import('./leadCard.js');
    let card = await writeBasicEnrichCard({ ...lead, name: profile.name || lead.name }, profile);
    card = await maybeDeepResearch(card);
    await crm.appendNote(lead.id, profileNote(profile));
    console.log(
      `X enrich @${handle}: name="${profile.name}"` +
        (profile.location ? ` location="${profile.location}"` : '') +
        (profile.timezone ? ` tz=${profile.timezone}` : '') +
        (profile.email ? ' email=yes' : '') +
        ` canDm=${profile.canDm} links=${(card.extraLinks || []).length}`
    );
    return { ok: true, profile };
  } catch (e) {
    console.error(`X enrich FAILED @${handle}:`, e.message);
    return { ok: false, error: e.message };
  }
}

export async function leadsNeedingXEnrich() {
  const rows = await crm.listByStatus(STATUS_LEAD);
  return rows.filter((lead) => {
    if (channelFromUrl(lead.url) !== 'x') return false;
    if (!leadHasReadyMarker(lead)) return false;
    if (String(lead.notes || '').includes(X_ENRICH_MARKER)) return false;
    return true;
  });
}

export async function enrichReadyXLeads() {
  if (process.env.CHANNEL_X_ENABLED !== '1') {
    console.log('X enrich skipped (CHANNEL_X_ENABLED!=1).');
    return { skipped: true, reason: 'channel_off' };
  }
  if (!apifyTokens().length) {
    console.error('X enrich skipped: no shared Apify tokens');
    return { ok: 0, failed: 0, skipped: true, reason: 'no_token' };
  }
  const cap = Math.max(1, Math.min(20, Number(process.env.X_LEADS_PER_RUN || 5) || 5));
  const leads = await leadsNeedingXEnrich();
  const batch = leads.slice(0, cap);
  console.log(`X leads needing enrich: ${leads.length} (cap ${cap})`);
  let ok = 0;
  let failed = 0;
  for (const lead of batch) {
    const result = await enrichOneXLead(lead);
    if (result.ok) ok++;
    else failed++;
  }
  console.log(`[X enrich SUMMARY] ok=${ok} failed=${failed}`);
  return { ok, failed, remaining: Math.max(0, leads.length - batch.length) };
}
