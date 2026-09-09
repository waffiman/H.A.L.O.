/**
 * LinkedIn People-search Connect (desktop SERP cards) — prefer card Connect, no full profile when possible.
 * Writes Notion Lead😴 (Link only) after each successful invite.
 */
import fs from 'fs';
import path from 'path';
import { createLeadSleepPage } from './connectLeads.js';
import { profileSlugFromUrl, canonicalProfileUrl } from './connectionsSync.js';

function crmSkipSlug(slug, opts = {}) {
  if (!slug) return false;
  if (typeof opts.shouldSkipProspect === 'function' && opts.shouldSkipProspect(slug)) return true;
  const s = String(slug).toLowerCase();
  if (opts.knownSlugs instanceof Set && opts.knownSlugs.has(s)) return true;
  if (opts.ledgerSlugs instanceof Set && opts.ledgerSlugs.has(s)) return true;
  return false;
}

function shouldPreSkipSlug(slug, opts, attemptedSlugs) {
  if (!slug) return true;
  if (attemptedSlugs?.has(String(slug).toLowerCase())) return true;
  return crmSkipSlug(slug, opts);
}

async function afterInviteSent(url, opts) {
  if (typeof opts.onInviteSent === 'function') {
    await opts.onInviteSent(url);
    return;
  }
  await createLeadSleepPage({ url });
}

const STATUS_PATH = path.join(process.cwd(), 'connect_run_status.json');

const CONNECT_BTN =
  'button[aria-label^="Invite"][aria-label*="to connect" i], button[aria-label="Connect"], button:text-is("Connect"), button:text-matches("^\\\\+?\\\\s*Connect$", "i"), [role="button"]:text-matches("^\\\\+?\\\\s*Connect$", "i")';
const CARD_SEL =
  'li.reusable-search__result-container, div.entity-result, li[class*="result-container"], div[data-chameleon-result-urn], div[data-view-name*="search-result"], ul[role="list"] > li';

/** Normalize button label — LinkedIn often shows "+ Connect". */
function normalizeActionLabel(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isConnectActionLabel(raw) {
  const t = normalizeActionLabel(raw);
  if (!t || t.includes('connections') || t.includes('pending') || t.includes('withdraw')) return false;
  if (t === 'connect' || t === '+ connect' || /^\+?\s*connect$/.test(t)) return true;
  if (t.startsWith('invite ') && t.includes('to connect')) return true;
  return false;
}

export function readConnectRunStatus() {
  try {
    if (!fs.existsSync(STATUS_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeConnectRunStatus(patch) {
  const prev = readConnectRunStatus() || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(next, null, 2));
  return next;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randBetween(a, b) {
  return a + Math.floor(Math.random() * Math.max(1, b - a + 1));
}

async function humanPause() {
  const min = Number(process.env.CONNECT_PAUSE_MIN_MS || 3000);
  const max = Number(process.env.CONNECT_PAUSE_MAX_MS || 7000);
  await sleep(randBetween(min, max));
}

/**
 * Extract profile URL from a search result card element handle / locator.
 */
async function cardProfileUrl(card) {
  const href = await card
    .locator('a[href*="/in/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  return canonicalProfileUrl(href || '') || null;
}

/** Mobile SERP often stays empty until cookie consent is accepted. */
export async function dismissLinkedInCookieBanner(page, label = '') {
  const tag = label ? ` (${label})` : '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const hit = await page
      .evaluate(() => {
        const pick = (els) => {
          for (const el of els) {
            const raw = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            const t = raw.toLowerCase();
            if (
              t === 'accept' ||
              t === 'accept all' ||
              t === 'allow all' ||
              t === 'accept & continue' ||
              t === 'agree & join linkedin' ||
              /^accept\b/.test(t)
            ) {
              el.click();
              return raw;
            }
          }
          return null;
        };
        return (
          pick([...document.querySelectorAll('button[action-type="ACCEPT"]')]) ||
          pick([...document.querySelectorAll('button.artdeco-button--primary, button[type="submit"]')]) ||
          pick([...document.querySelectorAll('button, a[role="button"]')]) ||
          null
        );
      })
      .catch(() => null);
    if (hit) {
      console.log(`Cookie banner Accept${tag}:`, hit);
      await sleep(2000);
      return true;
    }
    for (const sel of [
      'button:has-text("Accept")',
      'button:has-text("Accept & continue")',
      'button[action-type="ACCEPT"]',
      'button.artdeco-button--primary:has-text("Accept")',
    ]) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ force: true }).catch(() => {});
        console.log(`Cookie banner Accept${tag} (${sel.slice(0, 40)})`);
        await sleep(2000);
        return true;
      }
    }
    await sleep(500);
  }
  return false;
}

function shortenKeywords(raw, maxWords = 3) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'founder CEO';
  const words = s.split(' ').filter(Boolean);
  return words.length <= maxWords ? s : words.slice(0, maxWords).join(' ');
}

/** Mobile Connect: feed search box → People tab (never load over-faceted Brain URL). */
async function navigateMobilePeopleSearch(page, keywords) {
  const kw = shortenKeywords(keywords, 4);
  console.log('Mobile People search UI, keywords=', kw);
  await dismissLinkedInCookieBanner(page, 'mobile-search');
  let box = page
    .locator(
      'input[placeholder*="Search" i], input[aria-label*="Search" i], .search-global-typeahead__input, input.search-global-typeahead__input'
    )
    .first();
  if (!(await box.isVisible().catch(() => false))) {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(2000);
    box = page
      .locator(
        'input[placeholder*="Search" i], input[aria-label*="Search" i], .search-global-typeahead__input, input.search-global-typeahead__input'
      )
      .first();
  }
  if (await box.isVisible().catch(() => false)) {
    await box.click({ force: true }).catch(() => {});
    await sleep(300);
    await box.fill('').catch(() => {});
    await box.fill(kw).catch(() => {});
    await sleep(500);
    await page.keyboard.press('Enter').catch(() => {});
    await sleep(3500);
  } else {
    const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}&origin=SWITCH_SEARCH_VERTICAL`;
    console.log('Mobile search box missing — soft goto', url.slice(0, 110));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(3500);
  }
  const people = page
    .locator(
      'button:has-text("People"), a:has-text("People"), [role="tab"]:has-text("People"), li:has-text("People") button'
    )
    .first();
  if (await people.isVisible().catch(() => false)) {
    await people.click({ force: true }).catch(() => {});
    await sleep(3000);
  }
  await dismissLinkedInCookieBanner(page, 'post-search');
  return kw;
}

/** Prefer People tab click on mobile — avoid desktop People URL goto (cookie wall). */
async function ensurePeopleSerp(page, keywords, { isMobile = false } = {}) {
  const url = page.url() || '';
  if (/search\/results\/people/i.test(url)) return true;

  for (const sel of [
    'a[href*="search/results/people"]',
    'button:has-text("People")',
    '[role="tab"]:has-text("People")',
    'label:has-text("People")',
    '.search-reusables__filter-pill-button:has-text("People")',
  ]) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      console.log('People SERP — clicking filter');
      await el.click({ force: true }).catch(() => {});
      await sleep(3500);
      await dismissLinkedInCookieBanner(page, 'people-tab');
      if (/search\/results\/people/i.test(page.url() || '')) return true;
    }
  }

  if (isMobile) {
    // mwlite/all with profile links is OK for harvest — do not force desktop People URL
    return /search\/results\//i.test(page.url() || '');
  }

  const kw = shortenKeywords(keywords, 4);
  const peopleUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}&origin=SWITCH_SEARCH_VERTICAL`;
  console.log('Forcing People SERP goto:', peopleUrl.slice(0, 110));
  await page.goto(peopleUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await sleep(4000);
  await dismissLinkedInCookieBanner(page, 'people-goto');
  return /search\/results\/people/i.test(page.url() || '');
}

async function dismissModals(page) {
  const sels = [
    'button[aria-label="Dismiss"]',
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss confirmation modal"]',
    'div[role="dialog"] button:has-text("Got it")',
  ];
  for (const s of sels) {
    const dismiss = page.locator(s).first();
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click({ force: true }).catch(() => {});
      await sleep(400);
    }
  }
}

async function findConnectButton(scope, { ownerHint = '' } = {}) {
  // Exact Connect / Invite-to-connect / "+ Connect" — never "mutual connections".
  const candidates = [
    scope.locator('button[aria-label^="Invite"][aria-label*="to connect" i]'),
    scope.locator('button[aria-label="Connect"]'),
    scope.locator('button:text-is("Connect")'),
    scope.locator('button:text-matches("^\\+?\\s*Connect$", "i")'),
    scope.locator('[role="button"]:text-matches("^\\+?\\s*Connect$", "i")'),
  ];
  const hintParts = String(ownerHint || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2)
    .slice(0, 3);

  for (const loc of candidates) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const connect = loc.nth(i);
      if (!(await connect.isVisible().catch(() => false))) continue;
      const label = normalizeActionLabel(
        (await connect.getAttribute('aria-label').catch(() => '')) ||
          (await connect.innerText().catch(() => '')) ||
          ''
      );
      if (!isConnectActionLabel(label)) continue;
      // On profile pages, skip "People also viewed" invites for other names
      if (hintParts.length && label.startsWith('invite ')) {
        const hit = hintParts.some((p) => label.includes(p));
        if (!hit) continue;
      }
      return connect;
    }
  }
  return null;
}

/** Open ⋯ More actions on card and click Connect if present */
async function connectViaMoreMenu(page, card) {
  const more = card
    .locator(
      'button[aria-label*="More actions" i], button[aria-label*="More" i], button.artdeco-dropdown__trigger'
    )
    .first();
  if (!(await more.isVisible().catch(() => false))) return false;
  await more.click({ force: true }).catch(() => {});
  await sleep(800);
  const item = page
    .locator(
      'div[role="menu"] div[role="menuitem"]:text-is("Connect"), ' +
        'div.artdeco-dropdown__content li:text-is("Connect"), ' +
        'div[role="menu"] button:text-is("Connect"), ' +
        'div.artdeco-dropdown__content :text-is("Connect")'
    )
    .first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
  await item.click({ force: true }).catch(() => {});
  await sleep(1200);
  return true;
}

async function completeInviteDialog(page, note) {
  await sleep(800);
  // Wait for invite modal if it appears
  await page
    .waitForSelector('div[role="dialog"], div.artdeco-modal, div.artdeco-modal__actionbar', {
      timeout: 5000,
    })
    .catch(() => {});

  const dialogBtns = await page
    .evaluate(() => {
      const roots = [
        ...document.querySelectorAll('div[role="dialog"], div.artdeco-modal'),
      ];
      const scope = roots.length ? roots : [document.body];
      const labels = [];
      for (const root of scope) {
        for (const b of root.querySelectorAll('button')) {
          const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim();
          if (t) labels.push(t.slice(0, 80));
        }
      }
      return [...new Set(labels)].slice(0, 20);
    })
    .catch(() => []);
  if (dialogBtns.length) console.log('Invite dialog buttons:', dialogBtns.join(' | '));

  // Email required to connect
  const emailBox = page
    .locator('div[role="dialog"] input[type="email"], div[role="dialog"] input[name="email"]')
    .first();
  if (await emailBox.isVisible().catch(() => false)) {
    console.log('Invite requires email — skip');
    await dismissModals(page);
    await page.keyboard.press('Escape').catch(() => {});
    return 'email_required';
  }

  // Weekly / monthly limit copy
  const limitHit = await page
    .locator('text=/won.?t be able to connect|invitation limit|limit for this week/i')
    .first()
    .isVisible()
    .catch(() => false);
  if (limitHit) {
    await dismissModals(page);
    return 'weekly_limit';
  }

  // "How do you know" / Other
  const other = page
    .locator(
      'button[aria-label*="Other" i], label:has-text("Other"), input[value="OTHER"], ' +
        'div[role="dialog"] label:has-text("Other")'
    )
    .first();
  if (await other.isVisible().catch(() => false)) {
    await other.click({ force: true }).catch(() => {});
    await sleep(800);
    const cont = page
      .locator(
        'div[role="dialog"] button:has-text("Connect"), div[role="dialog"] button[aria-label*="Connect" i], ' +
          'div.artdeco-modal button:has-text("Connect")'
      )
      .first();
    if (await cont.isVisible().catch(() => false)) {
      await cont.click({ force: true }).catch(() => {});
      await sleep(1000);
    }
  }

  if (note && String(note).trim()) {
    const addNote = page
      .locator('button[aria-label*="Add a note" i], button:has-text("Add a note")')
      .first();
    if (await addNote.isVisible().catch(() => false)) {
      await addNote.click({ force: true }).catch(() => {});
      await sleep(800);
      const box = page
        .locator('div[role="dialog"] textarea, textarea[name="message"], #custom-message')
        .first();
      if (await box.isVisible().catch(() => false)) {
        await box.fill(String(note).slice(0, 300)).catch(() => {});
        await sleep(500);
      }
    }
  }

  // Prefer "Send without a note" then any Send / Send invitation / localized CTAs.
  // Some LinkedIn UIs only expose Cancel | OK (OK = confirm invite) — treat OK as send.
  const sendSelectors = [
    'button[aria-label*="Send without" i]',
    'button:has-text("Send without a note")',
    'div[role="dialog"] button:has-text("Send without a note")',
    'div.artdeco-modal button:has-text("Send without a note")',
    'button[aria-label="Send now"]',
    'button:has-text("Send invitation")',
    'div[role="dialog"] button[aria-label*="Send" i]',
    'div[role="dialog"] button:has-text("Send")',
    'div[role="dialog"] button:has-text("Wyślij")',
    'div[role="dialog"] button:has-text("Envoyer")',
    'div[role="dialog"] button:has-text("Senden")',
    'div[role="dialog"] button:has-text("Enviar")',
    'div.artdeco-modal__actionbar button.artdeco-button--primary',
    'div[role="dialog"] button.artdeco-button--primary',
    'div[role="dialog"] button:has-text("OK")',
    'div.artdeco-modal button:has-text("OK")',
    'div[role="dialog"] button:text-is("OK")',
  ];
  for (const sel of sendSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      const label = (
        (await btn.getAttribute('aria-label').catch(() => '')) ||
        (await btn.innerText().catch(() => '')) ||
        ''
      ).toLowerCase();
      if (
        label.includes('cancel') ||
        label.includes('dismiss') ||
        label.includes('close') ||
        label.includes('anuluj') ||
        label.includes('back')
      ) {
        continue;
      }
      console.log('Clicking invite CTA:', sel, label.slice(0, 40));
      await btn.click({ force: true }).catch(() => {});
      await sleep(1500);
      // After OK/Send, LinkedIn may show a second confirm — try once more quickly
      const again = page
        .locator(
          'div[role="dialog"] button.artdeco-button--primary, div[role="dialog"] button:has-text("Send"), ' +
            'div[role="dialog"] button:has-text("OK"), div[role="dialog"] button:has-text("Wyślij")'
        )
        .first();
      if (await again.isVisible().catch(() => false)) {
        const lab2 = (
          (await again.getAttribute('aria-label').catch(() => '')) ||
          (await again.innerText().catch(() => '')) ||
          ''
        ).toLowerCase();
        if (!/cancel|dismiss|close|anuluj|back/.test(lab2)) {
          await again.click({ force: true }).catch(() => {});
          await sleep(1200);
        }
      }
      await dismissModals(page);
      return true;
    }
  }

  // Last resort: if dialog only has Cancel + OK/primary, click the non-cancel action
  const fallbackOk = await page
    .evaluate(() => {
      const roots = [...document.querySelectorAll('div[role="dialog"], div.artdeco-modal')];
      for (const root of roots) {
        const buttons = [...root.querySelectorAll('button')].filter((b) => {
          const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim();
          return t && !b.disabled;
        });
        const actionable = buttons.filter((b) => {
          const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).toLowerCase();
          return !/cancel|dismiss|close|anuluj|back/.test(t);
        });
        const pick =
          actionable.find((b) => /send|wyślij|ok|gotowe|connect|invite/i.test(
            ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).toLowerCase()
          )) || actionable.find((b) => b.classList.contains('artdeco-button--primary')) || actionable[0];
        if (pick) {
          pick.click();
          return ((pick.getAttribute('aria-label') || '') + ' ' + (pick.innerText || '')).trim().slice(0, 60);
        }
      }
      return '';
    })
    .catch(() => '');
  if (fallbackOk) {
    console.log('Clicking invite fallback CTA:', fallbackOk);
    await sleep(1500);
    await dismissModals(page);
    return true;
  }

  // Dialog Connect as final step
  const dialogConnect = page
    .locator(
      'div[role="dialog"] button:has-text("Connect"), div[role="dialog"] button[aria-label*="Connect" i], ' +
        'div.artdeco-modal button:has-text("Connect")'
    )
    .first();
  if (await dialogConnect.isVisible().catch(() => false)) {
    await dialogConnect.click({ force: true }).catch(() => {});
    await sleep(1500);
    // may open send step
    for (const sel of sendSelectors.slice(0, 8)) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await sleep(1200);
        break;
      }
    }
    await dismissModals(page);
    return true;
  }

  return false;
}

async function becamePending(card) {
  const pending = card
    .locator('button:has-text("Pending"), button[aria-label*="Pending" i], span:has-text("Pending")')
    .first();
  return pending.isVisible().catch(() => false);
}

export async function sendConnectFromProfile(page, profileUrl, note) {
  console.log(`Profile fallback Connect: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) =>
    console.log('Profile goto:', e.message)
  );
  await sleep(3500);
  await dismissModals(page);

  const main = page.locator('main').first();
  const topCard = page
    .locator(
      'main section.artdeco-card, main .pv-top-card, main [data-member-id], main section:has(button)'
    )
    .first();
  const scope =
    (await topCard.count().catch(() => 0)) > 0
      ? topCard
      : (await main.count().catch(() => 0)) > 0
        ? main
        : page;

  const ownerHint = profileSlugFromUrl(profileUrl) || '';

  const actions = await page
    .evaluate(() => {
      const root = document.querySelector('main section') || document.querySelector('main') || document.body;
      return [...root.querySelectorAll('button, [role="button"]')]
        .map((b) => ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim())
        .filter((t) => /connect|pending|follow|message|more|invite/i.test(t))
        .slice(0, 12);
    })
    .catch(() => []);
  if (actions.length) console.log('Profile actions:', actions.join(' | '));

  // Message without Connect usually means already 1st-degree
  const hasMessage = actions.some((a) => /\bmessage\b/i.test(a) && !/mutual/i.test(a));
  const hasConnectAction = actions.some((a) => isConnectActionLabel(a));
  if (hasMessage && !hasConnectAction) {
    return { ok: false, reason: 'already_connected' };
  }

  async function finishAfterConnectClick() {
    const dr = await completeInviteDialog(page, note);
    if (dr === true) return { ok: true };
    if (typeof dr === 'string') return { ok: false, reason: dr };
    if (await page.locator('button:has-text("Pending"), button[aria-label*="Pending" i]').first().isVisible().catch(() => false)) {
      return { ok: true };
    }
    if (await page.locator('text=/invitation sent|invite sent/i').first().isVisible().catch(() => false)) {
      return { ok: true };
    }
    await dismissModals(page);
    await page.keyboard.press('Escape').catch(() => {});
    return { ok: false, reason: 'send_failed' };
  }

  let connectBtn =
    (await findConnectButton(scope, { ownerHint })) ||
    ((await main.count().catch(() => 0)) > 0 ? await findConnectButton(main, { ownerHint }) : null);
  // Never fall back to full-page Connect without ownerHint — that clicks sidebar invites
  if (!connectBtn && ownerHint) {
    connectBtn = await findConnectButton(page, { ownerHint });
  }
  if (connectBtn) {
    const label = (
      (await connectBtn.getAttribute('aria-label').catch(() => '')) ||
      (await connectBtn.innerText().catch(() => '')) ||
      ''
    ).toLowerCase();
    if (label.includes('pending')) return { ok: false, reason: 'already_pending' };
    if (label.includes('message') && !label.includes('connect')) {
      return { ok: false, reason: 'already_connected' };
    }
    console.log('Clicking Connect:', label.slice(0, 60));
    await connectBtn.scrollIntoViewIfNeeded().catch(() => {});
    await connectBtn.click({ force: true }).catch(() => {});
    await sleep(1500);
    return finishAfterConnectClick();
  }

  const more = scope
    .locator(
      'button[aria-label*="More actions" i], button[aria-label="More"], button.artdeco-dropdown__trigger, ' +
        'button:text-is("More"), button:text-is("See more")'
    )
    .first();
  if (!(await more.isVisible().catch(() => false))) {
    // try any overflow on the top card
    const altMore = page.locator('main section button.artdeco-dropdown__trigger').first();
    if (await altMore.isVisible().catch(() => false)) {
      await altMore.click({ force: true }).catch(() => {});
    } else {
      return { ok: false, reason: 'no_connect_button' };
    }
  } else {
    await more.click({ force: true }).catch(() => {});
  }
  await sleep(900);
  const item = page
    .locator(
      'div[role="menu"] :text-is("Connect"), div.artdeco-dropdown__content :text-is("Connect"), ' +
        '[role="menuitem"]:text-is("Connect")'
    )
    .first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.keyboard.press('Escape').catch(() => {});
    return { ok: false, reason: 'no_connect_button' };
  }
  await item.click({ force: true }).catch(() => {});
  await sleep(1500);
  return finishAfterConnectClick();
}

async function sendConnectFromCard(page, card, note, opts = {}) {
  await dismissModals(page);

  let clicked = false;
  const connectBtn = await findConnectButton(card);
  if (connectBtn) {
    const label = (
      (await connectBtn.getAttribute('aria-label').catch(() => '')) ||
      (await connectBtn.innerText().catch(() => '')) ||
      ''
    ).toLowerCase();
    if (label.includes('pending')) return { ok: false, reason: 'already_pending' };
    if (label.includes('message') && !label.includes('connect')) {
      return { ok: false, reason: 'already_connected' };
    }
    await connectBtn.scrollIntoViewIfNeeded().catch(() => {});
    await connectBtn.click({ force: true }).catch(() => {});
    clicked = true;
    await sleep(1500);
  } else {
    clicked = await connectViaMoreMenu(page, card);
  }

  if (clicked) {
    const dr = await completeInviteDialog(page, note);
    if (dr === true) return { ok: true };
    if (typeof dr === 'string') return { ok: false, reason: dr };
    if (await becamePending(card)) {
      await dismissModals(page);
      return { ok: true };
    }
    const toast = page.locator('text=/invitation sent|invite sent/i').first();
    if (await toast.isVisible().catch(() => false)) {
      await dismissModals(page);
      return { ok: true };
    }
  }

  // Fallback: open profile and Connect there (desktop profile always has the action)
  const profileUrl = opts.profileUrl || (await cardProfileUrl(card).catch(() => null));
  if (profileUrl && process.env.CONNECT_PROFILE_FALLBACK !== '0') {
    const searchUrlNow = page.url();
    const result = await sendConnectFromProfile(page, profileUrl, note);
    // return to SERP for next cards when possible
    if (searchUrlNow && /search\/results/i.test(searchUrlNow)) {
      await page.goto(searchUrlNow, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(2500);
    }
    return result;
  }

  await dismissModals(page);
  return { ok: false, reason: clicked ? 'send_failed' : 'no_connect_button' };
}

async function goNextPage(page) {
  const isMobile = (page.viewportSize()?.width || 1600) < 500;
  if (isMobile && (await loadMoreSerpResults(page))) return true;

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await sleep(1500);
  const nextBtn = page.locator('button[aria-label="Next"]').first();
  if (await nextBtn.isVisible().catch(() => false)) {
    if (!(await nextBtn.isEnabled().catch(() => false))) {
      return isMobile ? await loadMoreSerpResults(page) : false;
    }
    await nextBtn.click({ force: true }).catch(() => {});
    await sleep(3500);
    return true;
  }
  // numbered pagination: click current+1 if visible
  const active = page.locator('li.artdeco-pagination__indicator--number.active, button[aria-current="true"]').first();
  if (await active.isVisible().catch(() => false)) {
    const nxt = active.locator('xpath=following-sibling::li[1]//button').first();
    if (await nxt.isVisible().catch(() => false)) {
      await nxt.click({ force: true }).catch(() => {});
      await sleep(3500);
      return true;
    }
  }
  if (isMobile) return await loadMoreSerpResults(page);
  return false;
}

/** Mobile People/all SERP infinite scroll + Show more. */
async function loadMoreSerpResults(page) {
  const before = await page.locator('a[href*="/in/"]').count().catch(() => 0);
  await page
    .evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const el =
        document.querySelector('.scaffold-finite-scroll__content') ||
        document.querySelector('main') ||
        document.scrollingElement;
      if (el && el !== document.documentElement) el.scrollTop = el.scrollHeight;
    })
    .catch(() => {});
  await sleep(1800);
  const showMore = page
    .locator(
      'button:has-text("Show more results"), button:has-text("Show more"), button:has-text("Load more")'
    )
    .first();
  if (await showMore.isVisible().catch(() => false)) {
    await showMore.click({ force: true }).catch(() => {});
    await sleep(3500);
  }
  const after = await page.locator('a[href*="/in/"]').count().catch(() => 0);
  if (after > before) {
    console.log(`SERP load-more: profile links ${before} → ${after}`);
    return true;
  }
  return false;
}

async function waitForResults(page) {
  await page
    .waitForSelector(
      'button:text-is("Connect"), button:text-matches("^\\+?\\s*Connect$", "i"), button[aria-label^="Invite"][aria-label*="to connect" i], a[href*="/in/"]',
      { timeout: 25000 }
    )
    .catch(() => {});
  await sleep(2500);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 700)).catch(() => {});
    await sleep(800);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await sleep(1500);
  // Give React hydration time for action buttons on SERP
  for (let i = 0; i < 8; i++) {
    const n = await page
      .evaluate(() => {
        const isConn = (t) => {
          const s = String(t || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (!s || s.includes('connections') || s.includes('pending')) return false;
          return s === 'connect' || s === '+ connect' || /^\+?\s*connect$/.test(s) || (s.startsWith('invite ') && s.includes('to connect'));
        };
        return [...document.querySelectorAll('button, [role="button"]')].filter((b) =>
          isConn((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))
        ).length;
      })
      .catch(() => 0);
    if (n > 0) break;
    await sleep(1000);
  }
}

/** Click a SERP Connect button in-place (preferred — matches desktop People search UI). */
async function sendConnectFromSerpButton(page, btn, note) {
  const label = (
    (await btn.getAttribute('aria-label').catch(() => '')) ||
    (await btn.innerText().catch(() => '')) ||
    ''
  )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (label.includes('connections') || label.includes('pending')) {
    return { ok: false, reason: label.includes('pending') ? 'already_pending' : 'no_connect_button', url: null };
  }

  // Profile URL near this button
  let url = null;
  try {
    url = await btn.evaluate((el) => {
      let n = el;
      for (let i = 0; i < 12 && n; i++) {
        const a = n.querySelector?.('a[href*="/in/"]') || (n.tagName === 'A' && n.href?.includes('/in/') ? n : null);
        if (a?.href) return a.href;
        // also look in previous siblings / parent row
        const row = n.closest?.('li, div.entity-result, div[data-chameleon-result-urn], div.reusable-search__result-container');
        const ra = row?.querySelector('a[href*="/in/"]');
        if (ra?.href) return ra.href;
        n = n.parentElement;
      }
      return null;
    });
  } catch {
    /* ignore */
  }
  url = canonicalProfileUrl(url || '') || null;

  await btn.scrollIntoViewIfNeeded().catch(() => {});
  console.log('SERP Connect click:', (label || 'connect').slice(0, 50), url || '(no url)');
  await btn.click({ force: true }).catch(() => {});
  await sleep(1500);

  const dr = await completeInviteDialog(page, note);
  if (dr === true) return { ok: true, url };
  if (typeof dr === 'string') return { ok: false, reason: dr, url };

  // Pending on same control?
  const pending = page.locator('button:text-is("Pending"), button[aria-label*="Pending" i]').first();
  if (await pending.isVisible().catch(() => false)) return { ok: true, url };
  const toast = page.locator('text=/invitation sent|invite sent/i').first();
  if (await toast.isVisible().catch(() => false)) return { ok: true, url };

  await dismissModals(page);
  await page.keyboard.press('Escape').catch(() => {});
  return { ok: false, reason: 'send_failed', url };
}

async function dumpSerpActionButtons(page) {
  const sample = await page
    .evaluate(() =>
      [...document.querySelectorAll('button, [role="button"], a.artdeco-button')]
        .map((b) => {
          const t = ((b.getAttribute('aria-label') || '') + ' | ' + (b.innerText || '')).replace(/\s+/g, ' ').trim();
          const cls = String(b.className || '').slice(0, 80);
          return `${b.tagName}.${cls} :: ${t}`;
        })
        .filter((t) => /connect|pending|follow|message|invite/i.test(t) && !/mutual connections/i.test(t))
        .slice(0, 40)
    )
    .catch(() => []);
  if (sample.length) console.log('SERP action sample:', sample.join(' || '));
  else console.log('SERP action sample: (none matching Connect/Follow/Message)');

  // Structure dump of first 3 result cards (for selector debugging)
  try {
    const dump = await page.evaluate(() => {
      const cards = [
        ...document.querySelectorAll(
          'li.reusable-search__result-container, div.entity-result, div[data-chameleon-result-urn], ul[role="list"] > li, div[data-view-name*="search"], main li'
        ),
      ].slice(0, 5);
      const html = document.documentElement.outerHTML || '';
      const connectHits = (html.match(/>\s*\+?\s*Connect\s*</gi) || []).length;
      const inviteHits = (html.match(/Invite [^<]{0,60} to connect/gi) || []).length;
      return {
        meta: {
          connectTextHits: connectHits,
          inviteAriaHits: inviteHits,
          htmlLen: html.length,
          liCount: document.querySelectorAll('main li, ul[role="list"] > li').length,
        },
        cards: cards.map((card, idx) => {
          const actionRoot =
            card.querySelector(
              '.entity-result__actions, .entity-result__overflow-actions, div.entry-point, footer, [class*="actions"]'
            ) || null;
          const controls = [
            ...card.querySelectorAll('button, [role="button"], a.artdeco-button, span.artdeco-button__text, a'),
          ]
            .map((b) => ({
              tag: b.tagName,
              cls: String(b.className || '').slice(0, 140),
              aria: b.getAttribute('aria-label'),
              text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100),
            }))
            .slice(0, 30);
          return {
            idx,
            actionHtml: actionRoot ? (actionRoot.outerHTML || '').slice(0, 2500) : '(no action root)',
            cardHtml: (card.outerHTML || '').slice(0, 2000),
            controls,
          };
        }),
      };
    });
    fs.writeFileSync(path.join(process.cwd(), 'serp_actions_dump.json'), JSON.stringify(dump, null, 2));
    const htmlSnippet = await page.content().catch(() => '');
    fs.writeFileSync(path.join(process.cwd(), 'serp_page.html'), htmlSnippet.slice(0, 400000));
    console.log(
      `Wrote serp_actions_dump.json meta=${JSON.stringify(dump.meta)} cards=${(dump.cards || []).length}`
    );
    for (const c of dump.cards || []) {
      const brief = (c.controls || [])
        .filter((x) => /connect|follow|message|pending|invite|more/i.test(`${x.aria || ''} ${x.text || ''}`))
        .map((x) => `${x.text || x.aria || '?'}`)
        .slice(0, 8);
      console.log(`Card ${c.idx} controls:`, brief.join(' | ') || '(none)');
    }
  } catch (e) {
    console.log('serp dump failed:', e.message);
  }
  await page.screenshot({ path: path.join(process.cwd(), 'serp_actions.png'), fullPage: false }).catch(() => {});
}

async function serpLooksEmpty(page) {
  const hrefCount = await page.locator('a[href*="/in/"]').count().catch(() => 0);
  const connectN = (await collectSerpConnectButtons(page)).length;
  if (hrefCount > 0 || connectN > 0) return false;
  const noResultsCard = await page
    .locator(
      '.search-reusable-search-no-results, [data-view-name="search-results-no-results"], .artdeco-empty-state__headline:has-text("No results")'
    )
    .first()
    .isVisible()
    .catch(() => false);
  if (noResultsCard) return true;
  const noResults = await page
    .locator('button:has-text("Remove all filters"), button[aria-label*="Remove all filters" i]')
    .first()
    .isVisible()
    .catch(() => false);
  if (noResults) return true;
  const body = await page.locator('body').innerText().catch(() => '');
  if (/^no results found$/im.test(body.trim())) return true;
  return hrefCount === 0 && connectN === 0;
}

/** Over-faceted Brain URL often returns 0 on mobile — strip filters or retry shorter keywords. */
async function ensureSerpHasResults(page, searchUrl, { keywordFallbacks = [], isMobile = false } = {}) {
  const fallbacks = [...keywordFallbacks];
  try {
    const u = new URL(searchUrl);
    const kw = u.searchParams.get('keywords');
    if (kw && !fallbacks.includes(kw)) fallbacks.unshift(kw);
  } catch {
    /* ignore */
  }
  let fallbackIdx = 0;

  for (let attempt = 0; attempt < 6; attempt++) {
    await dismissLinkedInCookieBanner(page, `search-${attempt}`);
    await sleep(1500);
    if (!(await serpLooksEmpty(page))) return true;

    const removeFilters = page
      .locator('button:has-text("Remove all filters"), button[aria-label*="Remove all filters" i]')
      .first();
    if (await removeFilters.isVisible().catch(() => false)) {
      console.log('SERP over-filtered — clicking Remove all filters');
      await removeFilters.click({ force: true }).catch(() => {});
      await sleep(4500);
      continue;
    }

    if (isMobile && fallbackIdx < Math.min(fallbacks.length, 2)) {
      const kw = fallbacks[fallbackIdx++];
      console.log('SERP empty — mobile keyword fallback:', kw);
      await navigateMobilePeopleSearch(page, kw);
      continue;
    }

    if (!isMobile && attempt === 2) {
      let simple = searchUrl;
      try {
        const u = new URL(searchUrl);
        const kw = u.searchParams.get('keywords') || 'founder';
        simple = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(shortenKeywords(kw))}&origin=FACETED_SEARCH&network=${encodeURIComponent(JSON.stringify(['S', 'O']))}`;
      } catch {
        /* keep */
      }
      console.log('SERP retry — simplified URL:', simple.slice(0, 120));
      await page.goto(simple, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await sleep(4000);
      continue;
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(3000);
  }
  return !(await serpLooksEmpty(page));
}

async function collectSerpConnectButtons(page) {
  // Prefer result-row action areas; match "+ Connect" / Invite…to connect / artdeco-button text
  const candidates = page.locator(
    [
      '.entity-result__actions button',
      '.entity-result__actions [role="button"]',
      '.entity-result__actions a.artdeco-button',
      'li.reusable-search__result-container button',
      'div.entity-result button',
      'div[data-chameleon-result-urn] button',
      'button.artdeco-button',
      'a.artdeco-button',
      '[role="button"]',
    ].join(', ')
  );
  const n = await candidates.count().catch(() => 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const btn = candidates.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const label =
      (await btn.getAttribute('aria-label').catch(() => '')) ||
      (await btn.innerText().catch(() => '')) ||
      '';
    if (!isConnectActionLabel(label)) continue;
    // Extra guard: skip giant card-as-button (mutual connections text)
    if (normalizeActionLabel(label).includes('mutual')) continue;
    if (normalizeActionLabel(label).length > 90) continue;
    out.push(btn);
  }
  return out;
}

async function profileUrlFromSerpButton(btn) {
  try {
    const raw = await btn.evaluate((el) => {
      let n = el;
      for (let i = 0; i < 12 && n; i++) {
        const a = n.querySelector?.('a[href*="/in/"]') || (n.tagName === 'A' && n.href?.includes('/in/') ? n : null);
        if (a?.href) return a.href;
        const row = n.closest?.(
          'li, div.entity-result, div[data-chameleon-result-urn], div.reusable-search__result-container'
        );
        const ra = row?.querySelector('a[href*="/in/"]');
        if (ra?.href) return ra.href;
        n = n.parentElement;
      }
      return null;
    });
    return canonicalProfileUrl(raw || '') || null;
  } catch {
    return null;
  }
}

async function pickNextSerpButton(page, opts, attemptedSlugs) {
  const btns = await collectSerpConnectButtons(page);
  for (const btn of btns) {
    const url = await profileUrlFromSerpButton(btn);
    const slug = profileSlugFromUrl(url || '');
    if (shouldPreSkipSlug(slug, opts, attemptedSlugs)) {
      if (slug && crmSkipSlug(slug, opts)) console.log(`SERP pre-skip: ${slug}`);
      continue;
    }
    return { btn, url, slug };
  }
  return null;
}

/**
 * @param {import('playwright').Page} page
 * @param {{ searchUrl?: string, maxPerRun?: number, note?: string, knownSlugs?: Set, ledgerSlugs?: Set, dryRun?: boolean, shouldSkipProspect?: (slug: string) => boolean, onInviteSent?: (url: string) => Promise<void> }} opts
 */
export async function runLinkedInConnect(page, opts = {}) {
  const searchUrl = (opts.searchUrl || process.env.CONNECT_SEARCH_URL || '').trim();
  const searchKeywords =
    (opts.searchKeywords || '').trim() ||
    (() => {
      try {
        return new URL(searchUrl).searchParams.get('keywords') || '';
      } catch {
        return '';
      }
    })();
  const keywordFallbacks = Array.isArray(opts.keywordFallbacks) ? opts.keywordFallbacks : [];
  const maxPerRun = Number(opts.maxPerRun ?? process.env.CONNECT_MAX_PER_RUN ?? 10);
  const note = opts.note != null ? opts.note : process.env.CONNECT_NOTE || '';
  const dryRun = opts.dryRun || process.env.CONNECT_DRY_RUN === '1';

  if (!searchUrl) {
    throw new Error('CONNECT_SEARCH_URL is empty — set a LinkedIn People search URL');
  }
  if (!Number.isFinite(maxPerRun) || maxPerRun < 1) {
    throw new Error('CONNECT_MAX_PER_RUN must be >= 1');
  }

  writeConnectRunStatus({
    status: 'running',
    searchUrl,
    maxPerRun,
    sent: 0,
    failed: 0,
    skipped: 0,
    error: null,
  });

  console.log(`=== LinkedIn Connect (${(page.viewportSize()?.width || 0) < 500 ? 'mobile' : 'desktop'} SERP) max=${maxPerRun}${dryRun ? ' [DRY RUN]' : ''} ===`);
  console.log(`Search: ${searchUrl}`);
  if (searchKeywords) console.log(`Keywords: ${searchKeywords}`);

  const isMobileViewport = (page.viewportSize()?.width || 1600) < 500;

  let navigated = false;
  if (isMobileViewport) {
    await navigateMobilePeopleSearch(page, searchKeywords || 'founder CEO');
    navigated = true;
  } else try {
    const box = page
      .locator(
        'input[placeholder*="Search" i], input[aria-label*="Search" i], .search-global-typeahead__input, input.search-global-typeahead__input'
      )
      .first();
    if (await box.isVisible().catch(() => false)) {
      let keywords = shortenKeywords(searchKeywords, 4) || 'founder CEO';
      try {
        if (!searchKeywords) keywords = shortenKeywords(new URL(searchUrl).searchParams.get('keywords') || keywords, 4);
      } catch {
        /* keep */
      }
      console.log('Navigating via feed search UI, keywords=', keywords);
      await box.click({ force: true }).catch(() => {});
      await sleep(400);
      await box.fill('').catch(() => {});
      await box.type(keywords, { delay: 45 }).catch(async () => {
        await box.fill(keywords).catch(() => {});
      });
      await sleep(500);
      await page.keyboard.press('Enter').catch(() => {});
      await sleep(3500);
      // Prefer People tab if visible
      const people = page
        .locator('button:has-text("People"), a:has-text("People"), li:has-text("People") button')
        .first();
      if (await people.isVisible().catch(() => false)) {
        await people.click({ force: true }).catch(() => {});
        await sleep(2500);
      }
      // If still not on people SERP, try soft goto as fallback
      if (!/search\/results\/people/i.test(page.url())) {
        console.log('UI search not on people SERP yet, soft goto…');
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) =>
          console.log('Search goto:', e.message)
        );
      }
      navigated = true;
    }
  } catch (e) {
    console.log('UI search nav failed:', e.message);
  }
  if (!navigated) {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => {
      console.log('Search goto:', e.message);
    });
  }
  await sleep(3000);
  await dismissLinkedInCookieBanner(page, 'search');
  await sleep(1500);
  if (isMobileViewport) await ensurePeopleSerp(page, searchKeywords || 'founder CEO', { isMobile: true });
  const serpOk = await ensureSerpHasResults(page, searchUrl, { keywordFallbacks, isMobile: isMobileViewport });
  await waitForResults(page);
  await dismissModals(page);

  // Soft auth / empty SERP diagnostics — don't silently finish with sent=0
  {
    const serpUrl = page.url();
    const serpTitle = await page.title().catch(() => '');
    const bodyPreview = await page
      .evaluate(() => ((document.body && document.body.innerText) || '').slice(0, 400))
      .catch(() => '');
    if (
      /\/uas\/login|\/checkpoint|authwall|\/signup|linkedin\.com\/login/i.test(serpUrl) ||
      /^sign in/i.test(serpTitle) ||
      /welcome to your professional community/i.test(bodyPreview) ||
      (/sign in/i.test(bodyPreview) && /join now/i.test(bodyPreview))
    ) {
      await page.screenshot({ path: path.join(process.cwd(), 'serp_actions.png'), fullPage: false }).catch(() => {});
      writeConnectRunStatus({
        sent: 0,
        failed: 0,
        skipped: 0,
        status: 'error',
        error: `Auth wall on search (${serpUrl})`,
      });
      throw new Error(`Auth wall on search — cookies need repair (${serpUrl})`);
    }
    const hrefCount = await page.locator('a[href*="/in/"]').count().catch(() => 0);
    const connectN = (await collectSerpConnectButtons(page)).length;
    console.log(
      `SERP diagnostics: url=${serpUrl.slice(0, 100)} title=${serpTitle} profileLinks=${hrefCount} connectBtns=${connectN} serpOk=${serpOk}`
    );
    if (hrefCount > 0 && connectN === 0) {
      console.log(`SERP has ${hrefCount} profile links — proceeding with profile harvest`);
    }
    if (!serpOk && hrefCount === 0 && connectN === 0) {
      await dumpSerpActionButtons(page);
      const preview = await page
        .evaluate(() => ((document.body && document.body.innerText) || '').slice(0, 500))
        .catch(() => '');
      console.log('SERP empty text preview:', preview.replace(/\s+/g, ' ').slice(0, 400));
      writeConnectRunStatus({
        sent: 0,
        failed: 0,
        skipped: 0,
        status: 'error',
        error: 'People search returned 0 profiles (empty SERP)',
      });
      throw new Error('People search returned 0 profiles — LinkedIn may be blocking headless/empty results');
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const sentUrls = [];
  const attemptedSlugs = new Set();
  let pageNum = 1;
  let stagnantPages = 0;
  const maxProspectAttempts = Math.max(maxPerRun * 4, 40);

  while (sent < maxPerRun && attemptedSlugs.size < maxProspectAttempts) {
    console.log(`Connect page ${pageNum}`);

    // Preferred path: exact Connect buttons on People SERP (as in desktop LinkedIn UI)
    let serpBtns = await collectSerpConnectButtons(page);
    console.log(`SERP Connect buttons: ${serpBtns.length}`);
    if (!serpBtns.length) await dumpSerpActionButtons(page);

    // DOM fallback click when Playwright locators miss "+ Connect" / artdeco text
    if (!serpBtns.length) {
      const domClick = await page
        .evaluate(() => {
          const norm = (t) =>
            String(t || '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
          const isConn = (t) => {
            const s = norm(t);
            if (!s || s.includes('connections') || s.includes('pending') || s.includes('mutual')) return false;
            return s === 'connect' || s === '+ connect' || /^\+?\s*connect$/.test(s);
          };
          const roots = [
            ...document.querySelectorAll(
              '.entity-result__actions, .reusable-search__result-container, div.entity-result, div[data-chameleon-result-urn], ul[role="list"] > li'
            ),
          ];
          for (const root of roots) {
            const nodes = [...root.querySelectorAll('button, a, [role="button"], span.artdeco-button__text, div.artdeco-button')];
            for (const el of nodes) {
              const label = (el.getAttribute('aria-label') || '') + ' ' + (el.innerText || '');
              if (!isConn(label) && !isConn(el.innerText)) continue;
              const clickable = el.closest('button, a, [role="button"]') || el;
              const href =
                root.querySelector('a[href*="/in/"]')?.href ||
                clickable.closest('li, div')?.querySelector?.('a[href*="/in/"]')?.href ||
                null;
              clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              return { ok: true, text: norm(label).slice(0, 60), href };
            }
          }
          return { ok: false };
        })
        .catch(() => ({ ok: false }));
      if (domClick?.ok) {
        console.log('DOM Connect click:', domClick.text, domClick.href || '');
        const url = canonicalProfileUrl(domClick.href || '') || null;
        const slug = profileSlugFromUrl(url || '');
        if (shouldPreSkipSlug(slug, opts, attemptedSlugs)) {
          console.log(`DOM pre-skip: ${slug || domClick.href}`);
          skipped++;
        } else {
        await sleep(1500);
        const dr = await completeInviteDialog(page, note);
        if (dr === true || (await page.locator('button:has-text("Pending")').first().isVisible().catch(() => false))) {
          sent++;
          if (slug) attemptedSlugs.add(slug.toLowerCase());
          if (url) {
            try {
              await afterInviteSent(url, opts);
              console.log(`Invite sent + Lead😴: ${url}`);
            } catch (e) {
              console.error('Notion Lead😴 create:', e.message);
            }
            sentUrls.push(url);
          }
          writeConnectRunStatus({ sent, failed, skipped, status: 'running' });
          await humanPause();
        } else if (typeof dr === 'string') {
          console.log('DOM Connect →', dr);
          if (slug) attemptedSlugs.add(slug.toLowerCase());
          if (dr === 'weekly_limit') break;
          skipped++;
        } else {
          console.log('DOM Connect → send_failed');
          if (slug) attemptedSlugs.add(slug.toLowerCase());
          failed++;
        }
        }
      }
    }

    if (!serpBtns.length && process.env.CONNECT_PROFILE_FALLBACK === '0') {
      const hrefCount = await page.locator('a[href*="/in/"]').count().catch(() => 0);
      if (hrefCount === 0) {
        console.log('No SERP Connect buttons and no profile links — stopping');
        break;
      }
      console.log(`No inline Connect buttons — profile-link harvest from ${hrefCount} links`);
    }

    if (serpBtns.length > 0) {
      const maxLoops = Math.max(maxPerRun * 4, maxPerRun);
      let loops = 0;
      while (sent < maxPerRun && loops < maxLoops && attemptedSlugs.size < maxProspectAttempts) {
        loops++;
        const pick = await pickNextSerpButton(page, opts, attemptedSlugs);
        if (!pick) break;
        const { btn, url: preUrl, slug } = pick;
        if (slug) attemptedSlugs.add(slug.toLowerCase());
        const result = await sendConnectFromSerpButton(page, btn, note);
        if (result.ok) {
          sent++;
          const url = result.url || preUrl;
          if (url) {
            try {
              await afterInviteSent(url, opts);
              console.log(`Invite sent + Lead😴: ${url}`);
            } catch (e) {
              console.error('Notion Lead😴 create:', e.message);
            }
            sentUrls.push(url);
          } else {
            console.log('Invite sent (no profile url captured)');
          }
        } else {
          if (
            result.reason === 'already_pending' ||
            result.reason === 'already_connected' ||
            result.reason === 'email_required' ||
            result.reason === 'no_connect_button'
          ) {
            skipped++;
          } else if (result.reason === 'weekly_limit') {
            failed++;
            console.log('Weekly invite limit — stopping.');
            writeConnectRunStatus({ sent, failed, skipped, status: 'running' });
            break;
          } else {
            failed++;
          }
          console.log(`SERP Connect → ${result.reason}${slug ? ` (${slug})` : ''}`);
          await page.keyboard.press('Escape').catch(() => {});
        }
        writeConnectRunStatus({ sent, failed, skipped, status: 'running' });
        await humanPause();
        await sleep(800);
      }
      if (sent >= maxPerRun) break;
      const moved = await goNextPage(page);
      if (!moved) {
        stagnantPages++;
        if (stagnantPages >= 3) {
          console.log('No more search pages.');
          break;
        }
        if (await loadMoreSerpResults(page)) {
          stagnantPages = 0;
          pageNum++;
          await waitForResults(page);
          continue;
        }
        console.log('No more search pages.');
        break;
      }
      stagnantPages = 0;
      pageNum++;
      await waitForResults(page);
      continue;
    }

    const cards = page.locator(CARD_SEL);
    let count = await cards.count().catch(() => 0);
    console.log(`Cards on page: ${count}`);

    // If classic cards missing: Connect buttons or profile-link harvest
    if (count === 0) {
      const hrefs = await page
        .evaluate(() =>
          [...document.querySelectorAll('a[href*="/in/"]')]
            .map((a) => a.href)
            .filter(Boolean)
        )
        .catch(() => []);
      const unique = [];
      const seen = new Set();
      for (const h of hrefs) {
        const canon = canonicalProfileUrl(h);
        if (!canon) continue;
        const slug = profileSlugFromUrl(canon);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        unique.push(canon);
      }
      console.log(`No classic cards — profile links: ${unique.length}`);

      let attempts = 0;
      const maxAttempts = Math.max(maxPerRun * 5, 30);
      for (const url of unique) {
        if (sent >= maxPerRun || attempts >= maxAttempts || attemptedSlugs.size >= maxProspectAttempts) break;
        attempts++;
        const slug = profileSlugFromUrl(url);
        if (shouldPreSkipSlug(slug, opts, attemptedSlugs)) {
          skipped++;
          if (slug && crmSkipSlug(slug, opts)) console.log(`CRM skip: ${slug}`);
          continue;
        }
        if (slug) attemptedSlugs.add(slug.toLowerCase());
        if (dryRun) {
          console.log(`[dry-run] Would connect (profile): ${url}`);
          skipped++;
          continue;
        }
        const result = await sendConnectFromProfile(page, url, note);
        if (result.ok) {
          sent++;
          try {
            await afterInviteSent(url, opts);
            console.log(`Invite sent + Lead😴: ${url}`);
          } catch (e) {
            console.error('Notion Lead😴 create:', e.message);
          }
          sentUrls.push(url);
        } else {
          if (
            result.reason === 'already_pending' ||
            result.reason === 'already_connected' ||
            result.reason === 'no_connect_button' ||
            result.reason === 'email_required'
          ) {
            skipped++;
          } else if (result.reason === 'weekly_limit') {
            failed++;
            console.log('Weekly invite limit hit — stopping.');
            writeConnectRunStatus({ sent, failed, skipped, status: 'running' });
            break;
          } else {
            failed++;
          }
          console.log(`${profileSlugFromUrl(url)} → ${result.reason}`);
        }
        writeConnectRunStatus({ sent, failed, skipped, status: 'running' });
        await humanPause();
        if (sent < maxPerRun) {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
          await sleep(2500);
        }
      }
      if (sent >= maxPerRun) break;
      const moved = await goNextPage(page);
      if (!moved) {
        stagnantPages++;
        if (stagnantPages >= 3) {
          console.log('No more search pages.');
          break;
        }
        if (await loadMoreSerpResults(page)) {
          stagnantPages = 0;
          pageNum++;
          await waitForResults(page);
          continue;
        }
        console.log('No more search pages.');
        break;
      }
      stagnantPages = 0;
      pageNum++;
      await waitForResults(page);
      continue;
    }

    for (let i = 0; i < count && sent < maxPerRun && attemptedSlugs.size < maxProspectAttempts; i++) {
      const card = cards.nth(i);
      const url = await cardProfileUrl(card);
      if (!url) {
        skipped++;
        continue;
      }
      const slug = profileSlugFromUrl(url);
      if (shouldPreSkipSlug(slug, opts, attemptedSlugs)) {
        skipped++;
        if (slug && crmSkipSlug(slug, opts)) console.log(`CRM skip: ${slug}`);
        continue;
      }
      if (slug) attemptedSlugs.add(slug.toLowerCase());
      if (dryRun) {
        console.log(`[dry-run] Would connect: ${url}`);
        skipped++;
        continue;
      }
      const result = await sendConnectFromCard(page, card, note, { profileUrl: url });
      if (result.ok) {
        sent++;
        try {
          await afterInviteSent(url, opts);
          console.log(`Invite sent + Lead😴: ${url}`);
        } catch (e) {
          console.error(`Notion Lead😴 create failed ${url}:`, e.message);
        }
        sentUrls.push(url);
      } else {
        if (
          result.reason === 'already_pending' ||
          result.reason === 'already_connected' ||
          result.reason === 'no_connect_button'
        ) {
          skipped++;
        } else {
          failed++;
        }
        console.log(`${profileSlugFromUrl(url)} → ${result.reason}`);
      }
      writeConnectRunStatus({ sent, failed, skipped, status: 'running' });
      await humanPause();
    }

    if (sent >= maxPerRun) break;
    const moved = await goNextPage(page);
    if (!moved) {
      stagnantPages++;
      if (stagnantPages >= 3) {
        console.log('No more search pages.');
        break;
      }
      if (await loadMoreSerpResults(page)) {
        stagnantPages = 0;
        pageNum++;
        await waitForResults(page);
        continue;
      }
      console.log('No more search pages.');
      break;
    }
    stagnantPages = 0;
    pageNum++;
    await waitForResults(page);
  }

  if (sent < maxPerRun) {
    console.log(
      `[Connect] Target ${maxPerRun} not reached — sent=${sent} (attempted ${attemptedSlugs.size} unique slugs, skipped=${skipped})`
    );
  }

  const summary = {
    status: 'done',
    sent,
    failed,
    skipped,
    sentUrls,
    searchUrl,
    maxPerRun,
    error: null,
  };
  writeConnectRunStatus(summary);
  console.log(`[Connect SUMMARY] sent=${sent} failed=${failed} skipped=${skipped}`);
  try {
    const { notify } = await import('./notify.js');
    if (sent > 0) {
      await notify({
        key: `connect_sent_${new Date().toISOString().slice(0, 13)}`,
        type: 'connect',
        severity: 'info',
        title: 'Connection invites sent',
        message:
          `Sent ${sent} LinkedIn connection invite(s). They were added to Notion as Lead😴 (Link only). ` +
          `Failed: ${failed}, skipped: ${skipped}` +
          (skipped
            ? ' (skipped usually = already pending/connected or no Connect button on card).'
            : '.') +
          (failed ? ' Failed usually = invite dialog did not confirm (Send/OK).' : ''),
      });
    }
    if (failed > 0 && sent === 0) {
      await notify({
        key: `connect_failed_${new Date().toISOString().slice(0, 13)}`,
        type: 'connect',
        severity: 'error',
        title: 'Auto-connect failed',
        message: `Connect run finished with 0 sent, ${failed} failed, ${skipped} skipped. Check LinkedIn session and search URL.`,
      });
    }
  } catch {
    /* ignore */
  }
  return summary;
}
