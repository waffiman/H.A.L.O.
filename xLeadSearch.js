/**
 * Stage A step 1 — X People search in the logged-in X browser.
 * Inserts Lead😴 (https://x.com/{handle} + ready marker) when the chat composer
 * is usable. No follow, no Apify, no ice, no DM.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { dataRoot } from './dataRoot.js';
import { canonicalXProfileUrl, channelFromUrl, xHandleFromUrl } from './leadChannel.js';
import { CRM_STATUSES } from './crm/constants.js';
import * as crm from './crmStore.js';
import { readSalesPolicy } from './brainStore.js';
import {
  markXSessionDead,
  markXSessionOk,
  xAuthTokenPresent,
  xCookiesFile,
} from './xSessionHealth.js';

const CLOSED_INBOX_RE = /has a closed inbox|closed inbox|if you know their x number/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'are']);

export function xLeadsPerRun() {
  const raw = process.env.X_LEADS_PER_RUN;
  if (raw == null || String(raw).trim() === '') return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.max(0, Math.min(20, Math.round(n)));
}

/** One People-search string: roles, industries, extra keywords, company, region. */
export function buildXPeopleQuery(portrait, linkedInSearch) {
  const bits = [];
  const push = (v) => {
    const t = String(v || '').replace(/\s+/g, ' ').trim();
    if (t) bits.push(t);
  };
  for (const role of portrait?.roles || []) push(role);
  for (const industry of portrait?.industries || []) push(industry);
  push(linkedInSearch?.keywordsExtra);
  push(linkedInSearch?.currentCompany);
  for (const region of portrait?.regions || []) push(region);
  return bits.join(' ').slice(0, 180).trim();
}

export function xPortraitTokens(portrait, linkedInSearch) {
  const raw = [
    ...(portrait?.roles || []),
    ...(portrait?.industries || []),
    linkedInSearch?.keywordsExtra,
    linkedInSearch?.currentCompany,
    ...(portrait?.regions || []),
  ];
  const out = new Set();
  for (const part of raw) {
    for (const w of String(part || '').toLowerCase().split(/[^a-z0-9+#]+/)) {
      if (w.length >= 3 && !STOP.has(w)) out.add(w);
    }
  }
  return [...out];
}

function sessionDir() {
  return path.join(dataRoot(), 'session_data_x_search');
}

function isLoginWall(url) {
  return /\/i\/flow\/login|\/login|\/i\/flow\/signup/i.test(String(url || ''));
}

function loadPlaywrightCookies() {
  const file = xCookiesFile();
  if (!fs.existsSync(file)) return [];
  let list = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    list = Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
  const out = [];
  for (const c of list) {
    if (!c?.name || c.value == null) continue;
    const s = String(c.sameSite || '').toLowerCase();
    let sameSite = 'Lax';
    if (s === 'strict') sameSite = 'Strict';
    else if (s === 'none' || s === 'no_restriction') sameSite = 'None';
    const cookie = {
      name: String(c.name),
      value: String(c.value),
      domain: c.domain || '.x.com',
      path: c.path || '/',
      httpOnly: Boolean(c.httpOnly),
      secure: sameSite === 'None' ? true : c.secure !== false,
      sameSite,
    };
    const exp = Number(c.expires);
    if (Number.isFinite(exp) && exp > 0) cookie.expires = exp;
    out.push(cookie);
  }
  return out;
}

async function persistIfLive(context) {
  const cookies = await context.cookies('https://x.com');
  if (!cookies.some((c) => c.name === 'auth_token' && c.value)) return false;
  fs.writeFileSync(xCookiesFile(), JSON.stringify(cookies, null, 2));
  return true;
}

async function knownHandles() {
  const set = new Set();
  for (const status of CRM_STATUSES) {
    let rows = [];
    try {
      rows = await crm.listByStatus(status);
    } catch (e) {
      console.error('X search CRM list failed:', e.message);
    }
    for (const row of rows) {
      if (channelFromUrl(row?.url) !== 'x') continue;
      const handle = xHandleFromUrl(row.url);
      if (handle) set.add(handle.toLowerCase());
    }
  }
  return set;
}

async function readPeopleCards(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-testid="UserCell"]')];
    return cells.map((cell) => {
      const href = [...cell.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .find((h) => /^\/[A-Za-z0-9_]{1,15}$/.test(h));
      const lines = (cell.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const name = lines.find((line) => !line.startsWith('@')) || '';
      return { href: href || '', name, text: (cell.innerText || '').slice(0, 600) };
    });
  });
}

async function chatIsOpen(page, handle) {
  await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
  if (isLoginWall(page.url())) return { dead: true, open: false, reason: 'login' };
  const before = await page.locator('body').innerText().catch(() => '');
  if (CLOSED_INBOX_RE.test(before)) return { open: false, reason: 'closed inbox' };

  const testId = page.locator('[data-testid="sendDMFromProfile"]').first();
  const byRole = page.getByRole('button', { name: /^message$/i }).first();
  const hasTestId = (await testId.count().catch(() => 0)) > 0;
  const hasRole = (await byRole.count().catch(() => 0)) > 0;
  if (!hasTestId && !hasRole) return { open: false, reason: 'no message button' };
  await (hasTestId ? testId : byRole).click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (isLoginWall(page.url())) return { dead: true, open: false, reason: 'login' };
  const after = await page.locator('body').innerText().catch(() => '');
  if (CLOSED_INBOX_RE.test(after)) return { open: false, reason: 'closed inbox' };
  if ((await page.locator('[data-testid="dmComposerTextInput"]').count().catch(() => 0)) > 0) {
    return { open: true, reason: 'composer' };
  }
  if (/\/messages|\/i\/chat\//i.test(page.url())) return { open: true, reason: 'messages' };
  return { open: false, reason: 'composer not found' };
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runXLeadSearchPhase() {
  if (process.env.CHANNEL_X_ENABLED !== '1') {
    console.log('X lead search skipped (CHANNEL_X_ENABLED!=1).');
    return { skipped: true, reason: 'channel_off' };
  }
  const cap = xLeadsPerRun();
  if (cap <= 0) {
    console.log('X lead search skipped (X_LEADS_PER_RUN=0).');
    return { skipped: true, reason: 'cap_zero' };
  }
  const policy = readSalesPolicy();
  const query = buildXPeopleQuery(policy.portrait, policy.linkedInSearch);
  const tokens = xPortraitTokens(policy.portrait, policy.linkedInSearch);
  if (!query || !tokens.length) {
    console.log('X lead search skipped (no roles, industries, keywords, company, or region).');
    return { skipped: true, reason: 'empty_portrait' };
  }
  if (!xAuthTokenPresent().present) {
    console.log('X lead search skipped (no auth_token).');
    markXSessionDead('missing_auth_token');
    return { skipped: true, reason: 'no_auth' };
  }

  const known = await knownHandles();
  console.log(`X lead search: cap=${cap} known=${known.size} q="${query}"`);
  fs.mkdirSync(sessionDir(), { recursive: true });
  const context = await chromium.launchPersistentContext(sessionDir(), {
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  let inserted = 0;
  let skippedCards = 0;
  let checked = 0;
  let sessionDead = false;
  try {
    const cookies = loadPlaywrightCookies();
    if (cookies.length) await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=user`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    if (isLoginWall(page.url())) {
      markXSessionDead('auth_wall');
      console.log('X lead search stopped — login wall. Cookies left untouched.');
      return { skipped: true, reason: 'auth_wall', inserted: 0 };
    }
    await page.waitForSelector('[data-testid="UserCell"]', { timeout: 15000 }).catch(() => {});
    const cards = await readPeopleCards(page);
    console.log(`X people cards on first page: ${cards.length}`);

    const candidates = [];
    for (const card of cards) {
      const handle = xHandleFromUrl(card.href ? `https://x.com${card.href}` : '');
      if (!handle) continue;
      if (known.has(handle.toLowerCase())) continue;
      const hay = String(card.text || '').toLowerCase();
      if (!tokens.some((token) => hay.includes(token))) continue;
      candidates.push({ handle, name: String(card.name || handle).slice(0, 200) });
    }

    for (const candidate of candidates) {
      if (inserted >= cap) break;
      checked += 1;
      const gate = await chatIsOpen(page, candidate.handle);
      if (known.has(candidate.handle.toLowerCase())) continue;
      if (gate.dead) {
        sessionDead = true;
        markXSessionDead('auth_wall');
        console.log('X lead search stopped — session died during chat check. Cookies left untouched.');
        break;
      }
      if (!gate.open) {
        skippedCards += 1;
        console.log(`X skip @${candidate.handle}: ${gate.reason}`);
        await pause(4000 + Math.floor(Math.random() * 3000));
        continue;
      }
      const url = canonicalXProfileUrl(candidate.handle);
      try {
        const created = await crm.createXLead({ url, name: candidate.name });
        inserted += 1;
        known.add(candidate.handle.toLowerCase());
        console.log(`X Lead inserted @${candidate.handle} (${created.id})`);
      } catch (e) {
        console.error(`X insert @${candidate.handle}:`, e.message);
      }
      await pause(5000 + Math.floor(Math.random() * 4000));
    }

    if (!sessionDead) {
      const live = await persistIfLive(context);
      if (live) markXSessionOk({ source: 'x_lead_search' });
      else console.log('X lead search finished without a live auth_token — jar not overwritten.');
    }
  } finally {
    await context.close().catch(() => {});
  }
  console.log(`X lead search done. inserted=${inserted} skipped=${skippedCards} checked=${checked}`);
  return { inserted, skipped: skippedCards, checked };
}
