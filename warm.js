
import "dotenv/config";
import fs from "fs";
import path from "path";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
chromium.use(StealthPlugin());
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sessionPath = path.join(process.cwd(), "session_data_connect");
fs.mkdirSync(sessionPath, { recursive: true });
for (const name of fs.readdirSync(sessionPath)) {
  fs.rmSync(path.join(sessionPath, name), { recursive: true, force: true });
}
const browser = await chromium.launchPersistentContext(sessionPath, {
  headless: true,
  userAgent: UA,
  viewport: { width: 1365, height: 900 },
  isMobile: false,
  hasTouch: false,
  locale: "en-US",
  args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-blink-features=AutomationControlled","--disable-gpu"],
  ignoreDefaultArgs: ["--enable-automation"],
});
try {
  const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
  await browser.addCookies(cookies);
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  console.log("WARM", page.url(), await page.title());
  const auth = /uas\/login|\/login|checkpoint|authwall/i.test(page.url());
  console.log("WARM_AUTH", auth);
  if (!auth) {
    const live = await browser.cookies();
    const li = live.filter(c => /linkedin\.com/i.test(c.domain||""));
    if (li.some(c => c.name === "li_at")) {
      fs.writeFileSync("cookies.json", JSON.stringify(li, null, 2));
      console.log("WARM_PERSIST", li.length);
    }
  }
} finally {
  await browser.close().catch(()=>{});
}
