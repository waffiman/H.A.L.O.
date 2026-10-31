#!/usr/bin/env node
/**
 * Prove: cookies → @account, Message → pin/recovery, unlock with X_CHAT_PASSCODE, then composer?
 * Screenshots in scripts/_x_audit/pin_*.png
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { withCycleLock } from '../cycleLock.js';
import { dataRoot } from '../dataRoot.js';
import { xAuthTokenPresent, xCookiesFile } from '../xSessionHealth.js';

dotenv.config({ override: true });

const HANDLE = String(process.env.X_AUDIT_HANDLE || 'farman32740').replace(/^@/, '');
const OUT = path.join(dataRoot(), 'scripts', '_x_audit');
fs.mkdirSync(OUT, { recursive: true });

function loadCookies() {
  const raw = JSON.parse(fs.readFileSync(xCookiesFile(), 'utf8'));
  return (Array.isArray(raw) ? raw : []).map((c) => {
    const s = String(c.sameSite || '').toLowerCase();
    let sameSite = 'Lax';
    if (s === 'strict') sameSite = 'Strict';
    else if (s === 'none' || s === 'no_restriction') sameSite = 'None';
    return {
      name: String(c.name),
      value: String(c.value),
      domain: c.domain || '.x.com',
      path: c.path || '/',
      httpOnly: Boolean(c.httpOnly),
      secure: sameSite === 'None' ? true : c.secure !== false,
      sameSite,
    };
  });
}

async function shot(page, name) {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false }).catch(() => {});
  console.log('SHOT', f, 'url=', page.url());
  return f;
}

async function unlock(page) {
  const code = String(process.env.X_CHAT_PASSCODE || '').replace(/\D/g, '').slice(0, 4);
  console.log('PIN_SET', code.length === 4, 'url=', page.url());
  if (code.length !== 4) return { ok: false, reason: 'no_pin_env' };

  const body = await page.locator('body').innerText().catch(() => '');
  const onPin = /pin\/recovery/i.test(page.url()) || /enter passcode|encryption keys|decrypt your previous messages/i.test(body);
  console.log('ON_PIN_UI', onPin, 'body=', body.replace(/\s+/g, ' ').trim().slice(0, 200));
  if (!onPin) return { ok: false, reason: 'not_on_pin' };

  await shot(page, 'pin_01_before');

  // Prefer real inputs; else click circles / center and type.
  const inputs = page.locator('input[inputmode="numeric"], input[maxlength="1"], input[type="tel"], input[type="password"]');
  const n = await inputs.count().catch(() => 0);
  console.log('numeric_inputs', n);
  if (n >= 4) {
    for (let i = 0; i < 4; i++) {
      await inputs.nth(i).click({ timeout: 2000 }).catch(() => {});
      await inputs.nth(i).fill(code[i]).catch(() => {});
    }
  } else {
    // Circles are often divs — click the bordered one then keyboard.type
    const circle = page.locator('div[role="group"] div, div').filter({ hasText: /^$/ }).first();
    const col = page.locator('[data-testid="primaryColumn"], main, [role="main"]').first();
    const box = (await circle.boundingBox().catch(() => null)) || (await col.boundingBox().catch(() => null));
    if (box) {
      await page.mouse.click(box.x + Math.min(40, box.width / 2), box.y + box.height / 2);
    } else {
      await page.mouse.click(640, 420);
    }
    await page.waitForTimeout(300);
    await page.keyboard.type(code, { delay: 120 });
  }

  await page.waitForTimeout(800);
  await shot(page, 'pin_02_typed');

  const confirm = page.getByRole('button', { name: /confirm|continue|next|unlock|submit/i }).first();
  if ((await confirm.count().catch(() => 0)) > 0) {
    await confirm.click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForURL((u) => !/pin\/recovery/i.test(String(u)), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'pin_03_after');

  const body2 = await page.locator('body').innerText().catch(() => '');
  const stillPin =
    /pin\/recovery/i.test(page.url()) || /enter passcode|encryption keys/i.test(body2);
  console.log('AFTER', page.url(), 'stillPin=', stillPin, 'body=', body2.replace(/\s+/g, ' ').trim().slice(0, 250));
  return { ok: !stillPin, reason: stillPin ? 'pin_still' : 'unlocked', url: page.url() };
}

async function run() {
  if (!xAuthTokenPresent().present) return { ok: false, reason: 'no_auth' };
  const pinLen = String(process.env.X_CHAT_PASSCODE || '').replace(/\D/g, '').slice(0, 4).length;
  console.log('env X_CHAT_PASSCODE digits=', pinLen);

  const sessionDir = path.join(dataRoot(), 'session_data_x_pin_probe');
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    await context.addCookies(loadCookies());
    const page = context.pages()[0] || (await context.newPage());

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const who = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').innerText().catch(() => '');
    console.log('LOGGED_IN_AS', who.replace(/\s+/g, ' ').trim());
    await shot(page, 'pin_00_home');

    await page.goto(`https://x.com/${HANDLE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await shot(page, 'pin_00_profile');

    const btn = page.locator('[data-testid="sendDMFromProfile"]').or(page.getByRole('button', { name: /^message$/i })).first();
    const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await btn.click({ timeout: 8000 });
    const popup = await popupPromise;
    const target = popup || page;
    await target.waitForTimeout(3000);
    await shot(target, 'pin_00_after_message');

    const unlocked = await unlock(target);
    let composer = false;
    if (unlocked.ok) {
      await target.waitForTimeout(1500);
      composer = (await target
        .locator(
          '[data-testid="dmComposerTextInput"], [data-testid="dmComposerFocusTextInput"], [data-testid="messageEntry"] [contenteditable="true"]'
        )
        .count()
        .catch(() => 0)) > 0;
      await shot(target, 'pin_04_composer_check');
    }
    console.log('RESULT', JSON.stringify({ who, handle: HANDLE, unlocked, composer }));
    return { ok: unlocked.ok, who, unlocked, composer };
  } finally {
    await context.close().catch(() => {});
  }
}

const locked = await withCycleLock('C', () => run(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('skipped', locked.reason);
  process.exit(2);
}
process.exit(locked?.result?.ok ? 0 : 1);
