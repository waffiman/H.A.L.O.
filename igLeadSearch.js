/**
 * Instagram find step: search people matching Brain portrait tokens (session web API).
 * Returns candidate handles (no CRM insert — outbound pipeline does send → Lead).
 */
import fs from 'fs';
import { igCookiesFile } from './igSessionHealth.js';
import { readSalesPolicy } from './brainStore.js';

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

function cookieHeader(cookies) {
  return cookies
    .filter((c) => c?.name && c?.value != null)
    .map((c) => `${c.name}=${normalizeCookieValue(c.value)}`)
    .join('; ');
}

function pick(cookies, name) {
  return cookies.find((c) => c.name === name)?.value || '';
}

function portraitQueryTokens(policy) {
  const p = policy?.portrait || {};
  const roles = Array.isArray(p.roles) ? p.roles : [];
  const industries = Array.isArray(p.industries) ? p.industries : [];
  const keywords = Array.isArray(p.extraKeywords)
    ? p.extraKeywords
    : String(p.extraKeywords || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const company = String(p.currentCompany || p.company || '').trim();
  const region = String(p.region || p.geo || '').trim();
  const tokens = [...roles, ...industries, ...keywords, company, region]
    .map((s) => String(s || '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 2)
    .slice(0, 8);
  return tokens;
}

async function igUsersSearch(query, cookies) {
  const csrftoken = pick(cookies, 'csrftoken');
  const url = `https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(query)}&include_reel=false`;
  const res = await fetch(url, {
    headers: {
      Cookie: cookieHeader(cookies),
      'X-CSRFToken': csrftoken || '',
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: '*/*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
    },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`IG search non-JSON (${res.status}): ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`IG search ${res.status}: ${String(data?.message || text).slice(0, 120)}`);
  const users = Array.isArray(data?.users) ? data.users : [];
  return users
    .map((u) => u?.user || u)
    .filter(Boolean)
    .map((u) => ({
      handle: String(u.username || '').replace(/^@/, ''),
      name: String(u.full_name || '').trim(),
      isPrivate: u.is_private === true,
      followers: Number(u.follower_count) || 0,
    }))
    .filter((u) => u.handle);
}

/**
 * @returns {{ query: string, candidates: { handle, name, isPrivate }[] }}
 */
export async function searchIgByPortrait({ max = 8 } = {}) {
  const cookies = loadCookies();
  if (!cookies.some((c) => c.name === 'sessionid' && c.value)) {
    throw new Error('Instagram sessionid missing — sync cookies first');
  }
  const policy = readSalesPolicy();
  const tokens = portraitQueryTokens(policy);
  const query = tokens.slice(0, 3).join(' ') || 'founder';
  console.log(`[IG search] query="${query}" tokens=${tokens.length}`);
  const found = await igUsersSearch(query, cookies);
  const seen = new Set();
  const candidates = [];
  for (const u of found) {
    const h = u.handle.toLowerCase();
    if (seen.has(h)) continue;
    if (u.isPrivate) continue;
    seen.add(h);
    candidates.push(u);
    if (candidates.length >= max) break;
  }
  return { query, candidates, tokens };
}
