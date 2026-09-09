import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('screenshots/iter3b');
const BASE = 'http://127.0.0.1:3080/';
const AUTH = { username: 'wafficompany@gmail.com', password: 'Justwaffi2023#' };

const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'crm', label: 'CRM' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'integrations', label: 'Integrations' },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  httpCredentials: AUTH,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);

for (const p of PAGES) {
  await page.click(`button.nav-item[data-page="${p.id}"]`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${p.id}.png`), fullPage: true });
  console.log('shot', p.id);
}

await page.click('#btn-bell');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'notifications.png'), fullPage: true });
console.log('shot notifications');

// Verify iter3 checks in page
const checks = await page.evaluate(() => {
  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue('--muted').trim() || getComputedStyle(document.querySelector('.muted') || document.body).color;
  const brandBefore = document.querySelector('.brand::before');
  const brandMark = document.querySelector('.brand-mark');
  const brandStyle = brandMark ? getComputedStyle(brandMark) : null;
  const pulse = brandStyle ? brandStyle.animationName : '';
  const panel = document.getElementById('notify-panel');
  const panelStyle = panel ? getComputedStyle(panel) : null;
  const topActions = document.querySelector('.top-actions');
  return {
    interLoaded: document.fonts.check('600 16px Inter'),
    mutedSample: getComputedStyle(document.querySelector('.hint') || document.body).color,
    brandHasMark: !!brandMark,
    brandPulse: pulse,
    notifyPosition: panelStyle?.position || '',
    notifyBackdrop: !!document.getElementById('notify-backdrop'),
    instagramNoSave: topActions?.classList.contains('no-save') ?? null,
  };
});

// Instagram save hidden check
await page.click('button.nav-item[data-page="instagram"]');
await page.waitForTimeout(400);
const igSave = await page.evaluate(() => {
  const ta = document.querySelector('.top-actions');
  const save = document.getElementById('btn-save');
  return {
    noSaveClass: ta?.classList.contains('no-save'),
    saveDisplay: save ? getComputedStyle(save).display : null,
  };
});

console.log('CHECKS', JSON.stringify({ ...checks, igSave }, null, 2));
await browser.close();
console.log('DONE', OUT);
