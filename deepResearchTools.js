/**
 * DeepResearch tools. Each returns [{ text, sourceUrl }]. Never opens the main Link.
 */
import { apifyTokens } from './enrichAndWrite.js';
import { absoluteUrl, linkKind } from './leadLinks.js';
import { xHandleFromUrl } from './leadChannel.js';

/** Cheap → stronger antibot. Override with APIFY_WEB_FETCH_ACTOR (single) or APIFY_WEB_FETCH_ACTORS (comma list). */
const APIFY_WEB_FETCH_ACTORS = (() => {
  const one = (process.env.APIFY_WEB_FETCH_ACTOR || '').trim();
  const many = (process.env.APIFY_WEB_FETCH_ACTORS || '').trim();
  if (many) return many.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (one) return [one];
  return ['shelvick~smart-page-fetcher', 'apify~web-fetch'];
})();
const SOCIAL_KINDS = new Set(['telegram', 'x', 'linkedin', 'instagram', 'facebook', 'discord', 'whatsapp']);

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksBlocked(status, text) {
  if (status === 401 || status === 403 || status === 429 || status >= 500) return true;
  return /captcha|cf-browser-verification|attention required|access denied|verify you are human|just a moment/i.test(
    text || ''
  );
}

async function httpFetchHome(url) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  });
  const raw = await res.text();
  const text = htmlToText(raw).slice(0, 6000);
  return { status: res.status, text, blocked: looksBlocked(res.status, raw) || text.length < 80 };
}

function apifyActorInput(actor, url) {
  if (actor.includes('smart-page-fetcher')) {
    return { urls: [url], formats: ['markdown', 'text'], stealth: 'auto' };
  }
  if (actor.includes('web-fetch')) {
    return { url, formats: ['markdown', 'text'] };
  }
  return { url, urls: [url], startUrls: [{ url }] };
}

function extractApifyText(row) {
  return String(row?.markdown || row?.text || row?.content || row?.pageContent || row?.body || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

async function apifyFetchHome(url) {
  const tokens = apifyTokens();
  if (!tokens.length) return null;
  for (const actor of APIFY_WEB_FETCH_ACTORS) {
    for (const token of tokens) {
      try {
        const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apifyActorInput(actor, url)),
          signal: AbortSignal.timeout(120000),
        });
        const body = await res.text();
        if (!res.ok) {
          if ([401, 402, 403, 429].includes(res.status) || res.status >= 500) continue;
          break;
        }
        let rows;
        try {
          rows = JSON.parse(body);
        } catch {
          break;
        }
        const row = Array.isArray(rows) ? rows[0] : rows;
        const text = extractApifyText(row);
        if (!text) continue;
        return { text, sourceUrl: url, actor };
      } catch (e) {
        console.error(`DeepResearch web Apify ${actor}:`, e.message);
      }
    }
  }
  return null;
}

/** Homepage reader for website sub-links. HTTP first; Apify web-fetch on antibot. */
export async function runWebsiteReader(lead) {
  const canonical = absoluteUrl(lead?.url || '');
  const facts = [];
  const links = (lead?.extraLinks || []).filter((item) => {
    const url = absoluteUrl(item?.url || '');
    if (!url || url === canonical) return false;
    const kind = item.kind || linkKind(url);
    return kind === 'website' || !SOCIAL_KINDS.has(kind);
  });
  for (const item of links.slice(0, 3)) {
    const url = absoluteUrl(item.url);
    if (!url) continue;
    try {
      const home = await httpFetchHome(url);
      if (!home.blocked && home.text) {
        facts.push({ text: `Website ${url}: ${home.text.slice(0, 1800)}`, sourceUrl: url });
        continue;
      }
      console.log(`DeepResearch website HTTP blocked/empty for ${url} — trying Apify`);
      const via = await apifyFetchHome(url);
      if (via?.text) facts.push({ text: `Website ${url}: ${via.text.slice(0, 1800)}`, sourceUrl: url });
    } catch (e) {
      console.error(`DeepResearch website ${url}:`, e.message);
    }
  }
  return facts;
}

function keepBraveHit(hit, needles) {
  const blob = `${hit.title || ''} ${hit.url || ''} ${hit.description || ''}`.toLowerCase();
  return needles.some((n) => n && blob.includes(n));
}

/** Brave web search. Queries never include the main Link. */
export async function runBraveSearch(lead) {
  const token = (process.env.BRAVE_SEARCH_TOKEN || '').trim();
  if (!token) {
    console.log('DeepResearch Brave skipped — no BRAVE_SEARCH_TOKEN');
    return [];
  }
  const handle = xHandleFromUrl(lead?.url || '') || '';
  const domains = (lead?.extraLinks || [])
    .map((item) => {
      try {
        return new URL(absoluteUrl(item.url)).hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const needles = [handle.toLowerCase(), ...domains].filter(Boolean);
  if (!needles.length && !lead?.name) return [];

  const queries = [
    [lead?.name, lead?.headline].filter(Boolean).join(' ').slice(0, 80),
    [lead?.name, lead?.company].filter(Boolean).join(' ').slice(0, 80),
    domains[0] || handle,
  ].filter((q) => String(q || '').trim().length >= 3);

  const facts = [];
  const seen = new Set();
  for (const q of [...new Set(queries)].slice(0, 3)) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': token },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.error(`Brave search ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const hit of data?.web?.results || []) {
        if (!keepBraveHit(hit, needles)) continue;
        const key = String(hit.url || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const snippet = String(hit.description || hit.title || '').replace(/\s+/g, ' ').trim();
        if (!snippet) continue;
        facts.push({
          text: `Search (${q}): ${hit.title || ''} — ${snippet}`.slice(0, 1200),
          sourceUrl: String(hit.url || ''),
        });
      }
    } catch (e) {
      console.error('Brave search failed:', e.message);
    }
  }
  return facts;
}

export const TOOL_CATALOG = [
  {
    id: 'website',
    title: 'Website reader',
    blurb:
      'Reads homepage text from website sub-links over plain HTTP. On captcha or antibot, falls back to cheap Apify fetchers (Smart Page Fetcher, then Web Fetch).',
    kinds: ['website'],
  },
  {
    id: 'brave',
    title: 'Brave Search',
    blurb: 'Short web searches from name, headline, company, and sub-link domains. Keeps hits that mention the handle or those domains. Does not open the main profile link.',
    kinds: null,
  },
];

export function deepResearchToolRegistry() {
  return [
    { id: 'website', kinds: ['website'], run: runWebsiteReader },
    { id: 'brave', kinds: null, run: runBraveSearch },
  ];
}
