#!/usr/bin/env node
/** Dump inbox scrape rows (name/unread/preview) for diagnosis. */
import dotenv from 'dotenv';
dotenv.config({ override: true });

process.env.OUTREACH_PAUSED = '1'; // prevent scheduler side effects if imported oddly
process.env.STAGE_A_ONESHOT = '1';

const { chromium } = await import('playwright');
const path = await import('path');
const fs = await import('fs');
const { fileURLToPath } = await import('url');

// Reuse agent helpers by dynamic import after setting env
const index = await import('../index.js');

// index doesn't export scrapeInbox — duplicate minimal boot via ensureLoggedInBrowser isn't exported either.
// Inline: launch same way as agent using cookies.

function loadCookies() {
  const p = path.join(process.cwd(), 'cookies.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.cookies || [];
  return arr
    .map((c) => {
      if (!c?.name || c.value == null) return null;
      let sameSite = c.sameSite;
      if (sameSite === 'no_restriction' || sameSite === 'None') sameSite = 'None';
      else if (sameSite === 'strict' || sameSite === 'Strict') sameSite = 'Strict';
      else sameSite = 'Lax';
      const out = {
        name: c.name,
        value: String(c.value),
        domain: c.domain || '.linkedin.com',
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: !!c.httpOnly,
        sameSite,
      };
      const exp = c.expires ?? c.expirationDate;
      if (exp && Number(exp) > 0) out.expires = Number(exp) > 1e12 ? Math.floor(Number(exp) / 1000) : Number(exp);
      return out;
    })
    .filter(Boolean);
}

const browser = await chromium.launchPersistentContext(path.join(process.cwd(), 'session_data_inbox_probe'), {
  headless: true,
  viewport: { width: 1280, height: 900 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
});
const page = browser.pages()[0] || (await browser.newPage());
await browser.addCookies(loadCookies());

async function scrape(url, tryUnreadFilter) {
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(4000);
  let unreadFilterOn = false;
  if (tryUnreadFilter) {
    const unreadBtn = page
      .locator(
        'button:has-text("Unread"), a:has-text("Unread"), [role="radio"]:has-text("Unread"), button[aria-label*="Unread"]'
      )
      .first();
    if (await unreadBtn.isVisible().catch(() => false)) {
      await unreadBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      unreadFilterOn = true;
    }
  }
  const rows = await page.evaluate((forceUnread) => {
    const out = [];
    const seen = new Set();
    const push = (name, href, unread, preview, meta) => {
      const n = (name || '').replace(/\s+/g, ' ').trim();
      if (!n || n.length < 2) return;
      const key = n.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      let fullHref = href || '';
      if (fullHref.startsWith('/')) fullHref = `https://www.linkedin.com${fullHref}`;
      out.push({
        name: n,
        href: fullHref,
        unread: forceUnread ? true : Boolean(unread),
        preview: (preview || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        meta,
      });
    };
    for (const a of Array.from(document.querySelectorAll('a[href*="/messaging/thread/"]'))) {
      const href = a.getAttribute('href') || '';
      const aria = a.getAttribute('aria-label') || '';
      const lines = (a.innerText || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const name = lines[0] || '';
      const preview = lines[1] || '';
      const html = a.innerHTML.slice(0, 300);
      const unread =
        /unread/i.test(aria) ||
        /unread/i.test(a.className) ||
        Boolean(a.querySelector('[class*="unread"], .notification-badge, .badge')) ||
        /unread|непрочит/i.test(a.innerText || '');
      push(name, href, unread, preview, { aria: aria.slice(0, 120), className: String(a.className).slice(0, 80), htmlHint: html.includes('unread') });
    }
    // Also collect any element mentioning Alex
    const alex = Array.from(document.querySelectorAll('*'))
      .filter((el) => /alex\s*moroz/i.test(el.textContent || '') && (el.textContent || '').length < 200)
      .slice(0, 5)
      .map((el) => ({ tag: el.tagName, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120), class: String(el.className).slice(0, 80) }));
    return { rows: out.slice(0, 40), unreadFilterOn: forceUnread, alexHits: alex, title: document.title, url: location.href };
  }, unreadFilterOn);

  return { url, unreadFilterOn, ...rows };
}

const results = [];
results.push(await scrape('https://www.linkedin.com/mwlite/messaging/', true));
// desktop UA pass
await browser.close();

const browser2 = await chromium.launchPersistentContext(path.join(process.cwd(), 'session_data_inbox_probe2'), {
  headless: true,
  viewport: { width: 1400, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
});
const page2 = browser2.pages()[0] || (await browser2.newPage());
await browser2.addCookies(loadCookies());

async function scrapeDesktop(url) {
  await page2.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page2.waitForTimeout(5000);
  let unreadFilterOn = false;
  const unreadBtn = page2
    .locator(
      'button:has-text("Unread"), a:has-text("Unread"), [role="radio"]:has-text("Unread"), button[aria-label*="Unread"]'
    )
    .first();
  if (await unreadBtn.isVisible().catch(() => false)) {
    await unreadBtn.click().catch(() => {});
    await page2.waitForTimeout(2000);
    unreadFilterOn = true;
  }
  const data = await page2.evaluate((forceUnread) => {
    const out = [];
    const seen = new Set();
    const push = (name, href, unread, preview) => {
      const n = (name || '').replace(/\s+/g, ' ').trim();
      if (!n || n.length < 2) return;
      const key = n.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      let fullHref = href || '';
      if (fullHref.startsWith('/')) fullHref = `https://www.linkedin.com${fullHref}`;
      out.push({ name: n, href: fullHref, unread: forceUnread ? true : Boolean(unread), preview: (preview || '').slice(0, 120) });
    };
    for (const item of Array.from(
      document.querySelectorAll(
        '.msg-conversation-listitem, li.msg-conversation-listitem, .msg-conversation-card, [data-control-name="view_message"]'
      )
    )) {
      const a =
        item.closest('a[href*="/messaging/thread/"]') ||
        item.querySelector('a[href*="/messaging/thread/"]') ||
        (item.tagName === 'A' ? item : null);
      const href = a?.getAttribute('href') || '';
      const nameEl = item.querySelector(
        'h3, .msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names'
      );
      let name = (nameEl?.textContent || '').trim();
      const aria = item.getAttribute('aria-label') || a?.getAttribute('aria-label') || '';
      if (!name && aria) {
        const m = aria.match(/conversation with ([^.]+)/i) || aria.match(/^([^.,]+)/);
        if (m) name = m[1].trim();
      }
      const unread =
        /unread/i.test(aria) ||
        Boolean(item.querySelector('.msg-conversation-card__unread-count, .notification-badge, [class*="unread"]'));
      const previewEl = item.querySelector(
        '.msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet, p'
      );
      push(name, href, unread, previewEl?.textContent || '');
    }
    for (const a of Array.from(document.querySelectorAll('a[href*="/messaging/thread/"]'))) {
      const lines = (a.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const aria = a.getAttribute('aria-label') || '';
      const unread = /unread/i.test(aria) || Boolean(a.querySelector('[class*="unread"], .notification-badge'));
      push(lines[0] || '', a.getAttribute('href') || '', unread, lines[1] || '');
    }
    const alex = Array.from(document.body.innerText.matchAll(/Alex\s+Moroz[^\n]{0,80}/gi)).map((m) => m[0]);
    return { rows: out.slice(0, 40), alexText: alex.slice(0, 5), title: document.title };
  }, unreadFilterOn);
  return { url, unreadFilterOn, ...data };
}

results.push(await scrapeDesktop('https://www.linkedin.com/messaging/'));
await browser2.close();

for (const r of results) {
  console.log('\n====', r.url, 'filter=', r.unreadFilterOn, 'title=', r.title);
  console.log('rows', r.rows?.length || 0, 'unread', (r.rows || []).filter((x) => x.unread).length);
  const alex = (r.rows || []).filter((x) => /alex|moroz/i.test(x.name + x.preview));
  console.log('alex in rows', alex);
  if (r.alexHits) console.log('alexHits', r.alexHits);
  if (r.alexText) console.log('alexText', r.alexText);
  console.log(
    'all names:',
    (r.rows || []).map((x) => `${x.unread ? 'U' : '-'} ${x.name} | ${x.preview.slice(0, 50)}`).join('\n')
  );
}
