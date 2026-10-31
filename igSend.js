/**
 * Send one Instagram ice-breaker via Playwright (message request / first DM).
 * Separate Chromium profile: session_data_ig. Never touches LinkedIn / X jars.
 */
import fs from 'fs';
import { chromium } from 'playwright';
import { igCookiesFile, igSessionDataDir, markIgSessionDead, markIgSessionOk } from './igSessionHealth.js';
import { canonicalInstagramProfileUrl, instagramHandleFromUrl } from './leadChannel.js';

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
    /* keep raw */
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
        : typeof c.expires === 'number'
          ? Math.floor(c.expires)
          : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
  };
}

async function humanPause(min = 800, max = 2200) {
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min)));
}

/**
 * @returns {{ ok: boolean, status: string, error?: string }}
 */
export async function sendIgIceBreaker(urlOrHandle, message) {
  const handle = instagramHandleFromUrl(urlOrHandle);
  const text = String(message || '').trim();
  if (!handle) return { ok: false, status: 'bad_handle', error: 'Invalid Instagram handle' };
  if (!text) return { ok: false, status: 'empty_message', error: 'Empty ice-breaker' };

  const cookies = loadCookies().map(toPlaywright).filter(Boolean);
  if (!cookies.some((c) => c.name === 'sessionid')) {
    return { ok: false, status: 'no_session', error: 'sessionid missing' };
  }

  const profileDir = igSessionDataDir();
  fs.mkdirSync(profileDir, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 820 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    await context.addCookies(cookies);
    const page = context.pages()[0] || (await context.newPage());
    const profileUrl = canonicalInstagramProfileUrl(handle);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanPause(1200, 2400);

    if (/accounts\/login|challenge/i.test(page.url())) {
      markIgSessionDead('auth_wall', { at: 'igSend.profile' });
      return { ok: false, status: 'auth_wall', error: 'Instagram auth wall' };
    }
    markIgSessionOk({ source: 'igSend' });

    // 1) Profile Message button (when available)
    let opened = false;
    const msgBtn = page
      .locator('header button, header a, div[role="button"], a')
      .filter({ hasText: /^(Message|Messages|Send message|Nachricht)$/i })
      .first();
    if (await msgBtn.count()) {
      await msgBtn.click({ timeout: 8000 }).catch(() => {});
      await humanPause(1000, 2000);
      const early = page.locator(
        'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"], textarea[aria-label*="Message"]'
      );
      if (await early.first().isVisible().catch(() => false)) opened = true;
    }

    // 2) Direct compose by username (works for message requests)
    if (!opened) {
      for (const composeUrl of [
        'https://www.instagram.com/direct/new/',
        'https://www.instagram.com/direct/inbox/',
      ]) {
        await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await humanPause(900, 1600);
        if (composeUrl.includes('inbox')) {
          const pen = page
            .locator('svg[aria-label="New message"], svg[aria-label="Новое сообщение"], [aria-label="New message"]')
            .first();
          if (await pen.count()) {
            await pen.click({ timeout: 5000 }).catch(() => {});
            await humanPause(800, 1400);
          }
        }
        const search = page
          .locator(
            'input[name="queryBox"], input[placeholder*="Search"], input[aria-label*="Search"], input[placeholder*="Search..."]'
          )
          .first();
        if (!(await search.count())) continue;
        await search.click().catch(() => {});
        await search.fill('');
        await search.fill(handle);
        await humanPause(1200, 2000);
        const hit = page
          .locator(
            `span:text-is("${handle}"), div:text-is("${handle}"), span:has-text("${handle}"), a[href="/${handle}/"]`
          )
          .first();
        if (await hit.count()) {
          await hit.click();
          await humanPause(600, 1200);
        }
        const next = page
          .locator(
            'div[role="button"]:has-text("Chat"), button:has-text("Chat"), div[role="button"]:has-text("Next"), button:has-text("Next"), div[role="button"]:has-text("Chat"), div[role="button"]:has-text("Чат")'
          )
          .first();
        if (await next.count()) {
          await next.click().catch(() => {});
          await humanPause(900, 1600);
        }
        const box = page.locator(
          'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"], textarea[aria-label*="Message"]'
        );
        if (await box.first().isVisible().catch(() => false)) {
          opened = true;
          break;
        }
      }
    }

    const composer = page
      .locator(
        'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"], textarea[aria-label*="Message"], p[contenteditable="true"]'
      )
      .first();
    await composer.waitFor({ state: 'visible', timeout: 25000 });
    await composer.click();
    await humanPause(400, 900);
    await page.keyboard.type(text, { delay: 18 + Math.floor(Math.random() * 28) });
    await humanPause(500, 1100);

    const send = page
      .locator('div[role="button"]:has-text("Send"), button:has-text("Send"), div[role="button"]:has-text("Отправить")')
      .first();
    if (await send.count()) {
      await send.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await humanPause(1500, 2800);

    console.log(`[IG send] ice → @${handle} (${text.length} chars)`);
    return { ok: true, status: 'sent' };
  } catch (e) {
    console.error('[IG send]', e?.message || e);
    try {
      const pages = context?.pages?.() || [];
      const p = pages[0];
      if (p) {
        const shot = `/app/session_data_ig/ig_send_fail.png`;
        await p.screenshot({ path: shot, fullPage: false }).catch(() => {});
        console.error('[IG send] url=', p.url(), 'shot=', shot);
      }
    } catch {
      /* ignore */
    }
    return { ok: false, status: 'error', error: String(e?.message || e).slice(0, 240) };
  } finally {
    try {
      await context?.close();
    } catch {
      /* ignore */
    }
  }
}
