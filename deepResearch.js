/**
 * DeepResearch pack. Tools are registered here one at a time.
 * An empty registry still finishes the step so lead score and ice can follow.
 * Tools must not open the lead's main Link.
 */
import * as crm from './crmStore.js';
import { collectExtraLinks } from './leadLinks.js';
import { timezoneFromLocation } from './locationTimezone.js';
import { generateDeepResearchUpdate } from './salesBrain.js';

/** @type {{ id: string, kinds: string[]|null, run: Function }[]} */
export const DEEP_RESEARCH_TOOLS = [];

const FILLABLE = ['name', 'headline', 'company', 'location', 'email'];

export function deepResearchEnabled() {
  return process.env.DEEP_RESEARCH_ENABLED === '1';
}

function blank(value) {
  return !String(value || '').trim();
}

function sourceBlob(lead, facts) {
  return [
    lead?.name,
    lead?.headline,
    lead?.company,
    lead?.location,
    lead?.email,
    lead?.about,
    ...(facts || []).map((item) => `${item?.text || ''}\n${item?.sourceUrl || ''}`),
  ]
    .filter(Boolean)
    .join('\n');
}

/** A proposed value is kept only when that exact phrase is already in the tool facts or the card. */
function grounded(value, blob, max = 300) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > max) return '';
  if (!String(blob || '').toLowerCase().includes(text.toLowerCase())) return '';
  return text;
}

function emptyFieldNames(lead) {
  return FILLABLE.filter((key) => blank(lead?.[key]));
}

/**
 * Copy grounded values into fields that are still empty.
 * The same fact stays in About; this only fills the structured columns.
 */
export function fillsForEmptyFields(lead, proposed, facts) {
  const blob = sourceBlob(lead, facts);
  const patch = {};
  const filled = [];
  for (const key of emptyFieldNames(lead)) {
    const value = grounded(proposed?.[key], blob, key === 'email' ? 200 : 300);
    if (!value) continue;
    if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) continue;
    patch[key] = value;
    filled.push(key);
  }
  if (patch.location && blank(lead?.timezone)) {
    const tz = timezoneFromLocation(patch.location);
    if (tz) {
      patch.timezone = tz;
      filled.push('timezone');
    }
  }
  const known = new Set((lead?.extraLinks || []).map((item) => String(item?.url || '').toLowerCase()));
  const freshUrls = (proposed?.links || []).filter((url) => {
    const abs = grounded(url, blob, 400);
    return abs && !known.has(abs.toLowerCase());
  });
  if (freshUrls.length) {
    const merged = collectExtraLinks(
      [...(lead?.extraLinks || []).map((item) => item.url), ...freshUrls],
      lead?.url || ''
    );
    if (merged.length > (lead?.extraLinks || []).length) {
      patch.extraLinks = merged;
      filled.push('extraLinks');
    }
  }
  return { patch, filled };
}

export async function runDeepResearch(lead) {
  if (!deepResearchEnabled()) return { ...lead, deepRan: false, reason: 'off' };
  if (lead?.deepResearchedAt) {
    console.log('DeepResearch already done — skip.');
    return { ...lead, deepRan: false, reason: 'already' };
  }
  if (!DEEP_RESEARCH_TOOLS.length) {
    console.log('DeepResearch registry empty — card unchanged, score and ice may follow.');
    return { ...lead, deepRan: true, supplemented: false };
  }

  const facts = [];
  for (const tool of DEEP_RESEARCH_TOOLS) {
    try {
      const found = await tool.run(lead);
      if (Array.isArray(found)) facts.push(...found.filter((item) => item?.text));
    } catch (e) {
      console.error(`DeepResearch tool ${tool.id} failed:`, e.message);
    }
  }
  if (!facts.length) return { ...lead, deepRan: true, supplemented: false };

  const emptyFields = emptyFieldNames(lead);
  const update = await generateDeepResearchUpdate({
    profile: lead,
    links: lead.extraLinks || [],
    currentAbout: lead.about || '',
    additions: facts,
    emptyFields,
  });
  const { patch: fills, filled } = fillsForEmptyFields(lead, update.fill, facts);
  const deepResearchedAt = new Date().toISOString();
  const patch = { about: update.about || lead.about || '', deepResearchedAt, ...fills };
  await crm.patchLead(lead.id, patch);
  console.log(
    `DeepResearch supplemented About (${facts.length} fact source(s))` +
      (filled.length ? `; filled ${filled.join(', ')}` : '; no empty fields grounded')
  );
  return {
    ...lead,
    ...patch,
    extraLinks: patch.extraLinks || lead.extraLinks || [],
    deepRan: true,
    supplemented: true,
    filled,
  };
}
