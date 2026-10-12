/**
 * One X DM from the search session. Does not touch LinkedIn cookies.
 * Caller must hold the cycle lock, or run while the agent browser is stopped.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { dataRoot } from './dataRoot.js';
import { markXSessionDead, markXSessionOk, xAuthTokenPresent, xCookiesFile } from './xSessionHealth.js';
import {
  clearXPasscodeRequired,
  markXPasscodeRequired,
  xChannelBlockedOnPasscode,
  xChatPasscodePresent,
} from './xPasscode.js';

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
  await page.waitForTimeout(800);
}

async function dismissChatOverlays(page) {
  const closeBtns = page.locator(
    '[aria-label="Close"], [data-testid="app-bar-close"], [data-testid="xChatClose"], button:has-text("Not now"), button:has-text("Maybe later")'
  );
  const n = Math.min(await closeBtns.count().catch(() => 0), 3);
  for (let i = 0; i < n; i++) {
    await closeBtns.nth(i).click({ timeout: 1500 }).catch(() => {});
  }
}

function premiumBlockedText(text) {
  return /get premium to message|only premium users can send|upgrade to premium|subscribe to premium|premium is required|you need premium/i.test(
    String(text || '')
  );
}

async function isPremiumGate(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (premiumBlockedText(body)) return true;
  const cta = page.getByRole('button', { name: /get premium|upgrade|subscribe/i }).first();
  if ((await cta.count().catch(() => 0)) > 0) {
    const dialog = page.locator('[role="dialog"], [data-testid="sheetDialog"]').first();
    if ((await dialog.count().catch(() => 0)) > 0) return true;
  }
  return false;
}

async function composerInput(page) {
  await dismissChatOverlays(page);
  const selectors = [
    '[data-testid="dmComposerTextInput"]',
    '[data-testid="dmComposerFocusTextInput"]',
    '[data-testid="messageEntry"] [role="textbox"]',
    '[data-testid="messageEntry"] [contenteditable="true"]',
    'aside [role="textbox"]',
    '[data-testid="DMDrawer"] [role="textbox"]',
    '[role="dialog"] [role="textbox"]',
    '[role="dialog"] [contenteditable="true"]',
    '[data-testid="xchatEmbedRoute"] [contenteditable="true"]',
    '[data-testid="xchatEmbedRoute"] [role="textbox"]',
    'div[contenteditable="true"][data-testid]',
    'div[role="textbox"][contenteditable="true"]',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if ((await input.count().catch(() => 0)) === 0) continue;
    if (!(await input.isVisible().catch(() => false))) continue;
    return input;
  }
  // X Chat sometimes nests the editor in an iframe.
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const handle = await frame
        .locator(
          '[data-testid="dmComposerTextInput"], [role="textbox"][contenteditable="true"], div[contenteditable="true"]'
        )
        .first()
        .elementHandle({ timeout: 800 });
      if (handle) return frame.locator(':scope').locator('[contenteditable="true"], [role="textbox"]').first();
    } catch {
      /* next frame */
    }
  }
  return null;
}

async function waitForComposer(page, { tries = 4, delayMs = 1200 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await isPremiumGate(page)) return { input: null, premium: true };
    const input = await composerInput(page);
    if (input) return { input, premium: false };
    await page.waitForTimeout(delayMs);
  }
  if (await isPremiumGate(page)) return { input: null, premium: true };
  return { input: null, premium: false };
}

async function noteUi(page, reason) {
  const url = page.url();
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500);
  const testids = await page
    .evaluate(() =>
      [...document.querySelectorAll('[data-testid]')]
        .map((el) => el.getAttribute('data-testid'))
        .filter(Boolean)
        .slice(0, 40)
    )
    .catch(() => []);
  const shotDir = path.join(dataRoot(), 'scripts');
  fs.mkdirSync(shotDir, { recursive: true });
  const shot = path.join(shotDir, '_x_dm_shot.png');
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  console.log(`X DM ui: ${reason} url=${url} testids=${testids.join(',')}`);
  console.log(`X DM text: ${text}`);
  return { url, text, testids };
}

function peerIdsFromChatUrl(url) {
  const m = String(url || '').match(/\/i\/chat\/(?:g)?(\d+)(?:-(\d+))?/i);
  if (!m) return [];
  return [m[1], m[2]].filter(Boolean);
}

async function unlockChatPasscode(page) {
  const code = String(process.env.X_CHAT_PASSCODE || '').replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4) return false;
  if (!/pin\/recovery/i.test(page.url())) return false;
  await acceptCookies(page);
  const digits = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
  const count = await digits.count().catch(() => 0);
  if (count >= 4) {
    for (let i = 0; i < 4; i++) {
      await digits.nth(i).click({ timeout: 2000 }).catch(() => {});
      await digits.nth(i).fill(code[i]).catch(() => {});
    }
  } else {
    const column = page.locator('[data-testid="primaryColumn"]').first();
    const box = await column.boundingBox().catch(() => null);
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.46);
    await page.keyboard.type(code, { delay: 90 });
  }
  const confirm = page.getByRole('button', { name: /confirm|continue|next|unlock/i }).first();
  if ((await confirm.count().catch(() => 0)) > 0) {
    await confirm.click({ timeout: 4000 }).catch(() => {});
  }
  await page.waitForURL((url) => !/pin\/recovery/i.test(String(url)), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const ok = !/pin\/recovery/i.test(page.url());
  if (ok) clearXPasscodeRequired();
  return ok;
}

async function tryClassicMessages(page, peerIds = []) {
  const paths = [];
  for (const id of peerIds) {
    paths.push(`https://x.com/messages/${id}`);
    paths.push(`https://x.com/messages/compose?recipient_id=${id}`);
  }
  for (const url of paths) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await acceptCookies(page);
    if (/pin\/recovery/i.test(page.url())) {
      const unlocked = await unlockChatPasscode(page);
      if (!unlocked && !xChatPasscodePresent()) {
        markXPasscodeRequired('pin_recovery');
        return { open: false, reason: 'x_chat_passcode' };
      }
    }
    if (isLoginWall(page.url())) return { dead: true, reason: 'login' };
    const waited = await waitForComposer(page);
    if (waited.premium) return { open: false, reason: 'x_premium_required' };
    if (waited.input) return { open: true, input: waited.input, page };
  }
  return null;
}

async function tryComposeByHandle(page, handle) {
  await page.goto('https://x.com/messages/compose', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await acceptCookies(page);
  if (/pin\/recovery/i.test(page.url())) {
    await unlockChatPasscode(page);
  }
  if (isLoginWall(page.url())) return { dead: true, reason: 'login' };
  if (await isPremiumGate(page)) return { open: false, reason: 'x_premium_required' };

  const search = page
    .locator(
      '[data-testid="searchPeople"], input[placeholder*="Search"], input[aria-label*="Search"], [role="combobox"]'
    )
    .first();
  if ((await search.count().catch(() => 0)) === 0) return null;
  await search.click({ timeout: 4000 }).catch(() => {});
  await search.fill(`@${handle}`).catch(async () => {
    await page.keyboard.type(`@${handle}`, { delay: 40 });
  });
  await page.waitForTimeout(1800);
  const hit = page
    .locator(`[data-testid="TypeaheadUser"] >> text=@${handle}`)
    .or(page.getByRole('option', { name: new RegExp(`@?${handle}`, 'i') }))
    .or(page.locator(`text=@${handle}`))
    .first();
  if ((await hit.count().catch(() => 0)) > 0) {
    await hit.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press('Enter').catch(() => {});
  }
  await page.waitForTimeout(2000);
  const next = page.getByRole('button', { name: /^next$/i }).first();
  if ((await next.count().catch(() => 0)) > 0) {
    await next.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  const waited = await waitForComposer(page);
  if (waited.premium) return { open: false, reason: 'x_premium_required' };
  if (waited.input) return { open: true, input: waited.input, page };
  return null;
}

async function openComposer(page, handle) {
  await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  await acceptCookies(page);
  if (isLoginWall(page.url())) return { dead: true, reason: 'login' };
  const before = await page.locator('body').innerText().catch(() => '');
  if (/has a closed inbox|closed inbox|if you know their x number/i.test(before)) {
    return { open: false, reason: 'closed inbox' };
  }

  const testId = page.locator('[data-testid="sendDMFromProfile"]').first();
  const byRole = page.getByRole('button', { name: /^message$/i }).first();
  const hasTestId = (await testId.count().catch(() => 0)) > 0;
  const hasRole = (await byRole.count().catch(() => 0)) > 0;
  if (!hasTestId && !hasRole) {
    // Profile may hide Message until follow settles — try compose-by-handle.
    const viaCompose = await tryComposeByHandle(page, handle);
    if (viaCompose) return viaCompose;
    const ui = await noteUi(page, 'no message button');
    return { open: false, reason: 'no message button', ui };
  }

  const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await (hasTestId ? testId : byRole).click({ timeout: 8000 });
  const popup = await popupPromise;
  let target = popup || page;
  await target.waitForTimeout(2500);
  await acceptCookies(target);
  await dismissChatOverlays(target);

  if (/\/i\/chat\/pin\/recovery/i.test(target.url())) {
    const unlocked = await unlockChatPasscode(target);
    if (!unlocked && !xChatPasscodePresent()) {
      markXPasscodeRequired('pin_recovery');
      const ui = await noteUi(target, 'x chat passcode');
      return { open: false, reason: 'x_chat_passcode', ui };
    }
  }

  if (isLoginWall(target.url())) return { dead: true, reason: 'login' };

  let waited = await waitForComposer(target, { tries: 5, delayMs: 1400 });
  if (waited.premium) {
    console.log(`X DM not sent — Premium required for @${handle}.`);
    return { open: false, reason: 'x_premium_required' };
  }
  if (waited.input) return { open: true, input: waited.input, page: target };

  // Classic desktop messaging often has a real composer when /i/chat embed does not.
  const peers = peerIdsFromChatUrl(target.url());
  const classic = await tryClassicMessages(target, peers);
  if (classic) return classic;

  const viaCompose = await tryComposeByHandle(target, handle);
  if (viaCompose) return viaCompose;

  if (/pin\/recovery/i.test(target.url())) {
    if (!xChatPasscodePresent()) markXPasscodeRequired('pin_recovery');
    const ui = await noteUi(target, 'x chat passcode');
    return { open: false, reason: 'x_chat_passcode', ui };
  }
  if (await isPremiumGate(target)) {
    return { open: false, reason: 'x_premium_required' };
  }
  const ui = await noteUi(target, 'composer not found');
  return { open: false, reason: 'composer not found', ui };
}

/**
 * @returns {{ ok: boolean, reason?: string, sessionOk?: boolean }}
 */
export async function sendXDm(handle, text) {
  const cleanHandle = String(handle || '').replace(/^@/, '').trim();
  const message = String(text || '').trim();
  if (!cleanHandle || !message) return { ok: false, reason: 'missing handle or text' };
  if (!xAuthTokenPresent().present) {
    markXSessionDead('missing_auth_token');
    return { ok: false, reason: 'no_auth', sessionOk: false };
  }
  if (xChannelBlockedOnPasscode()) {
    return { ok: false, reason: 'x_chat_passcode', sessionOk: true };
  }

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

  let sessionDead = false;
  try {
    const cookies = loadPlaywrightCookies();
    if (cookies.length) await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const gate = await openComposer(page, cleanHandle);
    if (gate.dead) {
      sessionDead = true;
      markXSessionDead('auth_wall');
      console.log(`X DM @${cleanHandle} stopped — login wall. Cookies left untouched.`);
      return { ok: false, reason: 'auth_wall', sessionOk: false };
    }
    if (!gate.open) {
      console.log(`X DM @${cleanHandle} not sent: ${gate.reason}`);
      return { ok: false, reason: gate.reason, sessionOk: true };
    }
    const box = gate.page || page;
    await gate.input.click({ timeout: 5000 });
    await box.keyboard.type(message, { delay: 15 });
    const send = box.locator('[data-testid="dmComposerSendButton"]').first();
    if ((await send.count().catch(() => 0)) > 0) await send.click({ timeout: 8000 });
    else await box.keyboard.press('Enter');
    await box.waitForTimeout(2500);
    if (isLoginWall(box.url())) {
      sessionDead = true;
      markXSessionDead('auth_wall');
      console.log(`X DM @${cleanHandle} stopped after send — login wall. Cookies left untouched.`);
      return { ok: false, reason: 'auth_wall_after_send', sessionOk: false };
    }
    if (await isPremiumGate(box)) {
      return { ok: false, reason: 'x_premium_required', sessionOk: true };
    }
    const body = await box.locator('body').innerText().catch(() => '');
    const visible = body.includes(message.slice(0, 40));
    console.log(`X DM @${cleanHandle} sent. visible=${visible}`);
    return { ok: true, reason: visible ? 'visible' : 'sent_unconfirmed', sessionOk: true };
  } finally {
    if (!sessionDead) {
      const live = await persistIfLive(context).catch(() => false);
      if (live) markXSessionOk({ source: 'x_dm_check' });
      else console.log('X DM finished without a live auth_token — jar not overwritten.');
    }
    await context.close().catch(() => {});
  }
}
