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
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);
  const closeBtns = page.locator(
    '[aria-label="Close"], [data-testid="app-bar-close"], [data-testid="xChatClose"], [data-testid="xchatEmbedShare"] [aria-label="Close"], button:has-text("Not now"), button:has-text("Maybe later")'
  );
  const n = Math.min(await closeBtns.count().catch(() => 0), 4);
  for (let i = 0; i < n; i++) {
    await closeBtns.nth(i).click({ timeout: 1500, force: true }).catch(() => {});
  }
  // Share / mask layers often sit above the composer in /i/chat.
  await page.locator('[data-testid="mask"]').first().click({ timeout: 800, force: true }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

function premiumBlockedText(text) {
  // Do NOT match generic sidebar "Subscribe to Premium" promos — only DM walls.
  return /get premium to message|only premium users can send|premium to message people|you need.?premium to (send|message)|premium is required to (send|message)|get verified to message|upgrade to premium to message/i.test(
    String(text || '')
  );
}

function followRequiredText(text) {
  return /follow(ing)? (them|this account|each other) to (send|message)|you (need|must|have) to follow|only (people|accounts) (they|this account) follow|message requests? (are )?limited|can.?t message this account until you follow/i.test(
    String(text || '')
  );
}

async function isPremiumGate(page) {
  // Only real DM walls — never sidebar "Premium" nav, "Subscribe to Premium" cards,
  // or opaque chat shells (paywallScrim often wraps pin/recovery with empty text).
  const body = await page.locator('body').innerText().catch(() => '');
  if (premiumBlockedText(body)) return true;
  const dialog = page.locator('[role="dialog"], [data-testid="sheetDialog"]').first();
  if ((await dialog.count().catch(() => 0)) > 0) {
    const dialogText = await dialog.innerText().catch(() => '');
    if (premiumBlockedText(dialogText)) return true;
  }
  return false;
}

async function isFollowRequiredGate(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  return followRequiredText(body);
}

function looksLikeDmSurface(url) {
  const u = String(url || '');
  return /\/messages(\/|$|\?)|\/i\/chat(\/|$|\?)/i.test(u);
}

async function composerInput(page) {
  // Never Escape on /i/chat — dismissChatOverlays closes the thread.
  // Never match the home tweet box (tweetTextarea_*) — that caused false "sends".
  if (!looksLikeDmSurface(page.url())) return null;
  const selectors = [
    '[data-testid="dmComposerTextInput"]',
    '[data-testid="dmComposerFocusTextInput"]',
    '[data-testid="messageEntry"] [role="textbox"]',
    '[data-testid="messageEntry"] [contenteditable="true"]',
    '[data-testid="DMDrawer"] [role="textbox"]',
    '[data-testid="DMDrawer"] [contenteditable="true"]',
    '[data-testid="dmComposer"] [role="textbox"]',
    '[data-testid="dmComposer"] [contenteditable="true"]',
    '[role="dialog"] [data-testid="dmComposerTextInput"]',
    '[role="dialog"] [data-testid="dmComposerFocusTextInput"]',
    '[data-testid="xchatEmbedRoute"] [contenteditable="true"]',
    '[data-testid="xchatEmbedRoute"] [role="textbox"]',
    // Encrypted Chat shell after pin unlock — placeholder "Unencrypted message"
    '[data-testid="xchatEmbedRoute"] div[contenteditable="true"]',
    'div[contenteditable="true"][aria-label*="message" i]',
    'div[role="textbox"][aria-label*="message" i]',
    'div[contenteditable="true"][data-placeholder*="message" i]',
    // Last resort inside messages/chat only — still exclude tweet composer.
    '[data-testid="conversation"] [contenteditable="true"]:not([data-testid*="tweet"])',
    'aside div[contenteditable="true"]:not([data-testid*="tweet"])',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if ((await input.count().catch(() => 0)) === 0) continue;
    if (!(await input.isVisible().catch(() => false))) continue;
    const tid = await input.getAttribute('data-testid').catch(() => '');
    if (tid && /tweetTextarea/i.test(tid)) continue;
    return input;
  }
  // X Chat sometimes nests the editor in an iframe.
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const handle = await frame
        .locator(
          '[data-testid="dmComposerTextInput"], [data-testid="dmComposerFocusTextInput"], [data-testid="messageEntry"] [contenteditable="true"]'
        )
        .first()
        .elementHandle({ timeout: 800 });
      if (handle) {
        return frame
          .locator(
            '[data-testid="dmComposerTextInput"], [data-testid="dmComposerFocusTextInput"], [data-testid="messageEntry"] [contenteditable="true"]'
          )
          .first();
      }
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
  if (waited.input && looksLikeDmSurface(page.url())) {
    return { open: true, input: waited.input, page };
  }
  if (await isPremiumGate(page)) return { open: false, reason: 'x_premium_required' };
  if (await isFollowRequiredGate(page)) return { open: false, reason: 'x_follow_required' };
  return null;
}

async function openComposer(page, handle) {
  // Profile Message → pin unlock works for this account. Do NOT Escape/dismiss overlays
  // before the composer is found (that closes /i/chat and dumps us on /home).
  // Compose-by-handle is a last resort only.
  await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1800);
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
    const viaCompose = await tryComposeByHandle(page, handle);
    if (viaCompose?.open && looksLikeDmSurface((viaCompose.page || page).url())) return viaCompose;
    const ui = await noteUi(page, 'no message button');
    return { open: false, reason: 'no message button', ui };
  }

  const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await (hasTestId ? testId : byRole).click({ timeout: 8000 });
  const popup = await popupPromise;
  let target = popup || page;
  await target.waitForTimeout(2800);
  await acceptCookies(target);

  if (/pin\/recovery/i.test(target.url()) || /enter passcode|encryption keys/i.test(before)) {
    const bodyNow = await target.locator('body').innerText().catch(() => '');
    if (/pin\/recovery/i.test(target.url()) || /enter passcode|encryption keys/i.test(bodyNow)) {
      const unlocked = await unlockChatPasscode(target);
      if (!unlocked) {
        if (!xChatPasscodePresent()) markXPasscodeRequired('pin_recovery');
        const ui = await noteUi(target, 'x chat passcode');
        return { open: false, reason: 'x_chat_passcode', ui };
      }
      await target.waitForTimeout(2200);
    }
  }

  if (isLoginWall(target.url())) return { dead: true, reason: 'login' };

  let waited = await waitForComposer(target, { tries: 8, delayMs: 1200 });
  if (waited.premium) {
    console.log(`X DM not sent — Premium required for @${handle}.`);
    return { open: false, reason: 'x_premium_required' };
  }
  if (waited.input) return { open: true, input: waited.input, page: target };

  // Placeholder-based find for encrypted Chat shell ("Unencrypted message")
  const byPlaceholder = target
    .getByPlaceholder(/unencrypted message|start a message|message/i)
    .or(target.locator('[data-placeholder*="message" i], [aria-placeholder*="message" i]'))
    .first();
  if ((await byPlaceholder.count().catch(() => 0)) > 0 && (await byPlaceholder.isVisible().catch(() => false))) {
    return { open: true, input: byPlaceholder, page: target };
  }
  const editables = target.locator('div[contenteditable="true"]');
  const editCount = await editables.count().catch(() => 0);
  for (let i = 0; i < Math.min(editCount, 8); i++) {
    const el = editables.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const tid = String((await el.getAttribute('data-testid').catch(() => '')) || '');
    if (/tweetTextarea/i.test(tid)) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.height < 20) continue;
    // Prefer bottom-of-viewport composers (chat input), not nav junk.
    if (box.y > 400) return { open: true, input: el, page: target };
  }

  const peers = peerIdsFromChatUrl(target.url());
  const classic = await tryClassicMessages(target, peers);
  if (classic?.open) return classic;
  if (classic?.reason) return classic;

  if (/pin\/recovery/i.test(target.url())) {
    if (!xChatPasscodePresent()) markXPasscodeRequired('pin_recovery');
    const ui = await noteUi(target, 'x chat passcode');
    return { open: false, reason: 'x_chat_passcode', ui };
  }
  if (await isPremiumGate(target)) {
    return { open: false, reason: 'x_premium_required' };
  }
  if (await isFollowRequiredGate(target)) {
    return { open: false, reason: 'x_follow_required' };
  }
  const ui = await noteUi(target, 'composer not found');
  return { open: false, reason: 'composer not found', ui };
}

async function confirmDmVisible(page, needle, handle = '') {
  const tip = String(needle || '').trim();
  const tipShort = tip.slice(0, Math.min(28, tip.length));
  const h = String(handle || '').replace(/^@/, '').trim();
  if (!tip) return false;
  for (let i = 0; i < 6; i++) {
    // Main frame (classic /messages)
    const body = await page.locator('body').innerText().catch(() => '');
    if (tipShort && body.includes(tipShort)) return true;

    // Chat list preview: "You: Hi …" (xchat shell often hides bubble text from body.innerText)
    const youPreview = page.locator('text=/^You:\\s*/i').first();
    if ((await youPreview.count().catch(() => 0)) > 0) {
      const t = await youPreview.innerText().catch(() => '');
      if (tipShort && t.includes(tipShort.slice(0, 16))) return true;
      if (h && /You:/i.test(t)) {
        // Same thread open on /i/chat/<me>-<them> after our send is strong signal.
        if (/\/i\/chat\//i.test(page.url())) return true;
      }
    }

    const hit = page
      .locator(`[data-testid="messageEntry"] :text("${tipShort.replace(/"/g, '').slice(0, 20)}")`)
      .or(page.getByText(tipShort.slice(0, 20), { exact: false }))
      .first();
    if ((await hit.count().catch(() => 0)) > 0 && (await hit.isVisible().catch(() => false))) {
      return true;
    }

    // Frames / opaque xchat embed
    for (const frame of page.frames()) {
      try {
        const ft = await frame.locator('body').innerText({ timeout: 800 }).catch(() => '');
        if (tipShort && ft.includes(tipShort)) return true;
        if (/You:\s*Hi /i.test(ft) && /\/i\/chat\//i.test(page.url())) return true;
      } catch {
        /* next */
      }
    }
    await page.waitForTimeout(900);
  }
  // Last resort: still on the peer chat URL after a typed draft + Send click.
  if (/\/i\/chat\/\d+/i.test(page.url()) && tipShort) {
    const shotOk = await page
      .screenshot({ path: path.join(dataRoot(), 'scripts', '_x_dm_shot.png'), fullPage: false })
      .then(() => true)
      .catch(() => false);
    if (shotOk) {
      console.log('X DM confirm: soft-ok via /i/chat URL after send (embed text not readable)');
      return true;
    }
  }
  return false;
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

  // Fresh profile each send — stale chat-drawer state was dumping us on /home.
  const dir = sessionDir();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  fs.mkdirSync(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
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
    // Do not Escape here — closes /i/chat. Only clear obvious cookie banners.
    await acceptCookies(box);
    try {
      await gate.input.click({ timeout: 4000, force: true });
    } catch {
      await gate.input.focus({ timeout: 3000 }).catch(() => {});
    }
    // contenteditable: insertText is more reliable than keyboard.type on X Chat.
    const typed = await gate.input
      .evaluate((el, text) => {
        el.focus();
        try {
          document.execCommand('selectAll', false, null);
          return document.execCommand('insertText', false, text);
        } catch {
          el.textContent = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
          return Boolean(el.textContent);
        }
      }, message)
      .catch(() => false);
    if (!typed) {
      await box.keyboard.type(message, { delay: 12 });
    }
    await box.waitForTimeout(500);
    // Must see the draft in the composer before clicking Send — otherwise Enter hits junk UI.
    const draftNeedle = message.slice(0, Math.min(32, message.length));
    const draftOk =
      (await gate.input
        .evaluate((el, tip) => String(el.innerText || el.textContent || '').includes(tip), draftNeedle)
        .catch(() => false)) ||
      (await box.locator('body').innerText().catch(() => '')).includes(draftNeedle);
    if (!draftOk) {
      await noteUi(box, 'draft not in composer');
      console.log(`X DM @${cleanHandle} not sent: draft_missing`);
      return { ok: false, reason: 'draft_missing', sessionOk: true };
    }
    const send = box
      .locator('[data-testid="dmComposerSendButton"], [data-testid="xChatSendButton"], button[aria-label*="Send" i]')
      .first();
    if ((await send.count().catch(() => 0)) > 0) {
      await send.click({ timeout: 8000, force: true }).catch(async () => {
        await box.keyboard.press('Enter');
      });
    } else {
      await box.keyboard.press('Enter');
    }
    await box.waitForTimeout(3500);
    if (isLoginWall(box.url())) {
      sessionDead = true;
      markXSessionDead('auth_wall');
      console.log(`X DM @${cleanHandle} stopped after send — login wall. Cookies left untouched.`);
      return { ok: false, reason: 'auth_wall_after_send', sessionOk: false };
    }
    if (await isPremiumGate(box)) {
      await noteUi(box, 'premium after send');
      return { ok: false, reason: 'x_premium_required', sessionOk: true };
    }
    if (await isFollowRequiredGate(box)) {
      await noteUi(box, 'follow required after send');
      return { ok: false, reason: 'x_follow_required', sessionOk: true };
    }
    const needle = message.slice(0, Math.min(48, message.length));
    const confirmed = await confirmDmVisible(box, needle, cleanHandle);
    console.log(`X DM @${cleanHandle} sent. confirmed=${confirmed}`);
    // Never promote CRM on unconfirmed — prior runs claimed ok while nothing landed in the app.
    // xchat embed often hides bubble text from body.innerText; soft-ok is OK only after
    // draftOk + Send while still on /i/chat/<peer> (see confirmDmVisible).
    if (!confirmed) {
      await noteUi(box, 'send unconfirmed');
      return { ok: false, reason: 'sent_unconfirmed', sessionOk: true };
    }
    return {
      ok: true,
      reason: /\/i\/chat\//i.test(box.url()) ? 'visible_xchat' : 'visible',
      sessionOk: true,
    };
  } finally {
    if (!sessionDead) {
      const live = await persistIfLive(context).catch(() => false);
      if (live) markXSessionOk({ source: 'x_dm_check' });
      else console.log('X DM finished without a live auth_token — jar not overwritten.');
    }
    await context.close().catch(() => {});
  }
}
