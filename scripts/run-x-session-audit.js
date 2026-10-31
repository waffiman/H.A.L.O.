#!/usr/bin/env node
/**
 * Read-only X session audit: who am I, is Premium a real DM wall or a promo,
 * can we open composers for target handles. Writes screenshots + report JSON.
 *
 * Usage (VPS, agent stopped):
 *   X_AUDIT_HANDLES=farman32740,Agzer19 node scripts/run-x-session-audit.js
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { withCycleLock } from '../cycleLock.js';
import { dataRoot } from '../dataRoot.js';
import { xAuthTokenPresent, xCookiesFile } from '../xSessionHealth.js';

dotenv.config({ override: true });

const HANDLES = String(process.env.X_AUDIT_HANDLES || 'farman32740,Agzer19')
  .split(/[,\s]+/)
  .map((s) => s.replace(/^@/, '').trim())
  .filter(Boolean);

const OUT = path.join(dataRoot(), 'scripts', '_x_audit');
fs.mkdirSync(OUT, { recursive: true });

function loadCookies() {
  try {
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
  } catch {
    return [];
  }
}

function cookieMeta(cookies) {
  const auth = cookies.find((c) => c.name === 'auth_token' && c.value);
  const ct0 = cookies.find((c) => c.name === 'ct0' && c.value);
  const twid = cookies.find((c) => c.name === 'twid' && c.value);
  const mask = (v) => {
    const s = String(v || '');
    if (s.length < 12) return s ? `${s.slice(0, 2)}…` : '';
    return `${s.slice(0, 6)}…${s.slice(-4)} (len=${s.length})`;
  };
  return {
    count: cookies.length,
    names: cookies.map((c) => c.name),
    domains: [...new Set(cookies.map((c) => c.domain))],
    auth_token: auth ? mask(auth.value) : null,
    ct0: ct0 ? mask(ct0.value) : null,
    twid: twid ? String(twid.value) : null,
  };
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

async function pageFacts(page) {
  return page.evaluate(() => {
    const body = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const testids = [...document.querySelectorAll('[data-testid]')]
      .map((el) => el.getAttribute('data-testid'))
      .filter(Boolean);
    const uniq = [...new Set(testids)].slice(0, 80);

    const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const accountText = accountSwitcher
      ? String(accountSwitcher.innerText || accountSwitcher.textContent || '').replace(/\s+/g, ' ').trim()
      : '';

    const dialogs = [...document.querySelectorAll('[role="dialog"], [data-testid="sheetDialog"]')].map((el) => ({
      testid: el.getAttribute('data-testid'),
      text: String(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      visible: !!(el.offsetWidth || el.offsetHeight),
    }));

    const paywall = document.querySelector('[data-testid="paywallScrim"]');
    const paywallBox = paywall
      ? (() => {
          const r = paywall.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 2 && r.height > 2 };
        })()
      : null;

    const premiumMentions = [];
    const re =
      /get premium to message|only premium users can send|upgrade to premium|subscribe to premium|premium/i;
    for (const el of document.querySelectorAll('div, span, h1, h2, button, a')) {
      const t = String(el.innerText || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 180) continue;
      if (!re.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      premiumMentions.push({
        text: t.slice(0, 160),
        testid: el.getAttribute('data-testid'),
        tag: el.tagName,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
      if (premiumMentions.length >= 12) break;
    }

    const dmComposer = !!document.querySelector(
      '[data-testid="dmComposerTextInput"], [data-testid="dmComposerFocusTextInput"], [data-testid="messageEntry"] [contenteditable="true"]'
    );
    const tweetComposer = !!document.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0RichTextInputContainer"]');
    const searchPeople = !!document.querySelector('[data-testid="searchPeople"]');
    const msgBtn = !!document.querySelector('[data-testid="sendDMFromProfile"]');
    const loginWall = /\/i\/flow\/login|\/login/i.test(location.href);

    const dmWallText =
      /get premium to message|only premium users can send|premium to message people|you need.?premium to (send|message)/i.test(
        body
      );
    const promoOnly =
      !dmWallText &&
      /subscribe to premium|get premium|upgrade to premium/i.test(body) &&
      !paywallBox?.visible;

    return {
      href: location.href,
      title: document.title,
      accountText,
      bodySlice: body.slice(0, 700),
      testids: uniq,
      dialogs,
      paywallBox,
      premiumMentions,
      dmComposer,
      tweetComposer,
      searchPeople,
      msgBtn,
      loginWall,
      classification: loginWall
        ? 'login_wall'
        : dmWallText
          ? 'dm_premium_wall'
          : paywallBox?.visible
            ? 'paywall_scrim_visible'
            : promoOnly
              ? 'promo_banner_likely'
              : dmComposer
                ? 'dm_composer_ready'
                : 'unknown',
    };
  });
}

async function visit(page, label, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) =>
    console.log(`goto fail ${label}:`, e.message)
  );
  await page.waitForTimeout(2800);
  const facts = await pageFacts(page);
  const file = await shot(page, label);
  console.log(
    JSON.stringify(
      {
        step: label,
        url: facts.href,
        account: facts.accountText,
        class: facts.classification,
        dmComposer: facts.dmComposer,
        tweetComposer: facts.tweetComposer,
        msgBtn: facts.msgBtn,
        paywall: facts.paywallBox,
        dialogs: facts.dialogs.map((d) => d.text.slice(0, 120)),
        premiumMentions: facts.premiumMentions.slice(0, 6),
        shot: file,
      },
      null,
      2
    )
  );
  return { label, ...facts, shot: file };
}

async function tryComposeSearch(page, handle, label) {
  await page.goto('https://x.com/messages/compose', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  let facts = await pageFacts(page);
  await shot(page, `${label}_compose_land`);
  const search = page
    .locator('[data-testid="searchPeople"], input[placeholder*="Search"], input[aria-label*="Search"], [role="combobox"]')
    .first();
  if ((await search.count().catch(() => 0)) > 0) {
    await search.click({ timeout: 4000 }).catch(() => {});
    await search.fill(`@${handle}`).catch(async () => {
      await page.keyboard.type(`@${handle}`, { delay: 40 });
    });
    await page.waitForTimeout(2000);
    await shot(page, `${label}_compose_typed`);
    const hit = page.locator(`[data-testid="TypeaheadUser"]`).filter({ hasText: new RegExp(`@?${handle}`, 'i') }).first();
    if ((await hit.count().catch(() => 0)) > 0) {
      await hit.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const next = page.getByRole('button', { name: /^next$/i }).first();
      if ((await next.count().catch(() => 0)) > 0) {
        await next.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
  }
  facts = await pageFacts(page);
  const file = await shot(page, `${label}_compose_after`);
  console.log(
    JSON.stringify(
      {
        step: `${label}_compose_flow`,
        url: facts.href,
        class: facts.classification,
        dmComposer: facts.dmComposer,
        searchPeople: facts.searchPeople,
        paywall: facts.paywallBox,
        dialogs: facts.dialogs,
        premiumMentions: facts.premiumMentions.slice(0, 8),
        bodySlice: facts.bodySlice.slice(0, 400),
        shot: file,
      },
      null,
      2
    )
  );
  return { label: `${label}_compose_flow`, ...facts, shot: file };
}

async function tryProfileMessage(page, handle, label) {
  await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  let facts = await pageFacts(page);
  await shot(page, `${label}_profile`);
  const btn = page.locator('[data-testid="sendDMFromProfile"]').or(page.getByRole('button', { name: /^message$/i })).first();
  if ((await btn.count().catch(() => 0)) > 0) {
    const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await btn.click({ timeout: 8000 }).catch(() => {});
    const popup = await popupPromise;
    const target = popup || page;
    await target.waitForTimeout(2500);
    facts = await pageFacts(target);
    const file = await shot(target, `${label}_after_message_click`);
    console.log(
      JSON.stringify(
        {
          step: `${label}_message_click`,
          url: facts.href,
          class: facts.classification,
          dmComposer: facts.dmComposer,
          paywall: facts.paywallBox,
          dialogs: facts.dialogs,
          premiumMentions: facts.premiumMentions.slice(0, 8),
          bodySlice: facts.bodySlice.slice(0, 400),
          shot: file,
        },
        null,
        2
      )
    );
    if (popup) await popup.close().catch(() => {});
    return { label: `${label}_message_click`, ...facts, shot: file };
  }
  console.log(JSON.stringify({ step: `${label}_message_click`, noMessageButton: true, ...facts }, null, 2));
  return { label: `${label}_message_click`, noMessageButton: true, ...facts };
}

async function run() {
  const cookies = loadCookies();
  const meta = cookieMeta(cookies);
  console.log('COOKIE_META', JSON.stringify(meta, null, 2));
  if (!xAuthTokenPresent().present) {
    return { ok: false, reason: 'no_auth', meta };
  }

  // Fresh profile so stale home DOM does not leak into audit
  const sessionDir = path.join(dataRoot(), 'session_data_x_audit');
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const context = await chromium.launchPersistentContext(sessionDir, {
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

  const steps = [];
  try {
    if (cookies.length) await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());

    steps.push(await visit(page, '01_home', 'https://x.com/home'));
    steps.push(await visit(page, '02_messages', 'https://x.com/messages'));
    steps.push(await visit(page, '03_compose_empty', 'https://x.com/messages/compose'));

    for (const h of HANDLES) {
      const tag = h.toLowerCase();
      steps.push(await tryComposeSearch(page, h, `04_${tag}`));
      steps.push(await tryProfileMessage(page, h, `05_${tag}`));
    }

    // Account page for self
    const me = String(steps[0]?.accountText || '').match(/@([A-Za-z0-9_]+)/)?.[1];
    if (me) {
      steps.push(await visit(page, '06_self_profile', `https://x.com/${me}`));
    }

    const report = {
      ok: true,
      cookieMeta: meta,
      loggedInAs: steps[0]?.accountText || null,
      loginWall: steps.some((s) => s.loginWall || s.classification === 'login_wall'),
      steps: steps.map((s) => ({
        label: s.label,
        href: s.href,
        classification: s.classification,
        accountText: s.accountText,
        dmComposer: s.dmComposer,
        tweetComposer: s.tweetComposer,
        msgBtn: s.msgBtn,
        paywallBox: s.paywallBox,
        dialogs: s.dialogs,
        premiumMentions: s.premiumMentions,
        bodySlice: s.bodySlice?.slice(0, 300),
        shot: s.shot,
      })),
    };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('REPORT_WRITTEN', path.join(OUT, 'report.json'));
    console.log(
      'SUMMARY',
      JSON.stringify(
        {
          loggedInAs: report.loggedInAs,
          loginWall: report.loginWall,
          classes: report.steps.map((s) => `${s.label}:${s.classification}`),
        },
        null,
        2
      )
    );
    return report;
  } finally {
    await context.close().catch(() => {});
  }
}

const locked = await withCycleLock('C', () => run(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('audit skipped:', locked.reason);
  process.exit(2);
}
process.exit(locked?.result?.ok ? 0 : 1);
