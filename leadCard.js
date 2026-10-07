/**
 * Basic enrich card: structured fields, classified sub-links, fixed About.
 * Does not fetch any sub-link.
 */
import * as crm from './crmStore.js';
import { collectExtraLinks } from './leadLinks.js';
import { generateLeadAbout } from './salesBrain.js';
import { runDeepResearch, deepResearchEnabled } from './deepResearch.js';

export async function writeBasicEnrichCard(lead, profile = {}) {
  const links = collectExtraLinks(profile.linkCandidates || [], lead?.url || profile.linkedinUrl || '');
  const about = await generateLeadAbout({ profile, links });
  const patch = { about, extraLinks: links };
  if (profile.headline) patch.headline = String(profile.headline).slice(0, 300);
  if (profile.company) patch.company = String(profile.company).slice(0, 200);
  await crm.patchLead(lead.id, patch);
  console.log(
    `Basic card: headline=${patch.headline ? 'yes' : 'no'} company=${patch.company ? 'yes' : 'no'} links=${links.length}`
  );
  return {
    ...lead,
    headline: patch.headline || lead.headline || '',
    company: patch.company || lead.company || '',
    about,
    extraLinks: links,
  };
}

/** After the card is saved: DeepResearch only when the toggle is on, then the caller does score and ice. */
export async function maybeDeepResearch(lead) {
  if (!deepResearchEnabled()) return lead;
  return runDeepResearch(lead);
}
