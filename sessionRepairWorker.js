/**
 * Headless Chromium repair worker.
 * Normal path: native repair form posts {signin} → fill + click Sign in.
 * Challenge path: livestream screenshot + remote click/fill.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { markSessionOk } from './sessionHealth.js';

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, 'session_repair.json');
const FRAME_PATH = path.join(ROOT, 'session_repair_frame.jpg');
const INPUT_PATH = path.join(ROOT, 'session_repair_input.jsonl');
const COOKIES_PATH = path.join(ROOT, 'cookies.json');
const TOKEN = process.env.REPAIR_TOKEN || '';
const MAX_MS = Number(process.env.REPAIR_TIMEOUT_MS || 20 * 60 * 1000);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(patch) {
  const prev = readState() || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function toPlaywrightCookies(cookies) {
  return cookies
    .filter((c) => /linkedin\.com/i.test(String(c.domain || '')))
    .map((c) => {
      const item = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite === 'Strict' ? 'Strict' : c.sameSite === 'Lax' ? 'Lax' : 'None',
      };
      if (c.expires && c.expires > 0) item.expires = Math.floor(c.expires);
      return item;
    });
}

function wipeDirContents(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch (inner) {
      console.error('wipe entry:', dir, name, inner.message);
    }
  }
}

/** Stricter than body "sign in" grep — mobile feed promos must not block harvest. */
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

/** Poll for li_at after app approval — avoid rapid reloads; they reset the app-approval handshake. */
let lastChallengeReloadAt = 0;

async function waitForPostApproval(context, page) {
  const hasLiAt = (list) => list.some((c) => c.name === 'li_at' && c.value && c.value.length > 20);
  const onAppUrl = (u) =>
    /linkedin\.com\/(feed|mynetwork|messaging)/i.test(u || '') && !/login|checkpoint|authwall/i.test(u || '');

  if (hasLiAt(await context.cookies())) return true;

  const url = page.url() || '';
  if (onAppUrl(url)) return true;

  const now = Date.now();
  if (now - lastChallengeReloadAt < 15000) {
    await page.waitForTimeout(1000);
    return false;
  }
  lastChallengeReloadAt = now;

  console.log('Post-approval gentle reload (15s cadence), url=', url.slice(0, 120));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  if (hasLiAt(await context.cookies())) {
    console.log('li_at appeared after gentle reload');
    return true;
  }

  const url2 = page.url() || '';
  if (onAppUrl(url2)) {
    console.log('Challenge page redirected:', url2.slice(0, 100));
    return true;
  }
  return false;
}

/** Only harvest when li_at exists AND feed is actually reachable (not a stale jar). */
async function tryHarvest(context, page, { requireLive = true } = {}) {
  const cookies = await context.cookies();
  const li = cookies.find((c) => c.name === 'li_at' && c.value && c.value.length > 20);
  if (!li) {
    console.log('tryHarvest skip — no li_at in context yet');
    return false;
  }

  if (requireLive && page) {
    const urlNow = page.url() || '';
    const alreadyOnApp =
      /linkedin\.com\/(feed|messaging|mynetwork|in\/)/i.test(urlNow) &&
      !/login|authwall|uas\/login|checkpoint/i.test(urlNow);
    if (!alreadyOnApp) {
      await page
        .goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 })
        .catch(() => {});
      await page.waitForTimeout(1500);
    }
    const url = page.url() || '';
    const stillAuth = await pageLooksLikeAuthWall(page);
    const liveHasLiAt = (await context.cookies()).some((c) => c.name === 'li_at' && c.value && c.value.length > 20);
    const onFeedUrl = /linkedin\.com\/feed/i.test(url) && !stillAuth;
    const onApp =
      onFeedUrl ||
      /linkedin\.com\/(messaging|mynetwork|mwlite)/i.test(url) ||
      (/linkedin\.com/i.test(url) && !stillAuth && liveHasLiAt && !/login|checkpoint|authwall/i.test(url));
    // Mobile feed: li_at + /feed/ + no auth wall is enough (matches ensureLoggedInBrowser).
    if (stillAuth || !liveHasLiAt || !onApp) {
      console.log(
        'tryHarvest skip —',
        stillAuth ? 'auth wall' : !liveHasLiAt ? 'no li_at' : 'not on app url',
        url.slice(0, 120)
      );
      return false;
    }
  }

  const packed = toPlaywrightCookies(await context.cookies());
  const stillLi = packed.find((c) => c.name === 'li_at' && c.value && c.value.length > 20);
  if (!stillLi) return false;
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(packed, null, 2));
  // Bind-mounted session_data cannot be renamed (EBUSY) — clear contents instead.
  try {
    wipeDirContents(path.join(ROOT, 'session_data'));
  } catch (e) {
    console.error('session_data reset:', e.message);
  }
  try {
    const statePath = path.join(ROOT, 'state.json');
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  } catch (e) {
    console.error('state.json wipe:', e.message);
  }
  try {
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(ROOT, 'stage_b_state.json'),
      JSON.stringify({ lastInboxScanAt: now, lastBrowserAt: now }, null, 2)
    );
  } catch {
    /* ignore */
  }
  markSessionOk({
    source: 'remote_repair',
    cookieCount: packed.length,
    needsCookieRepair: false,
    url: page?.url?.() || undefined,
    feedVisible: true,
  });
  writeState({
    status: 'captured',
    liAtCaptured: true,
    uiMode: 'done',
    capturedAt: new Date().toISOString(),
  });
  try {
    const { notify } = await import('./notify.js');
    await notify({
      type: 'session',
      severity: 'info',
      forceTelegram: true,
      key: `session_repaired_${Date.now()}`,
      title: 'LinkedIn session restored',
      message: 'Remote repair captured a fresh li_at. You can close the repair tab.',
    });
  } catch (e) {
    console.error('repair notify:', e.message);
  }
  console.log('Repair captured live li_at — session marked OK');
  return true;
}

async function fillInput(page, selectorList, value) {
  const filled = await page.evaluate(
    ({ selectors, value: text }) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        el.focus();
        const tag = (el.tagName || '').toLowerCase();
        const proto =
          tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc?.set) desc.set.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    },
    { selectors: selectorList, value }
  );
  return filled;
}

/** Block Google One Tap / GSI so it cannot cover LinkedIn Sign in. */
async function blockGoogleOneTap(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (
      /accounts\.google\.com|credential\.google|gsi\/client|gsi\/button|onetap|apis\.google\.com\/js\/(api|platform|client)/i.test(
        url
      )
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

async function dismissLoginOverlays(page) {
  await page
    .addStyleTag({
      content: `
        iframe[src*="accounts.google"], iframe[src*="gsi"], iframe[id*="gsi"],
        #credential_picker_container, #credential_picker_iframe {
          display: none !important; visibility: hidden !important;
          pointer-events: none !important; height: 0 !important; overflow: hidden !important;
        }
      `,
    })
    .catch(() => {});

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  await page
    .evaluate(() => {
      for (const iframe of document.querySelectorAll('iframe')) {
        const src = iframe.src || '';
        if (/google|gsi|onetap/i.test(src)) iframe.remove();
      }
      for (const el of document.querySelectorAll(
        '#credential_picker_container, #credential_picker_iframe, [id*="credential_picker"]'
      )) {
        el.remove();
      }
      for (const el of [...document.querySelectorAll('div, section')]) {
        const t = (el.innerText || '').slice(0, 200);
        if (/sign in to linkedin with google/i.test(t) && el.querySelector('button')) {
          el.style.setProperty('display', 'none', 'important');
          el.remove();
        }
      }
    })
    .catch(() => {});

  await page.waitForTimeout(200);
}

async function readLoginPageHint(page) {
  return page
    .evaluate(() => {
      const t = document.body?.innerText || '';
      if (
        /wrong email or password|incorrect password|couldn.?t find.*account|that.?s not the right password|hmm,? that.?s not the right password|we don.?t recognize that email|password you.?ve entered is incorrect|неверн(ый|ая|ое).*(парол|email|логин)|неправильн(ый|ая).*(парол|email)/i.test(
          t
        )
      ) {
        return 'Wrong email or password — fix it above and Sign in again.';
      }
      if (/sign in to linkedin with google/i.test(t)) {
        return 'Google sign-in popup blocked the form — closing it and retrying…';
      }
      if (/captcha|security verification|unusual activity/i.test(t)) {
        return 'Security check — open the LinkedIn page in H.A.L.O. and follow the steps.';
      }
      return null;
    })
    .catch(() => null);
}

function isWrongPasswordHint(hint) {
  return /wrong email or password/i.test(String(hint || ''));
}

/** Stop repair cleanly so Stage R lock releases and the user can retry Sign in. */
function failCredentials(hint) {
  const msg = hint || 'Wrong email or password — fix it above and Sign in again.';
  writeState({
    status: 'credential_error',
    error: msg,
    lastSignInError: msg,
    uiMode: 'form',
    credentialErrorAt: new Date().toISOString(),
  });
  console.log('Credential error — stopping repair worker:', msg);
  const err = new Error(msg);
  err.code = 'CREDENTIAL_ERROR';
  throw err;
}

async function clickSignIn(page) {
  await dismissLoginOverlays(page);
  const pass = page.locator('input#password, input[name="session_password"], input[type="password"]').first();
  if (await pass.count()) {
    await pass.press('Enter').catch(() => {});
    return 'password Enter';
  }

  const oauthRe = /with\s+(apple|google|microsoft|one\b|passkey)|^continue$/i;
  const exact = page.locator('button.btn__primary--large[type="submit"], button[type="submit"].btn__primary--large').first();
  if ((await exact.count()) && (await exact.isVisible().catch(() => false))) {
    const label = ((await exact.textContent()) || '').trim();
    if (!oauthRe.test(label)) {
      await exact.scrollIntoViewIfNeeded().catch(() => {});
      await exact.click({ timeout: 8000, force: true }).catch(() => {});
      return label.slice(0, 40) || 'primary submit';
    }
  }

  const byRole = page.getByRole('button', { name: /^sign in$/i });
  if ((await byRole.count()) && (await byRole.first().isVisible().catch(() => false))) {
    await byRole.first().click({ timeout: 8000, force: true }).catch(() => {});
    return 'Sign in';
  }

  const clicked = await page.evaluate(() => {
    const oauth = (t) => /with\s+(apple|google|microsoft|one\b|passkey)|^continue$/i.test(t);
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit?.() || form.submit();
      return 'form.submit';
    }
    for (const b of document.querySelectorAll('button[type="submit"], button.btn__primary--large, form button')) {
      const t = (b.textContent || b.getAttribute('aria-label') || '').trim();
      if (oauth(t)) continue;
      if (/^sign\s*in$/i.test(t) || /^log\s*in$/i.test(t) || b.type === 'submit') {
        b.click();
        return t.slice(0, 40) || 'submit';
      }
    }
    return null;
  });
  return clicked || 'none';
}

async function detectChallengeKind(page) {
  return page
    .evaluate(() => {
      const t = (document.body?.innerText || '').slice(0, 5000).toLowerCase();
      if (
        /check your linkedin app|notification sent|tap yes|approve this sign|confirm (it'?s|this is) you|verify it'?s you|sign-in request|we sent a notification|open the linkedin app|waiting for approval|sent to your device/i.test(
          t
        )
      ) {
        return 'app_approval';
      }
      if (/enter the code|verification code|one-time|enter code|pin/i.test(t)) return 'pin';
      if (/captcha|robot|security check|puzzle/i.test(t)) return 'captcha';
      return 'generic';
    })
    .catch(() => 'generic');
}

async function notifyChallengeNeeded(page) {
  const st = readState() || {};
  if (st.challengeNotified) return;
  const kind = (await detectChallengeKind(page)) || 'generic';
  writeState({ challengeNotified: true, challengeKind: kind, challengeSince: new Date().toISOString() });
  const titles = {
    app_approval: 'Approve LinkedIn sign-in in your app',
    pin: 'LinkedIn wants a verification code',
    captcha: 'LinkedIn security check',
    generic: 'LinkedIn needs extra verification',
  };
  const messages = {
    app_approval:
      'Open the LinkedIn app on your phone and tap Yes / Approve on the sign-in request. H.A.L.O. will continue automatically — no need to sign in again here.',
    pin: 'Enter the code LinkedIn sent, or open the repair page from the LinkedIn dashboard.',
    captcha: 'Complete the security check on the repair page from the LinkedIn dashboard.',
    generic: 'Open the repair page from the LinkedIn dashboard and follow the on-screen steps.',
  };
  try {
    const { notify } = await import('./notify.js');
    await notify({
      type: 'session',
      severity: 'warn',
      skipTelegram: true,
      key: 'linkedin_signin_app_approval',
      title: titles[kind] || titles.generic,
      message: messages[kind] || messages.generic,
    });
  } catch (e) {
    console.error('challenge notify:', e.message);
  }
  console.log('Challenge detected — user action needed:', kind);
}

async function detectUiMode(page) {
  const url = page.url() || '';
  if (/checkpoint|challenge|captcha|two-step|add-phone|manage\/challenge/i.test(url)) {
    return 'challenge';
  }
  const info = await page
    .evaluate(() => {
      const user = document.querySelector(
        'input#username, input[name="session_key"], input[autocomplete="username"], input[type="email"]'
      );
      const pass = document.querySelector(
        'input#password, input[name="session_password"], input[type="password"]'
      );
      const pin = document.querySelector(
        'input[name="pin"], input#input__phone_verification_pin, input[autocomplete="one-time-code"]'
      );
      const challengeText = /enter the code|verification|captcha|confirm it.?s you|unusual activity|check your linkedin app|notification sent|tap yes|approve this sign|verify it.?s you|sign-in request|we sent a notification|open the linkedin app/i.test(
        document.body?.innerText || ''
      );
      return {
        hasLoginFields: !!(user && pass),
        hasPin: !!pin,
        challengeText,
      };
    })
    .catch(() => ({ hasLoginFields: false, hasPin: false, challengeText: false }));

  if (info.hasPin || info.challengeText || (!info.hasLoginFields && !/login|uas\/login/i.test(url))) {
    // Still on login URL without fields → likely interstitial / challenge
    if (info.hasPin || info.challengeText) return 'challenge';
    if (!info.hasLoginFields && /linkedin\.com/i.test(url) && !/feed|messaging/i.test(url)) {
      return 'challenge';
    }
  }
  return 'form';
}

async function clickByText(page, patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  for (const pattern of list) {
    const re = new RegExp(pattern, 'i');
    const locators = [
      page.getByRole('button', { name: re }),
      page.getByRole('link', { name: re }),
      page.locator('button, a, [role="button"], label, li').filter({ hasText: re }),
    ];
    for (const loc of locators) {
      const count = await loc.count().catch(() => 0);
      if (!count) continue;
      for (let i = 0; i < Math.min(count, 5); i++) {
        const item = loc.nth(i);
        const visible = await item.isVisible().catch(() => false);
        if (!visible) continue;
        await item.click({ timeout: 5000 }).catch(() => {});
        return pattern;
      }
    }
  }
  return null;
}

async function fillChallengeCode(page, text) {
  const code = String(text || '').replace(/\s+/g, '').trim();
  if (!code) return false;

  const result = await page.evaluate((code) => {
    const setVal = (el, val) => {
      el.focus();
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc?.set) desc.set.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8 && !el.disabled && el.type !== 'hidden';
    };

    const boxes = [...document.querySelectorAll('input')].filter(
      (el) =>
        visible(el) &&
        (el.maxLength === 1 || /digit|character|code/i.test(el.getAttribute('aria-label') || ''))
    );
    if (boxes.length >= 4 && boxes.length <= 8) {
      const digits = code.split('');
      boxes.slice(0, digits.length).forEach((box, i) => setVal(box, digits[i]));
      return { ok: true, mode: 'multi-box', count: boxes.length };
    }

    const selectors = [
      'input[name="pin"]',
      'input#input__phone_verification_pin',
      'input[autocomplete="one-time-code"]',
      'input[inputmode="numeric"]',
      'input[name*="pin" i]',
      'input[name*="code" i]',
      'input[id*="pin" i]',
      'input[id*="code" i]',
      'input[type="tel"]',
      'input[type="number"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && visible(el)) {
        setVal(el, code);
        return { ok: true, mode: 'selector', selector: sel };
      }
    }

    const generic = [...document.querySelectorAll('input[type="text"], input:not([type])')].find(
      (el) => visible(el) && el.type !== 'password' && el.type !== 'email'
    );
    if (generic) {
      setVal(generic, code);
      return { ok: true, mode: 'generic' };
    }

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      setVal(active, code);
      return { ok: true, mode: 'active' };
    }
    return { ok: false };
  }, code);

  if (result?.ok) {
    console.log('Repair fillCode via', result.mode, result.selector || '');
    return true;
  }

  const loc = page
    .locator(
      'input[name="pin"], input[autocomplete="one-time-code"], input[inputmode="numeric"], input[type="tel"]'
    )
    .first();
  if (await loc.count()) {
    await loc.click({ timeout: 3000 }).catch(() => {});
    await loc.fill(code);
    console.log('Repair fillCode via playwright locator');
    return true;
  }
  return false;
}

async function submitChallengeCode(page) {
  const hit = await clickByText(page, [
    'verify',
    'submit',
    'continue',
    'sign in',
    'next',
    'confirm',
  ]);
  if (hit) {
    console.log('Repair submitChallenge via', hit);
    return true;
  }
  await page.keyboard.press('Enter').catch(() => {});
  return false;
}

async function applySignIn(page, username, password) {
  await dismissLoginOverlays(page);
  await page
    .goto('https://www.linkedin.com/uas/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    .catch(() => {});
  await page.waitForTimeout(900);
  await dismissLoginOverlays(page);

  const user = page.locator('input#username, input[name="session_key"]').first();
  const pass = page.locator('input#password, input[name="session_password"]').first();
  const userVisible = await user.isVisible().catch(() => false);
  const passVisible = await pass.isVisible().catch(() => false);

  if (!userVisible || !passVisible) {
    const evalOk = await fillInput(
      page,
      ['input#username', 'input[name="session_key"]', 'input[autocomplete="username"]', 'input[type="email"]'],
      username
    );
    const passOk = await fillInput(
      page,
      ['input#password', 'input[name="session_password"]', 'input[type="password"]'],
      password
    );
    if (!evalOk || !passOk) {
      writeState({
        status: 'running',
        uiMode: 'challenge',
        error: null,
        lastSignInError: 'Login fields not found — use challenge screen',
      });
      await captureFrame(page, 'challenge');
      return;
    }
  } else {
    await user.click({ timeout: 8000 });
    await user.fill('');
    await user.type(username, { delay: 20 });
    await pass.click({ timeout: 8000 });
    await pass.fill('');
    await pass.type(password, { delay: 20 });
  }

  await dismissLoginOverlays(page);
  const how = await clickSignIn(page);
  console.log('Repair signin submitted via', how);
  writeState({
    status: 'running',
    uiMode: 'form',
    lastSignInAt: new Date().toISOString(),
    lastSignInError: null,
  });

  // Poll for wrong-password vs challenge vs success (LinkedIn can be slow).
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForTimeout(1500);
    const earlyMode = await detectUiMode(page);
    const earlyKind = await detectChallengeKind(page);
    if (earlyMode === 'challenge' || earlyKind === 'app_approval' || earlyKind === 'pin') {
      await captureFrame(page, 'challenge');
      return;
    }
    if (!/login|uas\/login|checkpoint\/lg\/login/i.test(page.url() || '')) {
      return;
    }
    const hint = await readLoginPageHint(page);
    if (isWrongPasswordHint(hint)) {
      await captureFrame(page, 'form', { snapshot: true });
      failCredentials(hint);
    }
    if (attempt === 3 || attempt === 6) {
      await dismissLoginOverlays(page);
    }
  }

  // Still on login — stop so Stage R frees and the user can retry immediately.
  if (/login|uas\/login/i.test(page.url() || '')) {
    const hint =
      (await readLoginPageHint(page)) ||
      'Wrong email or password — fix it above and Sign in again.';
    await captureFrame(page, 'form', { snapshot: true });
    failCredentials(
      isWrongPasswordHint(hint)
        ? hint
        : 'Wrong email or password — fix it above and Sign in again.'
    );
  }
}

async function drainInputs(page) {
  if (!fs.existsSync(INPUT_PATH)) return;
  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  if (!raw.trim()) return;
  fs.writeFileSync(INPUT_PATH, '');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      if (ev.type === 'signin' && typeof ev.username === 'string' && typeof ev.password === 'string') {
        await applySignIn(page, ev.username, ev.password);
      } else if (ev.type === 'clickText') {
        const key = String(ev.key || ev.text || '').trim();
        const map = {
          'verif-app': [
            'verification app',
            'authenticator app',
            'authentication app',
            'use your authenticator',
            'authenticator',
          ],
          'another-way': ['try another way', 'try a different way', 'other options', 'more options'],
        };
        const patterns = map[key] || (typeof ev.text === 'string' ? [ev.text] : []);
        const hit = await clickByText(page, patterns);
        console.log('Repair clickText', key || patterns[0], '→', hit || 'not found');
        await page.waitForTimeout(700);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'fillCode' && typeof ev.text === 'string') {
        const ok = await fillChallengeCode(page, ev.text);
        if (!ok) {
          writeState({ lastFillError: 'Code field not found — tap the code box on the screenshot, then try again.' });
        } else {
          writeState({ lastFillError: null });
        }
        await page.waitForTimeout(200);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'submitCode' && typeof ev.text === 'string') {
        await fillChallengeCode(page, ev.text);
        await page.waitForTimeout(300);
        await submitChallengeCode(page);
        await page.waitForTimeout(800);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'click' && Number.isFinite(ev.x) && Number.isFinite(ev.y)) {
        const st = readState() || {};
        const clip = st.clip;
        const absX = clip ? Number(clip.x) + ev.x : ev.x;
        const absY = clip ? Number(clip.y) + ev.y : ev.y;
        await page.mouse.click(absX, absY);
        await page.waitForTimeout(200);
        await page
          .evaluate(() => {
            document.querySelectorAll('[data-halo-active="1"]').forEach((el) => {
              el.removeAttribute('data-halo-active');
            });
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
              el.setAttribute('data-halo-active', '1');
            }
          })
          .catch(() => {});
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'setValue' && typeof ev.text === 'string') {
        const ok = await fillChallengeCode(page, ev.text);
        if (!ok) {
          writeState({ lastFillError: 'Could not find an input to fill.' });
        }
        await page.waitForTimeout(200);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'key' && ev.key) {
        await page.keyboard.press(String(ev.key));
      }
    } catch (e) {
      if (e?.code === 'CREDENTIAL_ERROR') throw e;
      console.error('repair input error:', e.message);
    }
  }
}

/** Challenge screenshots while user approves in LinkedIn app. */
async function captureFrame(page, forcedMode, opts = {}) {
  const mode = forcedMode || (await detectUiMode(page));
  const fullVp = page.viewportSize() || { width: 390, height: 844 };
  const snapshot = !!opts.snapshot;

  if (mode === 'form' && !snapshot) {
    writeState({
      status: 'running',
      uiMode: 'form',
      viewport: fullVp,
      clip: null,
      lastFrameAt: new Date().toISOString(),
    });
    return;
  }

  // Keep "Recognize this device" checked when present
  await page
    .evaluate(() => {
      const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
      for (const box of boxes) {
        const label =
          (box.labels && box.labels[0]?.textContent) ||
          box.closest('label')?.textContent ||
          box.parentElement?.textContent ||
          '';
        if (/recognize|remember|trust|future/i.test(label) && !box.checked) {
          box.click();
        }
      }
    })
    .catch(() => {});

  await page.screenshot({ path: FRAME_PATH, type: 'jpeg', quality: 55 }).catch(() => {});
  const kind = await detectChallengeKind(page);
  if (mode === 'form' || snapshot) {
    writeState({
      status: 'running',
      uiMode: 'form',
      viewport: fullVp,
      clip: null,
      lastFrameAt: new Date().toISOString(),
    });
    return;
  }
  writeState({
    status: 'running',
    uiMode: 'challenge',
    challengeKind: kind,
    viewport: fullVp,
    clip: null,
    lastFrameAt: new Date().toISOString(),
  });
  await notifyChallengeNeeded(page);
}

async function runRepair() {
  const st = readState();
  if (!TOKEN || !st?.token || st.token !== TOKEN) {
    writeState({ status: 'error', error: 'token mismatch' });
    process.exit(1);
  }
  writeState({
    status: 'running',
    error: null,
    uiMode: 'form',
    startedAt: new Date().toISOString(),
    challengeNotified: false,
    challengeKind: null,
    challengeSince: null,
  });

  // Fresh login from dashboard must not reuse a dead li_at jar from a prior repair.
  const userDataDir = path.join(ROOT, 'session_data_repair');
  const forceFresh = process.env.REPAIR_FORCE_FRESH === '1';
  if (forceFresh) {
    console.log('REPAIR_FORCE_FRESH=1 — wiping session_data_repair before login');
    wipeDirContents(userDataDir);
  } else {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Match agent UA so harvested cookies work in Stage A/B Chromium.
  const USER_AGENT =
    process.env.LINKEDIN_USER_AGENT ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    locale: 'en-US',
    // Match IONOS VPS geo — mismatched NYC geolocation + DE IP triggers duplicate device approvals.
    timezoneId: 'Europe/Berlin',
    geolocation: { longitude: 8.4037, latitude: 49.0069 },
    permissions: ['geolocation'],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=en-US'],
  });
  await blockGoogleOneTap(context);
  const page = context.pages()[0] || (await context.newPage());
  await context.addCookies([
    {
      name: 'lang',
      value: 'v=2&lang=en-us',
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      sameSite: 'None',
    },
  ]);

  // Reuse repair profile only if feed is actually live — never export a dead li_at.
  if (await tryHarvest(context, page, { requireLive: true })) {
    await context.close().catch(() => {});
    return;
  }

  await page.goto('https://www.linkedin.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  }).catch(() => {});
  writeState({ status: 'running', uiMode: 'form' });

  const started = Date.now();
  let lastModeCheck = 0;
  try {
    while (Date.now() - started < MAX_MS) {
      await drainInputs(page);
      const afterIn = readState();
      if (afterIn?.status === 'credential_error' || afterIn?.liAtCaptured) break;

      const now = Date.now();
      if (now - lastModeCheck >= 900) {
        const mode = await detectUiMode(page);
        if (mode === 'challenge') {
          await captureFrame(page, 'challenge');
        }
        const cur = readState();
        const since = cur?.challengeSince ? Date.parse(cur.challengeSince) : 0;
        const lastNudge = cur?.lastFeedNudgeAt ? Date.parse(cur.lastFeedNudgeAt) : 0;
        const postChallenge = since && !cur?.liAtCaptured;
        if (postChallenge && Date.now() - since > 5000 && Date.now() - lastNudge > 8000) {
          const nudgeN = (cur?.challengeNudgeCount || 0) + 1;
          writeState({
            lastFeedNudgeAt: new Date().toISOString(),
            challengeNudgeCount: nudgeN,
            uiMode: 'challenge',
          });
          if (nudgeN >= 4 && nudgeN % 4 === 0) {
            console.log('Post-challenge feed fallback (after waiting on challenge page)…');
            await page
              .goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 })
              .catch(() => {});
            await page.waitForTimeout(4000);
          } else {
            console.log('Post-challenge passive wait — approve in LinkedIn app…');
            await waitForPostApproval(context, page);
          }
          await captureFrame(page, 'challenge');
          if (await tryHarvest(context, page, { requireLive: true })) break;
        }
        if (mode !== 'challenge') {
          if (cur?.uiMode === 'challenge') {
            writeState({ uiMode: 'form', status: 'running' });
          }
        }
        lastModeCheck = now;
      }
      const url = page.url();
      if (/linkedin\.com\/(feed|messaging|in\/)/i.test(url) && !/login|authwall|uas\/login/i.test(url)) {
        if (await tryHarvest(context, page, { requireLive: true })) break;
      } else if (await tryHarvest(context, page, { requireLive: true })) {
        break;
      }
      await page.waitForTimeout(150);
    }
  } catch (e) {
    if (e?.code !== 'CREDENTIAL_ERROR') throw e;
    console.log('Repair ended on credential error (user can retry Sign in)');
  }

  await context.close().catch(() => {});
  const final = readState();
  if (final?.status === 'credential_error') {
    process.exitCode = 0;
    return;
  }
  if (!final?.liAtCaptured) {
    writeState({ status: 'timeout', error: 'Login not completed in time' });
    process.exitCode = 2;
  }
}

async function main() {
  const { withCycleLock, isLockHeld, releaseCycleLock } = await import('./cycleLock.js');
  const held = isLockHeld();
  if (held.held && held.owner === 'R') {
    console.log('Clearing stale Stage R lock from previous repair run');
    releaseCycleLock();
  }
  const lock = await withCycleLock('R', runRepair, { skipIfBusy: true });
  if (lock.skipped) {
    const who = isLockHeld().owner || 'unknown';
    writeState({ status: 'error', error: `Another automation is running (Stage ${who})` });
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  writeState({ status: 'error', error: e.message });
  process.exit(1);
});
