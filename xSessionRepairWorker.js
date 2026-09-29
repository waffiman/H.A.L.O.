/**
 * Dashboard X Sign in — Playwright on x.com only.
 * Identifier (email/username) → password if X asks (username-first) → extra
 * username → email code / captcha. Never writes LinkedIn cookies.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { dataRoot } from './dataRoot.js';
import { markXSessionOk, xCookiesFile, xSessionStatusFile, xStorageStateFile } from './xSessionHealth.js';

chromium.use(StealthPlugin());

const TOKEN = String(process.env.REPAIR_TOKEN || '').trim();
const ROOT = dataRoot();
const STATE_FILE = path.join(ROOT, 'x_session_repair.json');
const INPUT_FILE = path.join(ROOT, 'x_session_repair_input.jsonl');
const FRAME_PATH = path.join(ROOT, 'x_session_repair_frame.jpg');
const PROFILE = path.join(ROOT, 'session_data_x_repair');
const JAR = xCookiesFile(ROOT);
const STORAGE = xStorageStateFile(ROOT);
const VP = { width: 1280, height: 800 };
// Default: Playwright/Chromium Linux UA. Override only if it still matches Linux.
const X_UA = String(process.env.X_USER_AGENT || '').trim();
const FRESH = String(process.env.X_REPAIR_FRESH || '').trim() === '1';
const SKIP_WARMUP = String(process.env.X_REPAIR_SKIP_WARMUP || '').trim() === '1';

const IDENT_SELS = [
  'input[data-testid="ocfEnterTextTextInput"]',
  'input[autocomplete="username"]',
  'input[name="text"]',
  'input[name="username"]',
  'input[type="email"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="phone" i]',
  'input[placeholder*="username" i]',
  'input[aria-label*="email" i]',
  'input[aria-label*="username" i]',
  'input[type="text"]',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Headed Chromium — X paints a white shell for headless. Start Xvfb if docker forgot DISPLAY. */
async function ensureDisplay() {
  if (process.env.DISPLAY) return process.env.DISPLAY;
  if (process.platform === 'win32') return '';
  for (const n of [99, 100, 101]) {
    const display = `:${n}`;
    if (fs.existsSync(`/tmp/.X11-unix/X${n}`)) {
      process.env.DISPLAY = display;
      return display;
    }
    try {
      const child = spawn('Xvfb', [display, '-ac', '-screen', '0', '1280x1024x24'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      await sleep(900);
      if (fs.existsSync(`/tmp/.X11-unix/X${n}`)) {
        process.env.DISPLAY = display;
        return display;
      }
    } catch (e) {
      console.log('X repair — Xvfb', display, e.message);
    }
  }
  return '';
}

function wantHeadless() {
  return String(process.env.X_REPAIR_HEADLESS || '').trim() === '1' || !process.env.DISPLAY;
}

function humanPause(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs));
}

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
  await context.storageState({ path: STORAGE }).catch(() => {});
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

function isLegalSurface(url, text = '') {
  const u = String(url || '');
  const t = String(text || '').toLowerCase();
  if (/\/i\/flow\/(?!consent)/i.test(u)) return false;
  if (/\/tos(?:$|[/?#])|terms-of-service|help\.(x|twitter)\.com/i.test(u)) return true;
  if (
    /\bterms of service\b/.test(t) &&
    /did someone say/.test(t) &&
    !/phone, email, or username|sign in to x|log in to x/i.test(t)
  ) {
    return true;
  }
  return false;
}

async function isUsernameExtraSurface(page, textLower = '') {
  const t = String(textLower || '').toLowerCase();
  if (
    /confirm your account|information associated with your account|enter (the |your )?username|enter your (phone number or )?username|phone number or username to continue/i.test(
      t
    )
  ) {
    return true;
  }
  const confirm = await page.getByText(/confirm your account/i).first().isVisible().catch(() => false);
  if (confirm) return true;
  const usePassword = await page.getByText(/^Use password$/i).first().isVisible().catch(() => false);
  if (usePassword) return true;
  return false;
}

async function clearFrontIdent(page) {
  const loc = await frontIdentHandle(page);
  if (!loc) return false;
  await loc.click({ timeout: 3000 }).catch(() => {});
  await loc.press('Control+A').catch(() => {});
  await loc.press('Backspace').catch(() => {});
  await loc.evaluate((el) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, '');
    else el.value = '';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: '', inputType: 'deleteContentBackward' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }).catch(() => {});
  return true;
}

async function classify(page) {
  const url = page.url();
  const t = (await pageText(page)).toLowerCase();
  if (isLegalSurface(url, t)) return 'legal';
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
  if (await isUsernameExtraSurface(page, t)) {
    return 'username_extra';
  }
  const passVisibleEarlyForm = await page
    .locator('input[name="password"], input[type="password"], input[autocomplete="current-password"]')
    .first()
    .isVisible()
    .catch(() => false);
  const identVisibleEarly = await page.locator(IDENT_SELS.join(', ')).first().isVisible().catch(() => false);
  const loginCopy = /see what'?s happening|email or username|phone, email, or username|sign in to x/i.test(t);
  if (/\/i\/jf\/onboarding|knowledge_check|\/i\/flow\/consent/i.test(url)) {
    if (
      /temporarily limited your logins|we've temporarily limited|not allowed to log in at this time/i.test(t)
    ) {
      return 'rate_limited';
    }
    // First email/username screen often lives under /i/jf/onboarding — not an extra check.
    if (!identVisibleEarly && !passVisibleEarlyForm && !loginCopy) return 'onboarding';
  }
  if (
    /temporarily limited your logins|limited your logins|we've temporarily limited|not allowed to log in at this time/i.test(
      t
    )
  ) {
    return 'rate_limited';
  }
  // Inline red text on Confirm your account is not the full-page Try again screen.
  if (
    /something went wrong/i.test(t) &&
    /try again/i.test(t) &&
    !/try again later/i.test(t) &&
    !/confirm your account|phone number or username to continue/i.test(t)
  ) {
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
  const textVisible = await page.locator(IDENT_SELS.join(', ')).first().isVisible().catch(() => false);
  if (/temporarily locked|unusual login|we suspect/i.test(t) && !textVisible && !passVisible) {
    return 'unusual';
  }
  if (passVisible && !textVisible) return 'password';
  if (textVisible) {
    if (await isUsernameExtraSurface(page, t)) return 'username_extra';
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

function cookieAcceptClickInDocument() {
  const labels =
    /accept all cookies|allow all cookies|accept all|alle cookies akzeptieren|alle akzeptieren|принять все|refuse non-essential|reject non-essential|essential cookies only/i;
  const visit = (root) => {
    const nodes = [...root.querySelectorAll('button, [role="button"], div[role="button"]')];
    for (const b of nodes) {
      const t = String(b.innerText || '').replace(/\s+/g, ' ').trim();
      if (!labels.test(t) || t.length > 80) continue;
      // Prefer Accept all over reject
      const prefer = /accept all|allow all|принять все|alle cookies akzeptieren/i.test(t);
      if (!prefer && !/reject non-essential|refuse non-essential|essential cookies only/i.test(t)) continue;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerId: 1 }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, pointerId: 1 }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      b.click();
      return t;
    }
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const hit = visit(el.shadowRoot);
        if (hit) return hit;
      }
    }
    return null;
  };
  // Prefer Accept-all first pass
  const preferred = [...document.querySelectorAll('button, [role="button"], div[role="button"]')].find((b) =>
    /accept all cookies|allow all cookies|alle cookies akzeptieren|принять все/i.test(
      String(b.innerText || '').replace(/\s+/g, ' ').trim()
    )
  );
  if (preferred) {
    preferred.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    preferred.click();
    return String(preferred.innerText || '').replace(/\s+/g, ' ').trim();
  }
  return visit(document);
}

async function cookieBannerVisible(page) {
  const t = (await pageText(page)).toLowerCase();
  if (/did someone say[\s\S]{0,120}cookies|accept all cookies|allow all cookies|alle cookies akzeptieren/i.test(t)) {
    return true;
  }
  return page
    .getByRole('button', { name: /accept all cookies|allow all cookies|alle cookies akzeptieren/i })
    .first()
    .isVisible()
    .catch(() => false);
}

async function dismissXCookieBanner(page) {
  // Cookie sheet is often a portal / iframe — Playwright click on the login form never lands.
  let clicked = false;
  for (let round = 0; round < 5; round++) {
    for (const frame of page.frames()) {
      const hit = await frame.evaluate(cookieAcceptClickInDocument).catch(() => null);
      if (hit) {
        clicked = true;
        console.log('X repair — cookie accept via DOM', hit);
      }
      const btn = frame
        .getByRole('button', { name: /accept all cookies|allow all cookies|alle cookies akzeptieren|принять все/i })
        .first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true, timeout: 2500 }).catch(() => {});
        clicked = true;
      }
    }
    if (!(await cookieBannerVisible(page))) break;
    await page.waitForTimeout(400);
  }
  if (clicked) {
    console.log('X repair — cookie banner accepted');
    await page.waitForTimeout(900);
    return true;
  }
  return false;
}

async function leaveLegalSurface(page) {
  const url = page.url();
  const t = await pageText(page);
  if (!isLegalSurface(url, t)) return false;
  console.log('X repair — TOS/legal page, returning to login', url);
  await dismissXCookieBanner(page);
  await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await dismissXCookieBanner(page);
  return true;
}

async function frontIdentHandle(page) {
  const handle = await page.evaluateHandle(() => {
    const bad = new Set(['hidden', 'password', 'checkbox', 'radio', 'submit', 'button', 'file']);
    const vis = [...document.querySelectorAll('input, textarea')].filter((el) => {
      const t = String(el.type || 'text').toLowerCase();
      if (bad.has(t)) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return (
        r.width > 40 &&
        r.height > 10 &&
        st.visibility !== 'hidden' &&
        st.display !== 'none' &&
        Number(st.opacity) > 0.2
      );
    });
    const score = (el) => {
      const auto = String(el.autocomplete || '').toLowerCase();
      const name = String(el.name || '').toLowerCase();
      const testid = String(el.getAttribute('data-testid') || '').toLowerCase();
      const ph = String(el.placeholder || el.getAttribute('aria-label') || '').toLowerCase();
      if (testid.includes('ocfentertext')) return 6;
      if (auto === 'username' || name === 'text' || name === 'username') return 5;
      if (/email|phone|username/.test(ph)) return 4;
      return 1;
    };
    const dialog = vis.filter((el) => el.closest('[role="dialog"], [aria-modal="true"]'));
    const pool = (dialog.length ? dialog : vis).slice().sort((a, b) => score(a) - score(b));
    return pool[pool.length - 1] || null;
  });
  return handle.asElement();
}

function identNorm(s) {
  return String(s || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

async function identFieldValue(page) {
  const loc = await frontIdentHandle(page);
  if (!loc) return '';
  return loc.evaluate((el) => String(el.value || '').trim()).catch(() => '');
}

async function identValueMatches(page, expected) {
  const want = identNorm(expected);
  if (!want) return false;
  const cur = identNorm(await identFieldValue(page));
  return Boolean(cur) && cur === want;
}

async function typeInto(page, selectors, value) {
  await dismissXCookieBanner(page);
  if (await cookieBannerVisible(page)) {
    console.log('X repair — cookie sheet still up, not clicking through it');
    await dismissXCookieBanner(page);
  }
  let loc = await frontIdentHandle(page);
  if (!loc) loc = await waitVisible(page, selectors, 8000);
  if (!loc) return false;
  const already = await loc.evaluate((el) => String(el.value || '').trim()).catch(() => '');
  if (identNorm(already) === identNorm(value)) {
    console.log('X repair — identifier already filled, skip retype');
    return true;
  }
  await loc.click({ timeout: 4000 }).catch(() => {});
  await loc.press('Control+A').catch(() => {});
  await loc.press('Backspace').catch(() => {});
  // Real key events — X's React ignores fill() and stays with a disabled Continue.
  if (typeof loc.pressSequentially === 'function') {
    await loc.pressSequentially(String(value), { delay: 80 });
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
  console.log('X repair — typed into front identifier field');
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
    const ranked = [...document.querySelectorAll('button, [role="button"], div[role="button"]')]
      .filter((el) => labels.test(String(el.innerText || '').replace(/\s+/g, ' ').trim()))
      .map((btn) => {
        const style = getComputedStyle(btn);
        const r = btn.getBoundingClientRect();
        const disabled =
          btn.matches(':disabled') ||
          btn.getAttribute('disabled') != null ||
          btn.getAttribute('aria-disabled') === 'true' ||
          style.pointerEvents === 'none';
        const visible =
          r.width > 8 && r.height > 8 && style.visibility !== 'hidden' && style.display !== 'none';
        const dialog = Boolean(btn.closest('[role="dialog"], [aria-modal="true"]'));
        return { disabled, visible, dialog };
      })
      .filter((x) => x.visible);
    const ready = ranked.find((x) => !x.disabled && x.dialog) || ranked.find((x) => !x.disabled);
    if (ready) return { found: true, ready: true };
    if (ranked.length) return { found: true, ready: false };
    return { found: false, ready: false };
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

/** Exact Continue/Next — never "Continue with Google/Apple/phone". Overlay-safe click. */
async function clickContinueOrNext(page, waitMs = 8000, { allowSignIn = true } = {}) {
  if (isLegalSurface(page.url())) return false;
  await dismissXCookieBanner(page);
  const ready = await waitContinueReady(page, waitMs);
  if (!ready) {
    console.log('X repair — Continue still disabled');
    return false;
  }
  await dismissXCookieBanner(page);
  const clicked = await page.evaluate((allowSignInLabel) => {
    const labels = allowSignInLabel
      ? /^(continue|next|log in|sign in|продолжить|далее|войти)$/i
      : /^(continue|next|продолжить|далее)$/i;
    const ranked = [...document.querySelectorAll('button, [role="button"], div[role="button"]')]
      .filter((el) => {
        const testid = String(el.getAttribute('data-testid') || '');
        if (testid === 'ocfEnterTextNextButton' || testid === 'LoginForm_Login_Button') return true;
        return labels.test(String(el.innerText || '').replace(/\s+/g, ' ').trim());
      })
      .filter((btn) => {
        const r = btn.getBoundingClientRect();
        const style = getComputedStyle(btn);
        return (
          r.width > 8 &&
          r.height > 8 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          btn.getAttribute('aria-disabled') !== 'true' &&
          !btn.matches(':disabled')
        );
      });
    const btn =
      ranked.find((el) => el.getAttribute('data-testid') === 'ocfEnterTextNextButton') ||
      ranked.find((el) => el.closest('[role="dialog"], [aria-modal="true"]')) ||
      ranked[ranked.length - 1] ||
      null;
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    btn.click();
    return true;
  }, allowSignIn);
  if (clicked) {
    console.log('X repair — Continue/Next clicked');
    return true;
  }
  const named = [
    page.locator('[data-testid="ocfEnterTextNextButton"]'),
    page.getByRole('button', { name: /^Continue$/i }),
    page.getByRole('button', { name: /^Next$/i }),
  ];
  for (const loc of named) {
    const btn = loc.first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (await btn.isDisabled().catch(() => false)) continue;
    await btn.click({ force: true, timeout: 4000 }).catch(() => {});
    return true;
  }
  return false;
}

async function clickUsePassword(page) {
  for (const frame of page.frames()) {
    const hit = await frame
      .evaluate(() => {
        const exactRe = /^use password$/i;
        const softRe = /use password/i;
        const nodes = [...document.querySelectorAll('a, button, span, div, [role="button"], [role="link"]')];
        const scored = [];
        for (const el of nodes) {
          const t = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!softRe.test(t) || t.length > 40) continue;
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          if (r.width < 4 || r.height < 4) continue;
          if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.2) continue;
          const area = r.width * r.height;
          // Header wrappers also contain the words "Use password" — skip giant containers.
          if (area > 20000) continue;
          const tag = el.tagName;
          const clickable =
            tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link'
              ? el
              : el.closest('button, a, [role="button"], [role="link"]') || el;
          const cr = clickable.getBoundingClientRect();
          const cArea = cr.width * cr.height;
          if (cArea > 20000) continue;
          const exact = exactRe.test(t);
          const isBtn = clickable.tagName === 'BUTTON' || clickable.getAttribute('role') === 'button';
          scored.push({
            el: clickable,
            t,
            exact,
            isBtn,
            area: cArea,
            x: cr.x + cr.width / 2,
            y: cr.y + cr.height / 2,
          });
        }
        scored.sort(
          (a, b) =>
            Number(b.exact) - Number(a.exact) ||
            Number(b.isBtn) - Number(a.isBtn) ||
            a.area - b.area ||
            b.x - a.x
        );
        const best = scored[0];
        if (!best) return null;
        try {
          best.el.focus();
        } catch {
          /* ignore */
        }
        for (const type of ['pointerdown', 'pointerup']) {
          best.el.dispatchEvent(
            new PointerEvent(type, { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse' })
          );
        }
        best.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        best.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        best.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        best.el.click();
        return { t: best.t, x: best.x, y: best.y, area: Math.round(best.area), btn: best.isBtn };
      })
      .catch(() => null);
    if (hit) {
      console.log('X repair — Use password DOM click', JSON.stringify(hit));
      // Real mouse on the small control — React sometimes ignores synthetic-only clicks.
      if (Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
        await page.mouse.click(hit.x, hit.y).catch(() => {});
      }
      await page.waitForTimeout(2000);
      return true;
    }
  }
  const named = [
    page.getByRole('button', { name: /^Use password$/i }),
    page.getByRole('link', { name: /^Use password$/i }),
    page.locator('button').filter({ hasText: /^Use password$/i }),
    page.getByText(/^Use password$/i),
  ];
  for (const loc of named) {
    const el = loc.first();
    if (!(await el.isVisible().catch(() => false))) continue;
    const box = await el.boundingBox().catch(() => null);
    await el.click({ force: true, timeout: 4000 }).catch(() => {});
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    console.log('X repair — Use password locator', box);
    await page.waitForTimeout(2000);
    return true;
  }
  console.log('X repair — Use password not found');
  return false;
}

/** Force Continue after username — Playwright role click first (fires jf finish_knowledge_check). */
async function forceClickContinue(page) {
  await dismissXCookieBanner(page);
  // Pure locator click is what actually POSTs finish_knowledge_check. Coordinate
  // mouse often hits a fixed bg-overlay (getBoundingClientRect can be 0,0).
  const roleBtn = page.getByRole('button', { name: /^(Continue|Next|Продолжить|Далее)$/i }).last();
  if (await roleBtn.isVisible().catch(() => false)) {
    await roleBtn.click({ timeout: 5000 }).catch(() => {});
    console.log('X repair — force Continue role click');
    await page.waitForTimeout(1800);
    return true;
  }
  const submitted = await page.evaluate(() => {
    const labels = /^(continue|next|продолжить|далее)$/i;
    const btn = [...document.querySelectorAll('button, [role="button"]')].find((el) => {
      const t = String(el.innerText || '').replace(/\s+/g, ' ').trim();
      const testid = String(el.getAttribute('data-testid') || '');
      return testid === 'ocfEnterTextNextButton' || labels.test(t);
    });
    if (!btn) return false;
    btn.removeAttribute('disabled');
    btn.setAttribute('aria-disabled', 'false');
    if (btn.form) {
      try {
        btn.form.requestSubmit(btn);
        return 'submit';
      } catch {
        /* fall through */
      }
    }
    btn.click();
    return 'click';
  });
  if (submitted) {
    console.log('X repair — force Continue', submitted);
    await page.waitForTimeout(1800);
    return true;
  }
  const loc = page.locator('[data-testid="ocfEnterTextNextButton"], button:has-text("Continue")').last();
  if (await loc.isVisible().catch(() => false)) {
    await loc.click({ force: true, timeout: 4000 }).catch(() => {});
    console.log('X repair — force Continue locator');
    await page.waitForTimeout(1800);
    return true;
  }
  return false;
}

/** Watch jf.x.com finish_knowledge_check — 200 can still mean blocked. */
function attachXLoginNetGuards(page, bag) {
  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (!/finish_knowledge_check|begin_login/i.test(u)) return;
      const body = await res.text().catch(() => '');
      if (/not allowed to log in at this time|temporarily limited your login/i.test(body)) {
        bag.loginBlocked = true;
        bag.loginBlockReason = 'not_allowed';
        console.log('X repair — login blocked by X API', u.slice(0, 80), res.status());
      }
    } catch {
      /* ignore */
    }
  });
}

async function pageHasInlineHiccup(page) {
  const t = (await pageText(page)).toLowerCase();
  return /something went wrong/i.test(t) && /try again/i.test(t);
}

async function waitForIdentField(page, timeoutMs = 22000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await dismissXCookieBanner(page);
    await leaveLegalSurface(page);
    const loc = await waitVisible(page, IDENT_SELS, 1500);
    if (loc && !isLegalSurface(page.url())) return loc;
    await page.waitForTimeout(400);
  }
  return null;
}

async function loginDiagnostics(page) {
  return page
    .evaluate(() => {
      const inputs = [...document.querySelectorAll('input, textarea')].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          type: el.type,
          name: el.name,
          auto: el.autocomplete,
          testid: el.getAttribute('data-testid'),
          ph: el.placeholder,
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
      return {
        href: location.href,
        title: document.title,
        text: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220),
        inputs,
      };
    })
    .catch(() => null);
}

async function applyIdentifier(page, identifier, { extra = false } = {}) {
  writeState({ lastFillError: null, status: 'running' });
  await dismissXCookieBanner(page);
  if (!extra && (await leaveLegalSurface(page))) {
    await dismissXCookieBanner(page);
  }
  let loc = await waitForIdentField(page, extra ? 16000 : 22000);
  if (!loc && !extra) {
    console.log('X repair — login field missing, reload flow');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await dismissXCookieBanner(page);
    loc = await waitForIdentField(page, 15000);
  }
  // Always wipe Chrome autofill (old @handle) before typing email or username.
  await clearFrontIdent(page);
  await page.waitForTimeout(200);
  const ok = await typeInto(page, IDENT_SELS, identifier);
  if (!ok) {
    const dump = await loginDiagnostics(page);
    console.log('X repair — no identifier field', JSON.stringify(dump));
    throw new Error(extra ? 'Could not find the X username field' : 'Could not find the X email / username field');
  }
  await captureFrame(page);
  if (!extra) {
    await page.keyboard.press('Tab').catch(() => {});
    await page.waitForTimeout(400);
  }
  await dismissXCookieBanner(page);
  if (extra) {
    writeState({ lastFillError: 'Username is in — clicking Continue…' });
    await page.waitForTimeout(600);
    // Confirm-your-account expects Continue after username. Use password is secondary
    // (and its huge header wrappers previously stole the click).
    let used = await forceClickContinue(page);
    if (!used) used = await clickContinueOrNext(page, 4000, { allowSignIn: false });
    if (!used) {
      console.log('X repair — Continue miss after username, try Use password button');
      used = await clickUsePassword(page);
    }
    if (!used) {
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(600);
      used =
        (await forceClickContinue(page)) ||
        (await clickUsePassword(page)) ||
        (await clickContinueOrNext(page, 3000, { allowSignIn: false }));
    }
    if (!used) {
      console.log('X repair — could not advance after extra username', JSON.stringify(await loginDiagnostics(page)));
      await captureFrame(page);
      return false;
    }
    await dismissXCookieBanner(page);
    await page.waitForTimeout(humanPause(1200, 2200));
    await dismissXCookieBanner(page);
    await waitForPainted(page, 8000);
    await captureFrame(page);
    console.log('X repair — identifier submitted extra');
    return true;
  }
  let clicked = await clickContinueOrNext(page, 6000, { allowSignIn: false });
  if (!clicked) {
    await page.keyboard.press('Enter');
    console.log('X repair — pressed Enter after identifier');
    await page.waitForTimeout(500);
    await dismissXCookieBanner(page);
    clicked = await clickContinueOrNext(page, 4000, { allowSignIn: false });
  }
  if (!clicked) {
    console.log('X repair — identifier typed, Continue not confirmed yet');
    writeState({
      lastFillError: 'Email is in the field — clicking Continue…',
    });
    await captureFrame(page);
    return false;
  }
  await page.waitForTimeout(humanPause(1800, 3200));
  await waitForPainted(page, 8000);
  await captureFrame(page);
  console.log('X repair — identifier submitted email');
  return true;
}

async function applyPassword(page, password) {
  writeState({ lastFillError: null, status: 'running' });
  await dismissXCookieBanner(page);
  const ok = await typeInto(
    page,
    ['input[name="password"]', 'input[type="password"]', 'input[autocomplete="current-password"]'],
    password
  );
  if (!ok) throw new Error('Could not find the X password field');
  await page.keyboard.press('Tab').catch(() => {});
  await page.waitForTimeout(humanPause(3000, 7000));
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

async function waitForPainted(page, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page
      .evaluate(() => {
        const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        const hit = [...document.querySelectorAll('input, textarea, button, [role="button"]')].some((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 20 && r.height > 8;
        });
        return text.length > 24 || hit;
      })
      .catch(() => false);
    if (ok) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function captureFrame(page) {
  await waitForPainted(page, 4000);
  await page.screenshot({ path: FRAME_PATH, type: 'jpeg', quality: 62, animations: 'disabled' }).catch(() => {});
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

function publishKind(kind, identifierSubmitted, extraUsernameApplied, { waitingForExtraUsername = false } = {}) {
  if (kind === 'pin') {
    writeState({ challengeKind: 'pin', status: 'awaiting_code', error: null });
    return;
  }
  if (kind === 'captcha') {
    writeState({ challengeKind: 'captcha', status: 'awaiting_user', error: null });
    return;
  }
  if (kind === 'username_extra' || waitingForExtraUsername || (extraUsernameApplied && (kind === 'username' || kind === 'unknown'))) {
    writeState({
      challengeKind: 'username',
      status: 'awaiting_username',
      error: null,
      lastFillError: waitingForExtraUsername
        ? 'X is asking for your username — type it in the popup, then Next.'
        : null,
    });
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
  if (kind === 'onboarding') {
    writeState({
      challengeKind: 'generic',
      status: 'awaiting_user',
      error: null,
      lastFillError: 'X opened an extra check — use the live screenshot (do not close the popup).',
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

  const display = await ensureDisplay();
  const headless = wantHeadless();
  const launchOpts = {
    headless,
    viewport: VP,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
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
  };
  if (X_UA) launchOpts.userAgent = X_UA;
  const browser = await chromium.launchPersistentContext(PROFILE, launchOpts);
  const page = browser.pages()[0] || (await browser.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const netBag = { loginBlocked: false, loginBlockReason: null };
  attachXLoginNetGuards(page, netBag);
  console.log('X repair — browser', { headless, display: display || process.env.DISPLAY || '', fresh: FRESH });

  try {
    if (await persistXCookies(browser)) {
      console.log('X repair — already signed in from reused profile');
      return;
    }
    if (!SKIP_WARMUP) {
      writeState({ lastFillError: 'Warming up the browser…', status: 'running' });
      for (const url of ['https://www.google.com/', 'https://www.wikipedia.org/']) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
          console.log('X repair — warmup skip', url, e.message);
        });
        await page.mouse.move(180 + Math.random() * 500, 160 + Math.random() * 280).catch(() => {});
        await page.waitForTimeout(humanPause(2200, 4200));
      }
    }
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(humanPause(1600, 2800));
    await dismissXCookieBanner(page);
    await page.waitForSelector(IDENT_SELS.join(', '), { timeout: 20000 }).catch(() => {});
    await captureFrame(page);
    writeState({ lastFillError: null, status: 'running' });

    let signed = false;
    let identifierSubmitted = false;
    let extraUsernameApplied = false;
    let usedPasswordLink = false;
    let clearedExtraAutofill = false;
    let lastAdvanceAt = 0;
    let lastExtraContinueAt = 0;
    let lastEmail = '';
    let lastExtraUsername = '';
    let lastPassword = '';
    let tryAgainCount = 0;
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline && !signed) {
      if (netBag.loginBlocked) {
        writeState({
          challengeKind: 'rate_limited',
          status: 'error',
          error:
            'X refused this login ("not allowed to log in at this time"). Wait 30–60 minutes, do not retry from the VPS, or paste cookies from a normal Chrome session. Rotate the X password if it was shared in chat.',
        });
        await captureFrame(page);
        break;
      }
      await dismissXCookieBanner(page);
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
            const kindNow = await classify(page);
            if (kindNow === 'username_extra') {
              if (extraUsernameApplied && (await identValueMatches(page, ev.text))) {
                console.log('X repair — extra username already in field, Use password');
                usedPasswordLink = await clickUsePassword(page);
              } else {
                const ok = await applyIdentifier(page, ev.text, { extra: true });
                usedPasswordLink = Boolean(ok);
              }
              extraUsernameApplied = true;
              identifierSubmitted = true;
              lastAdvanceAt = Date.now();
              lastExtraContinueAt = Date.now();
            } else {
              console.log('X repair — queued extra username until Confirm your account', kindNow);
              writeState({
                lastFillError: 'Username saved. Chromium is still on the email step — it will be used later.',
              });
            }
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
        if (tryAgainCount >= 1) {
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
        extraUsernameApplied = false;
        usedPasswordLink = false;
        clearedExtraAutofill = false;
        lastAdvanceAt = 0;
        lastExtraContinueAt = 0;
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
            await applyIdentifier(page, lastExtraUsername, { extra: true });
            extraUsernameApplied = true;
            lastAdvanceAt = Date.now();
            lastExtraContinueAt = Date.now();
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
            'X blocked or rate-limited this server IP ("temporarily limited" / "not allowed to log in"). Do not Sign in again for 30–60 minutes. Stay logged out of that account in your own browser, or paste cookies from a normal Chrome session.',
        });
        await captureFrame(page);
        break;
      } else if (kind === 'legal') {
        await leaveLegalSurface(page);
        identifierSubmitted = false;
        extraUsernameApplied = false;
        usedPasswordLink = false;
        clearedExtraAutofill = false;
        lastAdvanceAt = 0;
        lastExtraContinueAt = 0;
        if (lastEmail) {
          try {
            await applyIdentifier(page, lastEmail);
            identifierSubmitted = true;
            lastAdvanceAt = Date.now();
          } catch (e) {
            writeState({ lastFillError: e.message });
            console.error('X repair after TOS:', e.message);
          }
        }
        await captureFrame(page);
        continue;
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
        if (kind === 'username_extra') {
          await dismissXCookieBanner(page);
          if (lastExtraUsername && !extraUsernameApplied) {
            try {
              const ok = await applyIdentifier(page, lastExtraUsername, { extra: true });
              extraUsernameApplied = true;
              usedPasswordLink = Boolean(ok);
              lastAdvanceAt = Date.now();
              lastExtraContinueAt = Date.now();
            } catch (e) {
              console.log('X repair — extra username apply:', e.message);
            }
          } else if (lastExtraUsername && extraUsernameApplied) {
            writeState({ lastFillError: 'Username is in — clicking Continue…' });
            let advanced = await forceClickContinue(page);
            if (!advanced) advanced = await clickContinueOrNext(page, 3000, { allowSignIn: false });
            if (!advanced) advanced = await clickUsePassword(page);
            usedPasswordLink = advanced || usedPasswordLink;
            lastAdvanceAt = Date.now();
            await captureFrame(page);
          } else if (!lastExtraUsername) {
            // Chromium profile often autofills a previous @handle — wipe until popup Next.
            if (!clearedExtraAutofill) {
              const wiped = await clearFrontIdent(page);
              clearedExtraAutofill = true;
              console.log('X repair — cleared autofill on Confirm your account', wiped);
              await captureFrame(page);
            }
            writeState({
              challengeKind: 'username',
              status: 'awaiting_username',
              lastFillError: 'X is asking for your username — type it in the popup, then Next.',
            });
          }
        } else if (
          !identifierSubmitted &&
          lastEmail &&
          (kind === 'unknown' || kind === 'username') &&
          Date.now() - lastAdvanceAt > 6000
        ) {
          console.log('X repair — retry identifier after empty login paint', kind, page.url());
          writeState({ lastFillError: 'Login form was blank — waiting and retrying email…', status: 'running' });
          try {
            await applyIdentifier(page, lastEmail);
            identifierSubmitted = true;
            lastAdvanceAt = Date.now();
            writeState({ lastFillError: null });
          } catch (e) {
            writeState({ lastFillError: e.message });
            lastAdvanceAt = Date.now();
            console.error('X repair identifier retry:', e.message);
          }
        } else if (
          identifierSubmitted &&
          !extraUsernameApplied &&
          (kind === 'username' || kind === 'onboarding' || kind === 'unknown') &&
          Date.now() - lastAdvanceAt > 2500
        ) {
          // Never retype email / Continue if X already moved to Confirm your account.
          if (await isUsernameExtraSurface(page)) {
            writeState({
              challengeKind: 'username',
              status: 'awaiting_username',
              lastFillError: 'X is asking for your username — type it in the popup, then Next.',
            });
          } else {
            await dismissXCookieBanner(page);
            const st = await continueState(page);
            if (st.found && !st.ready && lastEmail) {
              console.log('X repair — Continue gray with email shown, retype email');
              await typeInto(page, IDENT_SELS, lastEmail);
              await page.waitForTimeout(400);
            }
            const again = await clickContinueOrNext(page, 2500, { allowSignIn: false });
            console.log('X repair — retry Continue/Next', again, kind, page.url());
            if (again) lastAdvanceAt = Date.now();
          }
        } else if (extraUsernameApplied && (kind === 'username' || kind === 'onboarding' || kind === 'unknown')) {
          if (!usedPasswordLink || Date.now() - lastAdvanceAt > 5000) {
            usedPasswordLink = (await clickUsePassword(page)) || usedPasswordLink;
            lastAdvanceAt = Date.now();
          }
        }
        publishKind(kind, identifierSubmitted, extraUsernameApplied, {
          waitingForExtraUsername: kind === 'username_extra' && !lastExtraUsername,
        });
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
