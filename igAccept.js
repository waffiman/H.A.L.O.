/**
 * Instagram message-request acceptance + expire (mirror LinkedIn connect accept).
 * Pending leads carry IG_MSG_REQUEST_MARKER in notes and already have ice sent.
 */
import fs from 'fs';
import { chromium } from 'playwright';
import * as crm from './crmStore.js';
import { STATUS_LEAD, STATUS_CONVERSATION, STATUS_LOST, IG_MSG_REQUEST_MARKER } from './crm/constants.js';
import { channelFromUrl, instagramHandleFromUrl } from './leadChannel.js';
import { igCookiesFile, igSessionDataDir, markIgSessionDead, markIgSessionOk } from './igSessionHealth.js';

function notesHaveIgPending(lead) {
  const n = String(lead?.notes || lead?.notesText || '').toLowerCase();
  return n.includes(IG_MSG_REQUEST_MARKER.toLowerCase());
}

async function listPendingIgLeads() {
  const leads = await crm.listByStatus(STATUS_LEAD).catch(() => []);
  return (leads || []).filter(
    (l) => channelFromUrl(l.url) === 'instagram' && notesHaveIgPending(l)
  );
}

function loadCookiesPw() {
  try {
    const list = JSON.parse(fs.readFileSync(igCookiesFile(), 'utf8'));
    if (!Array.isArray(list)) return [];
    return list
      .filter((c) => c?.name && c.value != null)
      .map((c) => ({
        name: c.name,
        value: String(c.value),
        domain: String(c.domain || '.instagram.com').startsWith('.')
          ? String(c.domain || '.instagram.com')
          : `.${String(c.domain || 'instagram.com').replace(/^\./, '')}`,
        path: c.path || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: c.secure !== false,
        sameSite: 'Lax',
        expires:
          typeof c.expirationDate === 'number'
            ? Math.floor(c.expirationDate)
            : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
      }));
  } catch {
    return [];
  }
}

/**
 * Heuristic: open Direct inbox + requests. If a thread with the handle exists
 * outside Message requests (or request was accepted), treat as accepted.
 */
async function checkHandleAccepted(page, handle) {
  const h = String(handle || '').toLowerCase();
  if (!h) return false;
  // Primary inbox
  await page.goto('https://www.instagram.com/direct/inbox/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  if (/accounts\/login|challenge/i.test(page.url())) {
    markIgSessionDead('auth_wall', { at: 'igAccept.inbox' });
    throw new Error('Instagram auth wall');
  }
  markIgSessionOk({ source: 'igAccept' });

  const inboxHit = page.locator(`a[href*="/direct/t/"], div[role="listitem"], span`).filter({
    hasText: new RegExp(`@?${h}\\b`, 'i'),
  });
  if ((await inboxHit.count()) > 0) {
    // Prefer not Message requests folder label nearby
    const reqLabel = page.locator('text=/Message requests/i').first();
    if (!(await reqLabel.count())) return true;
  }

  // Message requests folder
  await page.goto('https://www.instagram.com/direct/requests/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  }).catch(() => {});
  await page.waitForTimeout(1200);
  const stillPending = page.locator(`span, a, div`).filter({ hasText: new RegExp(`@?${h}\\b`, 'i') });
  if ((await stillPending.count()) > 0) return false;

  // Not in requests + was in inbox → accepted; if nowhere, leave pending
  return (await inboxHit.count()) > 0;
}

export async function promoteAcceptedIgLeads({ max = 20 } = {}) {
  if (process.env.CHANNEL_INSTAGRAM_ENABLED !== '1') {
    return { checked: 0, promoted: 0, disabled: true };
  }
  const pending = await listPendingIgLeads();
  if (!pending.length) return { checked: 0, promoted: 0 };

  const cookies = loadCookiesPw();
  if (!cookies.some((c) => c.name === 'sessionid')) {
    console.log('[IG accept] no sessionid — skip');
    return { checked: 0, promoted: 0, noSession: true };
  }

  const profileDir = igSessionDataDir();
  fs.mkdirSync(profileDir, { recursive: true });
  let context;
  let checked = 0;
  let promoted = 0;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 820 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    for (const lead of pending.slice(0, max)) {
      const handle = instagramHandleFromUrl(lead.url);
      if (!handle) continue;
      checked++;
      try {
        const ok = await checkHandleAccepted(page, handle);
        if (!ok) continue;
        await crm.updateStatus(lead.id, STATUS_CONVERSATION);
        await crm.appendNote(lead.id, 'IG message request accepted → Conversation').catch(() => {});
        promoted++;
        console.log(`[IG accept] @${handle} → Conversation`);
      } catch (e) {
        console.error(`[IG accept] @${handle}:`, e.message);
        if (/auth wall/i.test(e.message)) break;
      }
    }
  } finally {
    try {
      await context?.close();
    } catch {
      /* ignore */
    }
  }
  return { checked, promoted };
}

export async function expireStaleIgLeads({
  waitDays = Number(process.env.IG_ACCEPT_WAIT_DAYS ?? process.env.CONNECT_ACCEPT_WAIT_DAYS ?? 21),
  now = new Date(),
} = {}) {
  if (process.env.CHANNEL_INSTAGRAM_ENABLED !== '1') {
    return { expired: 0, skipped: 0, disabled: true };
  }
  if (process.env.IG_ACCEPT_EXPIRE === '0') {
    return { expired: 0, skipped: 0, waitDays: 0, disabled: true };
  }
  const days = Number(waitDays);
  if (!Number.isFinite(days) || days <= 0) {
    return { expired: 0, skipped: 0, waitDays: 0, disabled: true };
  }

  const pending = await listPendingIgLeads();
  const cutoffMs = days * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  let expired = 0;
  let skipped = 0;

  for (const lead of pending) {
    const clockRaw = lead.processingAt || lead.createdAt;
    if (!clockRaw) {
      skipped++;
      continue;
    }
    const clockMs = clockRaw instanceof Date ? clockRaw.getTime() : Date.parse(clockRaw);
    if (!Number.isFinite(clockMs) || nowMs - clockMs < cutoffMs) continue;
    try {
      await crm.updateStatus(lead.id, STATUS_LOST, { lostReason: 'connect_not_accepted' });
      expired++;
      console.log(
        `[IG expire] Lead😴 → Lost❌ (${days}d): ${instagramHandleFromUrl(lead.url) || lead.url}`
      );
    } catch (e) {
      console.error('[IG expire]', e.message);
    }
  }
  if (expired) console.log(`[IG expire] closed ${expired} (waitDays=${days}, skipped=${skipped})`);
  return { expired, skipped, waitDays: days };
}
