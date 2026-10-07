/**
 * One X DM from the search session. Does not touch LinkedIn cookies.
 * Caller must hold the cycle lock, or run while the agent browser is stopped.
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
  await page.waitForTimeout(800);
}

async function composerInput(page) {
  const selectors = [
    '[data-testid="dmComposerTextInput"]',
    '[data-testid="dmComposerFocusTextInput"]',
    '[data-testid="messageEntry"] [role="textbox"]',
    'aside [role="textbox"]',
    '[data-testid="DMDrawer"] [role="textbox"]',
    '[role="dialog"] [role="textbox"]',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if ((await input.count().catch(() => 0)) > 0) return input;
  }
  return null;
}

async function noteUi(page, reason) {
  const url = page.url();
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500);
  const testids = await page
    .evaluate(() => [...document.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid')).filter(Boolean).slice(0, 40))
    .catch(() => []);
  const shot = path.join(dataRoot(), 'scripts', '_x_dm_shot.png');
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  console.log(`X DM ui: ${reason} url=${url} testids=${testids.join(',')}`);
  console.log(`X DM text: ${text}`);
  return { url, text, testids };
}

async function unlockChatPasscode(page) {
  const code = String(process.env.X_CHAT_PASSCODE || '').replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4 || !/pin\/recovery/i.test(page.url())) return false;
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
  await page.waitForURL((url) => !/pin\/recovery/i.test(String(url)), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return !/pin\/recovery/i.test(page.url());
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
    const ui = await noteUi(page, 'no message button');
    return { open: false, reason: 'no message button', ui };
  }
  const popupPromise = page.context().waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await (hasTestId ? testId : byRole).click({ timeout: 8000 });
  const popup = await popupPromise;
  let target = popup || page;
  await target.waitForTimeout(2500);
  await acceptCookies(target);
  if (/\/i\/chat\/pin\/recovery/i.test(target.url())) {
    const unlocked = await unlockChatPasscode(target);
    if (unlocked) {
      let input = await composerInput(target);
      if (!input) {
        await target.waitForTimeout(1500);
        input = await composerInput(target);
      }
      if (input) return { open: true, input, page: target };
    }
    const from = new URL(target.url()).searchParams.get('from') || '';
    const peer = (from.match(/\/i\/chat\/g?(\d+)/) || [])[1];
    if (peer) {
      await target
        .goto(`https://x.com/messages/${peer}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
        .catch(() => {});
      await target.waitForTimeout(2000);
      await acceptCookies(target);
      if (/pin\/recovery/i.test(target.url())) {
        await target
          .goto(`https://x.com/messages/compose?recipient_id=${peer}`, {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          })
          .catch(() => {});
        await target.waitForTimeout(2000);
        await acceptCookies(target);
      }
    }
  }
  if (/pin\/recovery|passcode/i.test(target.url())) {
    const ui = await noteUi(target, 'x chat passcode');
    return { open: false, reason: 'x_chat_passcode', ui };
  }
  if (isLoginWall(target.url())) return { dead: true, reason: 'login' };
  let input = await composerInput(target);
  if (!input && /\/messages|\/i\/chat\//i.test(target.url())) {
    await target.waitForTimeout(2000);
    input = await composerInput(target);
  }
  if (!input) {
    const wall = await target.locator('body').innerText().catch(() => '');
    if (/get premium to message|only premium users can send/i.test(wall)) {
      console.log(`X DM not sent — Premium required for this recipient.`);
      return { open: false, reason: 'x_premium_required' };
    }
    if (/pin\/recovery|passcode/i.test(target.url())) {
      const ui = await noteUi(target, 'x chat passcode');
      return { open: false, reason: 'x_chat_passcode', ui };
    }
    const ui = await noteUi(target, 'composer not found');
    return { open: false, reason: 'composer not found', ui };
  }
  return { open: true, input, page: target };
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
