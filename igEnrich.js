/**
 * Instagram basic enrich — no Apify.
 * 1) Logged-in web API (sessionid + csrftoken)
 * 2) Fallback: our Playwright profile parser (DOM + embedded JSON + og tags)
 */
import fs from 'fs';
import { chromium } from 'playwright';
import { igCookiesFile, igSessionDataDir, markIgSessionDead, markIgSessionOk } from './igSessionHealth.js';
import { instagramHandleFromUrl, canonicalInstagramProfileUrl } from './leadChannel.js';

function loadIgCookies() {
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

function cookieHeader(cookies) {
  return cookies
    .filter((c) => c?.name && c?.value != null)
    .map((c) => `${c.name}=${normalizeCookieValue(c.value)}`)
    .join('; ');
}

function pick(cookies, name) {
  const c = cookies.find((x) => x.name === name);
  return c?.value != null ? normalizeCookieValue(c.value) : '';
}

function toPlaywrightCookie(c) {
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

function shapeProfile(handle, user) {
  const name = String(user.full_name || user.name || handle)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const biography = String(user.biography || user.bio || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
  const externalUrl = String(user.external_url || user.externalUrl || '')
    .trim()
    .slice(0, 300);
  const category = String(user.category_name || user.business_category_name || user.category || '')
    .trim()
    .slice(0, 300);

  return {
    handle,
    url: canonicalInstagramProfileUrl(handle),
    name,
    biography,
    headline: category || biography.slice(0, 120),
    company: '',
    followers: Number(user.edge_followed_by?.count ?? user.follower_count ?? user.followers) || 0,
    following: Number(user.edge_follow?.count ?? user.following_count ?? user.following) || 0,
    isPrivate: user.is_private === true || user.isPrivate === true,
    isBusiness:
      user.is_business_account === true ||
      user.is_professional_account === true ||
      user.isBusiness === true,
    externalUrl,
    linkCandidates: [externalUrl].filter(Boolean),
    description: biography,
    canMessage: true,
    enrichSource: user._source || 'api',
  };
}

async function enrichViaWebApi(handle, cookies) {
  const sessionid = pick(cookies, 'sessionid');
  const csrftoken = pick(cookies, 'csrftoken');
  if (!sessionid) throw new Error('Instagram sessionid missing — sync cookies first');

  const endpoint = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Cookie: cookieHeader(cookies),
      'X-CSRFToken': csrftoken || '',
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: '*/*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: `https://www.instagram.com/${handle}/`,
    },
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Instagram enrich non-JSON (${res.status}): ${text.slice(0, 160)}`);
  }
  if (!res.ok) {
    throw new Error(`Instagram enrich ${res.status}: ${String(data?.message || text).slice(0, 160)}`);
  }
  const user = data?.data?.user || data?.user;
  if (!user) throw new Error('Instagram enrich: no user in response');
  return shapeProfile(handle, { ...user, _source: 'web_api' });
}

/**
 * Own Instagram profile parser (Playwright). No Apify.
 * Pulls embedded GraphQL/JSON blobs, then og/meta + visible header/bio.
 */
async function enrichViaPlaywrightParser(handle, cookies) {
  const jar = cookies.map(toPlaywrightCookie).filter(Boolean);
  if (!jar.some((c) => c.name === 'sessionid')) {
    throw new Error('Instagram sessionid missing — sync cookies first');
  }

  const profileDir = pathJoinSessionDir();
  fs.mkdirSync(profileDir, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    await context.addCookies(jar);
    const page = context.pages()[0] || (await context.newPage());

    // Capture web_profile_info / GraphQL if the page itself requests it
    let capturedUser = null;
    page.on('response', async (res) => {
      try {
        const u = res.url();
        if (!/web_profile_info|graphql|polaris/i.test(u)) return;
        if (res.status() !== 200) return;
        const ct = String(res.headers()['content-type'] || '');
        if (!/json|javascript/i.test(ct) && !/web_profile_info/.test(u)) return;
        const text = await res.text();
        if (!/biography|full_name|username/i.test(text)) return;
        const data = JSON.parse(text);
        const user =
          data?.data?.user ||
          data?.data?.user?.user ||
          findUserBlob(data, handle);
        if (user?.username || user?.full_name || user?.biography != null) {
          capturedUser = user;
        }
      } catch {
        /* ignore parse errors */
      }
    });

    const profileUrl = canonicalInstagramProfileUrl(handle);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2200);

    if (/accounts\/login|challenge/i.test(page.url())) {
      markIgSessionDead('auth_wall', { at: 'igEnrich.parser' });
      throw new Error('Instagram auth wall during enrich');
    }
    markIgSessionOk({ source: 'igEnrich.parser' });

    // Give XHR a moment
    await page.waitForTimeout(1800);
    if (capturedUser) {
      return shapeProfile(handle, { ...capturedUser, _source: 'playwright_xhr' });
    }

    const scraped = await page.evaluate((wantHandle) => {
      const want = String(wantHandle || '').toLowerCase();

      function walk(node, depth = 0) {
        if (!node || depth > 14) return null;
        if (Array.isArray(node)) {
          for (const item of node) {
            const hit = walk(item, depth + 1);
            if (hit) return hit;
          }
          return null;
        }
        if (typeof node !== 'object') return null;
        const uname = String(node.username || node.user_name || '').toLowerCase();
        if (
          (uname === want || (!want && node.biography != null && node.full_name != null)) &&
          (node.biography != null || node.full_name != null || node.edge_followed_by)
        ) {
          return node;
        }
        // nested user
        if (node.user && typeof node.user === 'object') {
          const inner = walk(node.user, depth + 1);
          if (inner) return inner;
        }
        for (const v of Object.values(node)) {
          if (v && typeof v === 'object') {
            const hit = walk(v, depth + 1);
            if (hit) return hit;
          }
        }
        return null;
      }

      // Embedded JSON scripts
      for (const script of document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(script.textContent || '');
          const hit = walk(data);
          if (hit) return { ...hit, _via: 'script_json' };
        } catch {
          /* continue */
        }
      }

      // Inline script blobs mentioning biography
      for (const script of document.querySelectorAll('script:not([src])')) {
        const raw = script.textContent || '';
        if (!/biography/i.test(raw) || raw.length < 80) continue;
        const m = raw.match(/\{[\s\S]{20,}"biography"\s*:\s*"[\s\S]{0,2000}?\}/);
        if (!m) continue;
        try {
          // Try to locate a larger object containing username
          const idx = raw.indexOf('"biography"');
          const start = raw.lastIndexOf('{', idx);
          const slice = raw.slice(Math.max(0, start), start + 12000);
          const data = JSON.parse(slice.replace(/,$/, ''));
          const hit = walk(data);
          if (hit) return { ...hit, _via: 'inline_script' };
        } catch {
          /* continue */
        }
      }

      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
      const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
      // "Name (@handle) • Instagram photos..."
      let name = '';
      const titleMatch = ogTitle.match(/^(.+?)\s*\(@/i) || ogTitle.match(/^(.+?)\s*[•|·]/);
      if (titleMatch) name = titleMatch[1].trim();
      // "1,234 Followers, 56 Following, 78 Posts - Bio text"
      let followers = 0;
      let following = 0;
      let biography = '';
      const counts = ogDesc.match(
        /([\d.,]+[KkMm]?)\s*Followers?,?\s*([\d.,]+[KkMm]?)\s*Following?,?\s*([\d.,]+[KkMm]?)\s*Posts?/i
      );
      if (counts) {
        const parseN = (s) => {
          const t = String(s).replace(/,/g, '').trim();
          const m2 = t.match(/^([\d.]+)\s*([KkMm])?$/);
          if (!m2) return 0;
          let n = parseFloat(m2[1]);
          const u = (m2[2] || '').toUpperCase();
          if (u === 'K') n *= 1e3;
          if (u === 'M') n *= 1e6;
          return Math.round(n);
        };
        followers = parseN(counts[1]);
        following = parseN(counts[2]);
        biography = ogDesc.slice(ogDesc.indexOf('-') + 1).trim() || '';
      } else if (ogDesc) {
        biography = ogDesc.trim();
      }

      // Visible header / bio
      const header = document.querySelector('header section, header, main header');
      const h1 = header?.querySelector('h1, h2')?.textContent?.trim() || '';
      if (!name && h1) name = h1;
      const bioEl =
        header?.querySelector('h1 + span, .-vDIg span, [data-testid="user-bio"], span[dir="auto"]') ||
        document.querySelector('span[dir="auto"]');
      // Prefer longest bio-looking span under header
      let bestBio = biography;
      if (header) {
        for (const el of header.querySelectorAll('span, div')) {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (t.length > bestBio.length && t.length < 800 && !/Followers|Following|Posts/i.test(t)) {
            bestBio = t;
          }
        }
      }
      const linkEl = header?.querySelector('a[href^="http"]') || document.querySelector('a[rel="me"], header a[target="_blank"]');
      const external =
        linkEl?.href && !/instagram\.com/i.test(linkEl.href) ? linkEl.href : '';

      if (!name && !bestBio && !followers) return null;
      return {
        username: wantHandle,
        full_name: name || wantHandle,
        biography: bestBio || biography,
        external_url: external,
        follower_count: followers,
        following_count: following,
        _via: 'dom_og',
        _ogUrl: ogUrl,
      };
    }, handle);

    if (!scraped) throw new Error('Playwright parser: no profile fields found');
    return shapeProfile(handle, { ...scraped, _source: `playwright_${scraped._via || 'dom'}` });
  } finally {
    try {
      await context?.close();
    } catch {
      /* ignore */
    }
  }
}

function pathJoinSessionDir() {
  // Prefer a dedicated enrich profile so we don't fight a concurrent send profile lock
  return `${igSessionDataDir()}_enrich`;
}

function findUserBlob(data, handle) {
  const want = String(handle || '').toLowerCase();
  const stack = [data];
  let guard = 0;
  while (stack.length && guard++ < 4000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const uname = String(node.username || '').toLowerCase();
    if (uname === want && (node.biography != null || node.full_name != null)) return node;
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

/**
 * Fetch public-ish profile fields with the operator session.
 * @returns {{ handle, name, biography, followers, following, isPrivate, isBusiness, externalUrl, headline, enrichSource }}
 */
export async function enrichIgProfileBasic(urlOrHandle) {
  const handle = instagramHandleFromUrl(urlOrHandle);
  if (!handle) throw new Error(`Invalid Instagram handle: ${urlOrHandle}`);
  const cookies = loadIgCookies();
  if (!pick(cookies, 'sessionid')) throw new Error('Instagram sessionid missing — sync cookies first');

  try {
    return await enrichViaWebApi(handle, cookies);
  } catch (e) {
    console.warn(`[IG enrich] web API failed for @${handle}: ${e?.message || e} — Playwright parser`);
    return await enrichViaPlaywrightParser(handle, cookies);
  }
}
