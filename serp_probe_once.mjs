import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const search = process.env.CONNECT_SEARCH_URL;
const sessionPath = path.join(process.cwd(), 'session_data_connect_probe');
fs.rmSync(sessionPath, { recursive: true, force: true });
fs.mkdirSync(sessionPath, { recursive: true });

const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'));
const browser = await chromium.launchPersistentContext(sessionPath, {
  headless: true,
  userAgent: UA,
  viewport: { width: 1365, height: 900 },
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1365,900',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
});

await browser.addCookies(cookies);
const page = browser.pages()[0] || (await browser.newPage());
await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);
console.log('FEED', page.url(), '|', await page.title());

await page.goto(search, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(6000);
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(900);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const bodyText = (document.body && document.body.innerText) || '';
  const hrefs = [...document.querySelectorAll('a[href*="/in/"]')].map((a) => a.href).slice(0, 20);
  const buttons = [...document.querySelectorAll('button, [role="button"]')]
    .map((b) =>
      ((b.getAttribute('aria-label') || '') + ' | ' + (b.innerText || '')).replace(/\s+/g, ' ').trim()
    )
    .filter(Boolean)
    .slice(0, 50);
  return {
    url: location.href,
    title: document.title,
    textLen: bodyText.length,
    hrefs,
    buttons,
    text: bodyText.slice(0, 2500),
    htmlSnippet: (document.documentElement.outerHTML || '').slice(0, 5000),
  };
});

fs.writeFileSync('serp_probe.json', JSON.stringify(info, null, 2));
await page.screenshot({ path: 'serp_probe.png', fullPage: false });
console.log(
  JSON.stringify(
    {
      url: info.url,
      title: info.title,
      textLen: info.textLen,
      hrefCount: info.hrefs.length,
      buttonCount: info.buttons.length,
      hrefs: info.hrefs.slice(0, 8),
      buttons: info.buttons.slice(0, 25),
      textPreview: info.text.slice(0, 1000),
    },
    null,
    2
  )
);
await browser.close();
