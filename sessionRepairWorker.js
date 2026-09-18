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
const MAX_MS = Number(process.env.REPAIR_TIMEOUT_MS || 12 * 60 * 1000);

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
      const isVisible = (el) => {
        if (!el || !(el instanceof Element)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const s = window.getComputedStyle(el);
        if (!s || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
        return true;
      };
      const otpSelector = [
        'input[name="pin"]',
        'input#input__phone_verification_pin',
        'input[autocomplete="one-time-code"]',
        'input[inputmode="numeric"]',
        'input[name*="pin" i]',
        'input[id*="pin" i]',
        'input[id*="verification" i]',
        'input[aria-label*="code" i]',
        'input[placeholder*="code" i]',
      ].join(', ');
      const hasVisibleOtp = [...document.querySelectorAll(otpSelector)].some(isVisible);

      // Primary authenticator step (not "try another way" footnotes).
      const authenticatorPrimary =
        /enter the code you see on your authenticator|code you see on your authenticator|enter the 6-digit code from your authenticator|from your authenticator app/.test(
          t
        );
      const authenticatorMention =
        /authenticator app|verification app|authentication app|google authenticator|in your authenticator/.test(t);
      const emailSmsPrimary =
        /we (emailed|texted) you.{0,40}code|enter the code (we )?(emailed|texted|sent to your (email|phone))|check your (email|inbox|phone|sms).{0,30}code|code.{0,20}(we sent|from (your )?(email|sms|text))/.test(
          t
        );
      const emailSmsLoose =
        /we sent.{0,40}code|email.{0,20}code|code.{0,20}(email|inbox|sms|phone)|text message/.test(t);

      const appApprovalStrong =
        /check your linkedin app|sign-in request|notification sent to your (linkedin )?app|tap yes|approve this sign|confirm (it'?s|this is) you|we sent a notification|open the linkedin app|waiting for approval|approve in (the )?app|approve the request|yes,? it'?s me/.test(
          t
        );

      // Government ID document form (not the footer link alone).
      const identityForm =
        /select an identification document|identification document|choose the country that issued|government[- ]issued|upload (your )?(id|passport|driver|licence|license)|photo of your id|we.?ll use this to verify your identity/.test(
          t
        ) ||
        (!!document.querySelector('select, [role="listbox"]') &&
          /verify your identity|issued your id|identification/.test(t) &&
          !/authenticator|enter the code|sign-in request|linkedin app/.test(t));
      if (identityForm) return { kind: 'identity_document', pinSource: null };

      if (/provide a new email|new email address|re-enter email|you will use this email address to sign in|public profile url/i.test(t)) {
        return { kind: 'email_update', pinSource: null };
      }

      // Visible OTP / primary code step wins over app-approval footnotes.
      if (hasVisibleOtp || authenticatorPrimary || emailSmsPrimary) {
        let pinSource = 'unknown';
        if (authenticatorPrimary || (hasVisibleOtp && authenticatorMention && !emailSmsPrimary)) {
          pinSource = 'authenticator';
        } else if (emailSmsPrimary || (hasVisibleOtp && emailSmsLoose)) {
          const emailOnly =
            /we emailed|emailed you|check your (email|inbox)|sent.{0,40}(to your )?email|code.{0,20}email/.test(t) &&
            !/texted|sms|text message/.test(t);
          const smsOnly =
            /we texted|texted you|sms|text message|sent.{0,40}(to your )?phone/.test(t) &&
            !/email|inbox/.test(t);
          if (emailOnly) pinSource = 'email';
          else if (smsOnly) pinSource = 'sms';
          else pinSource = 'email_sms';
        }
        return { kind: 'pin', pinSource };
      }

      // App Sign-in request must beat leftover recaptcha iframes + "try another way: email code" copy.
      if (appApprovalStrong) return { kind: 'app_approval', pinSource: null };

      // Captcha only when the challenge UI is actually visible (LinkedIn pages often embed invisible grecaptcha).
      const captchaNodes = [
        ...document.querySelectorAll(
          'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA" i], iframe[title*="recaptcha" i], .g-recaptcha, #g-recaptcha'
        ),
      ];
      const captchaVisible = captchaNodes.some(isVisible);
      const captchaCopyPrimary =
        /i.?m not a robot|i am not a robot|select all (images|squares)|image challenge|solve (this )?puzzle/.test(t);
      if (captchaVisible || captchaCopyPrimary) {
        return { kind: 'captcha', pinSource: null };
      }

      // Loose pin copy without a field — only if we are clearly on a code step (not app approve).
      if (
        !appApprovalStrong &&
        (/enter the code|verification code|one-time password|enter code|otp|sent (you )?a code/.test(t) ||
          emailSmsLoose ||
          authenticatorMention)
      ) {
        let pinSource = 'unknown';
        if (authenticatorMention) pinSource = 'authenticator';
        else if (emailSmsLoose) pinSource = 'email_sms';
        return { kind: 'pin', pinSource };
      }

      return null;
    })
    .catch(() => null);

  if (fromDom?.kind) {
    if (fromDom.kind === 'pin') writeState({ challengePinSource: fromDom.pinSource || 'unknown' });
    else writeState({ challengePinSource: null });
    return fromDom.kind;
  }

  if (/login|uas\/login/i.test(url) && !/checkpoint|challenge/i.test(url)) return null;

  if (/checkpoint|challenge|manage\/challenge|two-step|add-phone|identity|idv/i.test(url)) {
    const flags = await page
      .evaluate(() => {
        const t = (document.body?.innerText || '').slice(0, 5000).toLowerCase();
        const isVisible = (el) => {
          if (!el || !(el instanceof Element)) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
          const s = window.getComputedStyle(el);
          if (!s || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
          return true;
        };
        const hasVisibleOtp = [...document.querySelectorAll(
          'input[name="pin"], input#input__phone_verification_pin, input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name*="pin" i], input[id*="pin" i], input[placeholder*="code" i], input[aria-label*="code" i]'
        )].some(isVisible);
        const authenticatorPrimary =
          /enter the code you see on your authenticator|code you see on your authenticator|from your authenticator app/.test(
            t
          );
        const appApprovalStrong =
          /check your linkedin app|sign-in request|notification sent|tap yes|approve this sign|we sent a notification|open the linkedin app|approve in (the )?app|yes,? it'?s me/.test(
            t
          );
        const captchaVisible = [...document.querySelectorAll(
          'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA" i], iframe[title*="recaptcha" i], .g-recaptcha'
        )].some(isVisible);
        return {
          pin: hasVisibleOtp || authenticatorPrimary,
          pinSource: authenticatorPrimary
            ? 'authenticator'
            : /we (emailed|texted)|check your (email|inbox)|sms|text message/.test(t)
              ? 'email_sms'
              : 'unknown',
          identity:
            /select an identification document|identification document|choose the country that issued|government[- ]issued/.test(
              t
            ),
          appApproval: appApprovalStrong && !hasVisibleOtp && !authenticatorPrimary,
          captcha: captchaVisible || /i.?m not a robot|i am not a robot|select all (images|squares)/.test(t),
        };
      })
      .catch(() => ({
        pin: false,
        pinSource: 'unknown',
        identity: false,
        appApproval: false,
        captcha: false,
      }));
    if (flags.identity) return 'identity_document';
    if (flags.pin) {
      writeState({ challengePinSource: flags.pinSource || 'unknown' });
      return 'pin';
    }
    if (flags.appApproval) {
      writeState({ challengePinSource: null });
      return 'app_approval';
    }
    if (flags.captcha) return 'captcha';
    // Visible bframe only — do not treat every google.com/recaptcha frame as an active challenge.
    for (const fr of page.frames()) {
      const fu = fr.url() || '';
      if (/recaptcha.*bframe|google\.com\/recaptcha\/api2\/bframe/i.test(fu)) return 'captcha';
    }
    return 'generic';
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
    hasVisibleTiles: false,
    puzzlePrompt: '',
    looksLikePuzzle: false,
  };

  // Prefer visible host iframes — Google often preloads a hidden bframe URL.
  try {
    const bframes = page.locator('iframe[src*="bframe"]');
    const n = await bframes.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = bframes.nth(i);
      const visible = await el.isVisible().catch(() => false);
      const box = await el.boundingBox().catch(() => null);
      if (!visible || !box) continue;
      // Keep the largest visible bframe box for clipping; only tiles confirm "open".
      if (box.width >= 180 && box.height >= 180) {
        if (!state.bframeBox || box.width * box.height > state.bframeBox.width * state.bframeBox.height) {
          state.bframeBox = box;
        }
      }
    }
  } catch {
    /* ignore */
  }

  for (const fr of page.frames()) {
    const fu = fr.url() || '';
    if (!/recaptcha|google\.com\/recaptcha/i.test(fu)) continue;
    if (/bframe/i.test(fu)) {
      const meta = await fr
        .evaluate(() => {
          const sel = [
            'td.rc-imageselect-tile',
            '.rc-imageselect-tile',
            '.rc-image-tile-wrapper',
            '#rc-imageselect-target td',
            '#rc-imageselect-target img',
            'table.rc-imageselect-table-33 td',
            'table.rc-imageselect-table-44 td',
            '.rc-imageselect-target td',
            '.rc-imageselect-challenge img',
            '.rc-imageselect-table td',
          ];
          let tiles = 0;
          for (const s of sel) {
            tiles = Math.max(tiles, document.querySelectorAll(s).length);
          }
          const prompt = String(
            document.querySelector('.rc-imageselect-desc-wrapper')?.innerText ||
              document.querySelector('.rc-imageselect-desc')?.innerText ||
              document.querySelector('#rc-imageselect')?.innerText ||
              ''
          )
            .replace(/\s+/g, ' ')
            .trim();
          const body = String(document.body?.innerText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500);
          const looksLikePuzzle =
            tiles > 0 ||
            !!document.querySelector('#rc-imageselect, .rc-imageselect, .rc-imageselect-payload, .rc-imageselect-target') ||
            /select all|click verify|images with|traffic lights|crosswalks|buses|cars|bicycles|motorcycles|boats|hydrants/i.test(
              prompt || body
            );
          return { tiles, prompt: prompt.slice(0, 240), looksLikePuzzle };
        })
        .catch(() => ({ tiles: 0, prompt: '', looksLikePuzzle: false }));
      if (meta.prompt) state.puzzlePrompt = meta.prompt;
      if (meta.looksLikePuzzle) state.looksLikePuzzle = true;
      // Painted tiles always count. Prompt-only in a large visible bframe also counts
      // when the host iframe is actually on-screen (preload bframes are tiny/hidden).
      if (meta.tiles > 0) {
        state.hasVisibleTiles = true;
        state.imageChallengeOpen = true;
      } else if (meta.looksLikePuzzle && state.bframeBox) {
        state.hasVisibleTiles = true;
        state.imageChallengeOpen = true;
      }
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

  // After the operator tapped "I'm not a robot", a large on-screen bframe is the puzzle
  // even when frame.evaluate can't count tiles (class churn / partial paint).
  try {
    const prev = readState() || {};
    if (
      !state.hasVisibleTiles &&
      state.bframeBox &&
      state.bframeBox.width >= 250 &&
      state.bframeBox.height >= 250 &&
      (state.checked || prev.captchaUiChecked)
    ) {
      state.hasVisibleTiles = true;
      state.imageChallengeOpen = true;
      state.looksLikePuzzle = true;
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

/**
 * Click Google reCAPTCHA checkbox.
 * @param {{ force?: boolean }} opts force=true for explicit dashboard "I'm not a robot"
 *   (ignore phantom hidden bframes that would skip the click).
 */
async function tryClickRecaptcha(page, opts = {}) {
  const force = !!opts.force;
  const state = await getRecaptchaState(page);
  if (state.checked) {
    console.log('Repair recaptcha skip checkbox — already checked');
    return false;
  }
  // Only skip force-click when tiles are actually painted (not after LinkedIn reset).
  if (force && state.imageChallengeOpen && state.hasVisibleTiles) {
    console.log('Repair recaptcha force click skipped — tiles already visible');
    return false;
  }
  if (!force && state.imageChallengeOpen && state.hasVisibleTiles) {
    console.log('Repair recaptcha skip checkbox — image challenge already open');
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
      const box = await iframe.boundingBox().catch(() => null);
      if (box) {
        // Click left side of widget (checkbox), not the logo.
        await page.mouse.click(box.x + Math.min(28, box.width * 0.15), box.y + box.height / 2);
        console.log('Repair recaptcha checkbox clicked via mouse on anchor box');
        return true;
      }
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

function publishCaptchaStaging(stagingDir) {
  const bak = `${CAPTCHA_DIR}_old`;
  try {
    fs.rmSync(bak, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(CAPTCHA_DIR)) fs.renameSync(CAPTCHA_DIR, bak);
  } catch {
    try {
      fs.rmSync(CAPTCHA_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  fs.renameSync(stagingDir, CAPTCHA_DIR);
  try {
    fs.rmSync(bak, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function bframeFrom(page) {
  // Prefer the bframe that actually has the image-select puzzle.
  // Google often preloads an empty/hidden bframe — picking the first URL match
  // makes table screenshots fail while the live page frame still shows tiles.
  let best = null;
  let bestScore = -1;
  for (const fr of page.frames()) {
    if (!/bframe/i.test(fr.url() || '')) continue;
    const meta = await fr
      .evaluate(() => {
        const tiles = document.querySelectorAll(
          'td.rc-imageselect-tile, .rc-imageselect-tile, #rc-imageselect-target td, table.rc-imageselect-table-33 td, table.rc-imageselect-table-44 td'
        ).length;
        const hasTarget = !!document.querySelector(
          '#rc-imageselect-target, .rc-imageselect-target, table.rc-imageselect-table-33, table.rc-imageselect-table-44'
        );
        const bodyLen = (document.body?.innerText || '').length;
        return { tiles, hasTarget, bodyLen };
      })
      .catch(() => ({ tiles: 0, hasTarget: false, bodyLen: 0 }));
    const score =
      (meta.tiles || 0) * 100 + (meta.hasTarget ? 50 : 0) + Math.min(meta.bodyLen || 0, 200);
    if (score > bestScore) {
      bestScore = score;
      best = fr;
    }
  }
  if (best) return best;
  for (const fr of page.frames()) {
    if (/bframe/i.test(fr.url() || '')) return fr;
  }
  return null;
}

let lastCaptchaSyncAt = 0;

/** Publish captchaPhase + tile JPEGs for native dashboard UI (human still solves). */
async function syncCaptchaNativeUi(page, opts = {}) {
  const force = !!opts.force;
  const kind = await resolveChallengeKind(page).catch(() => null);
  const prev = readState() || {};
  if (kind !== 'captcha') {
    writeState({
      captchaPhase: 'none',
      captchaChecked: false,
      captchaPrompt: null,
      captchaTileCount: 0,
      captchaCols: 3,
      captchaMode: null,
      captchaHasChallengeJpg: false,
      captchaHasTiles: false,
    });
    return;
  }
  const state = await getRecaptchaState(page);
  const userClicked = !!prev.captchaUiChecked || !!state.checked;
  // Image UI when tiles/puzzle detected — or large on-screen bframe after the operator clicked.
  const puzzleReady =
    state.hasVisibleTiles ||
    (userClicked &&
      state.bframeBox &&
      state.bframeBox.width >= 250 &&
      state.bframeBox.height >= 250);
  if (!puzzleReady) {
    // Soft refresh after a tile tap — DOM can briefly rebuild; keep the last image UI.
    if (opts.soft && prev.captchaPhase === 'image' && prev.captchaHasChallengeJpg) {
      console.log('soft captcha sync — tiles momentarily gone; keep previous image');
      return;
    }
    if (userClicked) {
      writeState({
        captchaPhase: 'waiting',
        captchaChecked: !!state.checked,
        captchaHasTiles: false,
        captchaPrompt: null,
        captchaTileCount: 0,
        captchaHasChallengeJpg: false,
        captchaMode: null,
      });
      return;
    }
    writeState({
      captchaPhase: 'checkbox',
      captchaChecked: false,
      captchaHasTiles: false,
      captchaPrompt: null,
      captchaTileCount: 0,
      captchaCols: 3,
      captchaMode: null,
      captchaHasChallengeJpg: false,
    });
    return;
  }
  if (!state.hasVisibleTiles && puzzleReady) {
    console.log(
      `Captcha puzzleReady via large bframe ${Math.round(state.bframeBox.width)}x${Math.round(state.bframeBox.height)} (DOM tiles not counted)`
    );
  }

  // Throttle passive republish hard — only user actions bump the image.
  if (
    !force &&
    prev.captchaPhase === 'image' &&
    prev.captchaHasTiles &&
    prev.captchaHasChallengeJpg &&
    Date.now() - lastCaptchaSyncAt < 20000
  ) {
    return;
  }
  lastCaptchaSyncAt = Date.now();

  await page.waitForTimeout(force ? 250 : 400);

  let prompt = state.puzzlePrompt || '';
  let cols = 3;
  let tileCount = 9;
  // Image is the tile table only → overlay covers 100% (perfect 3×3 / 4×4).
  let overlay = { top: 0, left: 0, width: 100, height: 100 };
  let cropAbs = null; // table box relative to bframe host (click fallback)
  let tablePageBox = null; // absolute page box of the tile table
  const fr = await bframeFrom(page);
  let box = state.bframeBox;

  try {
    const bframes = page.locator('iframe[src*="bframe"]');
    const n = await bframes.count().catch(() => 0);
    let bestArea = 0;
    for (let i = 0; i < n; i++) {
      const el = bframes.nth(i);
      const b = await el.boundingBox().catch(() => null);
      if (!b || b.width < 100 || b.height < 100) continue;
      const area = b.width * b.height;
      if (area > bestArea) {
        bestArea = area;
        box = b;
      }
    }
  } catch {
    /* ignore */
  }

  let tableLoc = null;
  if (fr) {
    try {
      const table44 = fr.locator('table.rc-imageselect-table-44');
      const table33 = fr.locator('table.rc-imageselect-table-33');
      const is44 = (await table44.count().catch(() => 0)) > 0;
      const is33 = (await table33.count().catch(() => 0)) > 0;
      if (is44) tableLoc = table44.first();
      else if (is33) tableLoc = table33.first();
      else {
        tableLoc = fr
          .locator('#rc-imageselect-target, .rc-imageselect-target')
          .first();
      }

      const tileLoc = fr.locator(
        'td.rc-imageselect-tile, .rc-imageselect-tile, #rc-imageselect-target td'
      );
      const tileN = await tileLoc.count().catch(() => 0);
      if (is44 || tileN >= 16) cols = 4;
      else if (is33 || tileN === 9) cols = 3;
      else if (tileN > 9) cols = 4;
      tileCount = tileN || cols * cols;

      const desc = fr
        .locator(
          '.rc-imageselect-desc-wrapper, .rc-imageselect-desc, #rc-imageselect .rc-imageselect-instructions'
        )
        .first();
      const promptText = await desc.innerText().catch(() => '');
      if (promptText) {
        prompt = String(promptText).replace(/\s+/g, ' ').trim().slice(0, 240);
      }

      tablePageBox = tableLoc ? await tableLoc.boundingBox().catch(() => null) : null;
      if ((!tablePageBox || tablePageBox.width < 40) && tileN > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = 0;
        let maxY = 0;
        const lim = Math.min(tileN, cols * cols);
        for (let i = 0; i < lim; i++) {
          const tb = await tileLoc.nth(i).boundingBox().catch(() => null);
          if (!tb || tb.width < 8) continue;
          minX = Math.min(minX, tb.x);
          minY = Math.min(minY, tb.y);
          maxX = Math.max(maxX, tb.x + tb.width);
          maxY = Math.max(maxY, tb.y + tb.height);
        }
        if (Number.isFinite(minX) && maxX > minX) {
          tablePageBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
      }
      if (tablePageBox && box) {
        cropAbs = {
          x: Math.max(0, tablePageBox.x - box.x),
          y: Math.max(0, tablePageBox.y - box.y),
          w: tablePageBox.width,
          h: tablePageBox.height,
        };
      }
      console.log(
        `Captcha layout cols=${cols} tiles=${tileCount} table=${Math.round(tablePageBox?.width || 0)}x${Math.round(tablePageBox?.height || 0)}`
      );
    } catch (e) {
      console.log('captcha layout measure:', e.message);
    }
  }

  fs.mkdirSync(CAPTCHA_DIR, { recursive: true });
  const challengePath = path.join(CAPTCHA_DIR, 'challenge.jpg');
  const challengeTmp = path.join(CAPTCHA_DIR, 'challenge.tmp.jpg');
  const MIN_JPG = 4000; // blank/corrupt table shots were ~1KB
  let hasChallenge = false;
  let footerTrim = 0;
  let captureMode = '';

  const commitChallenge = (label) => {
    if (!fs.existsSync(challengeTmp)) return false;
    const size = fs.statSync(challengeTmp).size;
    if (size < MIN_JPG) {
      console.log(`captcha ${label} too small (${size}B) — discard`);
      try {
        fs.unlinkSync(challengeTmp);
      } catch {
        /* ignore */
      }
      return false;
    }
    fs.renameSync(challengeTmp, challengePath);
    hasChallenge = true;
    captureMode = label;
    console.log(`Captcha challenge ${label} ${size}B cols=${cols}`);
    return true;
  };

  // 1) Page clip of the tile table — uses compositor pixels (most reliable).
  if (!hasChallenge && tablePageBox && tablePageBox.width > 40) {
    try {
      await page.screenshot({
        path: challengeTmp,
        type: 'jpeg',
        quality: 88,
        clip: {
          x: Math.max(0, tablePageBox.x),
          y: Math.max(0, tablePageBox.y),
          width: Math.min(tablePageBox.width, 900),
          height: Math.min(tablePageBox.height, 900),
        },
      });
      if (commitChallenge('table-clip')) {
        overlay = { top: 0, left: 0, width: 100, height: 100 };
        footerTrim = 0;
      }
    } catch (e) {
      console.log('captcha table clip:', e.message);
    }
  }

  // 2) Element screenshot of the table locator.
  if (!hasChallenge && tableLoc) {
    try {
      await tableLoc.screenshot({ path: challengeTmp, type: 'jpeg', quality: 88 });
      if (commitChallenge('table-el')) {
        overlay = { top: 0, left: 0, width: 100, height: 100 };
        footerTrim = 0;
      }
    } catch (e) {
      console.log('captcha table screenshot:', e.message);
    }
  }

  // 3) Visible bframe host iframe (captcha widget only — not full LinkedIn page).
  if (!hasChallenge && box && box.width > 100) {
    try {
      await page.screenshot({
        path: challengeTmp,
        type: 'jpeg',
        quality: 82,
        clip: {
          x: Math.max(0, box.x),
          y: Math.max(0, box.y),
          width: Math.min(box.width, 900),
          height: Math.min(box.height, 900),
        },
      });
      if (commitChallenge('bframe-clip')) {
        if (tablePageBox) {
          overlay = {
            top: ((tablePageBox.y - box.y) / box.height) * 100,
            left: ((tablePageBox.x - box.x) / box.width) * 100,
            width: (tablePageBox.width / box.width) * 100,
            height: (tablePageBox.height / box.height) * 100,
          };
          // Approximate footer under the tile grid.
          const gridBottom = tablePageBox.y + tablePageBox.height - box.y;
          footerTrim = Math.max(
            0,
            Math.min(28, ((box.height - gridBottom) / box.height) * 100)
          );
          cropAbs = {
            x: 0,
            y: 0,
            w: box.width,
            h: box.height,
          };
        } else {
          overlay = { top: 22, left: 0, width: 100, height: 58 };
          footerTrim = 16;
        }
      }
    } catch (e) {
      console.log('captcha bframe clip:', e.message);
    }
  }

  // 4) Keep previous good jpg if capture missed this tick.
  if (!hasChallenge && fs.existsSync(challengePath) && fs.statSync(challengePath).size >= MIN_JPG) {
    hasChallenge = true;
    captureMode = 'reuse';
    console.log('Captcha challenge reuse previous jpg');
  }

  if (!hasChallenge) {
    writeState({
      captchaPhase: prev.captchaPhase === 'image' ? 'image' : 'waiting',
      captchaChecked: true,
      captchaHasTiles: prev.captchaPhase === 'image',
      captchaPrompt: prev.captchaPrompt || prompt || null,
      captchaHasChallengeJpg: false,
    });
    console.log('Captcha sync — capture empty; keep UI if possible');
    return;
  }

  // Keep captchaGridRev + captchaImgRev stable on passive polls so the dashboard
  // does not reload the image every few seconds (that caused "failed to load").
  const bumpRev = force && opts.bumpRev !== false && opts.soft !== true;
  const bumpImg = force || opts.soft === true;
  const gridRev =
    bumpRev || !prev.captchaGridRev || prev.captchaPhase !== 'image'
      ? Date.now()
      : Number(prev.captchaGridRev) || Date.now();
  const imgRev = bumpImg || !prev.captchaImgRev ? Date.now() : Number(prev.captchaImgRev) || Date.now();

  // Live selected tiles (Google clears selection when it swaps a tile image).
  let selectedIndexes = [];
  if (fr) {
    selectedIndexes = await fr
      .evaluate(() => {
        let tiles = [...document.querySelectorAll('td.rc-imageselect-tile')];
        if (!tiles.length) tiles = [...document.querySelectorAll('.rc-imageselect-tile')];
        if (!tiles.length) {
          tiles = [...document.querySelectorAll('#rc-imageselect-target td, .rc-imageselect-target td')].filter(
            (td) => {
              const r = td.getBoundingClientRect();
              return r.width > 20 && r.height > 20;
            }
          );
        }
        const out = [];
        tiles.forEach((td, i) => {
          const sel =
            td.classList.contains('rc-imageselect-tileselected') ||
            td.getAttribute('aria-selected') === 'true' ||
            /tileselected/i.test(td.className || '');
          if (sel) out.push(i);
        });
        return out;
      })
      .catch(() => []);
  }

  writeState({
    captchaPhase: 'image',
    captchaChecked: true,
    captchaHasTiles: true,
    captchaPrompt: prompt || 'Select all images that match the prompt',
    captchaTileCount: cols * cols,
    captchaCols: cols,
    captchaOverlay: overlay,
    captchaFooterTrim: footerTrim,
    captchaCrop: cropAbs,
    captchaGridRev: gridRev,
    captchaImgRev: imgRev,
    captchaSelectedIndexes: selectedIndexes,
    captchaMode: 'composite',
    captchaHasChallengeJpg: true,
    captchaCaptureMode: captureMode,
  });
  console.log(
    `Captcha native UI: cols=${cols} mode=${captureMode} rev=${gridRev} img=${imgRev} selected=[${selectedIndexes.join(',')}] force=${force} soft=${!!opts.soft} footerTrim=${footerTrim.toFixed(1)} prompt="${(prompt || '').slice(0, 50)}"`
  );
}

async function clickCaptchaTile(page, index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0) return false;
  const fr = await bframeFrom(page);
  if (fr) {
    // Only real tile cells — never wrappers (those inflate the index map).
    const tiles = fr.locator('td.rc-imageselect-tile');
    let n = await tiles.count().catch(() => 0);
    let loc = tiles;
    if (n === 0) {
      loc = fr.locator('.rc-imageselect-tile');
      n = await loc.count().catch(() => 0);
    }
    if (n === 0) {
      loc = fr.locator('#rc-imageselect-target td, .rc-imageselect-target td');
      n = await loc.count().catch(() => 0);
    }
    if (i < n) {
      await loc.nth(i).click({ force: true, timeout: 5000 });
      console.log('Repair captcha tile index', i, `of ${n}`);
      return true;
    }
  }
  // Fallback: click cell center using measured overlay % of the challenge image.
  const st = readState() || {};
  const cols = Number(st.captchaCols) === 4 ? 4 : 3;
  const rows = cols;
  const state = await getRecaptchaState(page);
  const box =
    state.bframeBox ||
    (await page.locator('iframe[src*="bframe"]').first().boundingBox().catch(() => null));
  if (!box) return false;
  const ov = st.captchaOverlay || { top: 0, left: 0, width: 100, height: 100 };
  const crop = st.captchaCrop;
  // Table-only crop: overlay is 100% of the tile table.
  const baseX = crop ? box.x + Number(crop.x || 0) : box.x;
  const baseY = crop ? box.y + Number(crop.y || 0) : box.y;
  const baseW = crop ? Number(crop.w || box.width) : box.width;
  const baseH = crop ? Number(crop.h || box.height) : box.height;
  const gridTop = baseY + (baseH * Number(ov.top)) / 100;
  const gridLeft = baseX + (baseW * Number(ov.left)) / 100;
  const gridW = (baseW * Number(ov.width)) / 100;
  const gridH = (baseH * Number(ov.height)) / 100;
  const cellW = gridW / cols;
  const cellH = gridH / rows;
  const r = Math.floor(i / cols);
  const c = i % cols;
  const x = gridLeft + (c + 0.5) * cellW;
  const y = gridTop + (r + 0.5) * cellH;
  await page.mouse.click(x, y);
  console.log('Repair captcha tile fallback click', i, Math.round(x), Math.round(y), `cols=${cols}`);
  return true;
}

async function clickCaptchaVerify(page) {
  const fr = await bframeFrom(page);
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

/** Prefer live kind, but do not demote a clear Sign-in request to leftover captcha. */
async function resolveChallengeKind(page) {
  const kind = (await detectChallengeKind(page).catch(() => null)) || null;
  const st = readState() || {};
  const prev = st.challengeKind || null;
  if (prev === 'app_approval' && kind === 'captcha') {
    const stillApp = await page
      .evaluate(() =>
        /sign-in request|check your linkedin app|notification sent|open the linkedin app|approve (this|the) (sign|request)|tap yes|waiting for approval/i.test(
          (document.body?.innerText || '').slice(0, 6000)
        )
      )
      .catch(() => false);
    if (stillApp) return 'app_approval';
  }
  return kind;
}

async function notifyChallengeNeeded(page) {
  const st = readState() || {};
  const kind = (await resolveChallengeKind(page)) || 'generic';
  const prev = st.challengeKind || null;
  // Always refresh kind when LinkedIn switches checkpoint (app_approval → pin, etc.).
  const changed = kind !== prev;
  const rank = {
    identity_document: 5,
    email_update: 5, // must beat leftover app_approval / captcha after email checkpoint
    pin: 4,
    app_approval: 4,
    captcha: 3,
    generic: 1,
    signing_in: 0,
  };
  const upgraded = !prev || changed || (rank[kind] || 0) > (rank[prev] || 0);
  if (!st.challengeNotified || upgraded || changed) {
    writeState({
      challengeNotified: true,
      challengeKind: kind,
      challengeSince: st.challengeSince || new Date().toISOString(),
    });
  }
  if (st.challengeNotified && !changed && !upgraded) return;

  const titles = {
    app_approval: 'Approve LinkedIn sign-in in your app',
    pin: 'LinkedIn wants a verification code',
    captcha: 'LinkedIn security check',
    email_update: 'LinkedIn asks for a new email',
    identity_document: 'LinkedIn asks for an ID document',
    generic: 'LinkedIn verification needed',
  };
  const messages = {
    app_approval:
      'Open the LinkedIn app on your phone and tap Yes / Approve on the sign-in request. H.A.L.O. will continue automatically — no need to sign in again here.',
    pin: 'Enter the verification code in the H.A.L.O. popup.',
    captcha: 'Complete the security check in the H.A.L.O. captcha popup (I’m not a robot / image tiles).',
    email_update:
      'LinkedIn asks for a new email. H.A.L.O. fills the email you used at Sign in and continues automatically.',
    identity_document:
      'LinkedIn is asking for a government ID. H.A.L.O. cannot complete this step. Finish ID verification in your personal browser on a normal home/office network, then paste fresh cookies — or cancel Sign in.',
    generic:
      'Complete the step shown in the H.A.L.O. LinkedIn popup (captcha, code, email, or app approve).',
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

/** Auto-fill LinkedIn "Provide a new email" with the Sign-in email. */
async function maybeAutoFillEmailUpdate(page) {
  const st = readState() || {};
  if (st.challengeKind !== 'email_update') return false;
  if (st.emailUpdateAttempted) return false;
  const email = String(st.signInUsername || '').trim();
  if (!email || !email.includes('@')) {
    writeState({
      emailUpdateAttempted: true,
      emailUpdateStatus: 'failed',
      lastFillError: 'No Sign-in email available to auto-fill.',
    });
    console.log('Repair email_update skip — no signInUsername');
    return false;
  }
  writeState({ emailUpdateAttempted: true, emailUpdateStatus: 'filling' });
  console.log('Repair email_update auto-fill', email.replace(/(^.).*(@.*$)/, '$1***$2'));
  const ok = await fillEmailUpdate(page, email, '');
  writeState({ emailUpdateStatus: ok ? 'submitted' : 'failed' });
  await page.waitForTimeout(600);
  await captureFrame(page, 'challenge');
  return ok;
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
    signInUsername: String(username || '').trim(),
    emailUpdateAttempted: false,
    emailUpdateStatus: null,
  });
  await captureFrame(page, 'form');

  // Poll for wrong-password vs challenge vs success (LinkedIn can be slow).
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForTimeout(1500);
    const earlyMode = await detectUiMode(page);
    const earlyKind = await resolveChallengeKind(page);
    if (
      earlyMode === 'challenge' ||
      earlyKind === 'app_approval' ||
      earlyKind === 'pin' ||
      earlyKind === 'captcha' ||
      earlyKind === 'email_update'
    ) {
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
        const cur = readState() || {};
        const lastAt = cur.lastSignInAt ? Date.parse(cur.lastSignInAt) : 0;
        const recent =
          Number.isFinite(lastAt) && Date.now() - lastAt < 120000 && (cur.uiMode === 'signing' || cur.uiMode === 'challenge');
        if (recent) {
          console.log('Repair skip duplicate signin (already submitted recently)');
        } else {
          await applySignIn(page, ev.username, ev.password);
        }
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
        // Explicit dashboard checkbox — force past phantom hidden bframes.
        writeState({
          captchaUiChecked: true,
          captchaPhase: 'waiting',
          captchaHasTiles: false,
          captchaPrompt: null,
          lastFillError: null,
        });
        let clicked = await tryClickRecaptcha(page, { force: true });
        console.log('Repair clickRecaptcha →', clicked ? 'clicked' : 'no-op');
        // Google often needs a beat before aria-checked / tiles appear; retry if still empty.
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(700);
          const st = await getRecaptchaState(page);
          if (st.checked || st.hasVisibleTiles) {
            console.log(
              `Repair clickRecaptcha settled checked=${st.checked} tiles=${st.hasVisibleTiles} after ${i + 1} polls`
            );
            break;
          }
          if (i === 2 || i === 5) {
            clicked = await tryClickRecaptcha(page, { force: true });
            console.log('Repair clickRecaptcha retry →', clicked ? 'clicked' : 'no-op');
          }
        }
        const after = await getRecaptchaState(page);
        if (!after.checked && !after.hasVisibleTiles) {
          writeState({
            captchaPhase: 'waiting',
            captchaUiChecked: true,
            captchaChecked: false,
            captchaHasTiles: false,
            lastFillError:
              'LinkedIn checkbox stayed empty — tap I’m not a robot again (or wait a few seconds).',
          });
          console.log('Repair clickRecaptcha — LinkedIn checkbox still unchecked');
        }
        // Fresh FRAME_PATH first — sync falls back to that when iframe shots fail.
        await captureFrame(page, 'challenge', { forceCaptchaSync: true });
      } else if (ev.type === 'clickCaptchaTile' && Number.isFinite(Number(ev.index))) {
        await clickCaptchaTile(page, Number(ev.index));
        // Wait for Google to swap the tile image (if it will) before reading selection.
        await page.waitForTimeout(750);
        await syncCaptchaNativeUi(page, { force: true, soft: true }).catch((e) =>
          console.log('soft captcha sync:', e.message)
        );
        await captureFrame(page, 'challenge');
      } else if (ev.type === 'captchaVerify') {
        await clickCaptchaVerify(page);
        await page.waitForTimeout(900);
        await captureFrame(page, 'challenge', { forceCaptchaSync: true });
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

  // Scrub password fields so live screenshots never show autofilled credentials.
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll(
        'input[type="password"], input[name="session_password"], input#password'
      )) {
        try {
          el.value = '';
          el.setAttribute('value', '');
          el.blur();
        } catch {
          /* ignore */
        }
      }
    })
    .catch(() => {});

  await page.screenshot({ path: FRAME_PATH, type: 'jpeg', quality: 55 }).catch(() => {});
  const kind = await resolveChallengeKind(page);
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
    // Routine polls must NOT force-republish — that bumps captchaGridRev and
    // makes the dashboard flicker waiting ↔ image every second.
    await syncCaptchaNativeUi(page, { force: !!opts.forceCaptchaSync }).catch((e) =>
      console.log('syncCaptchaNativeUi:', e.message)
    );
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
    // Never inherit a previous attempt's captcha tick / puzzle state.
    captchaPhase: 'none',
    captchaUiChecked: false,
    captchaChecked: false,
    captchaHasTiles: false,
    captchaHasChallengeJpg: false,
    captchaPrompt: null,
    captchaTileCount: 0,
    captchaOverlay: null,
    captchaFooterTrim: null,
    lastFillError: null,
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
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--lang=en-US',
      '--password-store=basic',
      '--disable-features=PasswordManagerOnboarding,PasswordCheck,AutofillServerCommunication',
    ],
  });
  // Never offer / fill Chromium password manager during repair.
  await context
    .addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'credentials', {
          get: () => undefined,
        });
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
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
          await maybeAutoFillEmailUpdate(page).catch((e) =>
            console.log('maybeAutoFillEmailUpdate:', e.message)
          );
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
          const liveKind = (await resolveChallengeKind(page).catch(() => null)) || cur?.challengeKind;
          writeState({
            lastFeedNudgeAt: new Date().toISOString(),
            challengeNudgeCount: nudgeN,
            uiMode: 'challenge',
            challengeKind: liveKind || cur?.challengeKind || 'generic',
          });
          // Captcha / pin / email_update: stay on page — never feed-probe mid-form.
          if (liveKind === 'captcha' || liveKind === 'pin' || liveKind === 'email_update') {
            console.log('Post-challenge passive wait —', liveKind, '(stay on page)…');
            if (liveKind === 'email_update') {
              await maybeAutoFillEmailUpdate(page).catch((e) =>
                console.log('maybeAutoFillEmailUpdate:', e.message)
              );
            } else {
              await page.waitForTimeout(2000);
            }
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
    writeState({
      status: 'timeout',
      error: 'Login not completed in time — press Sign in again.',
      challengeKind: null,
      captchaPhase: 'none',
    });
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
  const lock = await withCycleLock('R', runRepair, {
    skipIfBusy: false,
    waitMs: Number(process.env.REPAIR_LOCK_WAIT_MS || 90000),
  });
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
