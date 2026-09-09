/**
 * Browser bootstrap for manual Connect runs.
 * Dedicated connect browser bootstrap.
 * Default `agent` profile = mobile session_data + cookies.json (same as Stage A).
 * Use `repair` only right after dashboard Sign in (live session_data_repair jar).
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { runLinkedInConnect, readConnectRunStatus, dismissLinkedInCookieBanner } from './linkedinConnect.js';

chromium.use(StealthPlugin());

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-gpu',
  '--window-size=1600,1000',
];

/** URL/title/body — stray Sign-in controls on feed caused false auth_wall; logout landing is real. */
async function pageLooksLikeAuthWall(page) {
  const url = (page.url() || '').toLowerCase();
  if (/\/uas\/login|\/checkpoint\/lg\/login|authwall|\/signup/.test(url)) return true;
  if (/linkedin\.com\/login(\?|$|\/)/.test(url)) return true;
  const title = ((await page.title().catch(() => '')) || '').toLowerCase();
  if (/^sign in\s*\|/.test(title) || /^linkedin login/.test(title)) return true;
  const body = await page
    .evaluate(() => ((document.body && document.body.innerText) || '').slice(0, 500))
    .catch(() => '');
  if (/welcome to your professional community/i.test(body)) return true;
  if (/sign in as /i.test(body) && /join now/i.test(body) && !/\/feed/i.test(url)) return true;
  return false;
}

async function loadCookies(context) {
  const cookiesPath = path.join(process.cwd(), 'cookies.json');
  if (!fs.existsSync(cookiesPath)) return 0;
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    if (Array.isArray(cookies) && cookies.length) {
      console.log(`Loading ${cookies.length} cookies from cookies.json...`);
      await context.addCookies(cookies);
      return cookies.length;
    }
  } catch (e) {
    console.error('loadCookies:', e.message);
  }
  return 0;
}

async function persistCookies(context) {
  try {
    const all = await context.cookies();
    const linkedIn = all.filter((c) => /linkedin\.com/i.test(c.domain || ''));
    if (!linkedIn.length) return;
    // Never overwrite good cookies with empty/login-page set
    const hasAt = linkedIn.some((c) => c.name === 'li_at' && c.value);
    if (!hasAt) {
      console.log('Skip cookie persist — no li_at in live context');
      return;
    }
    fs.writeFileSync(path.join(process.cwd(), 'cookies.json'), JSON.stringify(linkedIn, null, 2));
    console.log(`Persisted ${linkedIn.length} LinkedIn cookies after Connect`);
  } catch (e) {
    console.error('persistCookies:', e.message);
  }
}

function clearConnectProfile(sessionPath) {
  fs.mkdirSync(sessionPath, { recursive: true });
  for (const name of fs.readdirSync(sessionPath)) {
    try {
      fs.rmSync(path.join(sessionPath, name), { recursive: true, force: true });
    } catch (e) {
      console.error('profile cleanup', name, e.message);
    }
  }
}

export async function runConnectWithBrowser() {
  const { markSessionOk, markSessionDead, readSessionStatus } = await import('./sessionHealth.js');
  const st = readSessionStatus();
  if (st && st.ok === false && process.env.REQUIRE_SESSION !== '0') {
    const err = `Session dead (${st.reason || 'unknown'}) — repair cookies before Connect`;
    console.error(err);
    return { error: err, sent: 0, failed: 0, skipped: 0 };
  }

  const searchUrl = (process.env.CONNECT_SEARCH_URL || '').trim();
  let resolvedUrl = searchUrl;
  let searchKeywords = '';
  let keywordFallbacks = [];
  if (!resolvedUrl) {
    try {
      const { resolveConnectPeopleSearchUrl } = await import('./prospectSearch.js');
      const resolved = resolveConnectPeopleSearchUrl();
      resolvedUrl = resolved.searchUrl;
      searchKeywords = resolved.keywords || '';
      keywordFallbacks = resolved.keywordFallbacks || [];
    } catch (e) {
      console.error('resolveConnectPeopleSearchUrl:', e.message);
    }
  }
  if (!resolvedUrl) {
    return { error: 'CONNECT_SEARCH_URL is empty and Brain portrait search could not be built', sent: 0, failed: 0, skipped: 0 };
  }

  const profileMode = String(process.env.CONNECT_SESSION_PROFILE || 'agent').toLowerCase();
  const profileDirs = {
    repair: 'session_data_repair',
    connect: 'session_data_connect',
    agent: 'session_data',
  };
  const sessionPath = path.join(process.cwd(), profileDirs[profileMode] || profileDirs.repair);
  const useMobileSession = profileMode === 'repair' || profileMode === 'agent';
  console.log(`Connect profile: ${profileMode} (${sessionPath})${useMobileSession ? ' [mobile UA]' : ''}`);

  const MOBILE_UA =
    process.env.LINKEDIN_USER_AGENT ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  const userAgent = useMobileSession ? MOBILE_UA : USER_AGENT;
  const viewport = useMobileSession ? { width: 390, height: 844 } : { width: 1600, height: 1000 };

  const pendingRepair = path.join(process.cwd(), '.cookie_repair_pending');
  const shouldReset =
    (profileMode === 'connect' || profileMode === 'agent') &&
    (process.env.CONNECT_RESET_PROFILE === '1' ||
      (profileMode === 'connect' && fs.existsSync(pendingRepair)));

  fs.mkdirSync(sessionPath, { recursive: true });
  if (shouldReset) {
    console.log('Resetting desktop Connect profile...');
    clearConnectProfile(sessionPath);
    try {
      if (fs.existsSync(pendingRepair)) fs.unlinkSync(pendingRepair);
    } catch {
      /* ignore */
    }
  } else {
    console.log('Reusing desktop Connect profile (set CONNECT_RESET_PROFILE=1 to wipe)');
  }

  // LinkedIn often serves empty People SERP under pure headless. Prefer headed under Xvfb.
  const wantHeadless = String(process.env.CONNECT_HEADLESS || '').trim();
  const headless =
    wantHeadless === '1' || wantHeadless.toLowerCase() === 'true'
      ? true
      : wantHeadless === '0' || wantHeadless.toLowerCase() === 'false'
        ? false
        : false; // default headed (use xvfb-run on VPS)

  const contextOptions = {
    headless,
    userAgent,
    viewport,
    isMobile: useMobileSession,
    hasTouch: useMobileSession,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    args: LAUNCH_ARGS,
    ignoreDefaultArgs: ['--enable-automation'],
  };

  console.log(`Launching Connect browser (${sessionPath})...`);
  console.log('headless=', headless, '| mobile=', useMobileSession, '| Search URL:', resolvedUrl.slice(0, 160));

  const browser = await chromium.launchPersistentContext(sessionPath, {
    headless,
    args: LAUNCH_ARGS,
    ...contextOptions,
  });

  try {
    const skipCookieLoad = profileMode === 'repair';
    const n = skipCookieLoad ? 1 : await loadCookies(browser);
    if (!skipCookieLoad && !n) {
      markSessionDead('no_cookies_for_connect');
      return { error: 'No cookies.json — paste LinkedIn cookies first', sent: 0, failed: 0, skipped: 0 };
    }

    const page = browser.pages()[0] || (await browser.newPage());

    async function dismissCookieBanner() {
      await dismissLinkedInCookieBanner(page, 'feed');
    }

    // Cookies already loaded above — go straight to feed (homepage-first caused extra logout friction)
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) =>
      console.log('Feed goto:', e.message)
    );
    await page.waitForTimeout(4500);
    await dismissCookieBanner();

    let url = page.url();
    let title = await page.title().catch(() => '');
    console.log('Feed check:', url, '|', title);

    if (await pageLooksLikeAuthWall(page)) {
      if (!skipCookieLoad) {
        console.log('Auth wall first pass — reloading cookies and retrying feed...');
        await loadCookies(browser);
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
        await page.waitForTimeout(4500);
        url = page.url();
        title = await page.title().catch(() => '');
        console.log('Feed retry:', url, '|', title);
      } else {
        console.log('Auth wall on repair jar — reloading feed without cookie inject...');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
        await page.waitForTimeout(3500);
        url = page.url();
        title = await page.title().catch(() => '');
        console.log('Feed reload:', url, '|', title);
      }
    }

    if (await pageLooksLikeAuthWall(page)) {
      markSessionDead('auth_wall_on_connect');
      return {
        error: `Auth wall — session needs re-sign-in (${url})`,
        sent: 0,
        failed: 0,
        skipped: 0,
      };
    }

    let knownSlugs = new Set();
    try {
      const { fetchKnownProfileSlugs } = await import('./connectionsSync.js');
      knownSlugs = await fetchKnownProfileSlugs();
    } catch (e) {
      console.error('fetchKnownProfileSlugs:', e.message);
    }
    let ledgerSlugs = new Set();
    try {
      const { connectLedgerSlugs } = await import('./connectSentLedger.js');
      ledgerSlugs = connectLedgerSlugs();
    } catch (_) {}

    const dryRun = process.env.CONNECT_DRY_RUN === '1';
    const summary = await runLinkedInConnect(page, {
      searchUrl: resolvedUrl,
      searchKeywords,
      keywordFallbacks,
      maxPerRun: Number(process.env.CONNECT_MAX_PER_RUN || 10),
      note: process.env.CONNECT_NOTE || '',
      knownSlugs,
      ledgerSlugs,
      dryRun,
      onInviteSent: async (url) => {
        const { profileSlugFromUrl } = await import('./connectionsSync.js');
        const { recordConnectSent } = await import('./connectSentLedger.js');
        const { upsertLeadSleepPage } = await import('./connectLeads.js');
        const slug = profileSlugFromUrl(url);
        if (slug) recordConnectSent(slug);
        if (dryRun) return;
        await upsertLeadSleepPage({ url });
      },
    });
    await persistCookies(browser);
    if (!summary?.error) {
      markSessionOk({ source: 'runConnectWithBrowser', feedVisible: true });
    }
    return summary;
  } catch (e) {
    console.error('Connect run error:', e.message);
    if (/auth wall on search/i.test(e.message)) {
      console.log('Search auth wall only — leaving session_status unchanged (feed was OK).');
    } else if (/auth wall|cookies need repair|session need/i.test(e.message)) {
      markSessionDead('auth_wall_on_search');
    }
    const status = readConnectRunStatus() || {};
    return {
      error: e.message,
      sent: status.sent || 0,
      failed: status.failed || 0,
      skipped: status.skipped || 0,
    };
  } finally {
    await browser.close().catch((e) => console.error('Browser close:', e.message));
  }
}
