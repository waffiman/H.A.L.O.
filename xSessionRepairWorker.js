/**
 * Dashboard X Sign in — Playwright on x.com only.
 * Identifier (email/username) → password if X asks (username-first) → extra
 * username → email code / captcha. Never writes LinkedIn cookies.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { dataRoot } from './dataRoot.js';
import { markXSessionOk, xCookiesFile, xSessionStatusFile } from './xSessionHealth.js';

chromium.use(StealthPlugin());

const TOKEN = String(process.env.REPAIR_TOKEN || '').trim();
const ROOT = dataRoot();
const STATE_FILE = path.join(ROOT, 'x_session_repair.json');
const INPUT_FILE = path.join(ROOT, 'x_session_repair_input.jsonl');
const FRAME_PATH = path.join(ROOT, 'x_session_repair_frame.jpg');
const PROFILE = path.join(ROOT, 'session_data_x_repair');
const JAR = xCookiesFile(ROOT);
const VP = { width: 1280, height: 800 };
// Match Playwright 1.41 Chromium on this Linux VPS — do not claim Windows
// (WebGL/OS mismatch is a stronger bot signal than a Linux desktop UA).
const X_UA =
  process.env.X_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const FRESH = String(process.env.X_REPAIR_FRESH || '').trim() === '1';
const HEADLESS =
  String(process.env.X_REPAIR_HEADLESS || '').trim() === '1' || !process.env.DISPLAY;

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
  if (!auth) return false;
  fs.writeFileSync(JAR, JSON.stringify(xOnly.map(toPlaywrightCookie).filter(Boolean), null, 2));
  markXSessionOk(
    { source: 'x_session_repair', cookieCount: xOnly.length },
    { statusFile: xSessionStatusFile(ROOT) }
  );
  writeState({ authTokenCaptured: true, status: 'success', error: null, challengeKind: null });
  console.log('X repair — auth_token captured, jar written');
  return true;
}

async function pageText(page) {
  return String((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 5000);
}

async function classify(page) {
  const url = page.url();
  const t = (await pageText(page)).toLowerCase();
  if (/\/home(?:$|[/?#])|\/i\/timeline/i.test(url) && !/\/i\/flow\/login/i.test(url)) return 'home';
  if (await page.locator('[data-testid="AppTabBar_Home_Link"], a[href="/home"]').first().isVisible().catch(() => false)) {
    return 'home';
  }
  if (/couldn.?t find your account|не удалось найти|account doesn.?t exist/i.test(t)) {
    return 'bad_credentials';
  }
  const passVisibleEarly = await page
    .locator('input[name="password"], input[type="password"], input[autocomplete="current-password"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (
    passVisibleEarly &&
    /wrong password|incorrect password|неверный пароль|that password is incorrect/i.test(t)
  ) {
    return 'bad_password';
  }
  if (
    /temporarily limited your logins|limited your logins|temporarily (limited|locked)|try again later/i.test(
      t
    )
  ) {
    return 'rate_limited';
  }
  if (/something went wrong/i.test(t) && /try again/i.test(t) && !/try again later/i.test(t)) {
    return 'try_again';
  }
  const captchaFrame = await page
    .locator('iframe[src*="recaptcha"], iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], iframe[title*="captcha" i]')
    .first()
    .isVisible()
    .catch(() => false);
  if (captchaFrame || /verify you.?re (a )?human|confirm you.?re not a robot|are you a robot|arkose/i.test(t)) {
    return 'captcha';
  }
  if (/verification code|authentication code|confirmation code|we sent (you )?a code|check your email|enter (the )?code|одноразов|код подтвержд/i.test(t)) {
    return 'pin';
  }
  if (/verify your identity|confirm your identity|upload.*id|identification document/i.test(t)) {
    return 'identity';
  }
  const passVisible = await page
    .locator('input[name="password"], input[type="password"], input[autocomplete="current-password"]')
    .first()
    .isVisible()
    .catch(() => false);
  const textVisible = await page
    .locator('input[autocomplete="username"], input[name="text"], input[type="text"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (/temporarily locked|unusual login|we suspect/i.test(t) && !textVisible && !passVisible) {
    return 'unusual';
  }
  if (passVisible && !textVisible) return 'password';
  if (textVisible) {
    if (
      /confirm your account|information associated with your account|enter (the |your )?username|enter your (phone number or )?username|phone number or username to continue/i.test(
        t
      )
    ) {
      return 'username_extra';
    }
    return 'username';
  }
  return 'unknown';
}

async function waitVisible(page, selectors, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function typeInto(page, selectors, value) {
  const loc = await waitVisible(page, selectors, 8000);
  if (!loc) return false;
  await loc.click({ timeout: 4000 });
  await loc.press('Control+A').catch(() => {});
  await loc.press('Backspace').catch(() => {});
  // Real key events — X's React ignores fill() and stays with a disabled Continue.
  if (typeof loc.pressSequentially === 'function') {
    await loc.pressSequentially(String(value), { delay: 45 });
  } else {
    await loc.type(String(value), { delay: 45 });
  }
  await loc.evaluate((el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, v);
    else el.value = v;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: v, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
  await page.waitForTimeout(350);
  return true;
}

async function clickFirst(page, selectors) {
  const loc = await waitVisible(page, selectors, 6000);
  if (!loc) return false;
  await loc.click({ timeout: 5000 });
  return true;
}

async function continueState(page) {
  return page.evaluate(() => {
    const labels = /^(continue|next|log in|sign in|продолжить|далее|войти)$/i;
    const btn = [...document.querySelectorAll('button, [role="button"], div[role="button"]')].find((el) =>
      labels.test(String(el.innerText || '').replace(/\s+/g, ' ').trim())
    );
    if (!btn) return { found: false, ready: false };
    const style = getComputedStyle(btn);
    const disabled =
      btn.matches(':disabled') ||
      btn.getAttribute('disabled') != null ||
      btn.getAttribute('aria-disabled') === 'true' ||
      style.pointerEvents === 'none';
    return { found: true, ready: !disabled };
  });
}

async function waitContinueReady(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await continueState(page);
    if (st.found && st.ready) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Exact Continue/Next — never "Continue with Google/Apple/phone". Skips a gray/disabled button. */
async function clickContinueOrNext(page, waitMs = 8000) {
  const ready = await waitContinueReady(page, waitMs);
  if (!ready) {
    console.log('X repair — Continue still disabled');
    return false;
  }
  const named = [
    page.getByRole('button', { name: /^Continue$/i }),
    page.getByRole('button', { name: /^Next$/i }),
    page.getByRole('button', { name: /^Log in$/i }),
    page.getByRole('button', { name: /^Sign in$/i }),
    page.getByRole('button', { name: /^Продолжить$/i }),
    page.getByRole('button', { name: /^Далее$/i }),
    page.getByRole('button', { name: /^Войти$/i }),
    page.locator('[data-testid="ocfEnterTextNextButton"]'),
    page.locator('[data-testid="LoginForm_Login_Button"]'),
  ];
  for (const loc of named) {
    const btn = loc.first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (await btn.isDisabled().catch(() => false)) continue;
    await btn.click({ timeout: 5000 });
    return true;
  }
  const clicked = await page.evaluate(() => {
    const labels = /^(continue|next|log in|sign in|продолжить|далее|войти)$/i;
    const btn = [...document.querySelectorAll('button, [role="button"], div[role="button"]')].find((el) =>
      labels.test(String(el.innerText || '').replace(/\s+/g, ' ').trim())
    );
    if (!btn || btn.getAttribute('aria-disabled') === 'true' || btn.matches(':disabled')) return false;
    btn.click();
    return true;
  });
  return !!clicked;
}

async function applyIdentifier(page, identifier) {
  writeState({ lastFillError: null, status: 'running' });
  const ok = await typeInto(
    page,
    ['input[autocomplete="username"]', 'input[name="text"]', 'input[type="text"]'],
    identifier
  );
  if (!ok) throw new Error('Could not find the X email / username field');
  await page.keyboard.press('Tab').catch(() => {});
  await page.waitForTimeout(400);
  let clicked = await clickContinueOrNext(page);
  if (!clicked) {
    await page.keyboard.press('Enter');
    console.log('X repair — pressed Enter after identifier');
    await page.waitForTimeout(800);
    clicked = await clickContinueOrNext(page);
  }
  if (!clicked) throw new Error('Continue stayed disabled — submit the username again');
  await page.waitForTimeout(1800);
  console.log('X repair — identifier submitted');
}

async function applyPassword(page, password) {
  writeState({ lastFillError: null, status: 'running' });
  const ok = await typeInto(
    page,
    ['input[name="password"]', 'input[type="password"]', 'input[autocomplete="current-password"]'],
    password
  );
  if (!ok) throw new Error('Could not find the X password field');
  await page.keyboard.press('Tab').catch(() => {});
  await page.waitForTimeout(400);
  let clicked = await clickContinueOrNext(page);
  if (!clicked) {
    await page.keyboard.press('Enter');
    console.log('X repair — pressed Enter after password');
    await page.waitForTimeout(800);
    clicked = await clickContinueOrNext(page);
  }
  if (!clicked) throw new Error('Continue stayed disabled — submit the password again');
  await page.waitForTimeout(1800);
  console.log('X repair — password submitted');
}

async function applyCode(page, code) {
  const ok = await typeInto(
    page,
    [
      'input[inputmode="numeric"]',
      'input[autocomplete="one-time-code"]',
      'input[name="text"]',
      'input[type="text"]',
    ],
    code
  );
  if (!ok) throw new Error('Could not find the X code field — tap it on the screenshot, then submit again.');
  let advanced = await clickContinueOrNext(page);
  if (!advanced) {
    advanced = await clickFirst(page, [
      'button:has-text("Verify")',
      '[role="button"]:has-text("Verify")',
    ]);
  }
  if (!advanced) await page.keyboard.press('Enter');
  await page.waitForTimeout(2200);
}

async function captureFrame(page) {
  await page.screenshot({ path: FRAME_PATH, type: 'jpeg', quality: 58 }).catch(() => {});
  writeState({
    lastFrameAt: new Date().toISOString(),
    viewport: VP,
    frameRev: Date.now(),
  });
}

function wipeDir(dir) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.log('wipe repair profile:', e.message);
  }
  fs.mkdirSync(dir, { recursive: true });
}

function publishKind(kind, identifierSubmitted) {
  if (kind === 'pin') {
    writeState({ challengeKind: 'pin', status: 'awaiting_code', error: null });
    return;
  }
  if (kind === 'captcha') {
    writeState({ challengeKind: 'captcha', status: 'awaiting_user', error: null });
    return;
  }
  if (kind === 'username_extra') {
    writeState({ challengeKind: 'username', status: 'awaiting_username', error: null });
    return;
  }
  if (kind === 'username') {
    writeState({
      challengeKind: identifierSubmitted ? 'generic' : 'username',
      status: 'running',
      error: null,
    });
    return;
  }
  if (kind === 'password') {
    writeState({
      challengeKind: 'password',
      status: 'awaiting_password',
      error: null,
    });
    return;
  }
  if (kind === 'bad_password') {
    writeState({
      challengeKind: 'password',
      status: 'awaiting_password',
      lastFillError: 'X rejected that password — try again.',
    });
    return;
  }
  if (kind === 'try_again') {
    writeState({
      challengeKind: 'generic',
      status: 'running',
      lastFillError: 'X said try again — reloading the login page…',
    });
    return;
  }
  if (kind === 'unknown') {
    writeState({ challengeKind: 'generic', status: 'running' });
  }
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
  writeState({
    status: 'running',
    error: null,
    authTokenCaptured: false,
    challengeKind: 'generic',
    viewport: VP,
  });
  if (FRESH) wipeDir(PROFILE);
  else fs.mkdirSync(PROFILE, { recursive: true });

  const browser = await chromium.launchPersistentContext(PROFILE, {
    headless: HEADLESS,
    viewport: VP,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
    userAgent: X_UA,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--password-store=basic',
      `--window-size=${VP.width},${VP.height}`,
    ],
  });
  const page = browser.pages()[0] || (await browser.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  console.log('X repair — browser', { headless: HEADLESS, display: process.env.DISPLAY || '', fresh: FRESH });

  try {
    if (await persistXCookies(browser)) {
      console.log('X repair — already signed in from reused profile');
      return;
    }
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1800);
    await captureFrame(page);

    let signed = false;
    let identifierSubmitted = false;
    let lastAdvanceAt = 0;
    let lastEmail = '';
    let lastExtraUsername = '';
    let lastPassword = '';
    let tryAgainCount = 0;
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline && !signed) {
      for (const ev of drainInput()) {
        try {
          if (ev.type === 'signin' && ev.username) {
            if (identifierSubmitted) {
              console.log('X repair — skip duplicate signin');
              continue;
            }
            lastEmail = ev.username;
            await applyIdentifier(page, ev.username);
            identifierSubmitted = true;
            lastAdvanceAt = Date.now();
          } else if (ev.type === 'submitUsername' && ev.text) {
            lastExtraUsername = ev.text;
            await applyIdentifier(page, ev.text);
            identifierSubmitted = true;
            lastAdvanceAt = Date.now();
          } else if (ev.type === 'submitPassword' && ev.text) {
            lastPassword = ev.text;
            await applyPassword(page, ev.text);
            lastAdvanceAt = Date.now();
          } else if (ev.type === 'submitCode' && ev.text) {
            await applyCode(page, ev.text);
          } else if (ev.type === 'click' && Number.isFinite(Number(ev.x)) && Number.isFinite(Number(ev.y))) {
            await page.mouse.click(Number(ev.x), Number(ev.y));
            await page.waitForTimeout(250);
          }
        } catch (e) {
          writeState({ lastFillError: e.message });
          console.error('X repair input:', e.message);
        }
        await captureFrame(page);
      }

      signed = await persistXCookies(browser);
      if (signed) break;

      const kind = await classify(page);
      console.log('X repair classify', kind, page.url());
      if (kind === 'home') {
        signed = await persistXCookies(browser);
        if (signed) break;
      } else if (kind === 'bad_credentials') {
        writeState({
          status: 'error',
          challengeKind: 'bad_credentials',
          error: 'X could not find that account — check the email / username and Sign in again.',
        });
        await captureFrame(page);
        break;
      } else if (kind === 'identity') {
        writeState({
          challengeKind: 'identity_document',
          status: 'error',
          error:
            'X asked for extra identity verification. Finish that in a personal browser, then Sign in again (or paste cookies).',
        });
        await captureFrame(page);
        break;
      } else if (kind === 'try_again') {
        if (tryAgainCount >= 3) {
          writeState({
            status: 'error',
            challengeKind: 'try_again',
            error: 'X said try again three times — press Sign in again in a minute.',
          });
          await captureFrame(page);
          break;
        }
        tryAgainCount += 1;
        console.log('X repair — try-again reload', tryAgainCount);
        writeState({
          challengeKind: 'generic',
          status: 'running',
          lastFillError: 'X hiccup — reloading login and retrying…',
        });
        const tryAgainBtn = page.getByRole('button', { name: /^Try again$/i }).first();
        if (await tryAgainBtn.isVisible().catch(() => false)) {
          await tryAgainBtn.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(1600);
        }
        await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(2200);
        identifierSubmitted = false;
        lastAdvanceAt = 0;
        if (lastEmail) {
          await applyIdentifier(page, lastEmail);
          identifierSubmitted = true;
          lastAdvanceAt = Date.now();
        }
        const waitExtra = Date.now() + 22000;
        while (Date.now() < waitExtra) {
          const k2 = await classify(page);
          if (k2 === 'try_again' || k2 === 'rate_limited' || k2 === 'unusual') break;
          if ((k2 === 'password' || k2 === 'bad_password') && lastPassword) {
            await applyPassword(page, lastPassword);
            lastAdvanceAt = Date.now();
            continue;
          }
          if (k2 === 'username_extra' && lastExtraUsername) {
            await applyIdentifier(page, lastExtraUsername);
            lastAdvanceAt = Date.now();
            break;
          }
          if (k2 === 'pin' || k2 === 'home' || k2 === 'captcha') break;
          await page.waitForTimeout(800);
        }
        await captureFrame(page);
        continue;
      } else if (kind === 'rate_limited') {
        writeState({
          challengeKind: 'rate_limited',
          status: 'error',
          error:
            'X temporarily limited logins from this server IP. Wait 15–30 minutes, stay logged out of that account in your own browser, then press Sign in once.',
        });
        await captureFrame(page);
        break;
      } else if (kind === 'unusual') {
        writeState({
          challengeKind: 'unusual',
          status: 'error',
          error:
            'X blocked this login. Finish any check in your own browser, close the X tab, then Sign in again.',
        });
        await captureFrame(page);
        break;
      } else {
        if (identifierSubmitted && kind === 'username_extra' && Date.now() - lastAdvanceAt > 4000) {
          const again = await clickContinueOrNext(page, 400);
          console.log('X repair — retry Continue/Next', again, kind, page.url());
          if (again) lastAdvanceAt = Date.now();
        }
        publishKind(kind, identifierSubmitted);
      }
      await captureFrame(page);
      await page.waitForTimeout(1500);
    }

    if (!signed && readState().status !== 'error') {
      writeState({
        status: 'error',
        error: 'X Sign in timed out — press Sign in again. Stay logged out of that account in your own browser.',
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
