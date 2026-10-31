#!/usr/bin/env node
/**
 * Read-only: unlock PIN, open DMs with farman32740 + Agzer19, dump whether our ice is present.
 * Screenshots → scripts/_x_audit/verify_*.png
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { withCycleLock } from '../cycleLock.js';
import { dataRoot } from '../dataRoot.js';
import { xAuthTokenPresent, xCookiesFile } from '../xSessionHealth.js';
import * as crm from '../crmStore.js';
import { STATUS_CONVERSATION, STATUS_LEAD } from '../crm/constants.js';
import { channelFromUrl, xHandleFromUrl } from '../leadChannel.js';

dotenv.config({ override: true });

const HANDLES = ['farman32740', 'Agzer19'];
const OUT = path.join(dataRoot(), 'scripts', '_x_audit');
fs.mkdirSync(OUT, { recursive: true });

function loadCookies() {
  return JSON.parse(fs.readFileSync(xCookiesFile(), 'utf8')).map((c) => {
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
}

async function shot(page, name) {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false }).catch(() => {});
  console.log('SHOT', name, page.url());
  return f;
}

async function unlock(page) {
  const code = String(process.env.X_CHAT_PASSCODE || '').replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4) return { ok: false, reason: 'no_pin' };
  const body = await page.locator('body').innerText().catch(() => '');
  const onPin = /pin\/recovery/i.test(page.url()) || /enter passcode|encryption keys/i.test(body);
  if (!onPin) return { ok: true, reason: 'not_needed' };
  const inputs = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
  const n = await inputs.count().catch(() => 0);
  if (n >= 4) {
    for (let i = 0; i < 4; i++) {
      await inputs.nth(i).click().catch(() => {});
      await inputs.nth(i).fill(code[i]).catch(() => {});
    }
  } else {
    await page.keyboard.type(code, { delay: 100 });
  }
  await page.waitForURL((u) => !/pin\/recovery/i.test(String(u)), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  return { ok: !/pin\/recovery/i.test(page.url()), reason: 'unlocked' };
}

async function openThread(page, handle) {
  await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, `verify_${handle}_profile`);
  const btn = page.locator('[data-testid="sendDMFromProfile"]').first();
  if ((await btn.count()) === 0) {
    return { handle, open: false, reason: 'no_message_btn' };
  }
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(3000);
  await shot(page, `verify_${handle}_after_click`);
  const pin = await unlock(page);
  await shot(page, `verify_${handle}_after_pin`);
  await page.waitForTimeout(2500);
  await shot(page, `verify_${handle}_thread`);

  // Collect readable text from main + frames
  const texts = [];
  texts.push(await page.locator('body').innerText().catch(() => ''));
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    texts.push(await frame.locator('body').innerText({ timeout: 1000 }).catch(() => ''));
  }
  const all = texts.join('\n').replace(/\s+/g, ' ').trim();
  return {
    handle,
    open: true,
    pin,
    url: page.url(),
    bodyLen: all.length,
    bodySlice: all.slice(0, 800),
    hasYou: /You:\s*/i.test(all),
    hasHi: /Hi\s+(hopesoDeveloper|Rodjo|farman|Agzer)/i.test(all),
    hasWaffi: /WAFFi|Mykhailo/i.test(all),
    hasUnencrypted: /Unencrypted message/i.test(all),
  };
}

async function crmIce(handle) {
  for (const st of [STATUS_CONVERSATION, STATUS_LEAD]) {
    for (const l of await crm.listByStatus(st)) {
      if (channelFromUrl(l.url) !== 'x') continue;
      if ((xHandleFromUrl(l.url) || '').toLowerCase() !== handle.toLowerCase()) continue;
      return {
        status: st,
        name: l.name,
        msg: String(l.msg || '').slice(0, 120),
        notesHasSent: String(l.notes || '').includes('X DM sent'),
        notesReason: (String(l.notes || '').match(/reason=([^\n]+)/) || [])[1] || null,
      };
    }
  }
  return null;
}

async function run() {
  if (!xAuthTokenPresent().present) return { ok: false, reason: 'no_auth' };
  const dir = path.join(dataRoot(), 'session_data_x_verify');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  const report = { who: null, threads: [], crm: {} };
  try {
    await ctx.addCookies(loadCookies());
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    report.who = (
      await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').innerText().catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .trim();
    await shot(page, 'verify_00_home');

    // Also open messages list
    await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const pin0 = await unlock(page);
    await shot(page, 'verify_01_messages');
    report.messagesPin = pin0;
    report.messagesUrl = page.url();
    report.messagesBody = (await page.locator('body').innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);

    for (const h of HANDLES) {
      report.crm[h] = await crmIce(h);
      report.threads.push(await openThread(page, h));
    }

    fs.writeFileSync(path.join(OUT, 'verify_report.json'), JSON.stringify(report, null, 2));
    console.log('REPORT', JSON.stringify(report, null, 2));
    return { ok: true, report };
  } finally {
    await ctx.close().catch(() => {});
  }
}

const locked = await withCycleLock('C', () => run(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('skipped', locked.reason);
  process.exit(2);
}
process.exit(locked?.result?.ok ? 0 : 1);
