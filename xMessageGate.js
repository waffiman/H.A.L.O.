/**
 * Pre-CRM X messageability probe.
 * Accept only when classic (unencrypted) /messages composer is writable and Premium is not required.
 * Apify canDm is NOT trusted — Premium gates often still block.
 */
import {
  clearXPasscodeRequired,
  markXPasscodeRequired,
  xChatPasscodePresent,
} from './xPasscode.js';

const CLOSED_INBOX_RE = /has a closed inbox|closed inbox|if you know their x number/i;

function isLoginWall(url) {
  return /\/i\/flow\/login|\/login|\/i\/flow\/signup/i.test(String(url || ''));
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

function encryptedChatText(text) {
  return /encrypted chat|end-to-end encrypted|this conversation is encrypted|chat is encrypted/i.test(
    String(text || '')
  );
}

async function acceptCookies(page) {
  const accept = page.getByRole('button', { name: /accept all cookies/i }).first();
  if ((await accept.count().catch(() => 0)) === 0) return;
  await accept.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
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
    await page.keyboard.type(code, { delay: 90 });
  }
  const confirm = page.getByRole('button', { name: /confirm|continue|next|unlock/i }).first();
  if ((await confirm.count().catch(() => 0)) > 0) {
    await confirm.click({ timeout: 4000 }).catch(() => {});
  }
  await page.waitForURL((url) => !/pin\/recovery/i.test(String(url)), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  const ok = !/pin\/recovery/i.test(page.url());
  if (ok) clearXPasscodeRequired();
  return ok;
}

function peerIdsFromUrl(url) {
  const m = String(url || '').match(/\/i\/chat\/(?:g)?(\d+)(?:-(\d+))?/i);
  if (!m) return [];
  return [m[1], m[2]].filter(Boolean);
}

/** Classic unencrypted composer only — not the encrypted /i/chat embed. */
async function classicComposerVisible(page) {
  const selectors = [
    '[data-testid="dmComposerTextInput"]',
    '[data-testid="dmComposerFocusTextInput"]',
    '[data-testid="messageEntry"] [contenteditable="true"]',
    '[data-testid="xchatEmbedRoute"] [contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ];
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if ((await input.count().catch(() => 0)) === 0) continue;
    if (!(await input.isVisible().catch(() => false))) continue;
    // Writable composer counts even inside /i/chat if X opened an editable box.
    return true;
  }
  return false;
}

async function bodyText(page) {
  return page.locator('body').innerText().catch(() => '');
}

async function gateFail(page, reason) {
  const text = (await bodyText(page)).replace(/\s+/g, ' ').trim().slice(0, 240);
  console.log(`X message gate: ${reason} url=${page.url()} text=${text}`);
  return { open: false, reason, unencrypted: false };
}

/**
 * @returns {{ open: boolean, reason?: string, dead?: boolean, unencrypted?: boolean }}
 */
export async function probeXMessageability(page, handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean) return { open: false, reason: 'missing handle' };

  await page.goto(`https://x.com/${clean}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1600);
  await acceptCookies(page);
  if (isLoginWall(page.url())) return { dead: true, open: false, reason: 'login' };

  const before = await bodyText(page);
  if (CLOSED_INBOX_RE.test(before)) return gateFail(page, 'closed inbox');

  const testId = page.locator('[data-testid="sendDMFromProfile"]').first();
  const byRole = page.getByRole('button', { name: /^message$/i }).first();
  const hasTestId = (await testId.count().catch(() => 0)) > 0;
  const hasRole = (await byRole.count().catch(() => 0)) > 0;

  /** @type {import('playwright').Page} */
  let target = page;
  if (!hasTestId && !hasRole) {
    // Stranger DMs often have no profile Message CTA — try classic compose search.
    const viaCompose = await tryComposeByHandleGate(page, clean);
    if (viaCompose) return viaCompose;
    return gateFail(page, 'no message button');
  }

  const popupPromise = page.context().waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await (hasTestId ? testId : byRole).click({ timeout: 8000 }).catch(() => {});
  const popup = await popupPromise;
  target = popup || page;
  await target.waitForTimeout(2200);
  await acceptCookies(target);

  if (/pin\/recovery/i.test(target.url())) {
    const unlocked = await unlockChatPasscode(target);
    if (!unlocked) {
      if (!xChatPasscodePresent()) markXPasscodeRequired('pin_recovery');
      return gateFail(target, 'x_chat_passcode');
    }
  }
  if (isLoginWall(target.url())) return { dead: true, open: false, reason: 'login' };

  let text = await bodyText(target);
  if (CLOSED_INBOX_RE.test(text)) return gateFail(target, 'closed inbox');
  if (premiumBlockedText(text)) return gateFail(target, 'x_premium_required');

  // If a writable composer is already here (classic or chat), accept — unless Premium wall text.
  if (await classicComposerVisible(target)) {
    const kind = /\/messages\//i.test(target.url()) ? 'unencrypted_composer' : 'chat_composer';
    return { open: true, reason: kind, unencrypted: true };
  }

  // Prefer classic /messages when chat opened as /i/chat/...
  const peers = peerIdsFromUrl(target.url());
  const classicUrls = [];
  for (const id of peers) {
    classicUrls.push(`https://x.com/messages/${id}`);
    classicUrls.push(`https://x.com/messages/compose?recipient_id=${id}`);
  }
  if (/\/i\/chat\//i.test(target.url()) || encryptedChatText(text) || classicUrls.length) {
    for (const url of classicUrls) {
      await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await target.waitForTimeout(1600);
      await acceptCookies(target);
      if (/pin\/recovery/i.test(target.url())) {
        const unlocked = await unlockChatPasscode(target);
        if (!unlocked) {
          if (!xChatPasscodePresent()) markXPasscodeRequired('pin_recovery');
          return gateFail(target, 'x_chat_passcode');
        }
      }
      text = await bodyText(target);
      if (premiumBlockedText(text)) return gateFail(target, 'x_premium_required');
      if (CLOSED_INBOX_RE.test(text)) return gateFail(target, 'closed inbox');
      if (await classicComposerVisible(target)) {
        return { open: true, reason: 'unencrypted_composer', unencrypted: true };
      }
    }
  }

  await target.waitForTimeout(1500);
  text = await bodyText(target);
  if (premiumBlockedText(text)) return gateFail(target, 'x_premium_required');
  if (followRequiredText(text)) return gateFail(target, 'x_follow_required');
  if (await classicComposerVisible(target)) {
    return { open: true, reason: 'composer_retry', unencrypted: true };
  }
  if (/\/i\/chat\//i.test(target.url()) && encryptedChatText(text)) {
    return gateFail(target, 'x_encrypted_only');
  }
  // Last resort: compose-by-handle (same path sendXDm prefers for strangers).
  const viaCompose = await tryComposeByHandleGate(page, clean);
  if (viaCompose) return viaCompose;
  return gateFail(target, 'no_unencrypted_composer');
}

async function tryComposeByHandleGate(page, handle) {
  await page.goto('https://x.com/messages/compose', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1400);
  await acceptCookies(page);
  if (isLoginWall(page.url())) return { dead: true, open: false, reason: 'login', unencrypted: false };
  if (/pin\/recovery/i.test(page.url())) {
    const unlocked = await unlockChatPasscode(page);
    if (!unlocked) {
      if (!xChatPasscodePresent()) markXPasscodeRequired('pin_recovery');
      return gateFail(page, 'x_chat_passcode');
    }
  }
  let text = await bodyText(page);
  if (premiumBlockedText(text)) return gateFail(page, 'x_premium_required');
  if (followRequiredText(text)) return gateFail(page, 'x_follow_required');

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
  await page.waitForTimeout(1600);
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
  await page.waitForTimeout(1800);
  const next = page.getByRole('button', { name: /^next$/i }).first();
  if ((await next.count().catch(() => 0)) > 0) {
    await next.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  text = await bodyText(page);
  if (premiumBlockedText(text)) return gateFail(page, 'x_premium_required');
  if (followRequiredText(text)) return gateFail(page, 'x_follow_required');
  if (CLOSED_INBOX_RE.test(text)) return gateFail(page, 'closed inbox');
  if (await classicComposerVisible(page)) {
    return { open: true, reason: 'compose_by_handle', unencrypted: true };
  }
  return null;
}
