/**
 * One-shot acceptance check: scan My Network for accepted Lead😴 → ready for enrich/ice.
 * Launch path mirrors ensureLoggedInBrowser() in index.js (plain playwright, no stealth).
 */
import fs from 'fs';
import 'dotenv/config';
import path from 'path';
import { chromium } from 'playwright';
import { withCycleLock, isLockHeld } from './cycleLock.js';
import { runStageAAcceptancePhase } from './stageAConnect.js';
import { listAllLeadSleepPages } from './connectLeads.js';

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function loadCookies(context) {
  const cookiesPath = path.join(process.cwd(), 'cookies.json');
  if (!fs.existsSync(cookiesPath)) return 0;
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    if (Array.isArray(cookies) && cookies.length) {
      await context.addCookies(cookies);
      return cookies.length;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

async function openAgentBrowser() {
  const sessionPath = path.join(process.cwd(), 'session_data');
  const statePath = path.join(process.cwd(), 'state.json');
  const wantHeadless = String(process.env.CONNECT_HEADLESS ?? '1').trim();
  const headless = wantHeadless !== '0' && wantHeadless.toLowerCase() !== 'false';

  const opts = {
    headless,
    userAgent: USER_AGENT,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-gpu',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (fs.existsSync(statePath)) opts.storageState = statePath;

  console.log(`Acceptance browser: session_data headless=${headless} [mobile UA, plain playwright]`);
  const browser = await chromium.launchPersistentContext(sessionPath, opts);
  await loadCookies(browser);
  const page = browser.pages()[0] || (await browser.newPage());
  await page.route('**/*.{woff,woff2,ttf}', (route) => route.abort());
  page.on('crash', () => console.log('PAGE CRASH event'));

  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) =>
    console.log('Feed goto:', e.message)
  );
  await page.waitForTimeout(5000);

  const url = page.url();
  if (/login|authwall|uas\/login/i.test(url)) {
    throw new Error('auth_wall_on_feed');
  }
  return { browser, page };
}

async function main() {
  const held = isLockHeld();
  if (held.held) {
    console.error(`Cannot start acceptance — cycle lock held by ${held.owner}`);
    process.exit(2);
  }

  const leads = await listAllLeadSleepPages();
  console.log(`Lead😴 in CRM: ${leads.length}`);
  for (const l of leads.slice(0, 15)) {
    console.log(`  - ${l.slug} ${l.url || ''}`);
  }
  if (!leads.length) {
    console.log('No Lead😴 rows — nothing to check.');
    process.exit(0);
  }

  const lock = await withCycleLock('A', async () => {
    let browser;
    try {
      const opened = await openAgentBrowser();
      browser = opened.browser;
      return await runStageAAcceptancePhase(opened.page);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }, { skipIfBusy: true, waitMs: 0 });

  if (lock.skipped) {
    console.error('Acceptance skipped — lock busy');
    process.exit(2);
  }
  const result = lock.result || {};
  console.log('Acceptance finished:', JSON.stringify(result));
  if (result.sessionDead) process.exit(1);
  if (result.browserCrashed) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
