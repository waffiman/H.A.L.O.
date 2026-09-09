/**
 * Local-only runner: sync My Connections → Notion (Proposal 1️⃣ + Link).
 * Does NOT start the DM send loop. Safe to run on your laptop while IONOS DM agent stays untouched.
 *
 * Usage:
 *   node sync-connections.js
 *   FORCE_SYNC=1 node sync-connections.js
 *   SYNC_DRY_RUN=1 node sync-connections.js
 *
 * Env (same .env as agent): NOTION_TOKEN, NOTION_DATABASE_ID, LINKEDIN_EMAIL, LINKEDIN_PASSWORD
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  syncNewConnections,
  isConnectionsSyncDue,
  loadSyncState,
} from './connectionsSync.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function humanRandomDelay(min = 2000, max = 5000) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

async function loadCookies(context) {
  try {
    const cookiesPath = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
      console.log('Loading cookies from cookies.json...');
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      await context.addCookies(cookies);
    }
  } catch (e) {
    console.error('Error loading cookies:', e.message);
  }
}

async function pageLooksLikeAuthWall(page) {
  const url = page.url().toLowerCase();
  if (url.includes('authwall')) return true;
  if (/linkedin\.com\/uas\/login|linkedin\.com\/login\b|\/checkpoint\//.test(url)) return true;
  const html = await page.content().catch(() => '');
  if (/pagekey[^"]*auth_wall/i.test(html)) return true;
  if (/<title>\s*sign in \| linkedin\s*<\/title>/i.test(html)) return true;
  return false;
}

/** Minimal login bootstrap — mirrors index.js session check without importing index (avoids starting DM loop). */
async function ensureLoggedIn(page, browser, statePath) {
  console.log('Navigating to feed to check session...');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'load', timeout: 90000 }).catch((e) =>
    console.log('Feed goto failed:', e.message)
  );
  await humanRandomDelay(4000, 7000);

  const interstitial = page.locator('button[data-action="dismiss"], button:has-text("Continue"), .promo__dismiss').first();
  if (await interstitial.isVisible().catch(() => false)) {
    await interstitial.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  if (!(await pageLooksLikeAuthWall(page))) {
    console.log('Session looks OK (not on auth wall).');
    return true;
  }

  if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) {
    console.error('Auth wall and no LINKEDIN_EMAIL/PASSWORD in .env');
    return false;
  }

  console.log('Auth wall — trying login via index helpers...');
  // Dynamic import of login only: index must guard main so this does not start processLeads.
  const auth = await import('./index.js');
  if (typeof auth.tryAutoLoginLinkedIn === 'function') {
    await auth.tryAutoLoginLinkedIn(page, browser, statePath);
  } else {
    console.error('tryAutoLoginLinkedIn not exported from index.js — update index exports.');
    return false;
  }

  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await humanRandomDelay(3000, 5000);
  return !(await pageLooksLikeAuthWall(page));
}

async function run() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
    console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID in .env');
    process.exit(1);
  }

  const state = loadSyncState();
  if (!isConnectionsSyncDue(state) && process.env.FORCE_SYNC !== '1') {
    console.log(`Connections sync not due yet (lastRunAt=${state.lastRunAt}). Set FORCE_SYNC=1 to run anyway.`);
    process.exit(0);
  }

  const sessionPath = path.join(process.cwd(), 'session_data');
  const statePath = path.join(process.cwd(), 'state.json');

  const contextOptions = {
    headless: process.env.SYNC_HEADED === '1' ? false : true,
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
  if (fs.existsSync(statePath)) {
    contextOptions.storageState = statePath;
  }

  console.log('Launching browser for connections sync...');
  const browser = await chromium.launchPersistentContext(sessionPath, {
    headless: contextOptions.headless,
    args: contextOptions.args,
    ...contextOptions,
  });

  let exitCode = 0;
  try {
    await loadCookies(browser);
    const page = browser.pages()[0] || (await browser.newPage());
    await page.route('**/*.{woff,woff2,ttf}', (route) => route.abort());

    const ok = await ensureLoggedIn(page, browser, statePath);
    if (!ok) {
      console.error('Not logged in — aborting sync.');
      exitCode = 2;
      return;
    }

    await syncNewConnections(page, { dryRun: process.env.SYNC_DRY_RUN === '1' });
  } catch (e) {
    console.error('Fatal sync:', e.message);
    exitCode = 1;
  } finally {
    await browser.storageState({ path: statePath }).catch(() => {});
    await browser.close().catch(() => {});
  }
  process.exit(exitCode);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  run();
}
