/**
 * Phase 0: My Connections → CRM (Status Lead😴 + ready marker + Link).
 * Already-connected imports are messageable: enrich + ice run while status stays Lead😴,
 * then ice send moves them to Conversation 💬.
 *
 * Intake model (CRM-first, grows with your network):
 * - Page sort: Recently added (newest at TOP).
 * - Notion Link column = source of truth for "already synced".
 * - Scroll from the top; collect profiles NOT already in CRM.
 * - Stop as soon as we have SYNC_MAX_NEW unknowns (no deep scroll to an old watermark).
 * - Soft cursor `lastSyncedProfileSlug` still helps when found (classic above-cursor
 *   oldest-first catch-up), but a missing/far cursor must NOT block imports.
 */
import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STATUS_LEAD, LEAD_READY_MARKER } from './crm/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYNC_STATE_PATH = path.join(process.cwd(), 'connections_sync_state.json');
const CONNECTIONS_URL = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';
const STATUS_PROPOSAL_1 = STATUS_LEAD;

/** Baseline: everyone above this profile is "new" until cursor advances. */
const DEFAULT_ANCHOR_URL =
  process.env.SYNC_ANCHOR_URL ||
  'https://www.linkedin.com/in/joshua-pieters-249467141/';

/** Never import these profiles (own account, etc.). Comma-separated slugs in env. */
const DEFAULT_EXCLUDE_SLUGS = (
  process.env.SYNC_EXCLUDE_SLUGS ||
  'mykhailo-byshliaha-8410a7271'
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function maxNewPerRun() {
  return Number(process.env.SYNC_MAX_NEW || process.env.SYNC_FIRST_RUN_LIMIT || 20);
}
export { maxNewPerRun };
/**
 * Scroll budget: cheap when unknowns are at the top; extends toward SYNC_MAX_SCROLLS
 * when we must scroll through a long run of CRM-known profiles (no-gap catch-up).
 */
function scrollBudget(maxNew, extended = false) {
  const configured = Number(process.env.SYNC_MAX_SCROLLS || 80);
  const safety = Number(process.env.SYNC_SAFE_SCROLL_CAP || 18);
  const base = Math.max(6, Math.min(safety, 4 + maxNew * 3));
  if (extended) {
    return Math.max(base, Math.min(configured, configured > 0 ? configured : 80));
  }
  return Math.max(1, Math.min(configured, base, safety));
}
function syncIntervalMs() {
  return Number(process.env.SYNC_INTERVAL_HOURS || 48) * 60 * 60 * 1000;
}

function getNotion() {
  return new Client({ auth: process.env.NOTION_TOKEN });
}

function getDatabaseId() {
  return process.env.NOTION_DATABASE_ID;
}

/** Normalize LinkedIn profile URL → slug (e.g. "howard-page-a2026b1"). */
export function profileSlugFromUrl(url = '') {
  try {
    const u = String(url).split('?')[0].split('#')[0];
    const m = u.match(/linkedin\.com\/in\/([^/]+)/i);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/\/$/, '').toLowerCase();
  } catch {
    return null;
  }
}

export function canonicalProfileUrl(urlOrSlug) {
  const slug =
    profileSlugFromUrl(urlOrSlug) ||
    String(urlOrSlug || '')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}/`;
}

function defaultAnchorSlug() {
  return profileSlugFromUrl(DEFAULT_ANCHOR_URL);
}

export function loadSyncState() {
  const anchorSlug = defaultAnchorSlug();
  const empty = {
    lastSyncedProfileUrl: canonicalProfileUrl(anchorSlug),
    lastSyncedProfileSlug: anchorSlug,
    lastRunAt: null,
    recentSlugs: [],
    excludeSlugs: DEFAULT_EXCLUDE_SLUGS,
  };
  try {
    if (!fs.existsSync(SYNC_STATE_PATH)) return empty;
    const raw = JSON.parse(fs.readFileSync(SYNC_STATE_PATH, 'utf8'));
    const slug = raw.lastSyncedProfileSlug || anchorSlug;
    return {
      lastSyncedProfileUrl: raw.lastSyncedProfileUrl || canonicalProfileUrl(slug),
      lastSyncedProfileSlug: slug,
      lastRunAt: raw.lastRunAt || null,
      recentSlugs: Array.isArray(raw.recentSlugs) ? raw.recentSlugs : [],
      excludeSlugs: [
        ...new Set([
          ...DEFAULT_EXCLUDE_SLUGS,
          ...(Array.isArray(raw.excludeSlugs) ? raw.excludeSlugs : []),
        ]),
      ],
    };
  } catch (e) {
    console.error('loadSyncState:', e.message);
    return empty;
  }
}

export function saveSyncState(state) {
  fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

/** Advance watermark after a single successful Notion import (oldest→newer). */
export function advanceCursorForImport(pageResult, extra = {}) {
  if (!pageResult?.slug || !pageResult?.url) return loadSyncState();
  const state = loadSyncState();
  const recent = [pageResult.slug, ...(state.recentSlugs || [])].filter(Boolean);
  const next = {
    ...state,
    lastSyncedProfileUrl: pageResult.url,
    lastSyncedProfileSlug: pageResult.slug,
    lastRunAt: new Date().toISOString(),
    recentSlugs: [...new Set(recent)].slice(0, 100),
    excludeSlugs: state.excludeSlugs || DEFAULT_EXCLUDE_SLUGS,
    ...extra,
  };
  saveSyncState(next);
  console.log(`Cursor advanced upward → ${pageResult.slug}`);
  return next;
}

export function isConnectionsSyncDue(state = loadSyncState()) {
  if (process.env.FORCE_SYNC === '1') return true;
  if (!state.lastRunAt) return true;
  const elapsed = Date.now() - new Date(state.lastRunAt).getTime();
  return elapsed >= syncIntervalMs();
}

/**
 * Create Notion page with Status + Link only.
 * Name (title) left empty — n8n fills it later. Notion may require the title key present.
 */
/**
 * All profile slugs already present in the CRM (any Status). Used to stop scrolling
 * once enough *new* accepts are visible — independent of how deep the old cursor is.
 */
export async function fetchKnownProfileSlugs(opts) {
  const crm = await import('./crmStore.js');
  return crm.fetchKnownProfileSlugs(opts);
}

export async function createNotionLead({ url, name = '' } = {}) {
  const crm = await import('./crmStore.js');
  const row = await crm.createLead({ url, name, status: STATUS_LEAD });
  try {
    await crm.appendNote(
      row.id,
      `Accepted connection — ${LEAD_READY_MARKER} (Lead😴)`
    );
  } catch (e) {
    console.error('ready marker note:', e.message);
  }
  return row;
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function dismissInterstitials(page) {
  const btn = page
    .locator('button[data-action="dismiss"], button:has-text("Continue"), .promo__dismiss')
    .first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true }).catch(() => {});
    await safePageWait(page, 2000);
  }
}

/** Avoid opaque Playwright errors when Chromium OOM-kills mid-wait. */
async function safePageWait(page, ms) {
  if (page.isClosed()) throw new Error('browser_closed');
  try {
    await page.waitForTimeout(ms);
  } catch (e) {
    if (page.isClosed() || /closed|target.*browser/i.test(String(e.message))) {
      throw new Error('browser_closed_during_wait');
    }
    throw e;
  }
}

function pageIsMobile(page) {
  return (page.viewportSize()?.width || 1600) < 500;
}

/**
 * Visit a profile URL and infer connection state from top-card actions.
 * Does not click Connect — read-only probe for acceptance / manual Lead😴.
 * @returns {{ status: 'connected'|'pending'|'not_connected'|'unknown'|'auth_dead'|'bad_url', name: string, url: string }}
 */
export async function probeProfileConnectionDegree(page, profileUrl) {
  const url = canonicalProfileUrl(profileUrl);
  if (!url) return { status: 'bad_url', name: '', url: '' };

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => {
    console.log('Profile probe goto:', e.message);
  });
  await safePageWait(page, 2800);
  await dismissInterstitials(page);

  const pageUrl = page.url();
  const title = await page.title().catch(() => '');
  if (/\/uas\/login|\/login|authwall|checkpoint/i.test(pageUrl) || /log in|sign in/i.test(title)) {
    return { status: 'auth_dead', name: '', url };
  }

  const info = await page
    .evaluate(() => {
      const root =
        document.querySelector('main section') || document.querySelector('main') || document.body;
      const actions = [...root.querySelectorAll('button, [role="button"]')]
        .map((b) => ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim())
        .filter((t) => t.length > 1)
        .slice(0, 24);
      const h1 =
        document.querySelector('main h1')?.textContent ||
        document.querySelector('h1')?.textContent ||
        '';
      const name = String(h1 || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      return { actions, name };
    })
    .catch(() => ({ actions: [], name: '' }));

  const labels = (info.actions || []).map((a) => String(a).toLowerCase());
  const hasPending = labels.some((t) => /\bpending\b/.test(t) && !/withdraw/.test(t));
  const hasMessage = labels.some((t) => /\bmessage\b/.test(t) && !/mutual/.test(t));
  const hasConnect = labels.some((t) => {
    if (!t || t.includes('connections') || t.includes('pending') || t.includes('withdraw')) return false;
    if (t === 'connect' || t === '+ connect' || /^\+?\s*connect$/.test(t)) return true;
    if (t.startsWith('invite ') && t.includes('to connect')) return true;
    return /\bconnect\b/.test(t) && !/connections/.test(t);
  });

  let status = 'unknown';
  if (hasPending) status = 'pending';
  else if (hasConnect) status = 'not_connected';
  else if (hasMessage && !hasConnect) status = 'connected';

  return { status, name: info.name || '', url };
}

/**
 * Scrape My Connections (newest→oldest).
 * Primary stop: enough CRM-unknown profiles (grows with network; no deep cursor hunt).
 * Soft stop: hit watermark cursor (classic above-cursor catch-up).
 * Keep the same session UA as the rest of the agent (desktop UA override breaks cookies).
 */
export async function scrapeNewConnectionUrls(
  page,
  {
    cursorSlug,
    recentSlugs = [],
    excludeSlugs = DEFAULT_EXCLUDE_SLUGS,
    knownSlugs = null,
    maxNew = maxNewPerRun(),
    mode = 'import',
    targetSlugs = null,
  } = {}
) {
  const acceptanceMode = mode === 'acceptance';
  const targetSet = acceptanceMode
    ? new Set([...(targetSlugs instanceof Set ? targetSlugs : targetSlugs || [])].map((s) =>
        String(s).toLowerCase()
      ))
    : null;
  if (acceptanceMode) {
    console.log(`Acceptance scrape: watching ${targetSet.size} Lead😴 slug(s).`);
  }
  console.log('Navigating to My Connections...');
  const isMobile = pageIsMobile(page);
  const urlsToTry = acceptanceMode
    ? isMobile
      ? [
          'https://www.linkedin.com/mwlite/mynetwork/connections/',
          CONNECTIONS_URL,
          'https://www.linkedin.com/mynetwork/connections/',
        ]
      : [
          CONNECTIONS_URL,
          'https://www.linkedin.com/mynetwork/connections/',
          'https://www.linkedin.com/mwlite/mynetwork/connections/',
        ]
    : [
        CONNECTIONS_URL,
        'https://www.linkedin.com/mynetwork/connections/',
        'https://www.linkedin.com/mwlite/mynetwork/connections/',
      ];
  let loaded = false;
  let sessionDead = false;
  for (const url of urlsToTry) {
    console.log('Trying', url);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await safePageWait(page, acceptanceMode ? 2500 : 4000);
    } catch (e) {
      const msg = String(e.message || e);
      if (/browser_closed|Target page, context or browser has been closed/i.test(msg)) {
        console.log('Chromium died loading My Connections — retry later or run during Stage A');
        return {
          urls: [],
          allAboveCount: 0,
          hitCursor: false,
          cursorMissing: Boolean(cursorSlug),
          scannedCount: 0,
          lastSeenSlugs: [],
          sessionDead: false,
          browserCrashed: true,
          listLoaded: false,
          intakeMode: 'none',
          unknownCount: 0,
          acceptanceMatches: acceptanceMode ? [] : undefined,
        };
      }
      console.log('  goto err:', msg.slice(0, 120));
      continue;
    }
    await dismissInterstitials(page);
    const hrefCount = await page.locator('a[href*="/in/"]').count().catch(() => 0);
    const title = await page.title().catch(() => '');
    const pageUrl = page.url();
    console.log(`  title="${title}", /in/ links=${hrefCount}`);
    if (/log in|sign in|sign up/i.test(title) || /\/uas\/login|\/login|authwall|checkpoint/i.test(pageUrl)) {
      sessionDead = true;
      console.log('Connections page requires login — LinkedIn session is inactive.');
      break;
    }
    if (hrefCount > 0) {
      loaded = true;
      break;
    }
  }
  if (sessionDead) {
    try {
      const { markSessionDead } = await import('./sessionHealth.js');
      markSessionDead('connections_login');
    } catch (_) {
      /* ignore */
    }
    return {
      urls: [],
      allAboveCount: 0,
      hitCursor: false,
      cursorMissing: Boolean(cursorSlug),
      scannedCount: 0,
      lastSeenSlugs: [],
      sessionDead: true,
      listLoaded: false,
      intakeMode: 'none',
      unknownCount: 0,
    };
  }
  if (!loaded) {
    console.log('Could not load a connections list with profile links.');
    return {
      urls: [],
      allAboveCount: 0,
      hitCursor: false,
      cursorMissing: Boolean(cursorSlug),
      scannedCount: 0,
      lastSeenSlugs: [],
      sessionDead: false,
      browserCrashed: page.isClosed(),
      listLoaded: false,
      intakeMode: acceptanceMode ? 'acceptance' : 'none',
      unknownCount: 0,
      acceptanceMatches: acceptanceMode ? [] : undefined,
    };
  }

  try {
    const sortBtn = page.locator('button:has-text("Recently added"), button:has-text("Sort by")').first();
    if (await sortBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const label = ((await sortBtn.textContent()) || '').toLowerCase();
      if (!label.includes('recently')) {
        await sortBtn.click().catch(() => {});
        await safePageWait(page, 1000);
        await page.locator('text=Recently added').first().click().catch(() => {});
        await safePageWait(page, 2000);
      }
    }
  } catch (_) {
    /* sort control optional */
  }

  if (!acceptanceMode) {
    try {
      fs.writeFileSync(path.join(process.cwd(), 'debug_connections.html'), await page.content());
      await page
        .screenshot({ path: path.join(process.cwd(), 'debug_connections.png'), fullPage: false })
        .catch(() => {});
    } catch (_) {
      /* ignore */
    }
  }

  await page.mouse.click(640, 420).catch(() => {});
  await safePageWait(page, 500);

  const skip = new Set(
    [...(excludeSlugs || []), ...(recentSlugs || [])].map((s) => String(s).toLowerCase())
  );
  const known = new Set(
    [...(knownSlugs instanceof Set ? knownSlugs : knownSlugs || [])].map((s) =>
      String(s).toLowerCase()
    )
  );
  const seen = new Set();
  /** Newest → older among profiles not yet in CRM / exclude / recent */
  const unknownCandidates = [];
  /** Acceptance: Lead😴 slugs found in My Connections */
  const acceptanceMatches = [];
  const acceptanceFound = new Set();
  /** Newest → older until soft cursor (classic path when cursor is hit) */
  const aboveCursor = [];
  let hitCursor = false;
  let scrolls = 0;
  let skippedKnown = 0;
  let scrollLimit = acceptanceMode
    ? (() => {
        // Higher default so deep "Recently added" accepts still get found.
        // Early-exit when all Lead😴 slugs matched; stagnant rounds still protect li_at.
        // Fallback budget when profile probes left a few unresolved (default 80).
        const maxCap = Math.max(8, Number(process.env.ACCEPTANCE_SCROLL_CAP || 80));
        const need = targetSet?.size || maxNew || 1;
        return Math.min(maxCap, Math.max(16, need + 12));
      })()
    : scrollBudget(maxNew, false);
  let scrollExtended = false;

  console.log(
    acceptanceMode
      ? `Acceptance intake: need up to ${targetSet.size} matches (scrollLimit=${scrollLimit})`
      : `Connections intake: need ${maxNew} CRM-unknown (known=${known.size}, softCursor=${cursorSlug || '(none)'}, scrollLimit=${scrollLimit})`
  );

  let stagnantRounds = 0;
  const context = page.context();

  async function liveLiAtPresent() {
    try {
      const cookies = await context.cookies('https://www.linkedin.com');
      return cookies.some((c) => c.name === 'li_at' && c.value);
    } catch {
      return false;
    }
  }

  async function pageLooksLoggedOut() {
    const pageUrl = page.url();
    const title = await page.title().catch(() => '');
    return (
      /\/uas\/login|\/login|authwall|checkpoint/i.test(pageUrl) ||
      /log in|sign in|sign up/i.test(title)
    );
  }

  while (scrolls < scrollLimit) {
    if (!(await liveLiAtPresent()) || (await pageLooksLoggedOut())) {
      sessionDead = true;
      console.log('li_at/auth lost mid-connections-scroll — aborting scrape early.');
      break;
    }

    const hrefs = await page.evaluate(() => {
      const out = [];
      const seenHref = new Set();
      const cleanName = (raw) => {
        let name = String(raw || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (/^view .+'s profile$/i.test(name)) return '';
        if (/^linkedin member$/i.test(name)) return '';
        name = name.split(/(?:1st|2nd|3rd)\b/i)[0].trim();
        name = name.replace(/\s+•.*$/, '').replace(/\s+[-–].*$/, '').trim();
        if (name.length > 80) name = name.slice(0, 80).trim();
        return name;
      };
      for (const a of document.querySelectorAll('a[href*="/in/"]')) {
        const href = a.getAttribute('href') || '';
        if (!/\/in\/[^/?#]+/i.test(href)) continue;
        if (/\/in\/unavailable|\/in\/ACo/i.test(href)) continue;
        if (seenHref.has(href)) continue;
        seenHref.add(href);
        const card = a.closest(
          'li.mn-connection-card, li, .mn-connection-card, .artdeco-entity-lockup, [data-view-name="connection-card"]'
        );
        let name = '';
        if (card) {
          const nameEl = card.querySelector(
            '.mn-connection-card__name, .artdeco-entity-lockup__title, [data-anonymize="person-name"], span[dir="ltr"]'
          );
          if (nameEl) name = cleanName(nameEl.innerText || nameEl.textContent);
        }
        if (!name) {
          const aria = (a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
          const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
          name = cleanName(aria || text);
        }
        out.push({ href, name });
      }
      return out;
    });

    const beforeCount = seen.size;
    for (const row of hrefs) {
      const href = row.href;
      const cardName = String(row.name || '').trim();
      const url = canonicalProfileUrl(href.startsWith('http') ? href : `https://www.linkedin.com${href}`);
      const slug = profileSlugFromUrl(url);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      if (cursorSlug && slug === cursorSlug) {
        if (!hitCursor) {
          hitCursor = true;
          console.log(
            `Soft cursor seen (${cursorSlug}) — continuing scroll (CRM-unknown may be below watermark).`
          );
        }
        continue;
      }
      if (skip.has(slug)) {
        console.log(`Skip excluded/recent: ${slug}`);
        continue;
      }
      if (acceptanceMode) {
        if (targetSet.has(slug) && !acceptanceFound.has(slug)) {
          acceptanceFound.add(slug);
          acceptanceMatches.push({ url, name: cardName, slug });
        }
        continue;
      }
      aboveCursor.push({ url, name: cardName });
      if (known.has(slug)) {
        skippedKnown++;
        continue;
      }
      unknownCandidates.push({ url, name: cardName });
    }

    if (acceptanceMode && acceptanceMatches.length >= targetSet.size) {
      console.log(`Acceptance complete: ${acceptanceMatches.length}/${targetSet.size} slug(s) found.`);
      break;
    }

    if (!acceptanceMode && unknownCandidates.length >= maxNew) {
      console.log(
        `Intake ready: ${unknownCandidates.length} CRM-unknown (≥${maxNew}) after ${scrolls} scrolls / ${seen.size} unique (skippedKnown=${skippedKnown}).`
      );
      break;
    }

    if (seen.size === beforeCount) stagnantRounds++;
    else stagnantRounds = 0;

    await page.mouse.wheel(0, 1800).catch(() => {});
    await safePageWait(page, 900);
    await page.keyboard.press('End').catch(() => {});
    await safePageWait(page, 1100);
    await page.evaluate(() => {
      const el =
        document.querySelector('.scaffold-finite-scroll__content') ||
        document.querySelector('main') ||
        document.scrollingElement;
      if (!el) return;
      if (el === document.scrollingElement || el === document.documentElement) {
        window.scrollTo(0, document.body.scrollHeight);
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
    await safePageWait(page, 1500 + Math.floor(Math.random() * 800));

    const more = page
      .locator(
        'button:has-text("Show more results"), button:has-text("Show more"), button:has-text("Load more")'
      )
      .first();
    if (await more.isVisible().catch(() => false)) {
      await more.click().catch(() => {});
      await safePageWait(page, 2000);
      stagnantRounds = 0;
    }

    scrolls++;

    // Long CRM-known prefix at the top — extend toward SYNC_MAX_SCROLLS so we do not skip deep unknowns.
    if (
      !scrollExtended &&
      scrolls >= scrollBudget(maxNew, false) &&
      unknownCandidates.length < maxNew &&
      (skippedKnown > 0 || seen.size >= 15)
    ) {
      scrollExtended = true;
      scrollLimit = scrollBudget(maxNew, true);
      console.log(
        `Extending scroll budget → ${scrollLimit} (have ${unknownCandidates.length}/${maxNew} unknown, skippedKnown=${skippedKnown}, scanned=${seen.size}).`
      );
    }

    if (scrolls % 5 === 0 || stagnantRounds >= 3 || scrollExtended) {
      console.log(
        `Scroll ${scrolls}/${scrollLimit}: unique=${seen.size}, unknown=${unknownCandidates.length}, knownSkip=${skippedKnown}, stagnant=${stagnantRounds}`
      );
    }

    if (stagnantRounds >= 5) {
      console.log(
        `Stopping scroll: list end (no new profiles for ${stagnantRounds} rounds, unique=${seen.size}, unknown=${unknownCandidates.length}).`
      );
      break;
    }
  }

  if (sessionDead) {
    try {
      const { markSessionDead } = await import('./sessionHealth.js');
      markSessionDead('li_at_cleared_mid_connections_scroll', { source: 'scrapeNewConnectionUrls' });
    } catch (_) {
      /* ignore */
    }
  } else if (!(await liveLiAtPresent()) || (await pageLooksLoggedOut())) {
    sessionDead = true;
    console.log('li_at/auth gone after connections scroll — marking session dead.');
    try {
      const { markSessionDead } = await import('./sessionHealth.js');
      markSessionDead('li_at_cleared_after_connections_scroll', { source: 'scrapeNewConnectionUrls' });
    } catch (_) {
      /* ignore */
    }
  }

  const lastSeen = [...seen].slice(-20);
  const cursorMissing = Boolean(cursorSlug) && !hitCursor;
  if (cursorMissing) {
    console.log(
      `Soft cursor "${cursorSlug}" not in window (ok) — using CRM-unknown intake. Last seen: ${lastSeen.join(', ')}`
    );
  }

  let entries = [];
  let intakeMode = 'none';
  if (acceptanceMode) {
    intakeMode = 'acceptance';
    entries = acceptanceMatches;
  } else if (!sessionDead && unknownCandidates.length) {
    // Oldest-first among visible unknowns (closest to synced frontier) — no gaps in the middle.
    intakeMode = hitCursor ? 'above_cursor' : 'frontier_oldest';
    entries = unknownCandidates.slice(-maxNew).reverse();
  }
  // Back-compat: callers that only need URLs
  const urls = entries.map((e) => (typeof e === 'string' ? e : e.url));

  const backlogRemaining = Math.max(0, unknownCandidates.length - urls.length);
  console.log(
    `Intake ${intakeMode}: import ${urls.length}/${maxNew} (unknownVisible=${unknownCandidates.length}, backlogAfter=${backlogRemaining}, scanned=${seen.size}, knownSkip=${skippedKnown}, scrollExtended=${scrollExtended})`
  );

  if (
    !sessionDead &&
    unknownCandidates.length === 0 &&
    skippedKnown >= maxNew * 3 &&
    scrollExtended
  ) {
    console.log(
      `Warning: scrolled through ${skippedKnown} CRM-known profile(s) with 0 unknown — deep backlog may need another Stage A cycle or higher SYNC_MAX_SCROLLS.`
    );
  }

  return {
    urls,
    entries,
    acceptanceMatches: acceptanceMode ? acceptanceMatches : undefined,
    allAboveCount: acceptanceMode ? acceptanceMatches.length : unknownCandidates.length,
    hitCursor,
    cursorMissing,
    scannedCount: seen.size,
    lastSeenSlugs: lastSeen,
    sessionDead,
    listLoaded: loaded,
    intakeMode,
    unknownCount: unknownCandidates.length,
    backlogRemaining,
    scrollExtended,
    skippedKnown,
  };
}

/**
 * Full sync: scrape → create Notion pages → advance soft cursor.
 * CRM Link column is the real dedupe; soft cursor is optional.
 */
export async function syncNewConnections(page, opts = {}) {
  const dryRun = opts.dryRun || process.env.SYNC_DRY_RUN === '1';
  const state = loadSyncState();
  const cursorSlug = state.lastSyncedProfileSlug || defaultAnchorSlug();

  console.log('--- Phase 0: My Connections → Notion ---');
  console.log(`Soft cursor (optional): ${cursorSlug}`);
  console.log(`Exclude: ${(state.excludeSlugs || []).join(', ') || '(none)'}`);
  console.log(`Batch limit: ${maxNewPerRun()}`);
  console.log(`Last run: ${state.lastRunAt || '(never)'}`);

  let knownSlugs = new Set();
  try {
    knownSlugs = await fetchKnownProfileSlugs();
  } catch (e) {
    console.error('fetchKnownProfileSlugs:', e.message);
  }

  const scraped = await scrapeNewConnectionUrls(page, {
    cursorSlug,
    recentSlugs: state.recentSlugs,
    excludeSlugs: state.excludeSlugs,
    knownSlugs,
    maxNew: maxNewPerRun(),
  });

  if (scraped.sessionDead) {
    console.log('[Connections Sync SUMMARY] created: 0 (session dead — skip import), failed: 0');
    return { created: [], failed: [], scraped };
  }

  console.log(
    `Intake ${scraped.intakeMode}: visibleUnknown=${scraped.unknownCount || scraped.allAboveCount}; importing: ${scraped.urls.length}`
  );
  if (scraped.cursorMissing) {
    console.log(
      `Soft cursor "${cursorSlug}" not in window — CRM-unknown intake continues (no SYNC_ALLOW_MISSING_CURSOR needed).`
    );
  }

  const created = [];
  const failed = [];

  const intakeRows =
    Array.isArray(scraped.entries) && scraped.entries.length
      ? scraped.entries
      : (scraped.urls || []).map((url) => ({ url, name: '' }));

  for (const row of intakeRows) {
    const url = typeof row === 'string' ? row : row.url;
    const cardName = typeof row === 'string' ? '' : String(row.name || '').trim();
    const slug = profileSlugFromUrl(url);
    try {
      if (dryRun) {
        console.log(`[dry-run] Would create: ${url}${cardName ? ` (${cardName})` : ''}`);
        created.push({ url, slug, id: null, name: cardName });
        continue;
      }
      const pageResult = await createNotionLead({ url, name: cardName });
      console.log(
        `Notion created: ${pageResult.url} (${pageResult.id})${pageResult.name ? ` name="${pageResult.name}"` : ''}`
      );
      created.push(pageResult);
      await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 400)));
    } catch (e) {
      console.error(`Notion create failed for ${url}:`, e.message);
      failed.push({ url, error: e.message });
    }
  }

  if (created.length > 0 && !dryRun) {
    try {
      const { archiveLeadSleepDuplicates } = await import('./connectLeads.js');
      const dedupe = await archiveLeadSleepDuplicates(created.map((c) => c.url));
      console.log(`[Lead😴 dedupe] archived: ${dedupe.archived}`);
    } catch (e) {
      console.error('Lead😴 dedupe error:', e.message);
    }
  }

  try {
    const { notify } = await import('./notify.js');
    const remaining = Math.max(0, (scraped.allAboveCount || 0) - created.length);
    if (scraped.listLoaded && (scraped.allAboveCount || 0) < maxNewPerRun() && created.length === 0) {
      await notify({
        key: `sync_cap_short_${new Date().toISOString().slice(0, 10)}`,
        type: 'sync',
        severity: 'warn',
        title: 'No new LinkedIn connections to sync this run',
        message: `Setpoint ${maxNewPerRun()}, but 0 CRM-unknown in scroll window (scanned ${scraped.scannedCount || 0}, knownSkip ${scraped.skippedKnown || 0}). Another Stage A cycle will continue catch-up.`,
      });
    }
    if (
      scraped.listLoaded &&
      created.length === 0 &&
      (scraped.skippedKnown || 0) >= maxNewPerRun() * 5 &&
      scraped.scrollExtended
    ) {
      await notify({
        key: `sync_deep_backlog_${new Date().toISOString().slice(0, 10)}`,
        type: 'sync',
        severity: 'warn',
        title: 'Sync scrolled deep with no new imports',
        message: `Scrolled through ${scraped.skippedKnown} CRM-known connections without finding unknowns. Catch-up continues next Stage A — raise SYNC_MAX_SCROLLS if this repeats.`,
      });
    }
    if (scraped.listLoaded && remaining <= 10 && (scraped.allAboveCount || 0) > 0) {
      await notify({
        key: `sync_low_remaining_${new Date().toISOString().slice(0, 10)}`,
        type: 'sync',
        severity: 'warn',
        title: 'Low remaining LinkedIn connections to sync',
        message: `After this Stage A sync, about ${remaining} CRM-unknown connection(s) remain in the current window (threshold: 10).`,
      });
    }
    if (created.length > 0) {
      await notify({
        key: `sync_imported_${new Date().toISOString().slice(0, 13)}`,
        type: 'leads',
        severity: 'info',
        title: 'New leads imported to CRM',
        message: `Stage A added ${created.length} connection(s) as Lead😴 (ready for enrich + ice).`,
      });
    }
  } catch (e) {
    console.error('sync notify:', e.message);
  }

  if (created.length > 0 && !dryRun) {
    const upperEdge = created[created.length - 1];
    const recent = [
      ...created.map((c) => c.slug).filter(Boolean),
      ...(state.recentSlugs || []),
    ];
    const recentSlugs = [...new Set(recent)].slice(0, 100);
    saveSyncState({
      lastSyncedProfileUrl: upperEdge.url,
      lastSyncedProfileSlug: upperEdge.slug,
      lastRunAt: new Date().toISOString(),
      recentSlugs,
      excludeSlugs: state.excludeSlugs || DEFAULT_EXCLUDE_SLUGS,
    });
    console.log(`Soft cursor advanced → ${upperEdge.slug}`);
    if (scraped.allAboveCount > created.length) {
      console.log(
        `Remaining CRM-unknown in window (approx): ${scraped.allAboveCount - created.length} — next run continues.`
      );
    }
  } else if (created.length === 0 && !dryRun) {
    saveSyncState({ ...state, lastRunAt: new Date().toISOString() });
    console.log('No new connections to import. lastRunAt updated.');
  } else if (dryRun) {
    console.log('[dry-run] State file not updated.');
  }

  console.log(`[Connections Sync SUMMARY] created: ${created.length}, failed: ${failed.length}`);
  return { created, failed, scraped };
}

export { SYNC_STATE_PATH, CONNECTIONS_URL, STATUS_PROPOSAL_1, DEFAULT_ANCHOR_URL, DEFAULT_EXCLUDE_SLUGS };
