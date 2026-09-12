import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { splitMessageForDm, sanitizeIceBreaker } from './messageQuality.js';
import * as crm from './crmStore.js';
import { cookiesFile, sessionDataDir, stateJsonFile } from './dataRoot.js';
import { STATUS_LEAD, STATUS_CONVERSATION, isLeadReadyForIcePipeline } from './crm/constants.js';

dotenv.config({ override: true });
// Tenant one-shots: load cabinet overrides after root .env (WORKSPACE_ID, stage flags, …)
if (process.env.TENANT_DATA_ROOT) {
  dotenv.config({ path: path.join(process.env.TENANT_DATA_ROOT, 'tenant.env'), override: true });
}

/** Re-read .env so dashboard Save is visible without relying on a stale Docker env snapshot.
 *  STAGE_A_ONESHOT=1 preserves CLI/docker overrides across reload (one-shot scripts). */
function reloadEnv() {
  const preserve = {};
  if (process.env.STAGE_A_ONESHOT === '1' || process.env.STAGE_B_ONESHOT === '1') {
    for (const k of [
      'OUTREACH_PAUSED',
      'SKIP_STAGE_A',
      'SKIP_STAGE_B',
      'SKIP_CONVERSATION',
      'FORCE_STAGE_A',
      'STAGE_A_ONLY',
      'STAGE_B_ONLY',
      'SKIP_SYNC',
      'SKIP_ENRICH',
      'SYNC_MAX_NEW',
      'STAGE_A_SEND_MAX',
      'ALLOW_AUTO_LOGIN',
      'ENABLE_INBOX_REPLIES',
      'SILENCE_BUSINESS_DAYS',
      'SILENCE_SKIP_WEEKENDS',
      'CONV_MAX_PER_RUN',
      'LOST_INBOX_MAX',
      'TARGET_LINKEDIN_URL',
      'STAGE_A_OUTBOUND_CONNECT',
      'STAGE_A_ACCEPTANCE',
      'STAGE_A_LEGACY_SYNC',
      'CONNECT_MAX_PER_RUN',
      'CONNECT_DRY_RUN',
      'CONNECT_ACCEPT_WAIT_DAYS',
      'CONNECT_ACCEPT_EXPIRE',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'TENANT_DATA_ROOT',
      'WORKSPACE_ID',
      'STAGE_A_ONESHOT',
      'STAGE_B_ONESHOT',
    ]) {
      if (process.env[k] != null) preserve[k] = process.env[k];
    }
  }
  dotenv.config({ override: true });
  if (process.env.TENANT_DATA_ROOT) {
    dotenv.config({ path: path.join(process.env.TENANT_DATA_ROOT, 'tenant.env'), override: true });
  }
  Object.assign(process.env, preserve);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function humanRandomDelay(min = 2000, max = 5000) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise(resolve => setTimeout(resolve, delay));
}

function isWeekday(date = new Date()) {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

// Counts elapsed business days strictly between `from` and `to` (Sat/Sun excluded).
function businessDaysBetween(from, to) {
  if (!from || !to) return 0;
  let count = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWeekday(cursor)) count++;
  }
  return count;
}

function normalizeCookieForPlaywright(raw) {
  if (!raw || !raw.name || raw.value == null) return null;
  let sameSite = raw.sameSite;
  if (sameSite === 'no_restriction' || sameSite === 'None') sameSite = 'None';
  else if (sameSite === 'strict' || sameSite === 'Strict') sameSite = 'Strict';
  else if (sameSite === 'lax' || sameSite === 'Lax') sameSite = 'Lax';
  else sameSite = 'Lax';

  const expiresRaw = raw.expires ?? raw.expirationDate;
  const out = {
    name: String(raw.name),
    value: String(raw.value),
    domain: raw.domain || '.linkedin.com',
    path: raw.path || '/',
    httpOnly: !!raw.httpOnly,
    secure: raw.secure !== false,
    sameSite,
  };
  if (expiresRaw != null && Number(expiresRaw) > 0) {
    out.expires = Math.floor(Number(expiresRaw));
  }
  return out;
}

async function loadCookies(context) {
    try {
        const fs = await import('fs');
        const cookiesPath = cookiesFile();
        if (fs.existsSync(cookiesPath)) {
            console.log(`Loading cookies from ${cookiesPath}...`);
            const raw = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
            const cookies = (Array.isArray(raw) ? raw : [])
              .map(normalizeCookieForPlaywright)
              .filter(Boolean);
            if (!cookies.length) {
              console.log('cookies.json empty after normalize — skip');
              return;
            }
            await context.addCookies(cookies);
            const hasAt = cookies.some((c) => c.name === 'li_at' && c.value);
            console.log(`Cookies loaded: ${cookies.length} (li_at=${hasAt})`);
        }
    } catch (e) {
        console.error('Error loading cookies:', e.message);
    }
}

/**
 * Password/checkpoint auto-login from VPS IP rotates LinkedIn session tokens and
 * kicks the user's real browser. Default OFF — rely on cookies.json + session_data.
 * Set ALLOW_AUTO_LOGIN=1 only when deliberately re-authing (and expect browser logout).
 */
function autoLoginAllowed() {
  return process.env.ALLOW_AUTO_LOGIN === '1';
}

/** Write live Playwright cookies back to cookies.json so the VPS session stays self-refreshing. */
async function persistSessionCookies(context) {
  try {
    const cookies = await context.cookies();
    const linkedIn = cookies.filter((c) => String(c.domain || '').includes('linkedin.com'));
    if (!linkedIn.length) return;
    const hasAt = linkedIn.some((c) => c.name === 'li_at' && c.value);
    if (!hasAt) {
      console.log('Skip cookie persist — live context has no li_at (keep last good cookies.json).');
      return;
    }
    const outPath = cookiesFile();
    fs.writeFileSync(outPath, JSON.stringify(linkedIn, null, 2));
    console.log(`Persisted ${linkedIn.length} LinkedIn cookies → ${outPath} (li_at=true)`);
  } catch (e) {
    console.error('persistSessionCookies:', e.message);
  }
}

async function getLeads(statusName) {
  try {
    const leads = await crm.listByStatus(statusName);
    console.log(`CRM query for "${statusName}" returned ${leads.length} results.`);
    return leads;
  } catch (e) {
    console.error('getLeads CRM error:', e.message || e);
    return [];
  }
}

/**
 * Find CRM leads in a Status by sender display name (title contains + fuzzy match).
 */
async function findLeadsByName(statusName, senderName) {
  const { normalizePersonName, namesMatch } = await import('./conversationAgent.js');
  const needle = normalizePersonName(senderName);
  if (!needle) return [];
  const tokens = needle.split(' ').filter((t) => t.length > 1);
  const searchToken = tokens[0] || needle;
  try {
    const hits = await crm.findLeadsByName(statusName, searchToken);
    return hits.filter((l) => namesMatch(l.name, senderName));
  } catch (e) {
    console.error(`findLeadsByName(${statusName}, ${senderName}):`, e.message || e);
    return [];
  }
}

/** Any-status CRM lookup by sender name. */
async function findCrmBySenderName(senderName) {
  const { normalizePersonName, namesMatch } = await import('./conversationAgent.js');
  const needle = normalizePersonName(senderName);
  if (!needle) return null;
  const tokens = needle.split(' ').filter((t) => t.length > 1);
  const searchToken = tokens[0] || needle;
  try {
    const hits = await crm.findCrmBySenderName(searchToken);
    const matched = hits.filter((l) => namesMatch(l.name, senderName));
    return matched[0] || null;
  } catch (e) {
    console.error(`findCrmBySenderName(${senderName}):`, e.message || e);
    return null;
  }
}

/** Only LinkedIn unread badge counts — already-read inbound chats must not notify. */
function inboxRowLooksInbound(row) {
  return Boolean(row?.unread);
}

/** LinkedIn ads / sponsored conversation rows — never notify or reply. */
function isSponsoredInboxRow(row) {
  return /sponsored|promoted|\bad\b|advertisement/i.test(
    `${row?.name || ''} ${row?.preview || ''}`
  );
}

function inboxNotifyKey(row) {
  const name = String(row?.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const preview = String(row?.preview || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return `inbox-inbound:${name}:${preview}`;
}

/**
 * Scrape LinkedIn messaging conversation list (names + thread href + unread hint).
 * Prefer desktop messaging (Unread filter works); mwlite as fallback.
 */
async function scrapeInboxConversations(page) {
  const urls = [
    'https://www.linkedin.com/messaging/',
    'https://www.linkedin.com/mwlite/messaging/',
  ];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 90000 });
      await humanRandomDelay(3000, 5000);
      if (await pageLooksLikeAuthWall(page)) {
        console.log('Inbox list auth wall — abort scrape');
        const { markSessionDead } = await import('./sessionHealth.js');
        markSessionDead('auth_wall_on_inbox', { url: page.url() });
        return [];
      }
      // Prefer Unread filter — then every visible row is unread
      let unreadFilterOn = false;
      const unreadBtn = page
        .locator(
          'button:has-text("Unread"), a:has-text("Unread"), [role="radio"]:has-text("Unread"), button[aria-label*="Unread"]'
        )
        .first();
      if (await unreadBtn.isVisible().catch(() => false)) {
        await unreadBtn.click().catch(() => {});
        await humanRandomDelay(1500, 2500);
        unreadFilterOn = true;
      }
      const rows = await page.evaluate((forceUnread) => {
        const out = [];
        const seen = new Set();
        const push = (name, href, unread, preview) => {
          const n = (name || '').replace(/\s+/g, ' ').trim();
          if (!n || n.length < 2) return;
          // Skip group chats / noise
          if (/^linkedin\b/i.test(n)) return;
          if (/,/.test(n) && n.split(',').length > 2) return;
          const key = n.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          let fullHref = href || '';
          if (fullHref && fullHref.startsWith('/')) fullHref = `https://www.linkedin.com${fullHref}`;
          out.push({
            name: n,
            href: fullHref,
            unread: forceUnread ? true : Boolean(unread),
            preview: (preview || '').replace(/\s+/g, ' ').trim().slice(0, 180),
          });
        };

        const looksUnread = (el, aria = '') => {
          if (/unread/i.test(aria)) return true;
          if (
            el.querySelector(
              '.msg-conversation-card__unread-count, .notification-badge, [class*="unread"], .msg-conversation-listitem__unread-count, .badge'
            )
          ) {
            return true;
          }
          // mwlite: unread threads often bold the participant name
          const bold = el.querySelector(
            '.body-medium-bold-open, .body-medium-bold, [class*="bold-open"], [class*="unread"]'
          );
          if (bold) return true;
          return false;
        };

        // Desktop conversation rows
        for (const item of Array.from(
          document.querySelectorAll(
            '.msg-conversation-listitem, li.msg-conversation-listitem, .msg-conversation-card, [data-control-name="view_message"]'
          )
        )) {
          const a =
            item.closest('a[href*="/messaging/thread/"]') ||
            item.querySelector('a[href*="/messaging/thread/"]') ||
            (item.tagName === 'A' ? item : null);
          const href = a?.getAttribute('href') || item.getAttribute('href') || '';
          const nameEl = item.querySelector(
            'h3, .msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names, .msg-conversation-listitem__participant-names span'
          );
          let name = (nameEl?.textContent || '').trim();
          const aria = item.getAttribute('aria-label') || a?.getAttribute('aria-label') || '';
          if (!name && aria) {
            const m = aria.match(/conversation with ([^.]+)/i) || aria.match(/^([^.,]+)/);
            if (m) name = m[1].trim();
          }
          const unread = looksUnread(item, aria) || (a ? looksUnread(a, aria) : false);
          const previewEl = item.querySelector(
            '.msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet, p'
          );
          push(name, href, unread, previewEl?.textContent || '');
        }

        // Generic thread links (mwlite / fallback)
        for (const a of Array.from(document.querySelectorAll('a[href*="/messaging/thread/"]'))) {
          const href = a.getAttribute('href') || '';
          let name = '';
          const h = a.querySelector('h2, h3, h4, strong, .participant, [class*="name"], p.body-medium-bold-open, p.body-medium-bold');
          if (h) name = (h.textContent || '').trim();
          if (!name) {
            const aria = a.getAttribute('aria-label') || '';
            const m = aria.match(/with ([^.]+)/i) || aria.match(/^([^.,]+)/);
            if (m) name = m[1].trim();
          }
          if (!name) {
            const lines = (a.innerText || '')
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            name = lines[0] || '';
          }
          const aria = a.getAttribute('aria-label') || '';
          const unread = looksUnread(a, aria);
          const preview = (a.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)[1] || '';
          push(name, href, unread, preview);
        }
        return out.slice(0, 40);
      }, unreadFilterOn);

      const unreadCount = rows.filter((r) => r.unread).length;
      console.log(
        `Inbox scrape (${url}): ${rows.length} conversations, unread=${unreadCount}${unreadFilterOn ? ' [Unread filter]' : ''}`
      );

      if (!rows.length) continue;

      // If Unread filter is on, trust the list. If not and we found 0 unread, try next URL
      // (mwlite often lists chats without unread badges → false 0/N).
      if (unreadFilterOn || unreadCount > 0) return rows;
      console.log('Inbox scrape unreliable (0 unread, no Unread filter) — trying next messaging URL');
    } catch (e) {
      console.error(`Inbox scrape failed ${url}:`, e.message);
    }
  }
  return [];
}

async function updateNotionStatus(id, statusName = STATUS_CONVERSATION, extraProps = {}) {
  await crm.updateStatus(id, statusName, extraProps);
}

/** Always write Processing at (UTC). Used as last-outbound clock for silence. */
async function setProcessingAt(pageIdOrLead, iso = new Date().toISOString()) {
  const pageId = typeof pageIdOrLead === 'string' ? pageIdOrLead : pageIdOrLead.id;
  const label =
    typeof pageIdOrLead === 'string' ? pageIdOrLead : pageIdOrLead.name || pageIdOrLead.id;
  try {
    await crm.setProcessingAt(pageId, iso);
    if (typeof pageIdOrLead === 'object' && pageIdOrLead) {
      pageIdOrLead.processingAt = new Date(iso);
    }
    console.log(`Processing at refreshed (UTC) for ${label}: ${iso}`);
  } catch (e) {
    console.error('setProcessingAt:', e.message);
  }
}

/** Safety net: set Processing at only if missing. */
async function ensureProcessingAt(lead) {
  if (lead.processingAt) return;
  await setProcessingAt(lead);
}

/**
 * Scrape LinkedIn thread with sender direction.
 * Returns [{ text, from, direction: 'inbound'|'outbound'|'unknown' }]
 *
 * mwlite: .member-message + .message-body; class token "self" = outbound, else inbound.
 * Desktop fallback: sender name vs lead name.
 */
async function scrapeThreadMessages(page, leadName = '') {
  try {
    return await page.evaluate((leadName) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const leadN = norm(leadName);
      const leadFirst = leadN.split(/\s+/).filter(Boolean)[0] || '';
      const myNames = ['mykhailo', 'misha', 'waffi'];
      const out = [];

      const pushMsg = (text, from, direction) => {
        const t = (text || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length < 2 || t.length > 4000) return;
        if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(t)) return;
        if (/^(today|yesterday|sun|mon|tue|wed|thu|fri|sat)\b/i.test(t) && t.length < 24) return;
        const prev = out[out.length - 1];
        if (prev && prev.text === t && prev.direction === direction) return;
        out.push({ text: t, from: (from || '').trim(), direction: direction || 'unknown' });
      };

      // --- mwlite / mobile (primary for this agent) ---
      for (const el of Array.from(document.querySelectorAll('.member-message'))) {
        const body = el.querySelector('.message-body');
        if (!body) continue;
        const tokens = String(el.className || '').split(/\s+/).filter(Boolean);
        const isSelf = tokens.includes('self');
        pushMsg(body.innerText || body.textContent, isSelf ? 'Me' : leadName, isSelf ? 'outbound' : 'inbound');
      }
      if (out.length) return out.slice(-40);

      // --- Desktop fallback ---
      const looksLikeLead = (fromN) => {
        if (!fromN || !leadFirst) return false;
        const f0 = fromN.split(/\s+/)[0];
        return (f0 && f0 === leadFirst) || (fromN.includes(leadFirst) && leadFirst.length > 2);
      };
      const looksLikeMe = (fromN) => fromN && myNames.some((n) => fromN.includes(n));
      let currentFrom = '';
      for (const ev of Array.from(
        document.querySelectorAll(
          '.msg-s-message-list__event, li.msg-s-message-list__event, .msg-s-event-listitem'
        )
      )) {
        const nameEl = ev.querySelector(
          '.msg-s-message-group__name, .msg-s-message-group__profile-link, a[data-control-name="view_profile"]'
        );
        if (nameEl) {
          const n = (nameEl.textContent || '').trim();
          if (n) currentFrom = n;
        }
        const fromN = norm(currentFrom);
        let direction = 'unknown';
        if (looksLikeLead(fromN)) direction = 'inbound';
        else if (looksLikeMe(fromN) || currentFrom) direction = 'outbound';
        const bubbles = ev.querySelectorAll(
          '.msg-s-event-listitem__body, .msg-s-message-listitem__message-bubble, [data-event-urn] p, .msg-s-event__content p'
        );
        if (bubbles.length) {
          bubbles.forEach((b) => pushMsg(b.innerText || b.textContent, currentFrom, direction));
        } else {
          const p = ev.querySelector('p');
          if (p) pushMsg(p.innerText || p.textContent, currentFrom, direction);
        }
      }
      return out.slice(-40);
    }, leadName);
  } catch (e) {
    console.error('scrapeThreadMessages:', e.message);
    return [];
  }
}

/** @deprecated use scrapeThreadMessages */
async function scrapeVisibleMessages(page) {
  const rows = await scrapeThreadMessages(page, '');
  return rows.map((r) => r.text);
}

async function pageLooksLikeAuthWall(page) {
  const url = page.url().toLowerCase();
  if (url.includes('authwall')) return true;
  if (/linkedin\.com\/uas\/login|linkedin\.com\/login\b|\/checkpoint\//.test(url)) return true;
  const html = await page.content().catch(() => '');
  if (/pagekey[^"]*auth_wall/i.test(html)) return true;
  if (/<title>\s*sign in \| linkedin\s*<\/title>/i.test(html)) return true;
  // Guest/public soft walls (URL stays on /in/... or /feed/)
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/sign in to connect/i.test(bodyText)) return true;
  if (/browse anonymously/i.test(bodyText)) return true;
  if (/sign in to view/i.test(bodyText)) return true;
  if (/continue with google/i.test(bodyText) && /sign in with email/i.test(bodyText)) return true;
  if (/join now/i.test(bodyText) && /sign in/i.test(bodyText) && !/start a post/i.test(bodyText)) {
    const hasMessageCta = await page.getByRole('button', { name: /^\s*Message\s*$/i }).count().catch(() => 0);
    const hasMsgLink = await page.locator('a[href*="messaging"]').count().catch(() => 0);
    if (hasMessageCta < 1 && hasMsgLink < 1) return true;
  }
  if (/session_redirect|guest_home|auth_wall/i.test(html)) return true;
  return false;
}

async function loginDebugArtifacts(page, tag) {
  try {
    const base = path.join(process.cwd(), `login_debug_${tag}`);
    fs.writeFileSync(`${base}.html`, await page.content());
    await page.screenshot({ path: `${base}.png` });
    console.log(`Login debug dumped: ${base}.html (+ .png)`);
  } catch (_) {}
}

async function dismissLinkedInFullScreenLoader(page) {
  const loader = page.locator('.loader.loader--full-screen, .loader--full-screen').first();
  try {
    await loader.waitFor({ state: 'visible', timeout: 3500 });
  } catch (_) {
    return;
  }
  await loader.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
}

/** Auth-wall pages bundle "Join" + "Sign In"; signup fields can steal generic #password matchers. */
async function revealLinkedInSignInCredentials(page) {
  await dismissLinkedInFullScreenLoader(page);
  const signInForm = page.locator('form[data-id="sign-in-form"]');
  const userInForm = signInForm.locator('input[name="session_key"], input[id$="_session_key"]').first();
  try {
    await userInForm.waitFor({ state: 'visible', timeout: 6000 });
    return true;
  } catch (_) {
    /* continue */
  }
  const fromJoinToggle = page
    .locator('.join-form button.form-toggle, button.authwall-join-form__form-toggle--bottom')
    .filter({ hasText: /^\s*Sign in\s*$/i })
    .first();
  if ((await fromJoinToggle.count()) > 0 && (await fromJoinToggle.isVisible().catch(() => false))) {
    await fromJoinToggle.click({ timeout: 10000 }).catch(() => {});
    await humanRandomDelay(700, 1600);
  }
  await dismissLinkedInFullScreenLoader(page);
  try {
    await userInForm.waitFor({ state: 'visible', timeout: 28000 });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Checkpoint "Floe" after /login redirect: LinkedIn binds the session server-side and only shows
 * a password field (#password[name="session_password"]); email/session_key stay hidden.
 */
async function tryLinkedInCheckpointPasswordOnly(page, browser, statePath) {
  if (!process.env.LINKEDIN_PASSWORD) return false;
  const floeForm = page.locator('form.login__form[action*="floe-profile-submit"]');
  const pwd = floeForm.locator('input#password[name="session_password"]').first();
  try {
    await pwd.waitFor({ state: 'visible', timeout: 14000 });
  } catch (_) {
    return false;
  }
  if ((await floeForm.locator('input[name="session_key"][type="hidden"]').count()) < 1) return false;

  console.log('LinkedIn checkpoint: password-only Floe screen — submitting password.');
  await pwd.click({ timeout: 5000 }).catch(() => {});
  await humanRandomDelay(250, 600);
  await pwd.fill(process.env.LINKEDIN_PASSWORD).catch(async () => {
    await page.keyboard.type(process.env.LINKEDIN_PASSWORD || '', { delay: 35 });
  });

  const submit = floeForm.locator('button[data-litms-control-urn="login-submit"]').first();
  if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
    await submit.click({ timeout: 12000 }).catch(() => {});
  } else {
    await pwd.press('Enter');
  }

  console.log('Checkpoint password sent. Complete any in-app or email verification if LinkedIn asks.');
  await page.waitForTimeout(15000);
  try {
    await page.waitForURL('**/feed/**', { timeout: 180000 });
    console.log('Reached feed after checkpoint password.');
  } catch (_) {
    await page.waitForTimeout(25000);
  }
  await browser.storageState({ path: statePath }).catch(() => {});

  if (page.url().includes('/feed/')) return true;
  if (!(await pageLooksLikeAuthWall(page))) return true;
  return false;
}

/** Try several login URLs / input variants (LinkedIn VPS vs desktop markup differs). */
async function tryAutoLoginLinkedIn(page, browser, statePath) {
  if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) return false;

  const loginUrls = [
    'https://www.linkedin.com/login',
    'https://www.linkedin.com/uas/login?session_redirect=/feed/&fromSignIn=true',
  ];

  const userSelectors = [
    'form[data-id="sign-in-form"] input[name="session_key"]',
    'form[data-id="sign-in-form"] input[id$="_session_key"]',
    'input#session_key',
    'input[id$="_session_key"]',
    'input[name="session_key"]',
    'input#username',
    'input[data-tracking-control-name="login_username_field"]',
    'input[autocomplete="username"]',
    'input[type="email"]',
    'input[type="tel"]',
    'form[action*="login-submit"] input[name="session_key"]',
    'form[action*="login"] input[type="text"]',
    'main input[type="text"]',
    'article input[type="text"]',
  ];
  const passSelectors = [
    'form[data-id="sign-in-form"] input[name="session_password"]',
    'input[name="session_password"]',
    'input[id="session_password"]',
    'input[autocomplete="current-password"]',
    'input#password',
    'input[type="password"]',
    'main input[type="password"]',
    'form[action*="login"] input[type="password"]',
  ];

  async function firstVisible(selectorList, label) {
    for (const s of selectorList) {
      const loc = page.locator(s).first();
      try {
        await loc.waitFor({ state: 'visible', timeout: 8000 });
        const t = await loc.getAttribute('type');
        const name = await loc.getAttribute('name').catch(() => '');
        if (t === 'hidden' || String(name || '').startsWith('_')) continue;
        if (label === 'user' && t === 'password') continue;
        /* Auth-wall "Join" form uses id=password/name=password; prefer real Sign in form when both exist */
        if (label === 'pass' && String(name || '') === 'password') {
          const inSignInForm = await loc.evaluate((el) =>
            !!(el.closest && el.closest('form[data-id="sign-in-form"]'))
          ).catch(() => false);
          const hasSignInForm = (await page.locator('form[data-id="sign-in-form"]').count().catch(() => 0)) > 0;
          if (hasSignInForm && !inSignInForm) continue;
        }
        return loc;
      } catch (_) {
        /* try next */
      }
    }
    return null;
  }

  for (let ui = 0; ui < loginUrls.length; ui++) {
    const loginUrl = loginUrls[ui];
    await page.goto(loginUrl, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await humanRandomDelay(1200, 2200);

    await page.evaluate(() => {
      ['.credentials-picker', '#credential_picker_container', '.is-shown', '[id^="google-one-tap"]', '.google-one-tap__module'].forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });
    });
    await humanRandomDelay(500, 1200);
    if (await tryLinkedInCheckpointPasswordOnly(page, browser, statePath)) return true;
    await revealLinkedInSignInCredentials(page).catch(() => false);

    let userField = null;
    let passField = null;
    const scopedForm = page.locator('form[data-id="sign-in-form"]');
    if ((await scopedForm.count()) > 0) {
      const u = scopedForm.locator('input[name="session_key"], input[id*="_session_key"]').first();
      const p = scopedForm.locator('input[name="session_password"]').first();
      try {
        await u.waitFor({ state: 'visible', timeout: 28000 });
        await p.waitFor({ state: 'visible', timeout: 15000 });
        userField = u;
        passField = p;
      } catch (_) {
        userField = null;
        passField = null;
      }
    }

    if (!userField || !passField) {
      userField = await firstVisible(userSelectors, 'user');
      passField = userField ? await firstVisible(passSelectors, 'pass') : null;
    }

    if (!userField || !passField) {
      console.log(`Login form fields not resolved (try ${ui + 1}/${loginUrls.length})`);
      continue;
    }

    await userField.click({ timeout: 5000 }).catch(() => {});
    await humanRandomDelay(200, 500);
    await userField.fill(process.env.LINKEDIN_EMAIL).catch(async () => {
      await userField.click({ timeout: 2000 }).catch(() => {});
      await page.keyboard.type(process.env.LINKEDIN_EMAIL || '', { delay: 35 });
    });
    await humanRandomDelay(350, 800);
    await passField.click({ timeout: 5000 }).catch(() => {});
    await passField.fill(process.env.LINKEDIN_PASSWORD).catch(async () => {
      await page.keyboard.type(process.env.LINKEDIN_PASSWORD || '', { delay: 35 });
    });

    let submitted = false;
    const submitCandidates = [
      page.locator('form[data-id="sign-in-form"] button[data-id="sign-in-form__submit-btn"]').first(),
      page.locator('form[data-id="sign-in-form"] button[type="submit"]').first(),
      page.locator('button[data-id="sign-in-form__submit-btn"]').first(),
      page.locator('form[action*="login-submit"]:not(.join-form) button[type="submit"]').first(),
      page.locator('button[type="submit"]').first(),
      page.locator('.btn-primary, button.artdeco-button--primary').first(),
      page.locator('input[type="submit"]').first(),
    ];
    for (const b of submitCandidates) {
      try {
        if ((await b.count()) > 0 && (await b.isVisible())) {
          await b.click({ timeout: 8000 }).catch(() => {});
          submitted = true;
          break;
        }
      } catch (_) { /* next */ }
    }
    if (!submitted) await passField.press('Enter');

    console.log('Login submitted. PLEASE CONFIRM ON YOUR PHONE NOW (2FA)...');
    await page.waitForTimeout(15000);
    try {
      await page.waitForURL('**/feed/**', { timeout: 180000 });
      console.log('Login successful!');
    } catch (_) {
      await page.waitForTimeout(20000);
    }
    await browser.storageState({ path: statePath }).catch(() => {});

    const stillWall = await pageLooksLikeAuthWall(page);
    if (!stillWall) return true;
    await loginDebugArtifacts(page, `post_try_${ui}`);
  }

  await loginDebugArtifacts(page, 'login_failed_all_attempts');
  return false;
}

async function absoluteLinkedInHref(href) {
  if (!href || href.startsWith('javascript')) return null;
  if (href.startsWith('http')) return href;
  return `https://www.linkedin.com${href.startsWith('/') ? href : '/' + href}`;
}

async function extractProfileRecipientId(page) {
  return page
    .evaluate(() => {
      const html = document.documentElement.innerHTML;
      const patterns = [
        /"profileUrn":"(urn:li:fsd_profile:[^"]+)"/,
        /"entityUrn":"(urn:li:fsd_profile:[^"]+)"/,
        /(urn:li:fsd_profile:[A-Za-z0-9_-]+)/,
        /(urn:li:member:\d+)/,
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m) return m[1];
      }
      const a = document.querySelector('a[href*="messaging/compose"][href*="recipient="]');
      if (a) {
        try {
          return new URL(a.href, location.origin).searchParams.get('recipient');
        } catch {
          return null;
        }
      }
      return null;
    })
    .catch(() => null);
}

/** Open DM composer from profile (mobile CTA + compose URL + mwlite fallbacks). */
async function openMessageComposerFromProfile(page, lead = {}) {
  // Message CTA is often below the fold on mobile profiles
  await page.mouse.wheel(0, 700).catch(() => {});
  await page.waitForTimeout(900);

  const locators = [
    () => page.locator('a[href*="messaging/compose"]').first(),
    () => page.locator('a[href*="/mailbox/compose"]').first(),
    () => page.locator('a[href*="messaging/thread/"]').first(),
    () => page.getByRole('link', { name: /^\s*Message\s*$/i }).first(),
    () => page.getByRole('button', { name: /^\s*Message\s*$/i }).first(),
    () => page.getByRole('button', { name: /send message/i }).first(),
    () => page.locator('[data-test-icon="send-privately"]').first(),
    () => page.locator('[data-control-name*="message"]').first(),
    () => page.locator('button:has-text("Message")').first(),
    () => page.locator('a:has-text("Message")').first(),
    () => page.locator('span:has-text("Message")').first(),
  ];
  for (const getLoc of locators) {
    const loc = getLoc();
    if ((await loc.count().catch(() => 0)) < 1) continue;
    if (!(await loc.isVisible().catch(() => false))) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      if (!(await loc.isVisible().catch(() => false))) continue;
    }
    const href = await loc.getAttribute('href').catch(() => null);
    const target = await absoluteLinkedInHref(href);
    if (target && /messaging|mailbox/i.test(target)) {
      console.log('Navigating to:', target);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(2500);
      return { ok: true, composeHref: target };
    }
    await loc.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    return { ok: true, composeHref: page.url() };
  }

  const recipient = await extractProfileRecipientId(page);
  const slug =
    (lead.url || page.url() || '')
      .replace(/\/+$/, '')
      .split('/in/')
      .pop()
      ?.split(/[/?#]/)[0] || '';

  const fallbacks = [];
  if (recipient) {
    const enc = encodeURIComponent(recipient);
    fallbacks.push(`https://www.linkedin.com/messaging/compose/?recipient=${enc}`);
    fallbacks.push(`https://www.linkedin.com/mwlite/message/compose/?profileUrn=${enc}`);
  }
  if (slug) {
    fallbacks.push(`https://www.linkedin.com/mwlite/profile/in/${encodeURIComponent(slug)}`);
  }

  for (const url of fallbacks) {
    console.log('Compose fallback:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000);
    if (/messaging|message\/compose|mailbox/i.test(page.url())) {
      return { ok: true, composeHref: page.url() };
    }
    if (/mwlite\/profile/i.test(url)) {
      const msg = page.getByRole('link', { name: /^\s*Message\s*$/i }).first();
      if (await msg.isVisible().catch(() => false)) {
        const href = await msg.getAttribute('href').catch(() => null);
        const target = await absoluteLinkedInHref(href);
        if (target) {
          await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
          await page.waitForTimeout(2500);
          return { ok: true, composeHref: target };
        }
        await msg.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
        return { ok: true, composeHref: page.url() };
      }
    }
  }

  return { ok: false, composeHref: null };
}

function composeUrlHasRecipient(url = '') {
  return /[?&](recipient|profileUrn)=/i.test(url);
}

async function pageLooksLikeLinkedInError(page) {
  const t = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 1500);
  return /something went wrong|give it another try|it.?s not you\.? it.?s us/i.test(t);
}

/** Send DM via Voyager (mobile compose?recipient= often shows "Something went wrong"). */
async function sendVoyagerDirectMessage(page, recipientUrn, text) {
  const urn = String(recipientUrn || '').trim();
  const bodyText = String(text || '').trim();
  if (!urn || !bodyText) return { ok: false, reason: 'missing_urn_or_text' };

  const result = await page
    .evaluate(async ({ urn, bodyText }) => {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)JSESSIONID=([^;]+)/);
      const csrf = csrfMatch
        ? decodeURIComponent(csrfMatch[1]).replace(/^"|"$/g, '')
        : '';
      if (!csrf) return { ok: false, reason: 'no_csrf' };

      const headers = {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'content-type': 'application/json; charset=UTF-8',
        'csrf-token': csrf,
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
      };

      const attempts = [];
      const payloads = [
        {
          label: 'messaging_conversations_create',
          url: '/voyager/api/messaging/conversations?action=create',
          body: {
            keyVersion: 'LEGACY_INBOX',
            conversationCreate: {
              eventCreate: {
                value: {
                  'com.linkedin.voyager.messaging.create.MessageCreate': {
                    attributedBody: { text: bodyText, attributes: [] },
                    attachments: [],
                  },
                },
              },
              recipients: [urn],
              subtype: 'MEMBER_TO_MEMBER',
            },
          },
        },
        {
          label: 'dash_createMessage',
          url: '/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage',
          body: {
            mailboxUrn: 'urn:li:fsd_profile:me',
            messageCreate: {
              conversationCreateFromParticipants: {
                participants: [urn],
              },
              body: {
                text: bodyText,
                attributes: [],
              },
            },
          },
        },
        {
          label: 'dash_create_conversation',
          url: '/voyager/api/voyagerMessagingDashCreateNewChat?action=createNewChat',
          body: {
            conversationCreateFromParticipants: {
              participants: [urn],
            },
            message: {
              body: { text: bodyText, attributes: [] },
            },
          },
        },
      ];

      for (const p of payloads) {
        try {
          const res = await fetch(p.url, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify(p.body),
          });
          const raw = await res.text();
          attempts.push({
            label: p.label,
            status: res.status,
            raw: raw.slice(0, 220),
          });
          if (res.status >= 200 && res.status < 300) {
            return { ok: true, label: p.label, status: res.status, attempts };
          }
        } catch (e) {
          attempts.push({ label: p.label, error: String(e && e.message ? e.message : e) });
        }
      }
      return { ok: false, reason: 'all_endpoints_failed', attempts };
    }, { urn, bodyText })
    .catch((e) => ({ ok: false, reason: String(e.message || e) }));

  if (result?.ok) {
    console.log(`Voyager DM OK via ${result.label} (${bodyText.length} chars)`);
  } else {
    console.log(
      `Voyager DM failed: ${result?.reason || 'unknown'} ${JSON.stringify(result?.attempts || result).slice(0, 500)}`
    );
  }
  return result;
}

async function findMessageBox(page) {
  const selectors = [
    'textarea#messaging-reply',
    '.msg-form__contenteditable',
    'div.msg-form__contenteditable[contenteditable="true"]',
    '.msg-form__msg-content-container [contenteditable="true"]',
    '.msg-form [contenteditable="true"]',
    'form.msg-form [contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][aria-label*="message" i]',
    'div[contenteditable="true"][aria-label*="Write" i]',
    'div[contenteditable="true"]',
    'textarea[name="message"]',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="Write" i]',
    '.compose-form__message-field',
    '[data-artdeco-is-focused="true"][contenteditable="true"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count().catch(() => 0)) < 1) continue;
    await loc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (await loc.isVisible().catch(() => false)) return loc;
  }
  return null;
}

/** After Send, LinkedIn briefly rebuilds the composer — retry instead of failing mid-split. */
async function findMessageBoxWithRetry(page, { attempts = 10, gapMs = 700 } = {}) {
  for (let i = 0; i < attempts; i++) {
    // Nudge mobile/desktop composer into focus if recipient chip is already set
    if (i === 2 || i === 6) {
      const nudge = page
        .locator(
          '.msg-form__contenteditable, .msg-form, [aria-label*="Write a message" i], [placeholder*="Write a message" i], [data-placeholder*="message" i]'
        )
        .first();
      if (await nudge.isVisible().catch(() => false)) {
        await nudge.click({ force: true }).catch(() => {});
      }
      await page.keyboard.press('Tab').catch(() => {});
    }
    const box = await findMessageBox(page);
    if (box) return box;
    await page.waitForTimeout(gapMs);
  }
  return null;
}

/** Read display name from profile page (full name beats truncated Notion "Riley A."). */
async function scrapeProfileDisplayName(page) {
  const selectors = [
    'h1.text-heading-xlarge',
    'h1.inline.t-24',
    '.pv-text-details__left-panel h1',
    'main h1',
    '[data-anonymize="person-name"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: 'visible', timeout: 3000 });
      const text = (await loc.textContent()).replace(/\s+/g, ' ').trim();
      if (text.length > 2) return text;
    } catch (_) { /* next */ }
  }
  return null;
}

async function composeAlreadyHasRecipient(page) {
  const chip = page.locator(
    '.msg-connections-typeahead__added-recipients li, .msg-form__recipients .presence-entity, .msg-form__recipients img, .compose-recipient__name'
  ).first();
  return chip.isVisible().catch(() => false);
}

function profileSlugFromUrl(url) {
  const m = String(url || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).replace(/\/$/, '').toLowerCase() : '';
}

function isAbbreviatedLastName(token) {
  return /^[a-z]\.?$/i.test(String(token || '').trim());
}

/** Name tokens for matching — keep single-letter initials like "M." */
function nameMatchParts(displayName) {
  return String(displayName || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Typeahead rows are "Name 1st Headline…" — cut before connection degree. */
function optionNameTokens(blob) {
  const raw = String(blob || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const cut = raw.search(/\b(?:1st|2nd|3rd)\b/);
  const namePart = (cut >= 0 ? raw.slice(0, cut) : raw).trim();
  return namePart.split(/\s+/).filter(Boolean);
}

function typeaheadSearchQuery(displayName) {
  const parts = nameMatchParts(displayName);
  if (!parts.length) return '';
  // "Kevin M." → type "Kevin M" (initial helps LinkedIn filter; period often hurts)
  if (parts.length >= 2 && isAbbreviatedLastName(parts[parts.length - 1])) {
    return `${parts[0]} ${parts[parts.length - 1].replace(/\./g, '')}`;
  }
  const significant = parts.filter((p) => p.length > 1 || isAbbreviatedLastName(p));
  if (significant.length >= 2) return `${significant[0]} ${significant[significant.length - 1]}`;
  return parts.slice(0, 2).join(' ');
}

/** Watch typeahead XHR/JSON for publicIdentifier === profile slug (DOM often has no /in/ href). */
function installTypeaheadSlugWatcher(page, slug) {
  const want = String(slug || '').toLowerCase().replace(/\/$/, '');
  const found = [];
  if (!want) {
    return { found, dispose() {}, best() { return null; } };
  }

  const onResponse = async (res) => {
    try {
      const u = res.url();
      if (!/linkedin\.com\/(voyager\/api|flagship-web)/i.test(u) && !/typeahead|Typeahead/i.test(u)) return;
      if (res.status() !== 200) return;
      const ct = String(res.headers()['content-type'] || '');
      if (ct && !/json|javascript/i.test(ct)) return;
      const data = await res.json().catch(() => null);
      if (!data) return;
      const raw = JSON.stringify(data);
      if (!raw.toLowerCase().includes(want)) return;
      console.log(`Typeahead network: slug sighted in ${u.slice(0, 120)}`);
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const x of node) visit(x);
          return;
        }
        const pid = node.publicIdentifier || node.vanityName || node.public_id;
        if (pid && String(pid).toLowerCase().replace(/\/$/, '') === want) {
          const title =
            (typeof node.title === 'object' && node.title?.text) ||
            (typeof node.title === 'string' && node.title) ||
            node.name ||
            [node.firstName, node.lastName].filter(Boolean).join(' ') ||
            '';
          const secondary =
            (typeof node.subtitle === 'object' && node.subtitle?.text) ||
            node.subtitle ||
            node.headline ||
            node.secondaryText ||
            '';
          const urn =
            node.entityUrn ||
            node.objectUrn ||
            node.profileUrn ||
            (typeof node['*profile'] === 'string' ? node['*profile'] : '') ||
            '';
          found.push({
            publicIdentifier: String(pid),
            title: String(title || '').replace(/\s+/g, ' ').trim(),
            secondary: String(secondary || '').replace(/\s+/g, ' ').trim(),
            urn: String(urn || '').trim(),
          });
        }
        for (const v of Object.values(node)) visit(v);
      };
      visit(data);
    } catch (_) {
      /* ignore non-json / aborted */
    }
  };
  page.on('response', onResponse);
  return {
    found,
    dispose() {
      page.off('response', onResponse);
    },
    best() {
      return found.find((h) => h.urn) || found[0] || null;
    },
  };
}

function companyMatchWords(company) {
  return String(company || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 3 && !/^(llc|inc|ltd|the|and|with|from|company|group)$/i.test(w));
}

/** Pick typeahead row that matches first + last name — never blind ArrowDown+Enter (wrong person). */
async function pickTypeaheadRecipient(
  page,
  displayName,
  { profileUrl = '', company = '', preferredTitle = '', preferredSecondary = '' } = {}
) {
  const parts = nameMatchParts(displayName);
  if (parts.length === 0) return false;
  const first = parts[0].toLowerCase();
  const last = parts[parts.length - 1].toLowerCase();
  const lastCore = last.replace(/\./g, '');
  const abbrevLast = parts.length >= 2 && isAbbreviatedLastName(parts[parts.length - 1]);
  const slug = profileSlugFromUrl(profileUrl);
  const companyWords = companyMatchWords(company);
  const prefTitle = String(preferredTitle || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const prefSecondary = String(preferredSecondary || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  await page.waitForTimeout(2500);
  const options = page.locator(
    '.msg-connections-typeahead__search-result, .basic-typeahead__selectable, [role="option"], .msg-connections-typeahead__search-results li'
  );
  const count = await options.count().catch(() => 0);

  async function optionHref(i) {
    const opt = options.nth(i);
    const fromA = await opt.locator('a[href*="/in/"]').first().getAttribute('href').catch(() => '');
    if (fromA) return String(fromA);
    const own = await opt.getAttribute('href').catch(() => '');
    if (own) return String(own);
    const html = (await opt.innerHTML().catch(() => '')) || '';
    const m = html.match(/linkedin\.com\/in\/([^"'/?#\s]+)/i) || html.match(/\/in\/([^"'/?#\s]+)/i);
    return m ? `/in/${decodeURIComponent(m[1])}` : '';
  }

  async function optionBlob(i) {
    const text = ((await options.nth(i).textContent()) || '').replace(/\s+/g, ' ').trim();
    const aria = (await options.nth(i).getAttribute('aria-label').catch(() => '')) || '';
    return { text, aria, blob: `${text} ${aria}`.toLowerCase().replace(/\s+/g, ' ').trim() };
  }

  async function clickOption(i, reason) {
    const { text, aria } = await optionBlob(i);
    console.log(`Typeahead ${reason}: "${(text || aria).slice(0, 100)}" for "${displayName}"`);
    await options.nth(i).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  }

  if (count >= 1) {
    const raw0 = ((await options.nth(0).textContent()) || '').replace(/\s+/g, ' ').trim();
    const aria0 = (await options.nth(0).getAttribute('aria-label').catch(() => '')) || '';
    const href0 = (await optionHref(0)).slice(0, 80);
    console.log(
      `Typeahead options=${count} first="${raw0.slice(0, 80)}" aria="${aria0.slice(0, 80)}" href0="${href0}"${slug ? ` slug=${slug}` : ''}${prefTitle ? ` net="${prefTitle.slice(0, 40)}"` : ''}`
    );
  }

  // 1) Exact LinkedIn slug in option link/markup
  if (slug) {
    for (let i = 0; i < count; i++) {
      const href = (await optionHref(i)).toLowerCase();
      if (href.includes(`/in/${slug}`) || href.includes(`/in/${encodeURIComponent(slug)}`)) {
        return clickOption(i, `slug match ${slug}`);
      }
    }
  }

  // 2) Network typeahead hit — match displayed name / headline to a row
  if (prefTitle) {
    const prefTokens = optionNameTokens(prefTitle);
    for (let i = 0; i < count; i++) {
      const { blob } = await optionBlob(i);
      const nameTokens = optionNameTokens(blob);
      if (!nameTokens.length) continue;
      const nameJoined = nameTokens.join(' ');
      if (prefTitle.includes(nameJoined) || nameJoined.includes(prefTokens.slice(0, 2).join(' '))) {
        if (prefTokens[0] && nameTokens[0] === prefTokens[0]) {
          return clickOption(i, `network title match`);
        }
      }
      // Same first token + shared secondary (company/headline) from API
      if (prefSecondary && nameTokens[0] === first) {
        const secWords = companyMatchWords(prefSecondary);
        if (secWords.some((w) => blob.includes(w))) {
          return clickOption(i, `network secondary match`);
        }
      }
    }
  }

  // Sole result after typing
  if (count === 1) {
    const { text, aria, blob } = await optionBlob(0);
    const looksEmpty = blob.length < 2 || /no result|nobody|try again/i.test(blob);
    if (!looksEmpty) {
      return clickOption(0, 'sole match');
    }
  }

  // Company from CRM/enrich when name is abbreviated / ambiguous
  if (companyWords.length && first) {
    const companyHits = [];
    for (let i = 0; i < count; i++) {
      const { blob } = await optionBlob(i);
      const nameTokens = optionNameTokens(blob);
      if (nameTokens[0] !== first) continue;
      const hits = companyWords.filter((w) => blob.includes(w)).length;
      if (hits > 0) companyHits.push({ i, hits });
    }
    companyHits.sort((a, b) => b.hits - a.hits);
    if (companyHits.length === 1 || (companyHits.length > 1 && companyHits[0].hits > companyHits[1].hits)) {
      return clickOption(companyHits[0].i, `company match (${companyWords.slice(0, 3).join(',')})`);
    }
  }

  const strongAbbrev = []; // last name starts with initial
  const weakAbbrev = []; // middle initial only
  for (let i = 0; i < count; i++) {
    const { blob } = await optionBlob(i);
    if (!blob) continue;
    const nameTokens = optionNameTokens(blob);
    if (!nameTokens.length) continue;
    const hasFirst = nameTokens[0] === first || nameTokens.includes(first);
    if (!hasFirst) continue;

    if (parts.length === 1) {
      return clickOption(i, 'match');
    }

    const nameLast = (nameTokens[nameTokens.length - 1] || '').replace(/[^a-z]/gi, '');

    if (!abbrevLast && (nameTokens.includes(last) || nameLast === last.replace(/[^a-z]/gi, ''))) {
      return clickOption(i, 'match');
    }

    if (abbrevLast && lastCore) {
      const hasMiddleInitial = nameTokens.slice(1, -1).some((t) => t.replace(/\./g, '') === lastCore);
      if (nameLast.startsWith(lastCore)) strongAbbrev.push(i);
      else if (hasMiddleInitial) weakAbbrev.push(i);
    }
  }
  if (strongAbbrev.length === 1) {
    return clickOption(strongAbbrev[0], 'abbrev-last match');
  }
  if (strongAbbrev.length === 0 && weakAbbrev.length === 1) {
    return clickOption(weakAbbrev[0], 'abbrev-middle match');
  }
  if (strongAbbrev.length > 1 || weakAbbrev.length > 1) {
    console.log(
      `Typeahead: ambiguous abbrev for "${displayName}" strong=${strongAbbrev.length} weak=${weakAbbrev.length} — need slug/network`
    );
  }

  if (parts.length >= 2 && !abbrevLast) {
    const second = parts[1].toLowerCase();
    for (let i = 0; i < count; i++) {
      const { blob } = await optionBlob(i);
      const nameTokens = optionNameTokens(blob);
      if (nameTokens.includes(first) && nameTokens.includes(second)) {
        return clickOption(i, 'partial match');
      }
    }
  }

  if (abbrevLast && first) {
    const firstHits = [];
    for (let i = 0; i < count; i++) {
      const { blob } = await optionBlob(i);
      const nameTokens = optionNameTokens(blob);
      if (nameTokens[0] === first) firstHits.push(i);
    }
    if (firstHits.length === 1) {
      return clickOption(firstHits[0], 'sole first-name');
    }
  }

  for (let i = 0; i < Math.min(count, 6); i++) {
    const { blob } = await optionBlob(i);
    console.log(`  opt[${i}] name="${optionNameTokens(blob).join(' ')}" blob="${blob.slice(0, 70)}"`);
  }
  console.log(`Typeahead: no confident match for "${displayName}" (${count} options)${slug ? ` slug=${slug}` : ''} — aborting send`);
  return false;
}

/** Resolve profile slug → messaging recipient URN via Voyager (no /in/ navigation). */
async function resolveRecipientUrnForSlug(page, { slug, query = '' } = {}) {
  const want = String(slug || '')
    .toLowerCase()
    .replace(/\/$/, '');
  if (!want) return null;

  const result = await page
    .evaluate(async ({ wantSlug, queryText }) => {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)JSESSIONID=([^;]+)/);
      const csrf = csrfMatch
        ? decodeURIComponent(csrfMatch[1]).replace(/^"|"$/g, '')
        : '';
      if (!csrf) return { ok: false, reason: 'no_csrf' };

      const headers = {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrf,
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
      };

      async function getJson(url) {
        try {
          const r = await fetch(url, { headers, credentials: 'include' });
          const text = await r.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            return { status: r.status, raw: text.slice(0, 180) };
          }
          return { status: r.status, json };
        } catch (e) {
          return { status: 0, error: String(e && e.message ? e.message : e) };
        }
      }

      function walk(node, out) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const x of node) walk(x, out);
          return;
        }
        const pid = node.publicIdentifier || node.vanityName || node.public_id;
        const urn =
          node.entityUrn ||
          node.objectUrn ||
          node.profileUrn ||
          (typeof node['*profile'] === 'string' ? node['*profile'] : '') ||
          '';
        if (
          pid &&
          String(pid).toLowerCase().replace(/\/$/, '') === wantSlug
        ) {
          const firstName = String(node.firstName || node.localizedFirstName || '').trim();
          const lastName = String(node.lastName || node.localizedLastName || '').trim();
          const title =
            (typeof node.title === 'object' && node.title?.text) ||
            node.title ||
            [firstName, lastName].filter(Boolean).join(' ') ||
            '';
          out.push({
            publicIdentifier: String(pid),
            urn: urn && /urn:li:(fsd_profile|member):/i.test(String(urn)) ? String(urn) : '',
            firstName,
            lastName,
            title: String(title || '').replace(/\s+/g, ' ').trim(),
          });
        }
        for (const v of Object.values(node)) walk(v, out);
      }

      const hits = [];
      const urls = [
        `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(wantSlug)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.TopCardSupplementary-128`,
        `/voyager/api/identity/profiles/${encodeURIComponent(wantSlug)}`,
        `/voyager/api/identity/profiles/${encodeURIComponent(wantSlug)}/profileContactInfo`,
      ];
      if (queryText) {
        urls.push(
          `/voyager/api/voyagerMessagingTypeaheadHits?q=typeaheadHits&typeaheadKeyword=${encodeURIComponent(queryText)}&count=12`
        );
        urls.push(
          `/voyager/api/search/dash/clusters?q=all&query=(keywords:${encodeURIComponent(queryText)})&origin=GLOBAL_SEARCH_HEADER&start=0&count=10`
        );
      }

      const attempts = [];
      for (const url of urls) {
        const res = await getJson(url);
        attempts.push({ url: url.slice(0, 100), status: res.status });
        if (res.json) walk(res.json, hits);
        // Prefer a hit that has lastName or urn
        if (hits.some((h) => h.lastName || h.urn)) break;
      }
      return { ok: hits.length > 0, hits, attempts };
    }, { wantSlug: want, queryText: String(query || '').trim() })
    .catch((e) => ({ ok: false, reason: String(e.message || e) }));

  if (!result?.ok) {
    console.log(
      `Voyager identity miss for ${want}: ${result?.reason || 'no hit'} attempts=${JSON.stringify(result?.attempts || []).slice(0, 300)}`
    );
    return null;
  }
  const hit =
    result.hits.find((h) => h.lastName && h.lastName.length > 1) ||
    result.hits.find((h) => h.urn) ||
    result.hits[0];
  const fullName = [hit.firstName, hit.lastName].filter(Boolean).join(' ').trim() || hit.title || '';
  console.log(
    `Voyager identity: ${want} name="${fullName}" urn=${(hit.urn || '').slice(0, 60)}`
  );
  return {
    urn: hit.urn || '',
    firstName: hit.firstName || '',
    lastName: hit.lastName || '',
    fullName,
    title: hit.title || '',
  };
}

function isAbbreviatedPersonName(name) {
  const parts = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (parts.length < 2) return false;
  return /^[a-z]\.?$/i.test(parts[parts.length - 1]);
}

/** Open compose via Messaging (avoids /in/ public profile which often kills VPS sessions). */
async function openComposeByRecipientName(page, displayName, { profileUrl = '', company = '' } = {}) {
  const slug = profileSlugFromUrl(profileUrl);
  let workingName = String(displayName || '').trim();
  let recipientUrn = '';
  const urls = [
    'https://www.linkedin.com/messaging/compose/',
    'https://www.linkedin.com/messaging/',
  ];
  for (const url of urls) {
    console.log('Compose-by-name:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await humanRandomDelay(2500, 4000);
    if (await pageLooksLikeAuthWall(page)) {
      console.log('Auth wall on messaging — abort compose-by-name');
      const { markSessionDead } = await import('./sessionHealth.js');
      markSessionDead('auth_wall_on_messaging', { url: page.url() });
      return { ok: false, composeHref: null };
    }

    // Expand "Kevin M." → full name via Voyager (Apify sometimes truncates last names)
    if (slug && isAbbreviatedPersonName(workingName)) {
      const identity = await resolveRecipientUrnForSlug(page, {
        slug,
        query: typeaheadSearchQuery(workingName) || workingName,
      });
      if (identity?.fullName && !isAbbreviatedPersonName(identity.fullName)) {
        console.log(`Expanded abbreviated name: "${workingName}" → "${identity.fullName}"`);
        workingName = identity.fullName;
      } else if (identity?.lastName && identity.lastName.length > 1) {
        const expanded = `${identity.firstName || workingName.split(/\s+/)[0]} ${identity.lastName}`.trim();
        console.log(`Expanded abbreviated name: "${workingName}" → "${expanded}"`);
        workingName = expanded;
      }
      if (identity?.urn) recipientUrn = identity.urn;
    } else if (slug) {
      const identity = await resolveRecipientUrnForSlug(page, {
        slug,
        query: typeaheadSearchQuery(workingName) || workingName,
      });
      if (identity?.urn) recipientUrn = identity.urn;
    }

    const newBtns = [
      page.getByRole('button', { name: /new message|compose|start a (new )?conversation/i }).first(),
      page.locator('a[href*="messaging/compose"], button.msg-conversations-container__compose-btn').first(),
    ];
    for (const b of newBtns) {
      if (await b.isVisible().catch(() => false)) {
        await b.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
        break;
      }
    }

    const toField = page
      .locator(
        'input[placeholder*="name" i], input#message-to, .msg-connections-typeahead__search-field input, input[aria-label*="name" i]'
      )
      .first();
    if (!(await toField.isVisible().catch(() => false))) continue;

    const watcher = installTypeaheadSlugWatcher(page, slug);
    try {
      await toField.click({ timeout: 5000 }).catch(() => {});
      await toField.fill('');
      const shortName = typeaheadSearchQuery(workingName) || workingName;
      console.log(`Compose typeahead query: "${shortName}" (from "${workingName}")`);
      await toField.type(shortName, { delay: 70 + Math.floor(Math.random() * 40) });
      await page.waitForTimeout(2800);
      const net = watcher.best();
      if (net) {
        console.log(
          `Typeahead network hit: id=${net.publicIdentifier} title="${(net.title || '').slice(0, 60)}" secondary="${(net.secondary || '').slice(0, 60)}" urn=${(net.urn || '').slice(0, 80)}`
        );
        if (net.urn) recipientUrn = net.urn;
      } else if (slug) {
        console.log(`Typeahead network: no publicIdentifier=${slug} in responses yet`);
      }

      const pickOpts = {
        profileUrl,
        company,
        preferredTitle: net?.title || workingName,
        preferredSecondary: net?.secondary || '',
      };
      if (!(await pickTypeaheadRecipient(page, workingName, pickOpts))) {
        await page.keyboard.press('ArrowDown').catch(() => {});
        await page.waitForTimeout(400);
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1500);
        if (await composeAlreadyHasRecipient(page)) {
          console.log('Compose recipient set via keyboard fallback');
          return {
            ok: true,
            composeHref: page.url(),
            profileName: workingName,
            recipientUrn,
          };
        }
        const parts = nameMatchParts(workingName).filter((p) => p.length > 1);
        if (parts.length >= 2 && shortName !== `${parts[0]} ${parts[1]}`) {
          await toField.fill('');
          await toField.type(`${parts[0]} ${parts[1]}`, { delay: 70 });
          await page.waitForTimeout(2800);
          const net2 = watcher.best();
          if (
            await pickTypeaheadRecipient(page, workingName, {
              ...pickOpts,
              preferredTitle: net2?.title || pickOpts.preferredTitle,
              preferredSecondary: net2?.secondary || pickOpts.preferredSecondary,
            })
          ) {
            return {
              ok: true,
              composeHref: page.url(),
              profileName: workingName,
              recipientUrn: net2?.urn || recipientUrn,
            };
          }
        }
        // Last resort: Voyager API DM (often 403 when messaging is restricted)
        if (recipientUrn) {
          console.log('Typeahead miss — will try Voyager DM fallback with resolved URN');
          return {
            ok: true,
            composeHref: page.url(),
            profileName: workingName,
            recipientUrn,
            preferVoyagerDm: true,
          };
        }
        console.log(`Compose-by-name: typeahead miss for "${workingName}"`);
        return { ok: false, composeHref: null };
      }
      return {
        ok: true,
        composeHref: page.url(),
        profileName: workingName,
        recipientUrn,
      };
    } finally {
      watcher.dispose();
    }
  }
  return { ok: false, composeHref: null };
}

async function reinjectCookiesIfNeeded(browser, page) {
  const hasAt = (await browser.cookies()).some((c) => c.name === 'li_at' && c.value);
  if (hasAt) return true;
  console.log('li_at missing in live jar — reinjecting cookies.json before DM...');
  await loadCookies(browser);
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await humanRandomDelay(3000, 5000);
  const ok =
    (await browser.cookies()).some((c) => c.name === 'li_at' && c.value) &&
    !(await pageLooksLikeAuthWall(page));
  console.log(`Cookie reinject ${ok ? 'OK' : 'FAILED'}`);
  return ok;
}

// Sends a single LinkedIn DM to a lead. Returns true on success, false otherwise.
async function sendMessageToLead(page, browser, statePath, lead) {
    console.log(`Target: ${lead.name} (${lead.url})`);
    try {
        await reinjectCookiesIfNeeded(browser, page);

        // Prefer messaging compose by name — /in/ public profiles kill li_at on this VPS.
        let composeMeta = await openComposeByRecipientName(page, lead.name, {
          profileUrl: lead.url || '',
          company: lead.company || lead.headline || '',
        });
        if (!composeMeta.ok) {
          if (process.env.ALLOW_PROFILE_DM_FALLBACK === '1') {
            console.log('Compose-by-name failed — falling back to profile Message CTA...');
          } else {
            console.log('Compose-by-name failed — skip profile fallback (set ALLOW_PROFILE_DM_FALLBACK=1 to enable).');
            return false;
          }
          const loadProfileAndCompose = async () => {
            console.log(`Navigating to profile: ${lead.url}`);
            await page.goto(lead.url, { waitUntil: 'load', timeout: 90000 });
            await humanRandomDelay(5000, 7000);
            await page.screenshot({ path: `debug_profile_${lead.name.replace(/\s+/g, '_')}.png` });
            fs.writeFileSync(`debug_profile_${lead.name.replace(/\s+/g, '_')}.html`, await page.content());

            // Never click app-promo "Continue"
            const dismiss = page.locator('[aria-label="Dismiss"], [aria-label="Close"], .promo__dismiss, button[data-action="dismiss"]').first();
            if (await dismiss.isVisible().catch(() => false)) {
              await dismiss.click({ force: true }).catch(() => {});
              await page.waitForTimeout(1500);
            }

            if (await pageLooksLikeAuthWall(page)) {
                if (!autoLoginAllowed()) {
                  console.log('Auth wall on profile — skipping password login (ALLOW_AUTO_LOGIN!=1).');
                  throw new Error('Auth wall on profile and auto-login disabled');
                }
                console.log('Auth wall detected on profile — re-logging...');
                await tryAutoLoginLinkedIn(page, browser, statePath);
                await page.goto(lead.url, { waitUntil: 'load', timeout: 90000 });
                await humanRandomDelay(4000, 6000);
                if (await pageLooksLikeAuthWall(page)) return false;
            }

            const profileName = await scrapeProfileDisplayName(page);
            if (profileName) console.log(`Profile display name: ${profileName}`);

            console.log('Searching for Message entry...');
            const opened = await openMessageComposerFromProfile(page, lead);
            if (!opened.ok) {
                console.log('Message entry not found. Skipping...');
                return false;
            }
            return { profileName, composeHref: opened.composeHref };
          };

          composeMeta = await loadProfileAndCompose();
          if (!composeMeta) return false;
        }

        const displayName = composeMeta.profileName || lead.name;

        await humanRandomDelay(2000, 4000);

        const dismissMsg = page.locator('[aria-label="Dismiss"], [aria-label="Close"], button[data-action="dismiss"]').first();
        if (await dismissMsg.isVisible().catch(() => false)) {
            await dismissMsg.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);
        }

        const composeUrl = page.url();
        const recipientPreset =
          (await composeAlreadyHasRecipient(page)) ||
          (!!(await findMessageBox(page)) &&
            (composeUrlHasRecipient(composeMeta.composeHref || '') || composeUrlHasRecipient(composeUrl)));

        const toField = page.locator('input[placeholder*="name"], input#message-to, .msg-connections-typeahead__search-field input').first();
        if (composeMeta.preferVoyagerDm && composeMeta.recipientUrn) {
            console.log('Prefer Voyager DM (UI composer unavailable for this recipient)');
        } else if (recipientPreset) {
            console.log('Recipient already set via compose URL/chip — skipping To field');
        } else if (await toField.isVisible().catch(() => false)) {
            console.log(`To: field detected. Filling recipient: ${displayName}`);
            await toField.click({ timeout: 5000 }).catch(() => {});
            await toField.fill('');
            await toField.fill(typeaheadSearchQuery(displayName) || displayName);
            await page.waitForTimeout(1500);
            if (!(await pickTypeaheadRecipient(page, displayName, {
              profileUrl: lead.url || '',
              company: lead.company || lead.headline || '',
            }))) {
              console.log(`Message NOT sent — could not confirm recipient for ${lead.name}`);
              return false;
            }
        }

        const dmKind = lead.dmKind || lead.messageKind || 'ice_breaker';
        const bubbles = splitMessageForDm(sanitizeIceBreaker(String(lead.msg || '')), { kind: dmKind });
        if (bubbles.length > 1) {
          console.log(
            `DM bubbles: ${bubbles.length} kind=${dmKind} (${bubbles.map((b) => b.length).join('+')} chars, threshold=${process.env.DM_SPLIT_THRESHOLD || 220})`
          );
        }

        // Mobile compose?recipient= often errors — send by URN when UI box is missing
        if (composeMeta.preferVoyagerDm && composeMeta.recipientUrn) {
          for (let i = 0; i < bubbles.length; i++) {
            const r = await sendVoyagerDirectMessage(page, composeMeta.recipientUrn, bubbles[i]);
            if (!r?.ok) {
              console.log(`Message NOT sent — Voyager DM failed for ${lead.name} bubble ${i + 1}/${bubbles.length}`);
              await page.screenshot({ path: `debug_no_box_${lead.name.replace(/\s+/g, '_')}.png` }).catch(() => {});
              return false;
            }
            if (i < bubbles.length - 1) await humanRandomDelay(2500, 4500);
          }
          console.log(`Message Sent — ${lead.name}${bubbles.length > 1 ? ` (${bubbles.length} bubbles, Voyager)` : ' (Voyager)'}`);
          return true;
        }

        const box = await findMessageBoxWithRetry(page, { attempts: 18, gapMs: 900 });
        if (!box) {
            if (composeMeta.recipientUrn) {
              console.log('UI box missing — falling back to Voyager DM');
              for (let i = 0; i < bubbles.length; i++) {
                const r = await sendVoyagerDirectMessage(page, composeMeta.recipientUrn, bubbles[i]);
                if (!r?.ok) {
                  console.log(`FAILED: Box not found and Voyager DM failed for ${lead.name}`);
                  await page.screenshot({ path: `debug_no_box_${lead.name.replace(/\s+/g, '_')}.png` }).catch(() => {});
                  return false;
                }
                if (i < bubbles.length - 1) await humanRandomDelay(2500, 4500);
              }
              console.log(`Message Sent — ${lead.name}${bubbles.length > 1 ? ` (${bubbles.length} bubbles, Voyager)` : ' (Voyager)'}`);
              return true;
            }
            console.log(`FAILED: Box not found for ${lead.name} (url=${page.url().slice(0, 140)})`);
            await page.screenshot({ path: `debug_no_box_${lead.name.replace(/\s+/g, '_')}.png` }).catch(() => {});
            return false;
        }

        const bubbleGapMs = Math.max(
          0,
          Number(process.env.DM_BUBBLE_GAP_MS || 60_000)
        );

        async function clickSendButton() {
            console.log('Activating and clicking .message-send button...');
            await page.evaluate(() => {
                const btn = document.querySelector('button.message-send, button.msg-form__send-button');
                const container = document.querySelector('.send-btn-container');
                if (container) container.classList.remove('hidden');
                if (btn) {
                    btn.disabled = false;
                    btn.removeAttribute('disabled');
                    btn.style.display = 'block';
                    btn.style.visibility = 'visible';
                }
            });
            const sendBtn = page.locator('button.message-send, button.msg-form__send-button, button[type="submit"]:has-text("Send"), button:has-text("Send")').last();
            await sendBtn.waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
            const btnBox = await sendBtn.boundingBox().catch(() => null);
            if (btnBox) {
                await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
            } else {
                await sendBtn.click({ force: true }).catch(() => {});
                await page.keyboard.press('Enter').catch(() => {});
            }
        }

        async function clearAndType(activeBox, text) {
            await activeBox.click({ force: true }).catch(() => {});
            await activeBox.focus().catch(() => {});
            await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
            await page.keyboard.press('A');
            await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
            await page.keyboard.press('Backspace');
            await page.keyboard.type(text, { delay: 12 });
        }

        let activeBox = box;
        for (let i = 0; i < bubbles.length; i++) {
            if (i > 0) {
              // Composer often remounts after Send — wait for it to come back
              const stillOk = await activeBox.isVisible().catch(() => false);
              if (!stillOk) {
                activeBox = await findMessageBoxWithRetry(page);
              } else {
                // Brief settle even if same node still visible
                await page.waitForTimeout(400);
              }
            }
            if (!activeBox) {
              console.log(`FAILED: Box not found for bubble ${i + 1}/${bubbles.length} — ${lead.name}`);
              await page.screenshot({ path: `debug_no_box_bubble${i + 1}_${lead.name.replace(/\s+/g, '_')}.png` }).catch(() => {});
              return false;
            }
            if (i === 0) console.log('Typing message to trigger LinkedIn UI...');
            else console.log(`Typing bubble ${i + 1}/${bubbles.length}...`);
            await clearAndType(activeBox, bubbles[i]);
            await page.waitForTimeout(i < bubbles.length - 1 ? 400 : 1200);
            await clickSendButton();
            if (i < bubbles.length - 1) {
              console.log(
                `Waiting ${Math.round(bubbleGapMs / 1000)}s before bubble ${i + 2}/${bubbles.length}...`
              );
              await page.waitForTimeout(bubbleGapMs);
            }
        }

        await page.waitForTimeout(2000);
        await page.screenshot({ path: `AFTER_CLICK_${lead.name.replace(/\s+/g, '_')}.png` });
        console.log(`Message Sent — ${lead.name}${bubbles.length > 1 ? ` (${bubbles.length} bubbles)` : ''}`);
        return true;
    } catch (e) {
        console.error(`Err processing ${lead.name}: ${e.message}`);
        return false;
    }
}

async function ensureLoggedInBrowser() {
  const sessionPath = sessionDataDir();
  const statePath = stateJsonFile();

  const contextOptions = {
    headless: true,
    userAgent: USER_AGENT,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-gpu',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (fs.existsSync(statePath)) {
    contextOptions.storageState = statePath;
  }

  console.log('Launching browser with persistent context...');
  const browser = await chromium.launchPersistentContext(sessionPath, {
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    ...contextOptions,
  });

  // Inject cookies before any LinkedIn navigation (guest hit first can poison the jar).
  await loadCookies(browser);
  const page = browser.pages()[0] || (await browser.newPage());
  await page.route('**/*.{woff,woff2,ttf}', (route) => route.abort());

  console.log('Navigating to feed to check session...');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'load', timeout: 90000 }).catch((e) =>
    console.log('Feed goto failed:', e.message)
  );
  await humanRandomDelay(5000, 8000);

  // Dismiss app-promo / softups — never click "Continue" on "Use the LinkedIn app" (that leaves web session).
  const dismissors = [
    page.locator('[aria-label="Dismiss"], [aria-label="Close"], button.artdeco-modal__dismiss').first(),
    page.locator('.promo__dismiss, button[data-action="dismiss"]').first(),
    page.locator('button:has-text("Not now"), button:has-text("No thanks"), button:has-text("Dismiss")').first(),
  ];
  for (const loc of dismissors) {
    if (await loc.isVisible().catch(() => false)) {
      console.log('Dismissing mobile promo/interstitial...');
      await loc.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      break;
    }
  }

  const { markSessionOk, markSessionDead } = await import('./sessionHealth.js');

  if ((await pageLooksLikeAuthWall(page)) && process.env.LINKEDIN_EMAIL) {
    if (!autoLoginAllowed()) {
      console.log('Auth wall on feed — NOT signing in (ALLOW_AUTO_LOGIN!=1). Using cookies/session only.');
      markSessionDead('auth_wall_on_feed');
    } else {
      console.log('Auth wall on feed — signing in (ALLOW_AUTO_LOGIN=1)...');
      try {
        await tryAutoLoginLinkedIn(page, browser, statePath);
      } catch (e) {
        console.error('Feed sign-in:', e.message);
      }
    }
  }

  const feedElement = page
    .locator('.feed-shared-update-v2, [data-test-global-nav-link="home"], button:has-text("Start a post"), a[href*="/messaging/"]')
    .first();
  const loginBtn = page.locator('form[action*="login-submit"], a[href*="login"], button:has-text("Sign in")').first();
  const isFeedVisible = await feedElement.isVisible().catch(() => false);
  const url = page.url();
  const isAtFeed = url.includes('/feed/');
  const looksLikeLoggedIn = url.includes('/mwlite') || url.includes('/messaging');
  const onCheckpoint = url.includes('checkpoint');
  const isLoginPage =
    ((await loginBtn.isVisible().catch(() => false)) && !isFeedVisible) ||
    (/login|oauth/.test(url) && !isAtFeed && !isFeedVisible);

  if (onCheckpoint && !isAtFeed) {
    console.log('LinkedIn checkpoint/security page — approve in the mobile LinkedIn app if you see a prompt. Waiting 60s...');
    await page.waitForTimeout(60000);
  }

  if (isLoginPage && !looksLikeLoggedIn && !isAtFeed) {
    if (!autoLoginAllowed()) {
      console.log('Login required — skipping password auto-login (ALLOW_AUTO_LOGIN!=1).');
      markSessionDead('login_required');
    } else {
      console.log('Login required. Attempting auto-login...');
      try {
        await tryAutoLoginLinkedIn(page, browser, statePath);
      } catch (loginErr) {
        console.error('Auto-login failed (continuing to DM attempts):', loginErr.message);
      }
    }
  }

  // If we are logged in, refresh cookies.json so VPS session stays current without password re-auth.
  const stillAuth = await pageLooksLikeAuthWall(page);
  const liveHasLiAt = (await browser.cookies()).some((c) => c.name === 'li_at' && c.value);
  const onFeedUrl = isAtFeed && !/\/uas\/login|\/login\b|authwall/i.test(url);
  // Mobile feed often hides "Start a post" behind app promo — li_at + /feed/ + no auth wall is enough.
  const positiveLogin = !stillAuth && liveHasLiAt && (isFeedVisible || looksLikeLoggedIn || onFeedUrl);
  if (positiveLogin) {
    await persistSessionCookies(browser);
    markSessionOk({ url, source: 'ensureLoggedInBrowser', feedVisible: isFeedVisible });
    if (!isFeedVisible) console.log('Session OK via li_at+/feed/ (feed chrome not visible yet).');
  } else if (stillAuth || isLoginPage || !liveHasLiAt) {
    const reason = stillAuth ? 'auth_wall' : !liveHasLiAt ? 'missing_li_at' : 'login_page';
    markSessionDead(reason, { url });
    console.log(`Session NOT confirmed logged-in (${reason}). url=${url} feedVisible=${isFeedVisible} li_at=${liveHasLiAt}`);
    const hardDead = stillAuth || !liveHasLiAt || /\/uas\/login|\/login|authwall|checkpoint/i.test(url);
    if (process.env.REQUIRE_SESSION === '1' && hardDead) {
      throw new Error('LinkedIn session dead — push fresh cookies (session_status.json)');
    }
  } else {
    console.log(`Session weak/unconfirmed on ${url} (feedVisible=${isFeedVisible}) — keeping cookies.json as-is`);
    markSessionDead('unconfirmed_feed', { url });
  }

  return { browser, page, statePath };
}

async function closeBrowser(browser) {
  if (!browser) return;
  try {
    const { readSessionStatus } = await import('./sessionHealth.js');
    const st = readSessionStatus();
    // Never overwrite good cookies with a logged-out browser context
    if (st?.ok !== false) {
      await persistSessionCookies(browser).catch(() => {});
      await browser.storageState({ path: stateJsonFile() }).catch(() => {});
    } else {
      console.log('Skipping cookie/state persist — session marked dead (keep last good cookies.json).');
    }
  } catch (_) {
    await persistSessionCookies(browser).catch(() => {});
    await browser.storageState({ path: stateJsonFile() }).catch(() => {});
  }
  await browser.close().catch((e) => console.error('Browser close:', e.message));
}

/**
 * Stage A — Acquisition: per-lead pipeline
 *   (backlog messageable Lead😴 drain) then for each new connection up to sync cap:
 *   CRM create → enrich → send ice → Conversation 💬 → advance cursor
 * Stops early if LinkedIn session dies so partial progress is kept.
 */
async function runStageA() {
  reloadEnv();
  if (process.env.OUTREACH_PAUSED === '1' || process.env.SKIP_STAGE_A === '1') {
    console.log('Stage A skipped (OUTREACH_PAUSED / SKIP_STAGE_A).');
    return;
  }
  if (process.env.CHANNEL_LINKEDIN_ENABLED === '0') {
    console.log('Stage A skipped (CHANNEL_LINKEDIN_ENABLED=0).');
    return;
  }
  console.log('=== STAGE A: Acquisition (per-lead: sync → enrich → ice) ===');
  const syncCap = Number(process.env.SYNC_MAX_NEW || process.env.SYNC_FIRST_RUN_LIMIT || 20);
  const sendMaxRaw = Number(process.env.STAGE_A_SEND_MAX || 0);
  const cycleCap =
    Number.isFinite(sendMaxRaw) && sendMaxRaw > 0 ? Math.min(sendMaxRaw, syncCap) : syncCap;
  console.log(
    `H.A.L.O. env: SYNC_MAX_NEW=${syncCap} STAGE_A_SEND_MAX=${process.env.STAGE_A_SEND_MAX || 0} cycleCap=${cycleCap}`
  );

  let browser;
  let phase1DmOk = 0;
  let phase1NotionOk = 0;
  let imported = 0;
  let syncPipelineAttempted = false;
  const phase1NamesOk = [];
  const enrichOnlyMode = process.env.ENRICH_ONLY === '1';

  try {
    if (enrichOnlyMode && process.env.SKIP_ENRICH !== '1') {
      const { enrichProposal1Leads } = await import('./enrichAndWrite.js');
      await enrichProposal1Leads();
    }
    if (enrichOnlyMode && process.env.SKIP_SEND === '1') {
      console.log('ENRICH_ONLY=1 — done (SKIP_SEND=1, no DM).');
      return;
    }
    if (enrichOnlyMode) {
      console.log('ENRICH_ONLY=1 — Apify done; opening browser for ice send only (same Stage A).');
    }

    // Legacy bulk sync only (no enrich/send)
    if (process.env.SYNC_CONNECTIONS_ONLY === '1') {
      const ctx = await ensureLoggedInBrowser();
      browser = ctx.browser;
      const { syncNewConnections } = await import('./connectionsSync.js');
      await syncNewConnections(ctx.page, { dryRun: process.env.SYNC_DRY_RUN === '1' });
      console.log('SYNC_CONNECTIONS_ONLY=1 — done.');
      return;
    }

    const { readSessionStatus } = await import('./sessionHealth.js');
    const sessionAlive = () => {
      const s = readSessionStatus();
      return !(s && s.ok === false);
    };
    if (!sessionAlive()) {
      console.log(
        `Stage A aborted — LinkedIn session inactive (${readSessionStatus()?.reason || 'unknown'}). Paste fresh li_at in H.A.L.O. LinkedIn section.`
      );
      return;
    }

    const ctx = await ensureLoggedInBrowser();
    browser = ctx.browser;
    let page = ctx.page;
    let statePath = ctx.statePath;
    if (!sessionAlive()) {
      console.log(
        `Stage A aborted — LinkedIn session inactive (${readSessionStatus()?.reason || 'unknown'}). Paste fresh li_at in H.A.L.O. LinkedIn section.`
      );
      return;
    }

    const { hasRealIceBreaker, enrichOneLead } = await import('./enrichAndWrite.js');

    /** Close LinkedIn during Apify — keeping headless open during enrich burns li_at on this VPS. */
    async function pauseBrowserForEnrich() {
      try {
        if (browser) await persistSessionCookies(browser);
      } catch (_) {}
      await closeBrowser(browser);
      browser = null;
      try {
        const sessionPath = sessionDataDir();
        fs.rmSync(sessionPath, { recursive: true, force: true });
        fs.mkdirSync(sessionPath, { recursive: true });
      } catch (_) {}
      console.log('Browser closed for enrich (cookies.json preserved, profile wiped).');
    }

    async function resumeBrowserForSend() {
      const ctx2 = await ensureLoggedInBrowser();
      browser = ctx2.browser;
      page = ctx2.page;
      statePath = ctx2.statePath;
      if (!sessionAlive()) {
        throw new Error('Session dead after reopen for DM — need fresh cookies');
      }
      console.log('Browser reopened for DM send.');
      return ctx2;
    }
    const { appendPageNote } = await import('./notionNotes.js');
    const {
      scrapeNewConnectionUrls,
      createNotionLead,
      advanceCursorForImport,
      loadSyncState,
      saveSyncState,
      maxNewPerRun,
      profileSlugFromUrl,
    } = await import('./connectionsSync.js');

    const targetUrl = (process.env.TARGET_LINKEDIN_URL || '').trim().toLowerCase();
    const targetSlug = targetUrl
      ? targetUrl.replace(/\/+$/, '').split('/in/').pop()?.split(/[/?#]/)[0] || ''
      : '';
    const matchesTarget = (l) => {
      if (!targetSlug) return true;
      const slug = (l.url || '').replace(/\/+$/, '').split('/in/').pop()?.split(/[/?#]/)[0] || '';
      return slug.toLowerCase() === targetSlug;
    };
    if (targetSlug) console.log(`TARGET_LINKEDIN_URL filter: ${targetSlug}`);

    async function sendIceAndPromote(lead) {
      if (!lead?.name || lead.name.length < 2) {
        console.log(`Skip send — missing Name for ${lead?.url}`);
        return false;
      }
      if (!hasRealIceBreaker(lead.msg || lead.ice)) {
        console.log(`Skip send — no ice-breaker for ${lead.url}`);
        return false;
      }
      const sendLead = { ...lead, msg: lead.msg || lead.ice, dmKind: 'ice_breaker' };
      const ok = await sendMessageToLead(page, browser, statePath, sendLead);
      if (!ok) {
        console.log(`Message NOT sent — ${lead.name}`);
        return false;
      }
      phase1DmOk++;
      try {
        await setProcessingAt(lead);
        await updateNotionStatus(lead.id, STATUS_CONVERSATION);
        phase1NotionOk++;
        phase1NamesOk.push(lead.name);
        await appendPageNote(
          lead.id,
          `mode=ice_breaker | ice sent → Conversation 💬 | full message:\n${String(sendLead.msg || '')}`
        ).catch((e) => console.error('page note:', e.message));
      } catch (notionErr) {
        console.error('Notion status update:', notionErr.message);
      }
      await humanRandomDelay(15000, 25000);
      return true;
    }

    function isIceReady(lead) {
      return Boolean(lead?.name && lead.name.length >= 2 && hasRealIceBreaker(lead.msg || lead.ice));
    }

    const sendCap = Number.isFinite(sendMaxRaw) && sendMaxRaw > 0 ? sendMaxRaw : Infinity;

    const prospectingEnabled = process.env.STAGE_A_OUTBOUND_CONNECT === '1';
    const acceptanceEnabled = process.env.STAGE_A_ACCEPTANCE !== '0';
    const legacySyncEnabled = process.env.STAGE_A_LEGACY_SYNC !== '0';

    // --- 0a0) Expire stale Lead😴 (CRM only; before profile probes) ---
    if (prospectingEnabled && acceptanceEnabled && !enrichOnlyMode) {
      try {
        const { expireStaleLeadSleepPages } = await import('./connectLeads.js');
        const ex = await expireStaleLeadSleepPages();
        if (ex.expired > 0) {
          console.log(`[Lead😴 expire] ${ex.expired} → Lost❌ (wait ${ex.waitDays}d)`);
        }
      } catch (e) {
        console.error('Lead😴 expire error:', e.message);
      }
    }

    // --- 0a) Acceptance: mark accepted Lead😴 ready for enrich/ice ---
    let acceptedPromotedIds = [];
    if (sessionAlive() && prospectingEnabled && acceptanceEnabled && !enrichOnlyMode) {
      try {
        const { runStageAAcceptancePhase } = await import('./stageAConnect.js');
        const ar = await runStageAAcceptancePhase(page);
        acceptedPromotedIds = ar.promotedIds || [];
        if (ar.promoted > 0) {
          console.log(
            `[Acceptance] ${ar.promoted} Lead😴 accepted → ready for enrich + ice (stay Lead😴)`
          );
        }
        if (ar.sessionDead) {
          console.log('Session dead during acceptance — stopping Stage A.');
        }
      } catch (e) {
        console.error('Acceptance phase error:', e.message);
      }
    }

    // --- 0b) Drain messageable Lead😴 (accepted / ice-ready; not limited by SYNC_MAX_NEW) ---
    console.log('--- Stage A leftover drain: messageable Lead😴 ---');
    let leftoverIceReadyLeft = 0;
    let leftoverSentThisRun = 0;
    {
      const readyIds = new Set(acceptedPromotedIds);
      const backlog = (await getLeads(STATUS_LEAD))
        .filter(matchesTarget)
        .filter((l) =>
          isLeadReadyForIcePipeline(l, {
            promotedIds: readyIds,
            hasIce: (msg) => hasRealIceBreaker(msg),
          })
        );
      leftoverIceReadyLeft = backlog.filter(isIceReady).length;
      console.log(
        `Lead😴 messageable: ${backlog.length} (ice-ready: ${leftoverIceReadyLeft})`
      );
      for (const lead of backlog) {
        if (phase1DmOk >= sendCap) {
          console.log(`STAGE_A_SEND_MAX=${sendMaxRaw} reached during leftover drain.`);
          break;
        }
        if (!sessionAlive()) {
          console.log(
            'Session dead during leftover drain — remaining messageable Lead😴 stay for next Stage A.'
          );
          break;
        }
        let working = lead;
        if (!hasRealIceBreaker(lead.msg)) {
          if (process.env.SKIP_ENRICH === '1') {
            console.log(`Skip leftover enrich (SKIP_ENRICH=1): ${lead.url}`);
            continue;
          }
          await pauseBrowserForEnrich();
          const enriched = await enrichOneLead(lead);
          if (!enriched.ok) {
            console.log(`Leftover enrich failed — leave as Lead😴: ${lead.url}`);
            try {
              await resumeBrowserForSend();
            } catch (_) {}
            continue;
          }
          working = { ...lead, ...enriched.lead, msg: enriched.lead.msg };
          await resumeBrowserForSend();
        }
        if (!browser || !page) await resumeBrowserForSend();
        const sent = await sendIceAndPromote(working);
        if (sent) {
          leftoverSentThisRun++;
          leftoverIceReadyLeft = Math.max(0, leftoverIceReadyLeft - 1);
        }
        if (!sessionAlive()) {
          console.log('Session dead after leftover send — stopping Stage A.');
          break;
        }
        if (!sent && (await pageLooksLikeAuthWall(page))) {
          console.log('Auth wall after leftover send — stopping Stage A.');
          break;
        }
      }
      leftoverIceReadyLeft = (await getLeads(STATUS_LEAD))
        .filter(matchesTarget)
        .filter((l) =>
          isLeadReadyForIcePipeline(l, {
            promotedIds: readyIds,
            hasIce: (msg) => hasRealIceBreaker(msg),
          })
        )
        .filter(isIceReady).length;
      if (leftoverIceReadyLeft) {
        console.log(`${leftoverIceReadyLeft} ice-ready leftover(s) still in Lead😴.`);
      }
    }

    // --- 1) Portrait prospecting: send N connection invites → Lead😴 ---
    if (prospectingEnabled && !enrichOnlyMode) {
      if (!sessionAlive()) {
        console.log('Skip connect phase — session inactive.');
      } else if (leftoverIceReadyLeft > 0) {
        console.log(
          `Skip connect phase — ${leftoverIceReadyLeft} ice-ready leftover(s) in Lead😴.`
        );
      } else if (leftoverSentThisRun > 0) {
        console.log(
          'Skip connect phase — leftover ice already sent this run (one enrich close per Stage A).'
        );
      } else {
        try {
          const { runStageAConnectPhase } = await import('./stageAConnect.js');
          const cr = await runStageAConnectPhase(page);
          console.log(
            `[Connect phase] sent=${cr.sent ?? 0} skipped=${cr.skipped ?? 0} dryRun=${cr.dryRun ? 1 : 0}`
          );
        } catch (e) {
          console.error('Connect phase error:', e.message);
        }
        if (!sessionAlive()) {
          console.log('Session dead after connect phase — stopping Stage A.');
        }
      }
    }

    // --- 2) Legacy My Network → Lead😴 ready (only when prospecting OFF) ---
    if (process.env.SKIP_SYNC === '1' || enrichOnlyMode) {
      if (enrichOnlyMode) {
        console.log('Stage A sync skipped (ENRICH_ONLY — leftover ice send only).');
      } else {
        console.log('Stage A sync skipped (SKIP_SYNC=1).');
      }
    } else if (prospectingEnabled) {
      console.log('Legacy My Network sync skipped — portrait prospecting is enabled.');
    } else if (!legacySyncEnabled) {
      console.log('Legacy My Network → Lead sync skipped (STAGE_A_LEGACY_SYNC=0).');
    } else if (!sessionAlive()) {
      console.log('Skip new-connection pipeline — session inactive.');
    } else if (leftoverIceReadyLeft > 0) {
      console.log(
        `Skip new-connection pipeline — ${leftoverIceReadyLeft} ice-ready leftover(s) remain in Lead😴.`
      );
    } else if (leftoverSentThisRun > 0) {
      console.log(
        'Skip new-connection pipeline this run — leftover ice already sent. Closing/reopening Chromium for Apify+DM kills li_at on this VPS. New leads wait for the next Stage A.'
      );
    } else {
      syncPipelineAttempted = true;
      const remaining = cycleCap;
      const state = loadSyncState();
      const cursorSlug = state.lastSyncedProfileSlug;
      console.log(
        `--- Stage A pipeline: import+enrich+ice (up to ${remaining}, softCursor=${cursorSlug}) ---`
      );

      let knownSlugs = new Set();
      try {
        const { fetchKnownProfileSlugs } = await import('./connectionsSync.js');
        knownSlugs = await fetchKnownProfileSlugs();
      } catch (e) {
        console.error('fetchKnownProfileSlugs:', e.message);
      }

      if (!browser || !page) await resumeBrowserForSend();
      const scraped = await scrapeNewConnectionUrls(page, {
        cursorSlug,
        recentSlugs: state.recentSlugs,
        excludeSlugs: state.excludeSlugs,
        knownSlugs,
        maxNew: Math.min(remaining, maxNewPerRun()),
      });

      // Close LinkedIn ASAP — long Notion/Apify with browser open burns li_at on this VPS.
      const liveAt = browser
        ? (await browser.cookies()).some((c) => c.name === 'li_at' && c.value)
        : false;
      if (!liveAt) {
        console.log('li_at already gone after connections scrape — aborting before enrich/DM.');
        try {
          const { markSessionDead } = await import('./sessionHealth.js');
          markSessionDead('li_at_cleared_during_connections_scrape', {
            source: 'runStageA',
            cursorMissing: Boolean(scraped.cursorMissing),
            intakeMode: scraped.intakeMode || null,
          });
        } catch (_) {
          /* ignore */
        }
      }
      await pauseBrowserForEnrich();

      if (scraped.sessionDead || !sessionAlive()) {
        console.log('Session dead during connections scrape — stopping (Stage B will skip Chromium).');
      } else if (!liveAt) {
        console.log(
          'Session burned during scrape (li_at cleared) — need fresh cookies for DM. Stage B will skip Chromium.'
        );
      } else if (!scraped.urls.length) {
        console.log(
          `No CRM-unknown connections to import (intake=${scraped.intakeMode}, scanned=${scraped.scannedCount}, softCursorMissing=${scraped.cursorMissing}).`
        );
        saveSyncState({ ...state, lastRunAt: new Date().toISOString() });
      } else {
        console.log(
          `Intake ${scraped.intakeMode}: unknownVisible=${scraped.unknownCount || scraped.allAboveCount}; pipeline this run: ${scraped.urls.length}`
        );
        if (scraped.cursorMissing) {
          console.log(
            `Soft cursor not in window — continuing with top-down CRM-unknown intake (no refuse).`
          );
        }

        // Phase A+B offline: Notion create + enrich (no LinkedIn browser)
        const created = [];
        for (const url of scraped.urls) {
          if (created.length >= remaining) break;
          const slug = profileSlugFromUrl(url);
          try {
            if (process.env.SYNC_DRY_RUN === '1') {
              console.log(`[dry-run] Would create+enrich+send: ${url}`);
              continue;
            }
            const pageResult = await createNotionLead({ url });
            console.log(`Notion created: ${pageResult.url} (${pageResult.id})`);
            imported++;
            advanceCursorForImport(pageResult);
            try {
              const { archiveLeadSleepDuplicates } = await import('./connectLeads.js');
              await archiveLeadSleepDuplicates([pageResult.url]);
            } catch (e) {
              console.error('Lead😴 dedupe error:', e.message);
            }
            created.push({
              id: pageResult.id,
              url: pageResult.url,
              name: '',
              msg: '',
              processingAt: null,
              slug,
            });
          } catch (e) {
            console.error(`Notion create failed for ${url}:`, e.message);
          }
        }

        if (created.length && process.env.SKIP_ENRICH !== '1') {
          for (const working of created) {
            const enriched = await enrichOneLead(working);
            if (!enriched.ok) {
              console.log(`Enrich failed for ${working.slug} — leave as Lead😴`);
              working._enrichFailed = true;
              continue;
            }
            Object.assign(working, enriched.lead, { msg: enriched.lead.msg });
          }
        }

        // Phase C: reopen once for DMs only if scrape still had live li_at
        const toSend = created.filter((w) => !w._enrichFailed && hasRealIceBreaker(w.msg || w.ice));
        if (toSend.length && liveAt) {
          await resumeBrowserForSend();
          for (const working of toSend) {
            if (phase1DmOk >= sendCap) break;
            if (!sessionAlive()) {
              console.log('Session dead mid-send — stopping.');
              break;
            }
            const sent = await sendIceAndPromote(working);
            if (!sessionAlive()) {
              console.log('Session dead after pipeline send — stopping.');
              break;
            }
            if (!sent && (await pageLooksLikeAuthWall(page))) {
              console.log('Auth wall after failed send — stopping Stage A.');
              break;
            }
          }
        } else {
          if (toSend.length && !liveAt) {
            console.log(
              `Enriched ${toSend.length} lead(s) but skipped DM — session died during scrape. Leftovers stay in Lead😴 for next Stage A.`
            );
          }
        }

        try {
          const { notify } = await import('./notify.js');
          if (imported > 0) {
            await notify({
              key: `sync_imported_${new Date().toISOString().slice(0, 13)}`,
              type: 'leads',
              severity: 'info',
              title: 'New leads imported to CRM',
              message: `Stage A pipeline imported ${imported} connection(s); ice→Conversation this run: ${phase1NotionOk}.`,
            });
          }
          const remainAbove = Math.max(0, (scraped.allAboveCount || 0) - imported);
          if (scraped.listLoaded && remainAbove <= 10 && (scraped.allAboveCount || 0) > 0) {
            await notify({
              key: `sync_low_remaining_${new Date().toISOString().slice(0, 10)}`,
              type: 'sync',
              severity: 'warn',
              title: 'Low remaining LinkedIn connections to sync',
              message: `About ${remainAbove} new connection(s) remain above the cursor (threshold: 10).`,
            });
          }
        } catch (e) {
          console.error('sync notify:', e.message);
        }
      }
    }

    leftoverIceReadyLeft = (await getLeads(STATUS_LEAD))
      .filter(matchesTarget)
      .filter((l) =>
        isLeadReadyForIcePipeline(l, {
          promotedIds: new Set(acceptedPromotedIds),
          hasIce: (msg) => hasRealIceBreaker(msg),
        })
      )
      .filter(isIceReady).length;
    console.log(
      `[Stage A SUMMARY] imported: ${imported}, ice→Conversation: ${phase1NotionOk}, DM ok: ${phase1DmOk}, leftover ice-ready left: ${leftoverIceReadyLeft}, cycleCap: ${cycleCap}`
    );
    if (phase1NamesOk.length) console.log(`Ice sent (Lead→Conversation) names: ${phase1NamesOk.join('; ')}`);

    // Never advance Stage A clock after dead session, leftovers, or sync found nobody to import.
    if (
      !sessionAlive() ||
      leftoverIceReadyLeft > 0 ||
      (syncPipelineAttempted && imported === 0 && phase1DmOk === 0)
    ) {
      console.log(
        'Stage A incomplete — not advancing Stage A interval (leftovers, session, or sync found 0 CRM-unknown).'
      );
    } else {
      const { markStageARan } = await import('./stageAState.js');
      markStageARan();
    }
  } finally {
    await closeBrowser(browser);
  }
}

/**
 * Stage B — Conversation: Notion preflight → open LinkedIn only if work exists.
 * Tick cadence = dashboard STAGE_B_INTERVAL_MS (Notion-only when browser not due).
 * Chromium gap = STAGE_B_INTERVAL_MS (optional STAGE_B_BROWSER_MIN_MS floor if set >0).
 * so shorter dashboard intervals open the browser more often — use with care.
 * 15m/30m/1h settings never open the browser more often than the safety floor.
 */
async function runStageB() {
  reloadEnv();
  if (
    process.env.OUTREACH_PAUSED === '1' ||
    process.env.SKIP_STAGE_B === '1' ||
    process.env.SKIP_CONVERSATION === '1'
  ) {
    console.log('Stage B skipped (OUTREACH_PAUSED / SKIP_STAGE_B / SKIP_CONVERSATION).');
    return;
  }
  if (process.env.CHANNEL_LINKEDIN_ENABLED === '0') {
    console.log('Stage B skipped (CHANNEL_LINKEDIN_ENABLED=0).');
    return;
  }
  const { readSessionStatus } = await import('./sessionHealth.js');
  if (readSessionStatus()?.ok === false) {
    console.log(
      `Stage B aborted — LinkedIn session inactive (${readSessionStatus()?.reason || 'unknown'}). Paste fresh li_at in H.A.L.O. LinkedIn section.`
    );
    return;
  }

  const targetUrl = (process.env.TARGET_LINKEDIN_URL || '').trim().toLowerCase();
  const targetSlug = targetUrl
    ? targetUrl.replace(/\/+$/, '').split('/in/').pop()?.split(/[/?#]/)[0] || ''
    : '';
  const matchesTarget = (l) => {
    if (!targetSlug) return true;
    const slug = (l.url || '').replace(/\/+$/, '').split('/in/').pop()?.split(/[/?#]/)[0] || '';
    return slug.toLowerCase() === targetSlug;
  };
  if (targetSlug) console.log(`TARGET_LINKEDIN_URL filter: ${targetSlug}`);

  // --- Notion-only preflight (no browser) ---
  let pending = (await getLeads('Conversation 💬')).filter(matchesTarget);
  console.log(`Conversation 💬: ${pending.length}`);
  if (pending.length === 0 && targetSlug) {
    console.log('No Conversation 💬 matches for TARGET — Stage B done.');
    return;
  }

  const silenceDays = Number(process.env.SILENCE_BUSINESS_DAYS || 2);
  const skipWeekends = process.env.SILENCE_SKIP_WEEKENDS !== '0';
  const silenceMax = Math.max(1, Number(process.env.STAGE_B_SILENCE_MAX || 2));
  const now = new Date();
  const weekendBlock = skipWeekends && !isWeekday(now);
  const silenceDue = weekendBlock
    ? []
    : pending.filter(
        (l) => l.processingAt && businessDaysBetween(l.processingAt, now) >= silenceDays
      );
  if (weekendBlock) {
    console.log('Weekend — silence closings deferred until Monday.');
  } else {
    console.log(`Silence due (Notion preflight): ${silenceDue.length} (≥${silenceDays} business days)`);
  }

  const {
    isInboxScanDue,
    canOpenBrowser,
    effectiveBrowserGapMs,
    markInboxScanned,
    markStageBBrowserRan,
    loadStageBState,
  } = await import('./stageBState.js');
  const browserGapMs = effectiveBrowserGapMs();
  const tickMs = Number(process.env.STAGE_B_INTERVAL_MS || 1800000);
  const inboxDue = !targetSlug && isInboxScanDue();
  // Silence closings must not wait on sponsored-inbox backoff
  const browserOk = canOpenBrowser() || silenceDue.length > 0;
  console.log(
    `Stage B cadence: tick=${tickMs}ms, ChromiumGap=${browserGapMs}ms (follows Stage B interval), inbox=${inboxDue ? 'DUE' : 'not due'}, browserOk=${browserOk}`
  );

  if (!inboxDue && silenceDue.length === 0) {
    console.log(
      'Stage B idle — no unread-scan due and no silence closings. Skipping Chromium (protects li_at).'
    );
    return;
  }

  if (!browserOk) {
    const st = loadStageBState();
    console.log(
      `Stage B work pending (inbox=${inboxDue}, silence=${silenceDue.length}) but Chromium cooldown until ~${browserGapMs}ms after ${st.lastBrowserAt}. Notion tick only.`
    );
    return;
  }

  console.log(
    `=== STAGE B: open browser (inboxScan=${inboxDue}, silenceDue=${silenceDue.length}, silenceCap=${silenceMax}) ===`
  );
  let browser;
  try {
    const ctx = await ensureLoggedInBrowser();
    browser = ctx.browser;
    const { page, statePath } = ctx;

    {
      const session = readSessionStatus();
      if (session && session.ok === false) {
        console.log(
          `Stage B aborted — LinkedIn session inactive (${session.reason || 'unknown'}). Paste fresh li_at in H.A.L.O. LinkedIn section.`
        );
        return;
      }
    }
    markStageBBrowserRan();

    const {
      threadHasInbound,
      decideReplyForLead,
      craftClosingFollowup,
      noteAfterSend,
      formatThreadForPrompt,
      namesMatch,
    } = await import('./conversationAgent.js');
    const { appendPageNote } = await import('./notionNotes.js');
    const { notify } = await import('./notify.js');

    let inboxHandled = 0;
    let silenceSent = 0;
    let revivedCount = 0;
    let unknownNotified = 0;
    const inboundIds = new Set();
    const revivedIds = new Set();

    const scanAllP2 = process.env.STAGE_B_SCAN_ALL_P2 === '1';
    let dumpedThreadDom = false;
    let stageBAbort = false;
    let inboxScanned = false;
    /** @type {Map<string, string>} leadId -> desktop messaging thread href */
    const unreadP2ThreadById = new Map();
    /** @type {Map<string, string>} lower name -> href */
    const unreadP2ThreadByName = new Map();

    function toDesktopMessagingHref(href) {
      const h = String(href || '').trim();
      if (!h) return '';
      return h
        .replace('://www.linkedin.com/mwlite/messaging/', '://www.linkedin.com/messaging/')
        .replace('://linkedin.com/mwlite/messaging/', '://www.linkedin.com/messaging/');
    }

    async function openThreadForLead(lead, threadHref = '') {
      if (stageBAbort) return null;

      const desktopHref = toDesktopMessagingHref(threadHref);
      if (/\/messaging\/thread\//i.test(desktopHref)) {
        console.log(`Opening desktop thread: ${desktopHref}`);
        await page.goto(desktopHref, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await humanRandomDelay(3000, 5000);
        if (await pageLooksLikeAuthWall(page)) {
          console.log('Auth wall on messaging thread — aborting Stage B to protect li_at');
          const { markSessionDead } = await import('./sessionHealth.js');
          markSessionDead('auth_wall_on_messaging_thread', { url: page.url() });
          stageBAbort = true;
          return null;
        }
        return await scrapeThreadMessages(page, lead.name);
      }

      console.log(`Thread via compose-by-name (no /in/ profile): ${lead.name}`);
      const opened = await openComposeByRecipientName(page, lead.name, {
        profileUrl: lead.url || '',
        company: lead.company || lead.headline || '',
      });
      if (await pageLooksLikeAuthWall(page)) {
        console.log('Auth wall on compose-by-name — aborting Stage B to protect li_at');
        stageBAbort = true;
        return null;
      }
      if (!opened.ok) return null;
      await humanRandomDelay(3000, 5000);
      return await scrapeThreadMessages(page, lead.name);
    }

    if (inboxDue) {
      console.log('--- Stage B inbox scan (Lost revive by name) ---');
      try {
        const inboxRows = await scrapeInboxConversations(page);
        inboxScanned = true;
        if (await pageLooksLikeAuthWall(page)) {
          const { markSessionDead } = await import('./sessionHealth.js');
          markSessionDead('auth_wall_on_inbox', { url: page.url() });
          stageBAbort = true;
        }
        const inboundRows = inboxRows.filter((r) => r.name && r.unread && !isSponsoredInboxRow(r));
        const sponsoredUnread = inboxRows.filter(
          (r) => r.name && r.unread && isSponsoredInboxRow(r)
        ).length;
        const sponsoredOnly = inboundRows.length === 0 && sponsoredUnread > 0;
        markInboxScanned();
        if (sponsoredUnread > 0) {
          console.log(`Inbox sponsored/ad unread ignored: ${sponsoredUnread} (not CRM leads).`);
        }
        if (sponsoredOnly && silenceDue.length === 0) {
          console.log(
            'Inbox check complete — sponsored-only noise, no silence work. Closing browser; next inbox tick on normal Stage B interval.'
          );
          await persistSessionCookies(page.context()).catch(() => {});
          return;
        }
        console.log(
          `Inbox unread to notify/resolve: ${inboundRows.length}/${inboxRows.length}` +
            (sponsoredUnread ? ` (${sponsoredUnread} sponsored filtered)` : '')
        );

        await persistSessionCookies(page.context()).catch(() => {});

        for (const row of inboundRows) {
          if (stageBAbort) break;
          try {
            console.log(
              `Inbox unread: ${row.name}${row.preview ? ` | ${row.preview.slice(0, 60)}…` : ''}`
            );
            const crm = await findCrmBySenderName(row.name);
            const status = crm?.status || '';
            const inCrm = Boolean(crm);
            const isP2 = status === 'Conversation 💬' || (crm && pending.some((l) => l.id === crm.id));
            const isLost = status === 'Lost❌';

            await notify({
              type: inCrm ? 'inbox_inbound' : 'inbox_unknown',
              severity: inCrm ? 'info' : 'warn',
              key: inboxNotifyKey(row),
              title: `LinkedIn unread — ${row.name}`,
              message: [
                `Unread message from "${row.name}".`,
                inCrm ? `CRM: ${status || 'unknown status'}.` : 'Not in CRM — no auto-reply.',
                isP2 ? 'Stage B may reply if this lead is in Conversation 💬.' : '',
                isLost ? 'Lost lead — reviving to Conversation 💬 (reply next cycle).' : '',
                row.preview ? `Preview: ${row.preview}` : '',
                row.href ? `Thread: ${row.href}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            });
            unknownNotified++;
            console.log(
              `  Unread notified — ${row.name} (${inCrm ? status || 'CRM' : 'not in CRM'})`
            );

            if (isP2) {
              const href = toDesktopMessagingHref(row.href);
              if (crm?.id) unreadP2ThreadById.set(crm.id, href);
              unreadP2ThreadByName.set(String(row.name || '').toLowerCase(), href);
              const match = pending.find((l) => namesMatch(l.name, row.name));
              if (match) unreadP2ThreadById.set(match.id, href);
              console.log(`  Conversation 💬 — reply handled in P2 loop`);
              continue;
            }

            if (isLost && crm) {
              await updateNotionStatus(crm.id, 'Conversation 💬');
              await setProcessingAt(crm);
              await appendPageNote(
                crm.id,
                `revived from Lost via unread inbox ("${row.name}") — reply this Stage B cycle`
              ).catch((e) => console.error('page note:', e.message));
              revivedIds.add(crm.id);
              revivedCount++;
              const href = toDesktopMessagingHref(row.href);
              if (href) {
                unreadP2ThreadById.set(crm.id, href);
                unreadP2ThreadByName.set(String(row.name || '').toLowerCase(), href);
              }
              console.log(`  Lost revive → Conversation 💬 — ${crm.name}`);
              await humanRandomDelay(2000, 4000);
              continue;
            }

            console.log(`  No auto-reply (${inCrm ? status : 'unknown sender'})`);
          } catch (e) {
            console.error(`Inbox resolve error ${row.name}:`, e.message);
          }
        }
      } catch (e) {
        console.error('Inbox Lost-revive scan error:', e.message);
      }
    } else {
      console.log('--- Stage B inbox scan skipped (not due this tick) ---');
    }

    if (revivedCount > 0) {
      pending = (await getLeads('Conversation 💬')).filter(matchesTarget);
      console.log(`Conversation 💬 after revive: ${pending.length}`);
    }

    function collectUnreadP2Leads(leadList) {
      const out = [];
      const seen = new Set();
      for (const lead of leadList) {
        const threadHref =
          unreadP2ThreadById.get(lead.id) ||
          unreadP2ThreadByName.get(String(lead.name || '').toLowerCase()) ||
          '';
        if (!scanAllP2 && !threadHref) continue;
        if (seen.has(lead.id)) continue;
        seen.add(lead.id);
        out.push({ lead, threadHref });
      }
      return out;
    }

    const replyQueue =
      inboxScanned || scanAllP2 ? collectUnreadP2Leads(pending) : [];

    console.log(
      `--- Stage B Conversation inbox --- (${replyQueue.length} unread thread(s); all will be answered this run) ---`
    );
    if (!inboxScanned && !scanAllP2) {
      console.log('No inbox scrape this tick — skipping P2 reply loop (nothing unread known).');
    } else if (!replyQueue.length) {
      console.log('Inbox scanned — no unread Conversation 💬 threads to answer.');
    } else {
      for (const { lead, threadHref } of replyQueue) {
        if (stageBAbort) {
          console.log('Stage B abort — skipping remaining P2 checks');
          break;
        }
        try {
          console.log(`Inbox check: ${lead.name}`);
          const messages = await openThreadForLead(lead, threadHref);
          if (!messages) {
            console.log(`  No composer for ${lead.name} — skip inbox`);
            continue;
          }
          const last = messages[messages.length - 1];
          const inbound = threadHasInbound(messages, [lead.msg]);
          console.log(
            `  messages=${messages.length} inbound=${inbound}` +
              (last
                ? ` last[dir=${last.direction} from=${JSON.stringify(last.from || '')} len=${last.text.length}]`
                : ' last=none')
          );
          if (messages.length === 0 && !dumpedThreadDom) {
            dumpedThreadDom = true;
            try {
              const hint = await page.evaluate(() => {
                const classes = {};
                document.querySelectorAll('*').forEach((el) => {
                  const c = el.className && String(el.className);
                  if (!c || typeof c !== 'string' || c.length > 100) return;
                  if (!/msg|message|bubble|thread|chat|conversation|event|list/i.test(c)) return;
                  classes[c] = (classes[c] || 0) + 1;
                });
                const top = Object.entries(classes)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 25);
                const aria = Array.from(document.querySelectorAll('[aria-label]'))
                  .map((el) => el.getAttribute('aria-label'))
                  .filter((a) => a && /message|sent|received|chat/i.test(a))
                  .slice(0, 15);
                return { url: location.href, top, aria, textLen: (document.body?.innerText || '').length };
              });
              console.log('  DOM hint:', JSON.stringify(hint));
              const safe = String(lead.name || 'lead').replace(/\s+/g, '_').slice(0, 40);
              await page.screenshot({ path: `debug_thread_${safe}.png` }).catch(() => {});
              fs.writeFileSync(`debug_thread_${safe}.html`, await page.content());
              console.log(`  dumped debug_thread_${safe}.html`);
            } catch (e) {
              console.log('  DOM hint failed:', e.message);
            }
          }
          if (!inbound) continue;

          inboundIds.add(lead.id);
          const lastInbound = [...messages]
            .reverse()
            .find((m) => (typeof m === 'object' ? m.direction === 'inbound' : false));
          const inboundText =
            typeof lastInbound === 'object' ? String(lastInbound.text || '') : '';
          const decision = await decideReplyForLead(lead, {
            thread: formatThreadForPrompt(messages.slice(-12)),
          });
          console.log(`  decision intent=${decision.intent} status=${decision.status}`);

          if (decision.reply && decision.reply.length >= 20) {
            const sendLead = { ...lead, msg: decision.reply, dmKind: 'reply' };
            const ok = await sendMessageToLead(page, browser, statePath, sendLead);
            if (ok) {
              inboxHandled++;
              await setProcessingAt(lead);
              await noteAfterSend(
                lead.id,
                'reply',
                [
                  decision.intent,
                  decision.notes_append || decision.reason || '',
                  inboundText ? `inbound full:\n${inboundText}` : '',
                  `outbound full:\n${decision.reply}`,
                ]
                  .filter(Boolean)
                  .join(' | ')
              ).catch((e) => console.error('note:', e.message));
              if (decision.status && decision.status !== 'Conversation 💬') {
                const extra =
                  decision.status === 'Lost❌' && decision.lostReason
                    ? { lostReason: decision.lostReason }
                    : {};
                await updateNotionStatus(lead.id, decision.status, extra);
              }
              await humanRandomDelay(15000, 25000);
            } else if (await pageLooksLikeAuthWall(page)) {
              console.log('Auth wall after reply attempt — aborting Stage B');
              stageBAbort = true;
            }
          } else if (decision.status === 'Lost❌' || decision.status === 'Active ✅') {
            const extra =
              decision.status === 'Lost❌' && decision.lostReason
                ? { lostReason: decision.lostReason }
                : {};
            await updateNotionStatus(lead.id, decision.status, extra);
            await noteAfterSend(
              lead.id,
              'reply',
              [
                `no-send | ${decision.intent} | ${decision.reason || ''}`,
                inboundText ? `inbound full:\n${inboundText}` : '',
              ]
                .filter(Boolean)
                .join(' | ')
            ).catch(() => {});
            inboxHandled++;
          } else {
            console.log(`  No send (empty/short reply), stay Conversation 💬 — ${lead.name}`);
          }
        } catch (e) {
          console.error(`Inbox error ${lead.name}:`, e.message);
        }
      }
    }

    console.log('--- Stage B silence (closing follow-up) ---');
    if (stageBAbort) {
      console.log('Stage B abort — skipping silence follow-ups (protect session).');
    } else if (weekendBlock) {
      console.log('Weekend — skipping silence follow-ups until Monday.');
    } else {
      const p2Fresh = (await getLeads('Conversation 💬')).filter(matchesTarget);
      const due = p2Fresh.filter(
        (l) =>
          !inboundIds.has(l.id) &&
          !revivedIds.has(l.id) &&
          l.processingAt &&
          businessDaysBetween(l.processingAt, now) >= silenceDays
      );
      const toClose = due.slice(0, silenceMax);
      console.log(
        `Silence due: ${due.length} (≥${silenceDays} business days); sending up to ${toClose.length} (STAGE_B_SILENCE_MAX=${silenceMax})`
      );
      for (const lead of toClose) {
        if (stageBAbort) break;
        try {
          console.log(`Closing follow-up: ${lead.name}`);
          const crafted = await craftClosingFollowup(lead);
          const sendLead = { ...lead, msg: crafted.text, dmKind: 'closing_followup' };
          const ok = await sendMessageToLead(page, browser, statePath, sendLead);
          if (ok) {
            silenceSent++;
            await setProcessingAt(lead);
            await updateNotionStatus(lead.id, 'Lost❌', { lostReason: 'no_reply' });
            await noteAfterSend(
              lead.id,
              'closing_followup',
              `no reply ≥${silenceDays} business days since last outbound → Lost (no_reply) | full message:\n${crafted.text}`
            ).catch((e) => console.error('note:', e.message));
            await humanRandomDelay(15000, 25000);
          } else {
            console.log(`Closing NOT sent — ${lead.name}`);
            if (await pageLooksLikeAuthWall(page)) {
              console.log('Auth wall after closing attempt — aborting Stage B');
              stageBAbort = true;
            }
          }
        } catch (e) {
          console.error(`Silence error ${lead.name}:`, e.message);
        }
      }
    }

    console.log(
      `[Stage B SUMMARY] revived: ${revivedCount}, inbound notified: ${unknownNotified}, inbox handled: ${inboxHandled}, closing sent: ${silenceSent}`
    );
  } finally {
    if (browser) {
      const { ensureStageBScheduled } = await import('./stageBState.js');
      ensureStageBScheduled();
    }
    await closeBrowser(browser);
  }
}

/**
 * Legacy entry used by one-shots. Routes via Stage A/B locks.
 * Env:
 *   ENRICH_ONLY, SYNC_CONNECTIONS_ONLY, FORCE_STAGE_A, STAGE_A_ONLY, STAGE_B_ONLY
 */
async function processLeads() {
  console.log('>>> STARTING CYCLE <<<');
  try {
    if (process.env.ENRICH_ONLY === '1') {
      const { withCycleLock } = await import('./cycleLock.js');
      await withCycleLock('A', runStageA, { skipIfBusy: false, waitMs: Number(process.env.LOCK_WAIT_MS || 900000) });
      return;
    }
    if (process.env.SYNC_CONNECTIONS_ONLY === '1' || process.env.FORCE_SYNC === '1' || process.env.SYNC_CONNECTIONS === '1') {
      // Force a Stage A style run for sync one-shots
      process.env.FORCE_STAGE_A = process.env.FORCE_STAGE_A || '1';
    }

    const { withCycleLock } = await import('./cycleLock.js');
    const { isStageADue } = await import('./stageAState.js');

    if (process.env.STAGE_B_ONLY === '1') {
      await withCycleLock('B', runStageB, { skipIfBusy: true });
      return;
    }

    const dueA = isStageADue() || process.env.STAGE_A_ONLY === '1' || process.env.FORCE_STAGE_A === '1';
    if (dueA) {
      await withCycleLock('A', runStageA, {
        skipIfBusy: false,
        waitMs: Number(process.env.LOCK_WAIT_MS || 900000),
      });
      if (process.env.STAGE_A_ONLY === '1') return;
    } else {
      console.log('Stage A not due yet.');
    }

    if (process.env.STAGE_A_ONLY === '1') return;

    await withCycleLock('B', runStageB, { skipIfBusy: true });
  } catch (e) {
    console.error(`Fatal: ${e.message}`);
  }
}

/** True after dashboard Save and restart — first Stage A tick ignores interval. */
let forceImmediateRunA = false;
/** Wait for cycle lock on forced Stage B (after A or B-only restart). */
let forceImmediateRunB = false;

function consumeForceRunOnceFlag() {
  const flagPath = path.join(__dirname, 'force_run_once.json');
  if (!fs.existsSync(flagPath)) return null;
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
  } catch {
    payload = {};
  }
  try {
    fs.unlinkSync(flagPath);
  } catch (e) {
    console.error('force_run_once unlink:', e.message);
  }
  reloadEnv();
  const linkedinOn = process.env.CHANNEL_LINKEDIN_ENABLED !== '0';
  const outreachOn = process.env.OUTREACH_PAUSED !== '1';
  const defaultA = linkedinOn && outreachOn && process.env.SKIP_STAGE_A !== '1';
  const defaultB =
    linkedinOn && outreachOn &&
    process.env.SKIP_STAGE_B !== '1' &&
    process.env.SKIP_CONVERSATION !== '1';
  // Legacy flags without runStageA/runStageB → both enabled stages
  const runStageA = payload.runStageA != null ? !!payload.runStageA : defaultA;
  const runStageB = payload.runStageB != null ? !!payload.runStageB : defaultB;
  return { runStageA, runStageB };
}

async function tickStageA() {
  try {
    reloadEnv();
    if (process.env.OUTREACH_PAUSED === '1' || process.env.SKIP_STAGE_A === '1') {
      console.log('Stage A tick skipped (OUTREACH_PAUSED / SKIP_STAGE_A).');
      return;
    }
    const { isStageADue, loadStageAState } = await import('./stageAState.js');
    const force = forceImmediateRunA || process.env.FORCE_STAGE_A === '1';
    if (!isStageADue() && !force) {
      const st = loadStageAState();
      const interval = Number(process.env.STAGE_A_INTERVAL_MS || 172800000);
      const nextAt = st.lastRunAt
        ? new Date(Date.parse(st.lastRunAt) + interval).toISOString()
        : 'soon';
      console.log(`Stage A tick skipped (not due until ${nextAt}).`);
      return;
    }
    if (force && !isStageADue()) {
      console.log('Stage A forced (Save and restart / FORCE_STAGE_A) — ignoring interval.');
    }
    const { withCycleLock } = await import('./cycleLock.js');
    await withCycleLock('A', runStageA, {
      skipIfBusy: false,
      waitMs: Number(process.env.LOCK_WAIT_MS || 900000),
    });
  } catch (e) {
    console.error('tickStageA:', e.message);
  }
}

async function tickStageB() {
  try {
    reloadEnv();
    if (forceImmediateRunB) {
      // Save and restart must open Chromium even if a browser cooldown is active.
      process.env.FORCE_STAGE_B_BROWSER = '1';
      process.env.FORCE_STAGE_B_INBOX = '1';
      console.log('Stage B forced (Save and restart) — bypassing Chromium cooldown for this run.');
    }
    if (
      process.env.OUTREACH_PAUSED === '1' ||
      process.env.SKIP_STAGE_B === '1' ||
      process.env.SKIP_CONVERSATION === '1'
    ) {
      console.log('Stage B tick skipped (OUTREACH_PAUSED / SKIP_STAGE_B).');
      return;
    }
    const { readSessionStatus } = await import('./sessionHealth.js');
    if (readSessionStatus()?.ok === false) {
      console.log('Stage B tick skipped (session inactive).');
      return;
    }
    const { withCycleLock, stageARunning } = await import('./cycleLock.js');
    if (stageARunning()) {
      console.log('Stage B skipped — Stage A running (next interval window).');
      return;
    }
    await withCycleLock('B', runStageB, {
      skipIfBusy: !forceImmediateRunB,
      waitMs: Number(process.env.LOCK_WAIT_MS || 900000),
    });
  } catch (e) {
    console.error('tickStageB:', e.message);
  } finally {
    if (forceImmediateRunB) {
      delete process.env.FORCE_STAGE_B_BROWSER;
      delete process.env.FORCE_STAGE_B_INBOX;
      forceImmediateRunB = false;
    }
  }
}

async function tickBrainAnalysis() {
  try {
    reloadEnv();
    if (process.env.BRAIN_ANALYSIS_ENABLED === '0') {
      return;
    }
    const { isBrainAnalysisDue, runBrainAnalysis } = await import('./brainAnalyzer.js');
    if (!isBrainAnalysisDue()) return;
    console.log('Brain analysis due — waiting for Stage A/B cycle lock…');
    const { withCycleLock } = await import('./cycleLock.js');
    await withCycleLock('Brain', runBrainAnalysis, {
      skipIfBusy: false,
      waitMs: Number(process.env.LOCK_WAIT_MS || 900000),
    });
  } catch (e) {
    console.error('tickBrainAnalysis:', e.message);
  }
}

// Only auto-start when this file is the entrypoint (not when imported by sync-connections.js).
const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  reloadEnv();
  const forcePlan = consumeForceRunOnceFlag();
  if (forcePlan) {
    forceImmediateRunA = forcePlan.runStageA;
    forceImmediateRunB = forcePlan.runStageB;
  }
  const stageAInterval = Number(process.env.STAGE_A_INTERVAL_MS || 172800000);
  const stageBInterval = Number(process.env.STAGE_B_INTERVAL_MS || 1800000);
  const brainInterval = Number(process.env.BRAIN_ANALYSIS_INTERVAL_MS || 604800000);
  console.log(
    `H.A.L.O. scheduler: Stage A due-check every ${Math.min(stageBInterval, 1800000)}ms (interval ${stageAInterval}ms); Stage B every ${stageBInterval}ms; Brain every ${Math.min(brainInterval, 3600000)}ms check (interval ${brainInterval}ms)`
  );
  if (forcePlan) {
    if (forcePlan.runStageA && forcePlan.runStageB) {
      console.log(
        'Save and restart — running Stage A first, then Stage B when A finishes (sequential, never parallel).'
      );
    } else if (forcePlan.runStageA) {
      console.log('Save and restart — running Stage A now (Stage B disabled).');
    } else if (forcePlan.runStageB) {
      console.log('Save and restart — running Stage B now (Stage A disabled).');
    } else {
      console.log('Save and restart — no immediate run (automation paused or no stages enabled).');
    }
  }

  const loopA = async () => {
    await tickStageA();
    reloadEnv();
    const ms = Math.min(Number(process.env.STAGE_B_INTERVAL_MS || 1800000), 1800000);
    setTimeout(loopA, ms);
  };
  const loopB = async () => {
    await tickStageB();
    reloadEnv();
    const { stageBLoopDelayMs } = await import('./stageBState.js');
    const ms = stageBLoopDelayMs();
    setTimeout(loopB, ms);
  };
  const loopBrain = async () => {
    await tickBrainAnalysis();
    reloadEnv();
    const ms = Math.min(Number(process.env.BRAIN_ANALYSIS_INTERVAL_MS || 604800000), 3600000);
    setTimeout(loopBrain, ms);
  };

  (async () => {
    if (forcePlan) {
      if (forcePlan.runStageA) {
        await tickStageA();
        reloadEnv();
      }
      if (forcePlan.runStageB) {
        const { readSessionStatus } = await import('./sessionHealth.js');
        if (readSessionStatus()?.ok === false) {
          console.log('Skip immediate Stage B — session inactive after Stage A.');
        } else {
          await tickStageB();
          reloadEnv();
        }
      }
      forceImmediateRunA = false;
      forceImmediateRunB = false;
    }
    reloadEnv();
    const { stageBLoopDelayMs, stageBBaseIntervalMs } = await import('./stageBState.js');
    const loopDelay = stageBLoopDelayMs();
    setTimeout(loopA, Math.min(Number(process.env.STAGE_B_INTERVAL_MS || 1800000), 1800000));
    setTimeout(loopB, loopDelay);
    setTimeout(loopBrain, Math.min(Number(process.env.BRAIN_ANALYSIS_INTERVAL_MS || 604800000), 3600000));
    console.log(
      `Stage B first tick in ~${Math.round(loopDelay / 60000)} min (base ${Math.round(stageBBaseIntervalMs() / 60000)} min ±1–5 min jitter).`
    );
  })();
}

export {
  tryAutoLoginLinkedIn,
  tryLinkedInCheckpointPasswordOnly,
  pageLooksLikeAuthWall,
  loadCookies,
  humanRandomDelay,
  processLeads,
  runStageA,
  runStageB,
};
