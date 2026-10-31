/**
 * Headless Telegram Web login: phone → code from dashboard → save Playwright storageState
 * (localStorage auth keys). Web A does not rely on EditThisCookie cookies.
 *
 * Proven Web A flow (do not regress):
 * 1) QR screen → click "Log in by phone Number"
 * 2) Type full E.164 into #sign-in-phone-number via pressSequentially
 *    (#sign-in-phone-code is country NAME autocomplete — never put "+48" there)
 * 3) Click NEXT → wait until #sign-in-code is visible → status awaiting_code
 * 4) Dashboard modal opens only on awaiting_code (Continue shows spinner until then)
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

function envPath(key, fallback) {
  return String(process.env[key] || fallback || '').trim();
}

const statePath = envPath('TG_REPAIR_STATE', path.join(process.cwd(), 'tg_session_repair.json'));
const inputPath = envPath('TG_REPAIR_INPUT', path.join(process.cwd(), 'tg_session_repair_input.jsonl'));
const cookiesPath = envPath('TG_COOKIES', path.join(process.cwd(), 'tg_cookies.json'));
const storagePath = envPath('TG_STORAGE_STATE', path.join(process.cwd(), 'tg_storage_state.json'));
const statusPath = envPath('TG_SESSION_STATUS', path.join(process.cwd(), 'tg_session_status.json'));
const sessionData = envPath('TG_SESSION_DATA', path.join(process.cwd(), 'session_data_tg'));

const AUTH_LS_RE = /auth_key|user_auth|_auth|account\d+|dc\d+_auth/i;

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

function storageHasAuth(state) {
  for (const origin of state?.origins || []) {
    for (const item of origin?.localStorage || []) {
      if (item?.value && AUTH_LS_RE.test(String(item.name || ''))) return true;
    }
  }
  return false;
}

async function persistSession(context) {
  const state = await context.storageState();
  fs.writeFileSync(storagePath, JSON.stringify(state, null, 2));
  const cookies = await context.cookies('https://web.telegram.org');
  if (cookies.length) fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  return storageHasAuth(state);
}

async function waitForCode(timeoutMs = 180000) {
  const started = Date.now();
  let offset = 0;
  try {
    if (fs.existsSync(inputPath)) offset = fs.statSync(inputPath).size;
  } catch {
    offset = 0;
  }
  while (Date.now() - started < timeoutMs) {
    const st = readState();
    if (st?.status === 'cancelled' || st?.status === 'idle') throw new Error('cancelled');
    try {
      if (fs.existsSync(inputPath)) {
        const buf = fs.readFileSync(inputPath, 'utf8');
        const chunk = buf.slice(offset);
        offset = buf.length;
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev?.type === 'code' && ev.code) return String(ev.code);
        }
      }
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('Timed out waiting for Telegram code');
}

async function clickIfVisible(locator, timeout = 4000) {
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

/** QR screen → phone form. */
async function ensurePhoneLoginForm(page) {
  const phoneField = page.locator('#sign-in-phone-number');
  if (await phoneField.isVisible().catch(() => false)) return;

  const candidates = [
    page.getByRole('button', { name: /log\s*in\s*by\s*phone/i }),
    page.getByRole('link', { name: /log\s*in\s*by\s*phone/i }),
    page.getByText(/log\s*in\s*by\s*phone\s*number/i),
    page.getByText(/log\s*in\s*by\s*phone/i),
    page.locator('button, a, div[role="button"]').filter({ hasText: /phone\s*number/i }),
  ];
  for (const loc of candidates) {
    if (await clickIfVisible(loc)) {
      await page.waitForTimeout(1500);
      if (await phoneField.isVisible().catch(() => false)) return;
    }
  }

  // Wait a bit longer — SPA may still be hydrating the QR → phone affordance.
  await page.waitForTimeout(3000);
  for (const loc of candidates) {
    if (await clickIfVisible(loc)) {
      await page.waitForTimeout(1500);
      break;
    }
  }
}

/**
 * Web A country field (#sign-in-phone-code) is a country *name* autocomplete — do NOT
 * put "+48" there. Type full E.164 into #sign-in-phone-number with real keystrokes so
 * GramJS auto-selects the country (e.g. Poland) and formats "+48 788 …".
 */
async function fillPhoneForm(page, phone) {
  const e164 = String(phone || '').trim().startsWith('+')
    ? String(phone).trim().replace(/\s+/g, '')
    : `+${String(phone || '').replace(/\D/g, '')}`;
  const phoneInput = page.locator('#sign-in-phone-number');
  await phoneInput.waitFor({ state: 'visible', timeout: 45000 });
  await phoneInput.click({ force: true });
  await page.waitForTimeout(200);
  // Clear default "+49 " (or whatever geo default) via select-all.
  await phoneInput.press('Control+A').catch(() => {});
  await phoneInput.press('Meta+A').catch(() => {});
  await phoneInput.press('Backspace');
  await page.waitForTimeout(150);
  await phoneInput.pressSequentially(e164, { delay: 40 });
  await page.waitForTimeout(700);
  const shown = await phoneInput.inputValue().catch(() => '');
  console.log(`[tg-repair] phone field after type: ${JSON.stringify(shown)}`);
  // Expect Telegram to keep the dial digits (spaces ok).
  const want = e164.replace(/\D/g, '');
  const got = String(shown).replace(/\D/g, '');
  if (!got.includes(want.slice(-6))) {
    throw new Error(`Phone field did not accept number (got ${JSON.stringify(shown)})`);
  }
}

async function clickNext(page) {
  // Prefer the labeled NEXT auth button (Web A).
  const labeled = page.getByRole('button', { name: /^next$/i }).first();
  if (await labeled.isVisible().catch(() => false)) {
    await labeled.click({ force: true, timeout: 8000 });
    return true;
  }
  const candidates = [
    page.getByRole('button', { name: /^(continue|sign in)$/i }),
    page.locator('button.Button.auth-button.primary'),
    page.locator('button[aria-label="Next"], button[title="Next"]'),
  ];
  for (const loc of candidates) {
    try {
      const el = loc.first();
      if ((await el.count()) === 0) continue;
      if (!(await el.isVisible().catch(() => false))) continue;
      await el.click({ force: true, timeout: 8000 });
      return true;
    } catch {
      /* try next */
    }
  }
  await page.keyboard.press('Enter');
  return true;
}

async function setInputValue(locator, value) {
  await locator.waitFor({ state: 'visible', timeout: 45000 });
  try {
    await locator.fill(String(value), { force: true, timeout: 10000 });
  } catch {
    await locator.pressSequentially(String(value), { delay: 40 });
  }
}

async function dumpDebug(page, label) {
  try {
    const shot = path.join(path.dirname(statePath), `tg_repair_debug_${label}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 800);
    console.log(`[tg-repair] debug ${label} url=${page.url()} body=${JSON.stringify(body)}`);
  } catch {
    /* ignore */
  }
}

async function main() {
  const st = readState();
  const phone = String(st?.phone || '').trim();
  if (!phone) {
    writeState({ status: 'error', error: 'No phone in repair state' });
    process.exit(1);
  }
  writeState({ status: 'opening_web', error: null });
  fs.mkdirSync(sessionData, { recursive: true });

  const context = await chromium.launchPersistentContext(sessionData, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://web.telegram.org/a/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(4000);

    if (await persistSession(context)) {
      markOk({ source: 'tg_web_already' });
      writeState({ status: 'done', error: null });
      return;
    }

    writeState({ status: 'enter_phone' });
    await ensurePhoneLoginForm(page);
    try {
      await fillPhoneForm(page, phone);
    } catch (e) {
      await dumpDebug(page, 'no_phone_field');
      throw new Error(
        `Telegram phone form not found (QR screen?). ${e?.message || e}`.slice(0, 400)
      );
    }
    await clickNext(page);
    await page.waitForTimeout(2000);

    const codeInput = page
      .locator(
        '#sign-in-code, input[aria-label*="code" i], input[inputmode="numeric"], input[type="tel"][maxlength]'
      )
      .first();
    const phoneStill = page.locator('#sign-in-phone-number');
    // If still on phone form, try Enter once more
    if (await phoneStill.isVisible().catch(() => false)) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Poll for code screen; fail fast on invalid-number banner.
    const deadline = Date.now() + 60000;
    let sawCode = false;
    while (Date.now() < deadline) {
      const bodyEarly = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
      if (/too many tries|flood|try again later|banned/i.test(bodyEarly)) {
        throw new Error('Telegram rate-limited or blocked this phone/IP — try later from another network');
      }
      if (/invalid phone number|incorrect.*phone|wrong.*number/i.test(bodyEarly)) {
        throw new Error('Telegram rejected the phone number — check country code and digits');
      }
      if (await codeInput.isVisible().catch(() => false)) {
        sawCode = true;
        break;
      }
      // Still on phone form with NEXT — retry once mid-wait.
      if (
        Date.now() > deadline - 40000 &&
        (await page.getByRole('button', { name: /^next$/i }).isVisible().catch(() => false))
      ) {
        await clickNext(page);
      }
      await page.waitForTimeout(1500);
    }
    if (!sawCode) {
      await dumpDebug(page, 'no_code_field');
      throw new Error('Telegram did not ask for a login code after submitting the phone number');
    }
    writeState({ status: 'awaiting_code', error: null });
    const code = await waitForCode();
    writeState({ status: 'entering_code' });

    await setInputValue(codeInput, code);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter').catch(() => {});
    await clickNext(page);
    await page.waitForTimeout(5000);

    const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    if (/two.?step|cloud password/i.test(body) && /enter.*password|your password/i.test(body)) {
      writeState({
        status: 'needs_2fa',
        error:
          'Telegram 2FA password required — enter it in a future step, or finish login in browser and paste storage JSON',
      });
      markDead('needs_2fa');
      return;
    }

    for (let i = 0; i < 8; i++) {
      if (await persistSession(context)) {
        markOk({ source: 'tg_web_phone_code' });
        writeState({ status: 'done', error: null, phone: '', phoneMasked: '' });
        console.log('Telegram Web storageState saved');
        return;
      }
      await page.waitForTimeout(1500);
    }
    await dumpDebug(page, 'no_auth');
    writeState({
      status: 'error',
      error:
        'Login finished but no localStorage auth keys — check the code, or paste storage JSON from DevTools',
    });
    markDead('no_storage_auth');
  } catch (e) {
    const msg = e?.message || String(e);
    writeState({ status: 'error', error: msg.slice(0, 500) });
    markDead(msg);
    console.error('TG repair worker:', msg);
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
  }
}

main();
