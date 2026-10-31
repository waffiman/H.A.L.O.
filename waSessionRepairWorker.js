/**
 * WhatsApp Web login:
 *   1) Open web.whatsapp.com → capture QR → status awaiting_qr (dashboard shows QR)
 *   2) Optional: dashboard sets preferPhoneCode → phone + 8-char linking code → awaiting_code
 *   3) User scans QR or enters code on phone → chats → session_data_wa
 *
 * Linking code is shown ON WEB and typed ON THE PHONE (not the reverse).
 * Spoof Chrome 131 UA — WA blocks stock Playwright Chromium.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

function envPath(key, fallback) {
  return String(process.env[key] || fallback || '').trim();
}

const statePath = envPath('WA_REPAIR_STATE', path.join(process.cwd(), 'wa_session_repair.json'));
const cookiesPath = envPath('WA_COOKIES', path.join(process.cwd(), 'wa_cookies.json'));
const storagePath = envPath('WA_STORAGE_STATE', path.join(process.cwd(), 'wa_storage_state.json'));
const statusPath = envPath('WA_SESSION_STATUS', path.join(process.cwd(), 'wa_session_status.json'));
const sessionData = envPath('WA_SESSION_DATA', path.join(process.cwd(), 'session_data_wa'));

const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(patch) {
  const prev = readState() || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2));
  return next;
}

function markOk(extra = {}) {
  fs.writeFileSync(
    statusPath,
    JSON.stringify({ ok: true, needsCookieRepair: false, updatedAt: new Date().toISOString(), ...extra }, null, 2)
  );
}

function markDead(reason) {
  fs.writeFileSync(
    statusPath,
    JSON.stringify(
      { ok: false, needsCookieRepair: true, reason: String(reason || ''), updatedAt: new Date().toISOString() },
      null,
      2
    )
  );
}

function cancelled() {
  const st = readState();
  return st?.status === 'cancelled' || st?.status === 'idle';
}

function wantsPhoneCode() {
  return Boolean(readState()?.preferPhoneCode);
}

async function persistSession(context) {
  const state = await context.storageState();
  fs.writeFileSync(storagePath, JSON.stringify(state, null, 2));
  const cookies = await context.cookies('https://web.whatsapp.com');
  if (cookies.length) fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
}

async function clickIfVisible(locator, timeout = 5000) {
  try {
    if ((await locator.count()) === 0) return false;
    const el = locator.first();
    if (!(await el.isVisible().catch(() => false))) return false;
    await el.click({ force: true, timeout });
    return true;
  } catch {
    return false;
  }
}

async function bodyText(page) {
  return (await page.locator('body').innerText().catch(() => '')).toLowerCase();
}

function isChromeGate(text) {
  return /whatsapp works with google chrome|update (google )?chrome|use google chrome/i.test(text);
}

function normalizeLinkCode(raw) {
  const s = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

async function captureQrDataUrl(page) {
  const canvas = page.locator('canvas').first();
  if (await canvas.isVisible().catch(() => false)) {
    const data = await canvas
      .evaluate((el) => {
        try {
          return el.toDataURL('image/png');
        } catch {
          return '';
        }
      })
      .catch(() => '');
    if (data && data.startsWith('data:image')) return data;
  }
  const box = page.locator('div[data-ref]').first();
  if (await box.isVisible().catch(() => false)) {
    try {
      const buf = await box.screenshot({ type: 'png' });
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      /* ignore */
    }
  }
  return '';
}

async function readLinkCode(page) {
  const selectors = [
    '[data-testid="link-device-phone-number-code"]',
    '[data-testid="link-code"]',
    '[data-testid*="link-device"][data-testid*="code"]',
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      const n = normalizeLinkCode(await el.innerText().catch(() => ''));
      if (n) return n;
    }
  }
  const boxes = page.locator('[data-testid*="code"] span, [aria-label*="code" i]');
  const nBoxes = await boxes.count().catch(() => 0);
  if (nBoxes >= 8 && nBoxes <= 16) {
    let acc = '';
    for (let i = 0; i < nBoxes; i++) {
      const t = (await boxes.nth(i).innerText().catch(() => '')).trim();
      if (/^[A-Za-z0-9]$/.test(t)) acc += t;
    }
    const n = normalizeLinkCode(acc);
    if (n) return n;
  }
  const text = await page.locator('body').innerText().catch(() => '');
  const dashed = text.match(/\b([A-Z0-9]{4})\s*[-–—]\s*([A-Z0-9]{4})\b/i);
  if (dashed) {
    const n = normalizeLinkCode(dashed[1] + dashed[2]);
    if (n) return n;
  }
  const near = text.match(/code[^\n]{0,40}?\b([A-Z0-9]{8})\b/i);
  if (near) {
    const n = normalizeLinkCode(near[1]);
    if (n) return n;
  }
  return '';
}

async function ensurePhoneLoginForm(page) {
  const phoneHint = page.getByText(/enter phone number|select a country/i).first();
  if (await phoneHint.isVisible().catch(() => false)) return;

  const candidates = [
    page.getByText(/log in with phone number/i),
    page.getByText(/link with phone number/i),
    page.getByRole('button', { name: /log in with phone number|link with phone number/i }),
    page.getByRole('link', { name: /log in with phone number|link with phone number/i }),
    page.locator('[data-testid="link-device-phone-number-entry-click"]'),
  ];
  for (const loc of candidates) {
    if (await clickIfVisible(loc)) {
      await page.waitForTimeout(2000);
      return;
    }
  }
  await page.waitForTimeout(2000);
  for (const loc of candidates) {
    if (await clickIfVisible(loc)) {
      await page.waitForTimeout(2000);
      break;
    }
  }
}

async function fillPhone(page, phone) {
  const e164 = String(phone || '').trim().startsWith('+')
    ? String(phone).trim().replace(/\s+/g, '')
    : `+${String(phone || '').replace(/\D/g, '')}`;

  const phoneInput = page
    .locator(
      [
        'input[aria-label*="phone" i]',
        'input[aria-label*="Phone" i]',
        'input[type="tel"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][data-tab]',
      ].join(', ')
    )
    .first();

  try {
    await phoneInput.waitFor({ state: 'visible', timeout: 45000 });
  } catch {
    const text = await bodyText(page);
    if (isChromeGate(text)) {
      throw new Error('WhatsApp blocked this browser (Chrome gate).');
    }
    const snippet = text.replace(/\s+/g, ' ').slice(0, 220);
    throw new Error(`Phone input not found on WhatsApp Web. Page: ${snippet || '(empty)'}`);
  }

  await phoneInput.click({ force: true });
  await page.waitForTimeout(200);
  await phoneInput.press('Control+A').catch(() => {});
  await phoneInput.press('Meta+A').catch(() => {});
  await phoneInput.press('Backspace');
  await page.waitForTimeout(100);
  await phoneInput.pressSequentially(e164, { delay: 40 });
  await page.waitForTimeout(600);
}

async function clickNext(page) {
  const next = page.getByRole('button', { name: /^next$/i }).first();
  if (await next.isVisible().catch(() => false)) {
    await next.click({ force: true, timeout: 8000 });
    return;
  }
  await page.keyboard.press('Enter');
}

/** True while QR / phone-code login UI is still up (must not count as connected). */
async function stillOnLoginUi(page) {
  const body = await bodyText(page);
  const paneVisible = await page.locator('#pane-side, [data-testid="chat-list"]').first().isVisible().catch(() => false);
  // Phone-side "Logging In" can appear as web copy — if chat list is already up, prefer inbox.
  if (!paneVisible) {
    if (/logging in|loading your personal|waiting for phone|keep your phone connected/i.test(body)) {
      return true;
    }
  }
  if (/scan to log in|log in with phone number|link with phone number instead|enter phone number/i.test(body)) {
    if (!paneVisible) return true;
  }
  const canvas = page.locator('canvas').first();
  if (await canvas.isVisible().catch(() => false)) {
    if (/scan to log in|scan the qr|link a device/i.test(body) && !paneVisible) return true;
  }
  const codeUi = page
    .locator('[data-testid="link-device-phone-number-code"], [data-testid="link-code"]')
    .first();
  if (await codeUi.isVisible().catch(() => false)) return true;
  return false;
}

/**
 * Real inbox only — never bare /chats/ or generic Search aria (false OK + early close
 * leaves the phone stuck on “Logging In”).
 */
async function inboxReady(page) {
  if (await stillOnLoginUi(page)) return false;
  const pane = page.locator('#pane-side, [data-testid="chat-list"], #side').first();
  if (!(await pane.isVisible().catch(() => false))) return false;
  const search = page
    .locator(
      [
        '[data-testid="chat-list-search"]',
        '#pane-side div[contenteditable="true"][data-tab="3"]',
        '#side div[contenteditable="true"][data-tab="3"]',
        'div[contenteditable="true"][data-tab="3"]',
      ].join(', ')
    )
    .first();
  if (await search.isVisible().catch(() => false)) return true;
  const body = await bodyText(page);
  if (/search or start a new chat/i.test(body)) return true;
  // Chat list rows present without login chrome
  const row = page.locator('#pane-side [data-testid="cell-frame-container"], [data-testid="chat-list"] [data-testid="cell-frame-container"]').first();
  return row.isVisible().catch(() => false);
}

/** Require inbox to stay up for holdMs so multi-device handshake can finish. */
async function confirmInboxStable(page, holdMs = 15000) {
  const deadline = Date.now() + holdMs;
  while (Date.now() < deadline) {
    if (cancelled()) throw new Error('cancelled');
    if (!(await inboxReady(page))) return false;
    writeState({ status: 'linking', error: null });
    await page.waitForTimeout(2000);
  }
  return inboxReady(page);
}

async function finishLinkedSession(context, page, source) {
  writeState({ status: 'linking', error: null, qrDataUrl: '', linkCode: '' });
  const ok = await confirmInboxStable(page, 15000);
  if (!ok) {
    throw new Error(
      'WhatsApp looked linked briefly then fell back to login — keep the phone on “Logging In” until HALO says Connected, then retry'
    );
  }
  await persistSession(context);
  // Keep Chromium open a bit longer so WA can finish companion handshake
  await page.waitForTimeout(8000);
  if (!(await inboxReady(page))) {
    throw new Error('Session dropped after link — phone may show Logging In; retry QR/code and wait until Connected');
  }
  await persistSession(context);
  markOk({ source });
  writeState({
    status: 'done',
    error: null,
    phone: '',
    phoneMasked: '',
    linkCode: '',
    qrDataUrl: '',
    preferPhoneCode: false,
  });
  console.log('WhatsApp Web session saved');
}

async function spoofChrome(context) {
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch {
      /* ignore */
    }
    try {
      const brands = [
        { brand: 'Google Chrome', version: '131' },
        { brand: 'Chromium', version: '131' },
        { brand: 'Not_A Brand', version: '24' },
      ];
      const uaData = {
        brands,
        mobile: false,
        platform: 'Linux',
        getHighEntropyValues: async () => ({
          architecture: 'x86',
          bitness: '64',
          model: '',
          platformVersion: '6.5.0',
          uaFullVersion: '131.0.6778.86',
          fullVersionList: [
            { brand: 'Google Chrome', version: '131.0.6778.86' },
            { brand: 'Chromium', version: '131.0.6778.86' },
            { brand: 'Not_A Brand', version: '10.0.0.0' },
          ],
        }),
        toJSON: () => ({ brands, mobile: false, platform: 'Linux' }),
      };
      Object.defineProperty(navigator, 'userAgentData', { get: () => uaData });
    } catch {
      /* ignore */
    }
  });
}

async function checkStayLoggedIn(page) {
  const stay = page.getByText(/stay logged in/i).first();
  if (!(await stay.isVisible().catch(() => false))) return;
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    const checked = await cb.isChecked().catch(() => true);
    if (!checked) await cb.check({ force: true }).catch(() => {});
  }
}

async function runPhoneLinkCodeFlow(page, phone) {
  writeState({ status: 'enter_phone', error: null, linkCode: '', qrDataUrl: '' });
  await ensurePhoneLoginForm(page);
  await checkStayLoggedIn(page);
  await fillPhone(page, phone);
  await clickNext(page);
  await page.waitForTimeout(2500);

  const codeDeadline = Date.now() + 90000;
  let linkCode = '';
  while (Date.now() < codeDeadline) {
    if (cancelled()) throw new Error('cancelled');
    const body = await bodyText(page);
    if (/invalid|incorrect.*number|couldn't find|couldn't find your|no whatsapp/i.test(body)) {
      throw new Error('WhatsApp rejected the phone number — check country code and digits');
    }
    linkCode = await readLinkCode(page);
    if (linkCode) break;
    await page.waitForTimeout(1500);
  }
  if (!linkCode) {
    const snippet = (await bodyText(page)).replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`WhatsApp did not show a linking code after the phone number. Page: ${snippet || '(empty)'}`);
  }
  writeState({ status: 'awaiting_code', error: null, linkCode, qrDataUrl: '', preferPhoneCode: true });
  console.log('WA link code ready:', linkCode);
  return linkCode;
}

/** @returns {'ok'|'switch_to_phone'} — 'ok' only means inbox appeared; caller must confirmInboxStable. */
async function waitUntilLinked(page, { mode, initialCode }) {
  let linkCode = initialCode || '';
  const loginDeadline = Date.now() + 240000;
  while (Date.now() < loginDeadline) {
    if (cancelled()) throw new Error('cancelled');
    if (await inboxReady(page)) return 'ok';
    const body = await bodyText(page);
    if (/don't link|do not link|link cancelled|couldn't link/i.test(body)) {
      throw new Error('Linking was declined or cancelled on the phone');
    }
    if (mode === 'phone_code') {
      const again = await readLinkCode(page);
      if (again && again !== linkCode) {
        linkCode = again;
        writeState({ status: 'awaiting_code', linkCode });
      }
    } else if (mode === 'qr') {
      if (wantsPhoneCode()) return 'switch_to_phone';
      if (await inboxReady(page)) return 'ok';
      const body = await bodyText(page);
      const nextQr = await captureQrDataUrl(page);
      // QR gone / linking in progress — stop pushing stale QR to the modal
      if (/logging in|loading your chats|loading your personal/i.test(body) || !nextQr) {
        writeState({ status: 'linking', error: null, qrDataUrl: '' });
      } else {
        writeState({ status: 'awaiting_qr', qrDataUrl: nextQr, linkCode: '' });
      }
    }
    await page.waitForTimeout(2000);
  }
  throw new Error(
    mode === 'qr'
      ? 'Timed out waiting for QR scan — scan in WhatsApp → Linked devices, or use phone linking code'
      : 'Timed out waiting for phone confirm — enter the dashboard code in WhatsApp → Linked devices'
  );
}

async function main() {
  const st = readState();
  const phone = String(st?.phone || '').trim();
  if (!phone) {
    writeState({ status: 'error', error: 'No phone in repair state' });
    process.exit(1);
  }
  writeState({
    status: 'opening_web',
    error: null,
    linkCode: '',
    qrDataUrl: '',
    preferPhoneCode: false,
  });
  fs.mkdirSync(sessionData, { recursive: true });

  const context = await chromium.launchPersistentContext(sessionData, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    userAgent: CHROME_UA,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  await spoofChrome(context);

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(5000);

    const landing = await bodyText(page);
    if (isChromeGate(landing)) {
      throw new Error(
        'WhatsApp still shows the Chrome-only gate after UA spoof — need a newer Chromium image or real Chrome channel'
      );
    }

    if (await inboxReady(page)) {
      await finishLinkedSession(context, page, 'wa_web_already');
      return;
    }

    // --- Phase 1: QR ---
    await checkStayLoggedIn(page);
    let qr = '';
    for (let i = 0; i < 20 && !qr; i++) {
      if (cancelled()) throw new Error('cancelled');
      if (await inboxReady(page)) {
        await finishLinkedSession(context, page, 'wa_web_already');
        return;
      }
      qr = await captureQrDataUrl(page);
      if (qr) break;
      await page.waitForTimeout(1500);
    }
    if (!qr) {
      const snippet = (await bodyText(page)).replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`WhatsApp QR not found. Page: ${snippet || '(empty)'}`);
    }
    writeState({ status: 'awaiting_qr', error: null, qrDataUrl: qr, linkCode: '' });
    console.log('WA QR ready');

    let source = 'wa_web_qr';
    const qrOutcome = await waitUntilLinked(page, { mode: 'qr' });
    if (qrOutcome === 'switch_to_phone') {
      const linkCode = await runPhoneLinkCodeFlow(page, phone);
      await waitUntilLinked(page, { mode: 'phone_code', initialCode: linkCode });
      source = 'wa_web_phone_link_code';
    }

    await finishLinkedSession(context, page, source);
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg === 'cancelled') {
      writeState({ status: 'cancelled', error: null, linkCode: '', qrDataUrl: '', preferPhoneCode: false });
    } else {
      writeState({ status: 'error', error: msg.slice(0, 500), linkCode: '', qrDataUrl: '' });
      markDead(msg);
      console.error('WA repair worker:', msg);
      process.exitCode = 1;
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main();
