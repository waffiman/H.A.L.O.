/**
 * Build LinkedIn People search URL from Brain target portrait + LinkedIn filters.
 */
import {
  normalizePortrait,
  readSalesPolicy,
  normalizeLinkedInSearchFields,
  defaultLinkedInSearchFields,
} from './brainStore.js';
import { REGION_GEO_URNS as GEO_URNS, normalizeRegionList } from './regionsGeo.js';

export { GEO_URNS as REGION_GEO_URNS };

const STAGE_LABELS = {
  pre_revenue: 'pre-revenue',
  early: 'early stage startup',
  growth: 'growth stage',
  established: 'established company',
};

const COMPANY_SIZE_KEYWORDS = {
  solo: 'solo founder',
  '2_10': 'small team',
  '11_50': 'mid-size',
  '51_200': 'scale-up',
  '200_plus': 'enterprise',
};

/** Connection degree → LinkedIn network facet codes (F=1st, S=2nd, O=3rd+). */
export const CONNECTION_DEGREE_NETWORK = {
  '2nd': ['S'],
  '3rd_plus': ['O'],
  '2nd_3rd': ['S', 'O'],
  all: ['S', 'O'],
  '1st': ['F'],
};

export const PROFILE_LANGUAGES = [
  { id: '', label: 'Any' },
  { id: 'en', label: 'English' },
  { id: 'uk', label: 'Ukrainian' },
  { id: 'de', label: 'German' },
  { id: 'fr', label: 'French' },
  { id: 'es', label: 'Spanish' },
  { id: 'pl', label: 'Polish' },
];

export const CONNECTION_DEGREE_OPTIONS = [
  { id: '2nd', label: '2nd connections' },
  { id: '3rd_plus', label: '3rd+ connections' },
  { id: '2nd_3rd', label: '2nd & 3rd+' },
  { id: 'all', label: 'All (not 1st)' },
];

/** LinkedIn People → Seniority facet codes. */
export const SENIORITY_FACETS = {
  intern: '1',
  entry: '2',
  associate: '3',
  mid_senior: '4',
  director: '5',
  executive: '6',
};

/** LinkedIn People → Years of experience facet codes. */
export const YEARS_EXPERIENCE_FACETS = {
  lt1: '1',
  y1_2: '2',
  y3_5: '3',
  y6_10: '4',
  gt10: '5',
};

/** LinkedIn People → Company headcount facet codes (B–I). */
export const COMPANY_HEADCOUNT_FACETS = {
  '1_10': 'B',
  '11_50': 'C',
  '51_200': 'D',
  '201_500': 'E',
  '501_1000': 'F',
  '1001_5000': 'G',
  '5001_10000': 'H',
  '10001_plus': 'I',
};

/** LinkedIn People → Function facet codes (subset — full list in dashboard UI). */
export const FUNCTION_FACETS = {
  accounting: '1',
  admin: '2',
  business_dev: '4',
  consulting: '6',
  engineering: '8',
  entrepreneurship: '9',
  finance: '10',
  hr: '12',
  it: '13',
  legal: '14',
  marketing: '15',
  operations: '18',
  product: '19',
  sales: '25',
  support: '26',
};

function mapFacetCodes(selected, map) {
  return (Array.isArray(selected) ? selected : [])
    .map((id) => map[id])
    .filter(Boolean);
}

function applyLinkedInFacetParams(params, li) {
  const seniority = mapFacetCodes(li.seniority, SENIORITY_FACETS);
  if (seniority.length) params.set('seniority', JSON.stringify(seniority));

  const yoe = mapFacetCodes(li.yearsOfExperience, YEARS_EXPERIENCE_FACETS);
  if (yoe.length) params.set('yearsOfExperience', JSON.stringify(yoe));

  const headcount = mapFacetCodes(li.companyHeadcount, COMPANY_HEADCOUNT_FACETS);
  if (headcount.length) params.set('companySize', JSON.stringify(headcount));

  const fn = mapFacetCodes(li.functionArea, FUNCTION_FACETS);
  if (fn.length) params.set('function', JSON.stringify(fn));

  if (li.currentTitle) params.set('title', JSON.stringify([li.currentTitle.trim()]));
}

export function defaultLinkedInSearch() {
  return defaultLinkedInSearchFields();
}

export function normalizeLinkedInSearch(raw) {
  return normalizeLinkedInSearchFields(raw);
}

/** Plain-text keywords for People search box. */
export function compileSearchKeywords(portrait, linkedInSearch = defaultLinkedInSearch()) {
  const p = normalizePortrait(portrait);
  const li = normalizeLinkedInSearch(linkedInSearch);
  const parts = [];
  if (p.roles.length) parts.push(...p.roles.slice(0, 3));
  if (p.industries.length) parts.push(...p.industries.slice(0, 2));
  if (p.stage && STAGE_LABELS[p.stage]) parts.push(STAGE_LABELS[p.stage]);
  if (p.companySize && COMPANY_SIZE_KEYWORDS[p.companySize]) {
    parts.push(COMPANY_SIZE_KEYWORDS[p.companySize]);
  }
  if (li.currentCompany) parts.push(li.currentCompany);
  if (li.pastCompany) parts.push(li.pastCompany);
  if (li.school) parts.push(li.school);
  if (li.industryKeywords) parts.push(li.industryKeywords);
  if (li.currentTitle) parts.push(li.currentTitle);
  if (li.keywordsExtra) parts.push(li.keywordsExtra);
  if (!li.currentCompany && !li.pastCompany && p.regions.length) {
    const remoteOnly = p.regions.length === 1 && p.regions[0] === 'Remote';
    if (!remoteOnly) parts.push(p.regions[0]);
  }
  if (p.regions.includes('Remote')) parts.push('remote');
  const kw = parts.join(' ').replace(/\s+/g, ' ').trim();
  return kw || 'founder';
}

/** Shorter keywords for Connect (mobile SERP breaks on long faceted queries). */
export function compileConnectSearchKeywords(portrait, linkedInSearch = defaultLinkedInSearch()) {
  const p = normalizePortrait(portrait);
  const li = normalizeLinkedInSearch(linkedInSearch);
  const parts = [];
  if (p.roles.length) parts.push(...p.roles.slice(0, 2));
  else if (p.industries.length) parts.push(p.industries[0]);
  if (li.keywordsExtra) {
    parts.push(
      ...String(li.keywordsExtra)
        .split(/\s+/)
        .slice(0, 2)
    );
  }
  const kw = parts.join(' ').replace(/\s+/g, ' ').trim();
  return kw || 'founder CEO';
}

/** Progressive fallbacks when mobile People SERP returns empty. */
export function connectKeywordFallbacks(portrait, linkedInSearch = defaultLinkedInSearch()) {
  const primary = compileConnectSearchKeywords(portrait, linkedInSearch);
  const out = [primary];
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length > 2) out.push(words.slice(0, 2).join(' '));
  if (words[0] && !out.includes(words[0])) out.push(words[0]);
  for (const fb of ['founder CEO', 'CEO founder', 'founder']) {
    if (!out.includes(fb)) out.push(fb);
  }
  return out;
}

function collectGeoUrns(portrait) {
  const p = normalizePortrait(portrait);
  const regions = normalizeRegionList(p.regions);
  const urns = new Set();
  for (const region of regions) {
    for (const id of GEO_URNS[region] || []) urns.add(id);
  }
  return [...urns];
}

/** Human-readable facet summary for Brain preview. */
export function describeSearchFacets(portrait, linkedInSearch = defaultLinkedInSearch()) {
  const p = normalizePortrait(portrait);
  const li = normalizeLinkedInSearch(linkedInSearch);
  const facets = [];
  facets.push(`Connection: ${li.connectionDegree === '2nd_3rd' ? '2nd & 3rd+' : li.connectionDegree.replace('_', ' ')}`);
  const geo = collectGeoUrns(p);
  if (geo.length) facets.push(`Location: ${p.regions.join(', ')}`);
  else if (p.regions.length) facets.push(`Location (keywords): ${p.regions.join(', ')}`);
  if (p.roles.length) facets.push(`Titles: ${p.roles.slice(0, 3).join(', ')}`);
  if (p.industries.length) facets.push(`Industries: ${p.industries.slice(0, 3).join(', ')}`);
  if (li.currentCompany) facets.push(`Current company: ${li.currentCompany}`);
  if (li.pastCompany) facets.push(`Past company: ${li.pastCompany}`);
  if (li.school) facets.push(`School: ${li.school}`);
  if (li.currentTitle) facets.push(`Title: ${li.currentTitle}`);
  if (li.industryKeywords) facets.push(`Industry (keywords): ${li.industryKeywords}`);
  if (li.seniority?.length) facets.push(`Seniority: ${li.seniority.join(', ')}`);
  if (li.functionArea?.length) facets.push(`Function: ${li.functionArea.join(', ')}`);
  if (li.yearsOfExperience?.length) facets.push(`Experience: ${li.yearsOfExperience.join(', ')}`);
  if (li.companyHeadcount?.length) facets.push(`Headcount: ${li.companyHeadcount.join(', ')}`);
  if (li.profileLanguage) {
    const lang = PROFILE_LANGUAGES.find((l) => l.id === li.profileLanguage);
    facets.push(`Language: ${lang?.label || li.profileLanguage}`);
  }
  return facets;
}

/**
 * Connect-safe People URL: short keywords + 2nd/3rd network only (no geo/language facets).
 */
export function buildConnectPeopleSearchUrl(portrait, linkedInSearch = defaultLinkedInSearch()) {
  const keywords = compileConnectSearchKeywords(portrait, linkedInSearch);
  const params = new URLSearchParams({
    keywords,
    origin: 'FACETED_SEARCH',
  });
  params.set('network', JSON.stringify(['S', 'O']));
  // Country/region geoUrn is safe on mobile (unlike long keyword/language stacks).
  const geoUrns = collectGeoUrns(portrait);
  if (geoUrns.length) params.set('geoUrn', JSON.stringify(geoUrns));
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

/** Portrait → simplified Connect search (Stage A one-shots). */
export function resolveConnectPeopleSearchUrl(root = process.cwd()) {
  const policy = readSalesPolicy(root);
  const linkedInSearch = normalizeLinkedInSearch(policy.linkedInSearch);
  const keywords = compileConnectSearchKeywords(policy.portrait, linkedInSearch);
  const keywordFallbacks = connectKeywordFallbacks(policy.portrait, linkedInSearch);
  const facets = describeSearchFacets(policy.portrait, linkedInSearch);
  const searchUrl = buildConnectPeopleSearchUrl(policy.portrait, linkedInSearch);
  return {
    searchUrl,
    keywords,
    keywordFallbacks,
    facets,
    linkedInSearch,
    source: 'connect-short',
  };
}

/**
 * LinkedIn People search URL with keywords + facet params.
 */
export function buildPeopleSearchUrlFromPortrait(portrait, linkedInSearch = defaultLinkedInSearch()) {
  const li = normalizeLinkedInSearch(linkedInSearch);
  const keywords = compileSearchKeywords(portrait, li);
  const params = new URLSearchParams({
    keywords,
    origin: 'FACETED_SEARCH',
  });

  const geoUrns = collectGeoUrns(portrait);
  if (geoUrns.length) params.set('geoUrn', JSON.stringify(geoUrns));

  const network = CONNECTION_DEGREE_NETWORK[li.connectionDegree] || CONNECTION_DEGREE_NETWORK['2nd'];
  if (network.length) params.set('network', JSON.stringify(network));

  if (li.profileLanguage) params.set('primaryLanguage', JSON.stringify([li.profileLanguage]));

  applyLinkedInFacetParams(params, li);

  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

/** Portrait + filters from disk + optional override in sales_policy.json */
export function resolvePeopleSearchUrl(root = process.cwd()) {
  const policy = readSalesPolicy(root);
  const linkedInSearch = normalizeLinkedInSearch(policy.linkedInSearch);
  const override = String(policy.searchUrlOverride || '').trim();
  const keywords = compileSearchKeywords(policy.portrait, linkedInSearch);
  const facets = describeSearchFacets(policy.portrait, linkedInSearch);
  if (override) {
    return { searchUrl: override, keywords, facets, linkedInSearch, source: 'override' };
  }
  const searchUrl = buildPeopleSearchUrlFromPortrait(policy.portrait, linkedInSearch);
  return { searchUrl, keywords, facets, linkedInSearch, source: 'portrait' };
}
