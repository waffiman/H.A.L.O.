/**
 * Follow an X profile from the search session. Does not touch LinkedIn cookies.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { dataRoot } from './dataRoot.js';
import { markXSessionDead, markXSessionOk, xAuthTokenPresent, xCookiesFile } from './xSessionHealth.js';

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

async function acceptCookies(page) {
  const accept = page.getByRole('button', { name: /accept all cookies/i }).first();
  if ((await accept.count().catch(() => 0)) === 0) return;
  await accept.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * @returns {{ ok: boolean, reason?: string, already?: boolean, sessionOk?: boolean }}
 */
export async function followXProfile(handle, { context: existing = null } = {}) {
  const cleanHandle = String(handle || '').replace(/^@/, '').trim();
  if (!cleanHandle) return { ok: false, reason: 'missing handle' };
  if (!xAuthTokenPresent().present) {
    markXSessionDead('missing_auth_token');
    return { ok: false, reason: 'no_auth', sessionOk: false };
  }

  let context = existing;
  let owned = false;
  if (!context) {
    fs.mkdirSync(sessionDir(), { recursive: true });
    context = await chromium.launchPersistentContext(sessionDir(), {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    owned = true;
    const cookies = loadPlaywrightCookies();
    if (cookies.length) await context.addCookies(cookies);
  }

  let sessionDead = false;
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(`https://x.com/${cleanHandle}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1800);
    await acceptCookies(page);
    if (isLoginWall(page.url())) {
      sessionDead = true;
      markXSessionDead('auth_wall');
      return { ok: false, reason: 'auth_wall', sessionOk: false };
    }

    const unfollow = page.locator('[data-testid$="-unfollow"]').first();
    if ((await unfollow.count().catch(() => 0)) > 0) {
      console.log(`X follow @${cleanHandle}: already following`);
      return { ok: true, already: true, sessionOk: true };
    }

    const followBtn = page.locator('[data-testid$="-follow"]').first();
    const byRole = page.getByRole('button', { name: /^follow$/i }).first();
    const hasTestId = (await followBtn.count().catch(() => 0)) > 0;
    const hasRole = (await byRole.count().catch(() => 0)) > 0;
    if (!hasTestId && !hasRole) {
      const shot = path.join(dataRoot(), 'scripts', '_x_follow_shot.png');
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
      console.log(`X follow @${cleanHandle}: no follow button`);
      return { ok: false, reason: 'no_follow_button', sessionOk: true };
    }
    await (hasTestId ? followBtn : byRole).click({ timeout: 8000 });
    await page.waitForTimeout(2000);
    if (isLoginWall(page.url())) {
      sessionDead = true;
      markXSessionDead('auth_wall');
      return { ok: false, reason: 'auth_wall', sessionOk: false };
    }
    const nowFollowing = (await page.locator('[data-testid$="-unfollow"]').count().catch(() => 0)) > 0;
    console.log(`X follow @${cleanHandle}: ${nowFollowing ? 'ok' : 'clicked_unconfirmed'}`);
    return { ok: true, already: false, sessionOk: true, confirmed: nowFollowing };
  } finally {
    if (owned) {
      if (!sessionDead) {
        const live = await persistIfLive(context).catch(() => false);
        if (live) markXSessionOk({ source: 'x_follow' });
      }
      await context.close().catch(() => {});
    }
  }
}
