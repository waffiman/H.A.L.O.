/**
 * Headless Chromium repair worker.
 * Normal path: native repair form posts {signin} → fill + click Sign in.
 * Challenge path: livestream screenshot + remote click/fill.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { markSessionOk } from './sessionHealth.js';
import {
  cookiesFile,
  sessionDataDir,
  sessionRepairDataDir,
  stateJsonFile,
  stageBStateFile,
  dataRoot,
} from './dataRoot.js';

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, 'session_repair.json');
const FRAME_PATH = path.join(ROOT, 'session_repair_frame.jpg');
const INPUT_PATH = path.join(ROOT, 'session_repair_input.jsonl');
const CAPTCHA_DIR = path.join(ROOT, 'session_repair_captcha');
function cookiesPath() {
  return cookiesFile();
}
const TOKEN = process.env.REPAIR_TOKEN || '';
const MAX_MS = Number(process.env.REPAIR_TIMEOUT_MS || 20 * 60 * 1000);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(patch) {
  const prev = readState() || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function toPlaywrightCookies(cookies) {
  return cookies
    .filter((c) => /linkedin\.com/i.test(String(c.domain || '')))
    .map((c) => {
      const item = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite === 'Strict' ? 'Strict' : c.sameSite === 'Lax' ? 'Lax' : 'None',
      };
      if (c.expires && c.expires > 0) item.expires = Math.floor(c.expires);
      return item;
    });
}

function wipeDirContents(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch (inner) {
      console.error('wipe entry:', dir, name, inner.message);
    }
  }
}

/** Stricter than body "sign in" grep — mobile feed promos must not block harvest. */
async function pageLooksLikeAuthWall(page) {
  const url = (page.url() || '').toLowerCase();
  if (/\/uas\/login|\/checkpoint\/lg\/login|authwall|\/signup/.test(url)) return true;
  if (/linkedin\.com\/login(\?|$|\/)/.test(url)) return true;
  const title = ((await page.title().catch(() => '')) || '').toLowerCase();
  if (/^sign in\s*\|/.test(title) || /^linkedin login/.test(title)) return true;
  const body = await page
    .evaluate(() => ((document.body && document.body.innerText) || '').slice(0, 500))
    .catch(() => '');
  if (/welcome to your professional community/i.test(body)) return true;
  if (/sign in as /i.test(body) && /join now/i.test(body) && !/\/feed/i.test(url)) return true;
  return false;
}

/** Poll for li_at after app approval — avoid rapid reloads; they reset the app-approval handshake. */
let lastChallengeReloadAt = 0;

async function waitForPostApproval(context, page) {
  const hasLiAt = (list) => list.some((c) => c.name === 'li_at' && c.value && c.value.length > 20);
  const onAppUrl = (u) =>
    /linkedin\.com\/(feed|mynetwork|messaging)/i.test(u || '') && !/login|checkpoint|authwall/i.test(u || '');

  if (hasLiAt(await context.cookies())) return true;

  const url = page.url() || '';
  if (onAppUrl(url)) return true;

  const now = Date.now();
  if (now - lastChallengeReloadAt < 15000) {
    await page.waitForTimeout(1000);
    return false;
  }
  lastChallengeReloadAt = now;

  console.log('Post-approval gentle reload (15s cadence), url=', url.slice(0, 120));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  if (hasLiAt(await context.cookies())) {
    console.log('li_at appeared after gentle reload');
    return true;
  }

  const url2 = page.url() || '';
  if (onAppUrl(url2)) {
    console.log('Challenge page redirected:', url2.slice(0, 100));
    return true;
  }
  return false;
}

/** Only harvest when li_at exists AND feed is actually reachable (not a stale jar). */
async function tryHarvest(context, page, { requireLive = true } = {}) {
  const cookies = await context.cookies();
  const li = cookies.find((c) => c.name === 'li_at' && c.value && c.value.length > 20);
  if (!li) {
    console.log('tryHarvest skip — no li_at in context yet');
    return false;
  }

  if (requireLive && page) {
    const urlNow = page.url() || '';
    const alreadyOnApp =
      /linkedin\.com\/(feed|messaging|mynetwork|in\/)/i.test(urlNow) &&
      !/login|authwall|uas\/login|checkpoint/i.test(urlNow);
    if (!alreadyOnApp) {
      await page
        .goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 })
        .catch(() => {});
      await page.waitForTimeout(1500);
    }
    const url = page.url() || '';
    const stillAuth = await pageLooksLikeAuthWall(page);
    const liveHasLiAt = (await context.cookies()).some((c) => c.name === 'li_at' && c.value && c.value.length > 20);
    const onFeedUrl = /linkedin\.com\/feed/i.test(url) && !stillAuth;
    const onApp =
      onFeedUrl ||
      /linkedin\.com\/(messaging|mynetwork|mwlite)/i.test(url) ||
      (/linkedin\.com/i.test(url) && !stillAuth && liveHasLiAt && !/login|checkpoint|authwall/i.test(url));
    // Mobile feed: li_at + /feed/ + no auth wall is enough (matches ensureLoggedInBrowser).
    if (stillAuth || !liveHasLiAt || !onApp) {
      console.log(
        'tryHarvest skip —',
        stillAuth ? 'auth wall' : !liveHasLiAt ? 'no li_at' : 'not on app url',
        url.slice(0, 120)
      );
      return false;
    }
  }

  const packed = toPlaywrightCookies(await context.cookies());
  const stillLi = packed.find((c) => c.name === 'li_at' && c.value && c.value.length > 20);
  if (!stillLi) return false;
  fs.writeFileSync(cookiesPath(), JSON.stringify(packed, null, 2));
  // Bind-mounted session_data cannot be renamed (EBUSY) — clear contents instead.
  try {
    wipeDirContents(sessionDataDir());
  } catch (e) {
    console.error('session_data reset:', e.message);
  }
  try {
    const statePath = stateJsonFile();
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  } catch (e) {
    console.error('state.json wipe:', e.message);
  }
  try {
    const now = new Date().toISOString();
    fs.writeFileSync(
      stageBStateFile(),
      JSON.stringify({ lastInboxScanAt: now, lastBrowserAt: now }, null, 2)
    );
  } catch {
    /* ignore */
  }
  markSessionOk({
    source: 'remote_repair',
    cookieCount: packed.length,
    needsCookieRepair: false,
    url: page?.url?.() || undefined,
    feedVisible: true,
  });
  writeState({
    status: 'captured',
    liAtCaptured: true,
    uiMode: 'done',
    capturedAt: new Date().toISOString(),
  });
  try {
    const { notify } = await import('./notify.js');
    await notify({
      type: 'session',
      severity: 'info',
      forceTelegram: true,
      key: `session_repaired_${Date.now()}`,
      title: 'LinkedIn session restored',
      message: 'Remote repair captured a fresh li_at. You can close the repair tab.',
    });
  } catch (e) {
    console.error('repair notify:', e.message);
  }
  console.log('Repair captured live li_at — session marked OK');
  return true;
}

async function fillInput(page, selectorList, value) {
  const filled = await page.evaluate(
    ({ selectors, value: text }) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        el.focus();
        const tag = (el.tagName || '').toLowerCase();
        const proto =
          tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc?.set) desc.set.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    },
    { selectors: selectorList, value }
  );
  return filled;
}

/** Block Google One Tap / GSI so it cannot cover LinkedIn Sign in. */
async function blockGoogleOneTap(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (
      /accounts\.google\.com|credential\.google|gsi\/client|gsi\/button|onetap|apis\.google\.com\/js\/(api|platform|client)/i.test(
        url
      )
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

async function dismissLoginOverlays(page) {
  await page
    .addStyleTag({
      content: `
        iframe[src*="accounts.google"], iframe[src*="gsi"], iframe[id*="gsi"],
        #credential_picker_container, #credential_picker_iframe {
          display: none !important; visibility: hidden !important;
          pointer-events: none !important; height: 0 !important; overflow: hidden !important;
        }
      `,
    })
    .catch(() => {});

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  await page
    .evaluate(() => {
      for (const iframe of document.querySelectorAll('iframe')) {
        const src = iframe.src || '';
        if (/google|gsi|onetap/i.test(src)) iframe.remove();
      }
      for (const el of document.querySelectorAll(
        '#credential_picker_container, #credential_picker_iframe, [id*="credential_picker"]'
      )) {
        el.remove();
      }
      for (const el of [...document.querySelectorAll('div, section')]) {
        const t = (el.innerText || '').slice(0, 200);
        if (/sign in to linkedin with google/i.test(t) && el.querySelector('button')) {
          el.style.setProperty('display', 'none', 'important');
          el.remove();
        }
      }
    })
    .catch(() => {});

  await page.waitForTimeout(200);
}

async function readLoginPageHint(page) {
  return page
    .evaluate(() => {
      const t = document.body?.innerText || '';
      if (
        /wrong email or password|incorrect password|couldn.?t find.*account|that.?s not the right password|hmm,? that.?s not the right password|we don.?t recognize that email|password you.?ve entered is incorrect|неверн(ый|ая|ое).*(парол|email|логин)|неправильн(ый|ая).*(парол|email)/i.test(
          t
        )
      ) {
        return 'Wrong email or password — fix it above and Sign in again.';
      }
      if (/sign in to linkedin with google/i.test(t)) {
        return 'Google sign-in popup blocked the form — closing it and retrying…';
      }
      if (/captcha|security verification|unusual activity/i.test(t)) {
        return 'Security check — open the LinkedIn page in H.A.L.O. and follow the steps.';
      }
      return null;
    })
    .catch(() => null);
}

function isWrongPasswordHint(hint) {
  return /wrong email or password/i.test(String(hint || ''));
}

/** Stop repair cleanly so Stage R lock releases and the user can retry Sign in. */
function failCredentials(hint) {
  const msg = hint || 'Wrong email or password — fix it above and Sign in again.';
  writeState({
    status: 'credential_error',
    error: msg,
    lastSignInError: msg,
    uiMode: 'form',
    credentialErrorAt: new Date().toISOString(),
  });
  console.log('Credential error — stopping repair worker:', msg);
  const err = new Error(msg);
  err.code = 'CREDENTIAL_ERROR';
  throw err;
}

async function clickSignIn(page) {
  await dismissLoginOverlays(page);
  const pass = page.locator('input#password, input[name="session_password"], input[type="password"]').first();
  if (await pass.count()) {
    await pass.press('Enter').catch(() => {});
    return 'password Enter';
  }

  const oauthRe = /with\s+(apple|google|microsoft|one\b|passkey)|^continue$/i;
  const exact = page.locator('button.btn__primary--large[type="submit"], button[type="submit"].btn__primary--large').first();
  if ((await exact.count()) && (await exact.isVisible().catch(() => false))) {
    const label = ((await exact.textContent()) || '').trim();
    if (!oauthRe.test(label)) {
      await exact.scrollIntoViewIfNeeded().catch(() => {});
      await exact.click({ timeout: 8000, force: true }).catch(() => {});
      return label.slice(0, 40) || 'primary submit';
    }
  }

  const byRole = page.getByRole('button', { name: /^sign in$/i });
  if ((await byRole.count()) && (await byRole.first().isVisible().catch(() => false))) {
    await byRole.first().click({ timeout: 8000, force: true }).catch(() => {});
    return 'Sign in';
  }

  const clicked = await page.evaluate(() => {
    const oauth = (t) => /with\s+(apple|google|microsoft|one\b|passkey)|^continue$/i.test(t);
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit?.() || form.submit();
      return 'form.submit';
    }
    for (const b of document.querySelectorAll('button[type="submit"], button.btn__primary--large, form button')) {
      const t = (b.textContent || b.getAttribute('aria-label') || '').trim();
      if (oauth(t)) continue;
      if (/^sign\s*in$/i.test(t) || /^log\s*in$/i.test(t) || b.type === 'submit') {
        b.click();
        return t.slice(0, 40) || 'submit';
      }
    }
    return null;
  });
  return clicked || 'none';
}

async function detectChallengeKind(page) {
  const url = page.url() || '';
  const fromDom = await page
    .evaluate(() => {
      const t = (document.body?.innerText || '').slice(0, 8000).toLowerCase();
      const hasRecaptcha =
        !!document.querySelector(
          'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], iframe[title*="recaptcha"], .g-recaptcha, #g-recaptcha'
        ) || /grecaptcha/i.test(document.documentElement?.innerHTML || '');
      const hasCodeField = !!document.querySelector(
        'input[name="pin"], input#input__phone_verification_pin, input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      );

      // Email/SMS code wins over leftover captcha iframes after the puzzle is solved.
      if (
        hasCodeField ||
        /enter the code|verification code|one-time|enter code|\bpin\b|код підтвердження|код подтверждения|введіть код|введите код|code de v[eé]rification|c[oó]digo de verificaci[oó]n|c[oó]digo de verifica[cç][aã]o|verifizierungscode|codice di verifica|kod weryfikacyjny|doğrulama kodu|認証コード|验证码|رمز التحقق|we (emailed|sent).{0,40}code|email.{0,20}code|code.{0,20}(email|inbox|phone|sms)|check your email|sent (you )?a code|otp|one.time password/.test(
          t
        )
      ) {
        // "Provide a new email" is a different LinkedIn step (not the OTP box).
        if (
          /provide a new email|new email address|re-enter email|public profile url/i.test(t)
        ) {
          return 'email_update';
        }
        return 'pin';
      }

      if (
        /provide a new email|new email address|re-enter email|you will use this email address to sign in/i.test(
          t
        )
      ) {
        return 'email_update';
      }

      // Captcha / security check
      if (
        hasRecaptcha ||
        /captcha|i.?m not a robot|i am not a robot|security check|quick security|puzzle|я не робот|не робот|ich bin kein roboter|je ne suis pas un robot|no soy un robot|não sou um robô|non sono un robot/.test(
          t
        )
      ) {
        return 'captcha';
      }

      // Phone app approval — LinkedIn localizes checkpoint copy (EN + common locales).
      const appApproval =
        // EN
        /check your linkedin app|notification sent|tap yes|approve this sign|confirm (it'?s|this is) you|verify it'?s you|sign-in request|we sent a notification|open the linkedin app|waiting for approval|sent to your device|approve in (the )?app|check your phone|approve the request|yes,? it'?s me/.test(
          t
        ) ||
        // UA / RU
        /підтверд(іть|ження)|перевірте.*додаток|відкрийте.*додаток|запит на вхід|підтвердіть вхід|додатку linkedin|проверьте.*приложение|откройте.*приложение|подтвердите вход|запрос на вход|уведомление.*(отправлен|послан)|это вы|це ви/.test(
          t
        ) ||
        // DE / NL / PL
        /linkedin[- ]app|in der linkedin[- ]app|bestätigen sie|anmeldung bestätigen|anfrage (genehmigen|bestätigen)|in de linkedin[- ]app|bevestig (het is u|aanmelding)|in (aplikacji|aplikacji) linkedin|potwierdź (logowanie|że to ty)|zatwierdź/.test(
          t
        ) ||
        // FR / ES / PT / IT
        /application linkedin|approuvez|confirmez (qu.?il s.?agit de vous|la connexion)|demande de connexion|app de linkedin|aprueba|confirma (que eres tú|el inicio)|solicitud de inicio|aplicativo linkedin|aprova|confirme (que é você|o login)|app linkedin|approva|conferma (che sei tu|l.?accesso)|richiesta di accesso/.test(
          t
        ) ||
        // TR / JA / ZH / AR
        /linkedin uygulamas|onayla|giriş isteği|linkedinアプリ|承認|サインイン|领英|linkedin.?应用|确认是你|批准|تطبيق linkedin|وافق|تأكيد تسجيل/.test(
          t
        );
      if (appApproval) return 'app_approval';
      return null;
    })
    .catch(() => null);

  if (fromDom) return fromDom;

  // Still on plain login form after credentials → not a challenge yet.
  if (/login|uas\/login/i.test(url) && !/checkpoint|challenge/i.test(url)) {
    return null;
  }

  // Checkpoint URLs: pin → captcha iframe → app approval (never invent app_approval over captcha).
  if (/checkpoint|challenge|manage\/challenge|two-step|add-phone/i.test(url)) {
    const flags = await page
      .evaluate(() => ({
        hasCodeField: Boolean(
          document.querySelector(
            'input[name="pin"], input#input__phone_verification_pin, input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          )
        ),
        hasRecaptcha: Boolean(
          document.querySelector(
            'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], iframe[title*="recaptcha"], .g-recaptcha'
          )
        ),
      }))
      .catch(() => ({ hasCodeField: false, hasRecaptcha: false }));
    if (flags.hasCodeField) return 'pin';
    if (flags.hasRecaptcha) return 'captcha';
    // Also scan child frames for recaptcha.
    for (const fr of page.frames()) {
      if (/recaptcha|google\.com\/recaptcha/i.test(fr.url() || '')) return 'captcha';
    }
    return 'app_approval';
  }
  return null;
}

/** Inspect reCAPTCHA: checkbox vs image-tile challenge (bframe). */
async function getRecaptchaState(page) {
  const state = {
    hasAnchor: false,
    checked: false,
    imageChallengeOpen: false,
    bframeBox: null,
    anchorBox: null,
  };
  for (const fr of page.frames()) {
    const fu = fr.url() || '';
    if (!/recaptcha|google\.com\/recaptcha/i.test(fu)) continue;
    if (/bframe/i.test(fu)) {
      state.imageChallengeOpen = true;
      continue;
    }
    if (/anchor/i.test(fu) || /api2\/anchor/i.test(fu)) {
      state.hasAnchor = true;
      try {
        const checked = await fr
          .evaluate(() => {
            const el =
              document.querySelector('#recaptcha-anchor') ||
              document.querySelector('[role="checkbox"]');
            if (!el) return false;
            return (
              el.getAttribute('aria-checked') === 'true' ||
              el.classList.contains('recaptcha-checkbox-checked')
            );
          })
          .catch(() => false);
        state.checked = !!checked;
      } catch {
        /* ignore */
      }
    }
  }
  try {
    const b = page.locator('iframe[src*="bframe"]').first();
    if ((await b.count().catch(() => 0)) > 0 && (await b.isVisible().catch(() => false))) {
      state.imageChallengeOpen = true;
      state.bframeBox = await b.boundingBox().catch(() => null);
    }
  } catch {
    /* ignore */
  }
  try {
    const a = page.locator('iframe[src*="anchor"], iframe[title*="reCAPTCHA"]').first();
    if ((await a.count().catch(() => 0)) > 0) {
      state.anchorBox = await a.boundingBox().catch(() => null);
    }
  } catch {
    /* ignore */
  }
  return state;
}

/** Click Google reCAPTCHA checkbox only when unchecked and no image puzzle is open. */
async function tryClickRecaptcha(page) {
  const state = await getRecaptchaState(page);
  if (state.imageChallengeOpen) {
    console.log('Repair recaptcha skip checkbox — image challenge already open');
    return false;
  }
  if (state.checked) {
    console.log('Repair recaptcha skip checkbox — already checked');
    return false;
  }
  for (const fr of page.frames()) {
    const fu = fr.url() || '';
    if (!/recaptcha|google\.com\/recaptcha/i.test(fu)) continue;
    if (/bframe/i.test(fu)) continue;
    try {
      const anchor = fr.locator(
        '#recaptcha-anchor, .recaptcha-checkbox-border, .recaptcha-checkbox, span[role="checkbox"]'
      );
      if ((await anchor.count().catch(() => 0)) > 0) {
        await anchor.first().click({ timeout: 5000, force: true });
        console.log('Repair recaptcha checkbox clicked via frame');
        return true;
      }
    } catch (e) {
      console.log('recaptcha frame click:', e.message);
    }
  }
  try {
    const iframe = page.locator('iframe[src*="recaptcha"][src*="anchor"], iframe[title*="reCAPTCHA"]').first();
    if ((await iframe.count().catch(() => 0)) > 0) {
      await iframe.click({ timeout: 5000, force: true });
      console.log('Repair recaptcha iframe host clicked');
      return true;
    }
  } catch (e) {
    console.log('recaptcha host click:', e.message);
  }
  return false;
}

function clearCaptchaTileFiles() {
  try {
    fs.mkdirSync(CAPTCHA_DIR, { recursive: true });
    for (const name of fs.readdirSync(CAPTCHA_DIR)) {
      try {
        fs.unlinkSync(path.join(CAPTCHA_DIR, name));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function bframeFrom(page) {
  for (const fr of page.frames()) {
    if (/bframe/i.test(fr.url() || '')) return fr;
  }
  return null;
}

/** Publish captchaPhase + tile JPEGs for native dashboard UI (human still solves). */
async function syncCaptchaNativeUi(page) {
  const kind = await detectChallengeKind(page).catch(() => null);
  if (kind !== 'captcha') {
    writeState({
      captchaPhase: 'none',
      captchaChecked: false,
      captchaPrompt: null,
      captchaTileCount: 0,
      captchaCols: 3,
    });
    return;
  }
  const state = await getRecaptchaState(page);
  if (!state.imageChallengeOpen) {
    clearCaptchaTileFiles();
    writeState({
      captchaPhase: state.checked ? 'waiting' : 'checkbox',
      captchaChecked: !!state.checked,
      captchaPrompt: null,
      captchaTileCount: 0,
      captchaCols: 3,
    });
    return;
  }

  const fr = bframeFrom(page);
  let prompt = '';
  let saved = 0;
  let cols = 3;
  clearCaptchaTileFiles();
  fs.mkdirSync(CAPTCHA_DIR, { recursive: true });

  if (fr) {
    prompt = await fr
      .evaluate(() => {
        const el =
          document.querySelector('.rc-imageselect-desc-wrapper') ||
          document.querySelector('.rc-imageselect-desc') ||
          document.querySelector('#rc-imageselect');
        return String(el?.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240);
      })
      .catch(() => '');

    const tiles = fr.locator(
      'td.rc-imageselect-tile, .rc-imageselect-tile, .rc-image-tile-wrapper'
    );
    const count = await tiles.count().catch(() => 0);
    const max = Math.min(count, 16);
    cols = max > 9 ? 4 : 3;
    for (let i = 0; i < max; i++) {
      try {
        await tiles.nth(i).screenshot({
          path: path.join(CAPTCHA_DIR, `tile_${i}.jpg`),
          type: 'jpeg',
          quality: 72,
        });
        saved++;
      } catch (e) {
        console.log('captcha tile shot', i, e.message);
      }
    }
    try {
      const table = fr.locator('#rc-imageselect-target, table.rc-imageselect-table, table').first();
      if ((await table.count().catch(() => 0)) > 0) {
        await table.screenshot({
          path: path.join(CAPTCHA_DIR, 'challenge.jpg'),
          type: 'jpeg',
          quality: 70,
        });
      }
    } catch (e) {
      console.log('captcha table shot:', e.message);
    }
  }

  writeState({
    captchaPhase: 'image',
    captchaChecked: true,
    captchaPrompt: prompt || 'Select all images that match the prompt',
    captchaTileCount: saved,
    captchaCols: cols,
    captchaGridRev: Date.now(),
  });
  console.log(`Captcha native UI: image tiles=${saved} prompt="${(prompt || '').slice(0, 60)}"`);
}

async function clickCaptchaTile(page, index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0) return false;
  const fr = bframeFrom(page);
  if (!fr) return false;
  const tiles = fr.locator(
    'td.rc-imageselect-tile, .rc-imageselect-tile, .rc-image-tile-wrapper'
  );
  const n = await tiles.count().catch(() => 0);
  if (i >= n) {
    console.log('clickCaptchaTile out of range', i, n);
    return false;
  }
  await tiles.nth(i).click({ force: true, timeout: 5000 });
  console.log('Repair captcha tile index', i);
  return true;
}

async function clickCaptchaVerify(page) {
  const fr = bframeFrom(page);
  if (!fr) return false;
  const btn = fr.locator(
    '#recaptcha-verify-button, button#recaptcha-verify-button, .rc-button-default'
  );
  if ((await btn.count().catch(() => 0)) === 0) return false;
  await btn.first().click({ force: true, timeout: 5000 });
  console.log('Repair captcha Verify clicked');
  return true;
}

/** Apply user tap: checkbox once, or tile coords when the image puzzle is open. */
async function applyCaptchaClick(page, x, y) {
  const state = await getRecaptchaState(page);
  if (state.imageChallengeOpen) {
    // Never re-click the checkbox — that resets the puzzle so tiles ignore taps.
    console.log('Repair captcha tile click at', x, y);
    await page.mouse.click(x, y);
    // If the tap landed inside the bframe, also dispatch inside the frame (more reliable).
    if (state.bframeBox) {
      const b = state.bframeBox;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        const relX = x - b.x;
        const relY = y - b.y;
        for (const fr of page.frames()) {
          if (!/bframe/i.test(fr.url() || '')) continue;
          try {
            await fr.mouse.click(relX, relY);
            console.log('Repair captcha bframe click', Math.round(relX), Math.round(relY));
          } catch (e) {
            console.log('bframe click:', e.message);
          }
          break;
        }
      }
    }
    return 'tile';
  }
  if (!state.checked) {
    const hit = await tryClickRecaptcha(page);
    return hit ? 'checkbox' : 'miss';
  }
  // Checked but no bframe yet — soft click at coords in case puzzle is opening.
  await page.mouse.click(x, y);
  return 'page';
}

async function notifyChallengeNeeded(page) {
  const st = readState() || {};
  const kind = (await detectChallengeKind(page)) || 'generic';
  const prev = st.challengeKind || null;
  const rank = { app_approval: 3, pin: 3, captcha: 3, email_update: 3, generic: 1, signing_in: 0 };
  const upgraded = !prev || (rank[kind] || 0) > (rank[prev] || 0);
  // First detection or upgrade generic → app_approval/pin/captcha
  if (!st.challengeNotified || upgraded) {
    writeState({
      challengeNotified: true,
      challengeKind: kind,
      challengeSince: st.challengeSince || new Date().toISOString(),
    });
  }
  if (st.challengeNotified && !upgraded) return;

  const titles = {
    app_approval: 'Approve LinkedIn sign-in in your app',
    pin: 'LinkedIn wants a verification code',
    captcha: 'LinkedIn security check',
    generic: 'Approve LinkedIn sign-in in your app',
  };
  const messages = {
    app_approval:
      'Open the LinkedIn app on your phone and tap Yes / Approve on the sign-in request. H.A.L.O. will continue automatically — no need to sign in again here.',
    pin: 'Enter the code LinkedIn emailed or texted you on the repair page (or in the dashboard prompt). App push is not always offered — LinkedIn chooses email/SMS for some logins.',
    captcha: 'Complete the security check in H.A.L.O. (I’m not a robot / image tiles on the LinkedIn page).',
    generic:
      'Open the LinkedIn app on your phone and tap Yes / Approve if LinkedIn sent a sign-in request. If you got an email/SMS code instead, open the repair page and enter it there.',
  };
  try {
    const { notify } = await import('./notify.js');
    await notify({
      type: 'session',
      severity: 'warn',
      skipTelegram: true,
      key: 'linkedin_signin_app_approval',
      title: titles[kind] || titles.generic,
      message: messages[kind] || messages.generic,
    });
  } catch (e) {
    console.error('challenge notify:', e.message);
  }
  console.log('Challenge detected — user action needed:', kind);
}

async function detectUiMode(page) {
  const url = page.url() || '';
  if (/checkpoint|challenge|captcha|two-step|add-phone|manage\/challenge/i.test(url)) {
    return 'challenge';
  }
  const info = await page
    .evaluate(() => {
      const user = document.querySelector(
        'input#username, input[name="session_key"], input[autocomplete="username"], input[type="email"]'
      );
      const pass = document.querySelector(
        'input#password, input[name="session_password"], input[type="password"]'
      );
      const pin = document.querySelector(
        'input[name="pin"], input#input__phone_verification_pin, input[autocomplete="one-time-code"]'
      );
      const body = (document.body?.innerText || '').slice(0, 8000);
      const challengeText =
        /enter the code|verification|captcha|confirm it.?s you|unusual activity|check your linkedin app|notification sent|tap yes|approve this sign|verify it.?s you|sign-in request|we sent a notification|open the linkedin app|linkedin app|підтверд|запрос на вход|запит на вхід|anmeldung bestätigen|approuvez|aprueba|approva|potwierdź|onayla|承認|验证|وافق/i.test(
          body
        );
      return {
        hasLoginFields: !!(user && pass),
        hasPin: !!pin,
        challengeText,
      };
    })
    .catch(() => ({ hasLoginFields: false, hasPin: false, challengeText: false }));

  if (info.hasPin || info.challengeText || (!info.hasLoginFields && !/login|uas\/login/i.test(url))) {
    // Still on login URL without fields → likely interstitial / challenge
    if (info.hasPin || info.challengeText) return 'challenge';
    if (!info.hasLoginFields && /linkedin\.com/i.test(url) && !/feed|messaging/i.test(url)) {
      return 'challenge';
    }
  }
  return 'form';
}

async function clickByText(page, patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  for (const pattern of list) {
    const re = new RegExp(pattern, 'i');
    const locators = [
      page.getByRole('button', { name: re }),
      page.getByRole('link', { name: re }),
      page.locator('button, a, [role="button"], label, li').filter({ hasText: re }),
    ];
    for (const loc of locators) {
      const count = await loc.count().catch(() => 0);
      if (!count) continue;
      for (let i = 0; i < Math.min(count, 5); i++) {
        const item = loc.nth(i);
        const visible = await item.isVisible().catch(() => false);
        if (!visible) continue;
        await item.click({ timeout: 5000 }).catch(() => {});
        return pattern;
      }
    }
  }
  return null;
}

async function fillChallengeCode(page, text) {
  const code = String(text || '').replace(/\s+/g, '').trim();
  if (!code) return false;

  const result = await page.evaluate((code) => {
    const setVal = (el, val) => {
      el.focus();
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc?.set) desc.set.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8 && !el.disabled && el.type !== 'hidden';
    };

    const boxes = [...document.querySelectorAll('input')].filter(
      (el) =>
        visible(el) &&
        (el.maxLength === 1 || /digit|character|code/i.test(el.getAttribute('aria-label') || ''))
    );
    if (boxes.length >= 4 && boxes.length <= 8) {
      const digits = code.split('');
      boxes.slice(0, digits.length).forEach((box, i) => setVal(box, digits[i]));
      return { ok: true, mode: 'multi-box', count: boxes.length };
    }

    const selectors = [
      'input[name="pin"]',
      'input#input__phone_verification_pin',
      'input[autocomplete="one-time-code"]',
      'input[inputmode="numeric"]',
      'input[name*="pin" i]',
      'input[name*="code" i]',
      'input[id*="pin" i]',
      'input[id*="code" i]',
      'input[type="tel"]',
      'input[type="number"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && visible(el)) {
        setVal(el, code);
        return { ok: true, mode: 'selector', selector: sel };
      }
    }

    const generic = [...document.querySelectorAll('input[type="text"], input:not([type])')].find(
      (el) => visible(el) && el.type !== 'password' && el.type !== 'email'
    );
    if (generic) {
      setVal(generic, code);
      return { ok: true, mode: 'generic' };
    }

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      setVal(active, code);
      return { ok: true, mode: 'active' };
    }
    return { ok: false };
  }, code);

  if (result?.ok) {
    console.log('Repair fillCode via', result.mode, result.selector || '');
    return true;
  }

  const loc = page
    .locator(
      'input[name="pin"], input[autocomplete="one-time-code"], input[inputmode="numeric"], input[type="tel"]'
    )
    .first();
  if (await loc.count()) {
    await loc.click({ timeout: 3000 }).catch(() => {});
    await loc.fill(code);
    console.log('Repair fillCode via playwright locator');
    return true;
  }
  return false;
}

async function submitChallengeCode(page) {
  const hit = await clickByText(page, [
    'verify',
    'submit',
    'continue',
    'sign in',
    'next',
    'confirm',
  ]);
  if (hit) {
    console.log('Repair submitChallenge via', hit);
    return true;
  }
  await page.keyboard.press('Enter').catch(() => {});
  return false;
}

/** LinkedIn "Provide a new email address" checkpoint after suspicious login. */
async function fillEmailUpdate(page, email, profileUrl = '') {
  const em = String(email || '').trim();
  if (!em) return false;
  const profile = String(profileUrl || '').trim();
  const filled = await page
    .evaluate(
      ({ em, profile }) => {
        const setVal = (el, val) => {
          el.focus();
          const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          if (desc?.set) desc.set.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 8 && r.height > 8 && !el.disabled && el.type !== 'hidden';
        };
        const inputs = [...document.querySelectorAll('input')].filter(visible);
        const emailish = inputs.filter(
          (el) =>
            el.type === 'email' ||
            /email/i.test(
              `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`
            )
        );
        const targets = emailish.length >= 2 ? emailish : inputs.filter((el) => el.type !== 'password');
        if (targets.length < 2) return { ok: false, reason: 'need_two_fields', n: targets.length };
        setVal(targets[0], em);
        setVal(targets[1], em);
        if (profile && targets[2]) setVal(targets[2], profile);
        return { ok: true, fields: targets.length };
      },
      { em, profile }
    )
    .catch((e) => ({ ok: false, reason: e.message }));
  console.log('Repair fillEmailUpdate', filled);
  if (!filled?.ok) return false;
  await page.waitForTimeout(400);
  await clickByText(page, ['^Continue$', 'Continue', 'Submit', 'Next']);
  await page.waitForTimeout(1000);
  return true;
}

async function applySignIn(page, username, password) {
  await dismissLoginOverlays(page);
  await page
    .goto('https://www.linkedin.com/uas/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    .catch(() => {});
  await page.waitForTimeout(900);
  await dismissLoginOverlays(page);

  const user = page.locator('input#username, input[name="session_key"]').first();
  const pass = page.locator('input#password, input[name="session_password"]').first();
  const userVisible = await user.isVisible().catch(() => false);
  const passVisible = await pass.isVisible().catch(() => false);

  if (!userVisible || !passVisible) {
    const evalOk = await fillInput(
      page,
      ['input#username', 'input[name="session_key"]', 'input[autocomplete="username"]', 'input[type="email"]'],
      username
    );
    const passOk = await fillInput(
      page,
      ['input#password', 'input[name="session_password"]', 'input[type="password"]'],
      password
    );
    if (!evalOk || !passOk) {
      writeState({
        status: 'running',
        uiMode: 'challenge',
        error: null,
        lastSignInError: 'Login fields not found — use challenge screen',
      });
      await captureFrame(page, 'challenge');
      return;
    }
  } else {
    await user.click({ timeout: 8000 });
    await user.fill('');
    await user.type(username, { delay: 20 });
    await pass.click({ timeout: 8000 });
    await pass.fill('');
    await pass.type(password, { delay: 20 });
  }

  await dismissLoginOverlays(page);
  const how = await clickSignIn(page);
  console.log('Repair signin submitted via', how);
  writeState({
    status: 'running',
    uiMode: 'signing',
    challengeKind: null,
    lastSignInAt: new Date().toISOString(),
    lastSignInError: null,
  });
  await captureFrame(page, 'form');

  // Poll for wrong-password vs challenge vs success (LinkedIn can be slow).
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForTimeout(1500);
    const earlyMode = await detectUiMode(page);
    const earlyKind = await detectChallengeKind(page);
    if (earlyMode === 'challenge' || earlyKind === 'app_approval' || earlyKind === 'pin' || earlyKind === 'captcha') {
      await captureFrame(page, 'challenge');
      return;
    }
    if (!/login|uas\/login|checkpoint\/lg\/login/i.test(page.url() || '')) {
      return;
    }
    const hint = await readLoginPageHint(page);
    if (isWrongPasswordHint(hint)) {
      await captureFrame(page, 'form', { snapshot: true });
      failCredentials(hint);
    }
    if (attempt === 3 || attempt === 6) {
      await dismissLoginOverlays(page);
    }
  }

  // Still on login — stop so Stage R frees and the user can retry immediately.
  if (/login|uas\/login/i.test(page.url() || '')) {
    const hint =
      (await readLoginPageHint(page)) ||
      'Wrong email or password — fix it above and Sign in again.';
    await captureFrame(page, 'form', { snapshot: true });
    failCredentials(
      isWrongPasswordHint(hint)
        ? hint
        : 'Wrong email or password — fix it above and Sign in again.'
    );
  }
}

async function drainInputs(page) {
  if (!fs.existsSync(INPUT_PATH)) return;
  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  if (!raw.trim()) return;
  fs.writeFileSync(INPUT_PATH, '');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      if (ev.type === 'signin' && typeof ev.username === 'string' && typeof ev.password === 'string') {
        await applySignIn(page, ev.username, ev.password);
      } else if (ev.type === 'clickText') {
        const key = String(ev.key || ev.text || '').trim();
        const map = {
          'verif-app': [
            'verification app',
            'authenticator app',
            'authentication app',
            'use your authenticator',
            'authenticator',
          ],
          'another-way': ['try another way', 'try a different way', 'other options', 'more options'],
        };
        const patterns = map[key] || (typeof ev.text === 'string' ? [ev.text] : []);
        const hit = await clickByText(page, patterns);
        console.log('Repair clickText', key || patterns[0], '→', hit || 'not found');
        await page.waitForTimeout(700);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'fillCode' && typeof ev.text === 'string') {
        const ok = await fillChallengeCode(page, ev.text);
        if (!ok) {
          writeState({ lastFillError: 'Code field not found — tap the code box on the screenshot, then try again.' });
        } else {
          writeState({ lastFillError: null });
        }
        await page.waitForTimeout(200);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'submitCode' && typeof ev.text === 'string') {
        await fillChallengeCode(page, ev.text);
        await page.waitForTimeout(300);
        await submitChallengeCode(page);
        await page.waitForTimeout(800);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'fillEmail' && typeof ev.email === 'string') {
        await fillEmailUpdate(page, ev.email, ev.profileUrl || '');
        await page.waitForTimeout(800);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'type' && typeof ev.text === 'string') {
        await page.keyboard.type(String(ev.text), { delay: 20 });
        await page.waitForTimeout(200);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'click' && Number.isFinite(ev.x) && Number.isFinite(ev.y)) {
        const st = readState() || {};
        const clip = st.clip;
        const absX = clip ? Number(clip.x) + ev.x : ev.x;
        const absY = clip ? Number(clip.y) + ev.y : ev.y;
        if (st.challengeKind === 'captcha') {
          await applyCaptchaClick(page, absX, absY);
        } else {
          await page.mouse.click(absX, absY);
          await page
            .evaluate(() => {
              document.querySelectorAll('[data-halo-active="1"]').forEach((el) => {
                el.removeAttribute('data-halo-active');
              });
              const el = document.activeElement;
              if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                el.setAttribute('data-halo-active', '1');
              }
            })
            .catch(() => {});
        }
        await page.waitForTimeout(250);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'clickRecaptcha') {
        // Explicit checkbox-only request (do not use while image puzzle is open).
        await tryClickRecaptcha(page);
        await page.waitForTimeout(800);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'clickCaptchaTile' && Number.isFinite(Number(ev.index))) {
        await clickCaptchaTile(page, Number(ev.index));
        await page.waitForTimeout(400);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'captchaVerify') {
        await clickCaptchaVerify(page);
        await page.waitForTimeout(900);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'setValue' && typeof ev.text === 'string') {
        const ok = await fillChallengeCode(page, ev.text);
        if (!ok) {
          writeState({ lastFillError: 'Could not find an input to fill.' });
        }
        await page.waitForTimeout(200);
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'key' && ev.key) {
        await page.keyboard.press(String(ev.key));
      }
    } catch (e) {
      if (e?.code === 'CREDENTIAL_ERROR') throw e;
      console.error('repair input error:', e.message);
    }
  }
}

/** Challenge screenshots while user approves in LinkedIn app. */
async function captureFrame(page, forcedMode, opts = {}) {
  const mode = forcedMode || (await detectUiMode(page));
  const fullVp = page.viewportSize() || { width: 390, height: 844 };
  const snapshot = !!opts.snapshot;

  if (mode === 'form' && !snapshot) {
    writeState({
      status: 'running',
      uiMode: 'form',
      viewport: fullVp,
      clip: null,
      lastFrameAt: new Date().toISOString(),
    });
    return;
  }

  // Keep "Recognize this device" checked when present
  await page
    .evaluate(() => {
      const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
      for (const box of boxes) {
        const label =
          (box.labels && box.labels[0]?.textContent) ||
          box.closest('label')?.textContent ||
          box.parentElement?.textContent ||
          '';
        if (/recognize|remember|trust|future/i.test(label) && !box.checked) {
          box.click();
        }
      }
    })
    .catch(() => {});

  await page.screenshot({ path: FRAME_PATH, type: 'jpeg', quality: 55 }).catch(() => {});
  const kind = await detectChallengeKind(page);
  if (mode === 'form' || snapshot) {
    writeState({
      status: 'running',
      uiMode: 'form',
      viewport: fullVp,
      clip: null,
      lastFrameAt: new Date().toISOString(),
    });
    return;
  }
  writeState({
    status: 'running',
    uiMode: 'challenge',
    challengeKind: kind,
    viewport: fullVp,
    clip: null,
    lastFrameAt: new Date().toISOString(),
  });
  await notifyChallengeNeeded(page);
  if (kind === 'captcha') {
    await syncCaptchaNativeUi(page).catch((e) => console.log('syncCaptchaNativeUi:', e.message));
  } else {
    writeState({
      captchaPhase: 'none',
      captchaTileCount: 0,
      captchaPrompt: null,
    });
  }
}

async function runRepair() {
  const st = readState();
  if (!TOKEN || !st?.token || st.token !== TOKEN) {
    writeState({ status: 'error', error: 'token mismatch' });
    process.exit(1);
  }
  writeState({
    status: 'running',
    error: null,
    uiMode: 'form',
    startedAt: new Date().toISOString(),
    challengeNotified: false,
    challengeKind: null,
    challengeSince: null,
  });

  // Fresh login from dashboard must not reuse a dead li_at jar from a prior repair.
  const userDataDir = sessionRepairDataDir();
  const forceFresh = process.env.REPAIR_FORCE_FRESH === '1';
  if (forceFresh) {
    console.log('REPAIR_FORCE_FRESH=1 — wiping session_data_repair before login');
    wipeDirContents(userDataDir);
  } else {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Match agent UA so harvested cookies work in Stage A/B Chromium.
  const USER_AGENT =
    process.env.LINKEDIN_USER_AGENT ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    locale: 'en-US',
    // Match IONOS VPS geo — mismatched NYC geolocation + DE IP triggers duplicate device approvals.
    timezoneId: 'Europe/Berlin',
    geolocation: { longitude: 8.4037, latitude: 49.0069 },
    permissions: ['geolocation'],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=en-US'],
  });
  await blockGoogleOneTap(context);
  const page = context.pages()[0] || (await context.newPage());
  await context.addCookies([
    {
      name: 'lang',
      value: 'v=2&lang=en-us',
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      sameSite: 'None',
    },
  ]);

  // Reuse repair profile only if feed is actually live — never export a dead li_at.
  if (await tryHarvest(context, page, { requireLive: true })) {
    await context.close().catch(() => {});
    return;
  }

  await page.goto('https://www.linkedin.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  }).catch(() => {});
  writeState({ status: 'running', uiMode: 'form' });

  const started = Date.now();
  let lastModeCheck = 0;
  try {
    while (Date.now() - started < MAX_MS) {
      await drainInputs(page);
      const afterIn = readState();
      if (afterIn?.status === 'credential_error' || afterIn?.liAtCaptured) break;

      const now = Date.now();
      if (now - lastModeCheck >= 900) {
        const mode = await detectUiMode(page);
        if (mode === 'challenge') {
          await captureFrame(page, 'challenge');
        }
        const cur = readState();
        const since = cur?.challengeSince ? Date.parse(cur.challengeSince) : 0;
        const lastNudge = cur?.lastFeedNudgeAt ? Date.parse(cur.lastFeedNudgeAt) : 0;
        const postChallenge = since && !cur?.liAtCaptured;

        // LinkedIn often drops back to an empty Sign in form after a failed
        // checkpoint (no phone push). Stop the infinite "Extra verification" loop.
        if (postChallenge && mode !== 'challenge') {
          const bouncedToLogin = await page
            .evaluate(() => {
              const user = document.querySelector(
                'input#username, input[name="session_key"], input[autocomplete="username"], input[type="email"]'
              );
              const pass = document.querySelector(
                'input#password, input[name="session_password"], input[type="password"]'
              );
              const url = location.href || '';
              return !!(user && pass && /login|uas\/login|session_redirect/i.test(url));
            })
            .catch(() => false);
          if (bouncedToLogin && Date.now() - since > 20000) {
            const msg =
              'LinkedIn bounced back to Sign in without completing verification ' +
              '(no app Sign-in request / checkpoint failed). Close all personal LinkedIn tabs, ' +
              'disable browser extensions on linkedin.com, then try Sign in again.';
            console.log('Challenge bounce → login form:', msg);
            writeState({
              status: 'error',
              error: msg,
              uiMode: 'form',
              challengeKind: null,
              lastSignInError: msg,
            });
            break;
          }
        }

        if (postChallenge && Date.now() - since > 5000 && Date.now() - lastNudge > 8000) {
          const nudgeN = (cur?.challengeNudgeCount || 0) + 1;
          // Re-classify challengeKind so UI is not stuck on stale "generic"
          const liveKind = (await detectChallengeKind(page).catch(() => null)) || cur?.challengeKind;
          writeState({
            lastFeedNudgeAt: new Date().toISOString(),
            challengeNudgeCount: nudgeN,
            uiMode: 'challenge',
            challengeKind: liveKind || cur?.challengeKind || 'generic',
          });
          // Captcha: never navigate away / reload / re-click checkbox — that kills the image puzzle.
          if (liveKind === 'captcha' || cur?.challengeKind === 'captcha') {
            console.log('Post-challenge passive wait — captcha (stay on page)…');
            await page.waitForTimeout(2500);
          } else if (nudgeN >= 6 && nudgeN % 6 === 0 && liveKind === 'app_approval') {
            // App-only: occasional feed probe after a long wait (not for captcha/pin).
            console.log('Post-challenge feed fallback (after waiting on app approval)…');
            await page
              .goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 })
              .catch(() => {});
            await page.waitForTimeout(4000);
          } else {
            console.log('Post-challenge passive wait —', liveKind || 'challenge', '…');
            await waitForPostApproval(context, page);
          }
          await captureFrame(page, 'challenge');
          if (await tryHarvest(context, page, { requireLive: true })) break;
        }
        if (mode !== 'challenge') {
          if (cur?.uiMode === 'challenge') {
            writeState({ uiMode: 'form', status: 'running' });
          }
        }
        lastModeCheck = now;
      }
      const url = page.url();
      if (/linkedin\.com\/(feed|messaging|in\/)/i.test(url) && !/login|authwall|uas\/login/i.test(url)) {
        if (await tryHarvest(context, page, { requireLive: true })) break;
      } else if (await tryHarvest(context, page, { requireLive: true })) {
        break;
      }
      await page.waitForTimeout(150);
    }
  } catch (e) {
    if (e?.code !== 'CREDENTIAL_ERROR') throw e;
    console.log('Repair ended on credential error (user can retry Sign in)');
  }

  await context.close().catch(() => {});
  const final = readState();
  if (final?.status === 'credential_error') {
    process.exitCode = 0;
    return;
  }
  if (!final?.liAtCaptured) {
    // Keep a concrete bounce/credential error — do not mask it as a generic timeout.
    if (final?.status === 'error' || final?.status === 'credential_error') {
      process.exitCode = 2;
      return;
    }
    writeState({ status: 'timeout', error: 'Login not completed in time' });
    process.exitCode = 2;
  }
}

async function main() {
  const { withCycleLock, isLockHeld, releaseCycleLock } = await import('./cycleLock.js');
  const held = isLockHeld();
  if (held.held && held.owner === 'R') {
    console.log('Clearing stale Stage R lock from previous repair run');
    releaseCycleLock();
  }
  const lock = await withCycleLock('R', runRepair, { skipIfBusy: true });
  if (lock.skipped) {
    const who = isLockHeld().owner || 'unknown';
    writeState({ status: 'error', error: `Another automation is running (Stage ${who})` });
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  writeState({ status: 'error', error: e.message });
  process.exit(1);
});
