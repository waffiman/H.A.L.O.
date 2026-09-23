/**
 * Dashboard X Sign in — Playwright on x.com only.
 * Never reads/writes cookies.json or LinkedIn session_data.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { dataRoot } from './dataRoot.js';
import { markXSessionOk, xCookiesFile, xSessionStatusFile } from './xSessionHealth.js';

const TOKEN = String(process.env.REPAIR_TOKEN || '').trim();
const ROOT = dataRoot();
const STATE_FILE = path.join(ROOT, 'x_session_repair.json');
const INPUT_FILE = path.join(ROOT, 'x_session_repair_input.jsonl');
const PROFILE = path.join(ROOT, 'session_data_x_repair');
const JAR = xCookiesFile(ROOT);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(patch) {
  const prev = readState();
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

function drainInput() {
  if (!fs.existsSync(INPUT_FILE)) return [];
  const lines = fs.readFileSync(INPUT_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  fs.writeFileSync(INPUT_FILE, '');
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return out;
}

function toPlaywrightCookie(c) {
  const name = c.name;
  const value = String(c.value ?? '');
  if (!name || !value) return null;
  const sameSiteRaw = String(c.sameSite || 'None');
  let sameSite = 'None';
  if (/lax/i.test(sameSiteRaw)) sameSite = 'Lax';
  else if (/strict/i.test(sameSiteRaw)) sameSite = 'Strict';
  return {
    name,
    value,
    domain: c.domain || '.x.com',
    path: c.path || '/',
    httpOnly: Boolean(c.httpOnly),
    secure: c.secure !== false,
    sameSite,
    expires: c.expires || Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
  };
}

async function persistXCookies(context) {
  const cookies = await context.cookies();
  const xOnly = cookies.filter((c) => {
    const d = String(c.domain || '').replace(/^\./, '').toLowerCase();
    return d === 'x.com' || d.endsWith('.x.com') || d === 'twitter.com' || d.endsWith('.twitter.com');
  });
  const auth = xOnly.find((c) => c.name === 'auth_token' && c.value);
  if (!auth) {
    console.log('X repair — no auth_token yet; skip jar write');
    return false;
  }
  fs.writeFileSync(JAR, JSON.stringify(xOnly.map(toPlaywrightCookie).filter(Boolean), null, 2));
  markXSessionOk(
    { source: 'x_session_repair', cookieCount: xOnly.length },
    { statusFile: xSessionStatusFile(ROOT) }
  );
  writeState({ authTokenCaptured: true, status: 'success' });
  console.log('X repair — auth_token captured, jar written');
  return true;
}

async function classify(page) {
  const url = page.url();
  const text = await page.locator('body').innerText().catch(() => '');
  const t = String(text || '').slice(0, 4000);
  if (/\/home|\/i\/timeline/i.test(url) && !/\/i\/flow\/login/i.test(url)) return 'home';
  if (/unusual|verify your identity|confirm your identity/i.test(t)) return 'identity';
  if (
    /verification code|authentication code|confirmation code|authenticator|enter (the )?code/i.test(t)
  ) {
    return 'pin';
  }
  if (/password/i.test(t) && /log in|sign in/i.test(t)) return 'password';
  if (/phone|email|username/i.test(t) && /next|sign in|log in/i.test(t)) return 'username';
  return 'unknown';
}

async function typeInto(page, selectors, value) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.click({ timeout: 3000 });
      await loc.fill('');
      await loc.type(String(value), { delay: 40 });
      return true;
    }
  }
  return false;
}

async function clickFirst(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.click({ timeout: 4000 });
      return true;
    }
  }
  return false;
}

async function main() {
  if (!TOKEN) {
    console.error('REPAIR_TOKEN missing');
    process.exit(1);
  }
  const st = readState();
  if (st.token && st.token !== TOKEN) {
    console.error('Token mismatch');
    process.exit(1);
  }
  writeState({ status: 'running', error: null });
  fs.mkdirSync(PROFILE, { recursive: true });

  const browser = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = browser.pages()[0] || (await browser.newPage());

  try {
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);

    let signed = false;
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline && !signed) {
      for (const ev of drainInput()) {
        if (ev.type === 'signin') {
          const kind = await classify(page);
          console.log('X repair classify before signin', kind);
          await typeInto(
            page,
            [
              'input[autocomplete="username"]',
              'input[name="text"]',
              'input[type="text"]',
            ],
            ev.username
          );
          await clickFirst(page, [
            'button:has-text("Next")',
            '[role="button"]:has-text("Next")',
            'div[role="button"]:has-text("Next")',
          ]);
          await page.waitForTimeout(1800);
          await typeInto(
            page,
            ['input[name="password"]', 'input[type="password"]', 'input[autocomplete="current-password"]'],
            ev.password
          );
          await clickFirst(page, [
            'button[data-testid="LoginForm_Login_Button"]',
            'button:has-text("Log in")',
            '[role="button"]:has-text("Log in")',
          ]);
          await page.waitForTimeout(2500);
        } else if (ev.type === 'submitCode' && ev.text) {
          await typeInto(
            page,
            [
              'input[name="text"]',
              'input[inputmode="numeric"]',
              'input[type="text"]',
            ],
            ev.text
          );
          await clickFirst(page, [
            'button:has-text("Next")',
            'button:has-text("Verify")',
            '[role="button"]:has-text("Next")',
          ]);
          await page.waitForTimeout(2500);
        }
      }

      signed = await persistXCookies(browser);
      if (signed) break;

      const kind = await classify(page);
      if (kind === 'home') {
        signed = await persistXCookies(browser);
        if (signed) break;
      }
      if (kind === 'pin') {
        writeState({ challengeKind: 'pin', status: 'awaiting_code' });
      } else if (kind === 'identity') {
        writeState({
          challengeKind: 'identity_document',
          status: 'awaiting_user',
          error: 'X asked for extra identity verification — finish in a personal browser, then paste cookies.',
        });
      } else {
        writeState({ challengeKind: kind, status: 'running' });
      }
      await page.waitForTimeout(1500);
    }

    if (!signed) {
      writeState({
        status: 'error',
        error: 'X Sign in timed out — try cookie paste or Sign in again.',
      });
    }
  } catch (e) {
    writeState({ status: 'error', error: e.message });
    console.error('X repair failed:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
