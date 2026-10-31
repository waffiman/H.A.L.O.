#!/usr/bin/env node
/**
 * Minimal IG DM probe: Playwright + ig_cookies.json → one message.
 * Usage:
 *   node scripts/run-ig-dm-probe.js <handle> [message...]
 *   node scripts/run-ig-dm-probe.js _auto_ [message...]   # pick first public search hit
 */
import dotenv from 'dotenv';
import { applyTenantEnv } from '../tenantEnv.js';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';

dotenv.config({ override: true });
applyTenantEnv();

const argHandle = String(process.argv[2] || '')
  .replace(/^@/, '')
  .trim();
const message =
  process.argv.slice(3).join(' ').trim() ||
  'Hi — quick HALO delivery check from WAFFi (you can ignore).';

if (!argHandle) {
  console.error('Usage: node scripts/run-ig-dm-probe.js <handle|_auto_> [message]');
  process.exit(2);
}

const { withCycleLock } = await import('../cycleLock.js');
const { sendIgIceBreaker } = await import('../igSend.js');
const { igCookiesFile, igSessionDataDir, markIgSessionDead, markIgSessionOk } = await import(
  '../igSessionHealth.js'
);

function loadCookies() {
  try {
    const list = JSON.parse(fs.readFileSync(igCookiesFile(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function normalizeCookieValue(raw) {
  let v = String(raw ?? '');
  try {
    if (/%[0-9A-Fa-f]{2}/.test(v)) v = decodeURIComponent(v);
  } catch {
    /* keep */
  }
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

function toPlaywright(c) {
  if (!c?.name || c.value == null) return null;
  const domain = String(c.domain || '.instagram.com').replace(/^\./, '');
  return {
    name: c.name,
    value: normalizeCookieValue(c.value),
    domain: domain.startsWith('.') ? domain : `.${domain}`,
    path: c.path || '/',
    httpOnly: Boolean(c.httpOnly),
    secure: c.secure !== false,
    sameSite: c.sameSite === 'lax' || c.sameSite === 'Lax' ? 'Lax' : 'None',
    expires:
      typeof c.expirationDate === 'number'
        ? Math.floor(c.expirationDate)
        : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
  };
}

async function pickAutoHandle() {
  const cookies = loadCookies().map(toPlaywright).filter(Boolean);
  if (!cookies.some((c) => c.name === 'sessionid')) {
    throw new Error('sessionid missing');
  }
  const profileDir = igSessionDataDir();
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 820 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    if (/accounts\/login|challenge/i.test(page.url())) {
      markIgSessionDead('auth_wall', { at: 'ig_dm_probe.auto' });
      throw new Error('Instagram auth wall on home');
    }
    markIgSessionOk({ source: 'ig_dm_probe' });
    await page.goto('https://www.instagram.com/explore/search/keyword/?q=founder%20ceo', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    }).catch(() => {});
    await page.waitForTimeout(1500);
    // Prefer classic search box
    const search = page.locator('input[placeholder*="Search"], input[aria-label*="Search"]').first();
    if (await search.count()) {
      await search.click().catch(() => {});
      await search.fill('founder agency');
      await page.waitForTimeout(2000);
    }
    // Own profile from nav (skip self — Message composer won't open)
    const selfHref = await page
      .locator('a[href*="/"] img[alt*="profile"], a[href^="/"][role="link"]')
      .evaluateAll((nodes) =>
        nodes
          .map((n) => n.closest('a')?.getAttribute('href') || '')
          .find((h) => /^\/[A-Za-z0-9._]+\/?$/.test(h))
      )
      .catch(() => '');
    const self = String(selfHref || '')
      .replace(/\//g, '')
      .toLowerCase();
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/"]')]
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => /^\/[A-Za-z0-9._]+\/?$/.test(h) && !/\/(explore|reels|direct|accounts|stories)\//.test(h))
        .map((h) => h.replace(/\//g, ''))
        .filter(Boolean)
    );
    const skip = new Set([
      '',
      'explore',
      'reels',
      'direct',
      'accounts',
      'stories',
      'p',
      'reel',
      'waffi_agency',
      self,
    ].filter(Boolean));
    const handle = hrefs.find((h) => !skip.has(h.toLowerCase()) && h.length >= 3);
    if (!handle) throw new Error(`auto handle: no search hits (self=${self || '?'})`);
    console.log('[IG probe] auto handle:', handle, 'self=', self || '?');
    return handle;
  } finally {
    await context.close().catch(() => {});
  }
}

const locked = await withCycleLock(
  'C',
  async () => {
    let handle = argHandle;
    if (handle === '_auto_') handle = await pickAutoHandle();
    const r = await sendIgIceBreaker(handle, message);
    console.log('IG DM probe result:', JSON.stringify({ handle, ...r }));
    return { handle, ...r };
  },
  { skipIfBusy: true }
);

if (locked?.skipped) {
  console.log('skipped:', locked.reason);
  process.exit(2);
}
process.exit(locked?.result?.ok ? 0 : 1);
