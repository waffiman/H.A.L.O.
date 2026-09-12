/**
 * Cookie session auth for HALO cabinets.
 * Cookie: halo_session = base64url(payload).sig
 */
import crypto from 'crypto';
import { readEnvFile, writeEnvFile } from './env.js';
import {
  getTenantByEmail,
  getTenantAuthRow,
  verifyPassword,
  tenantPublic,
  waffiWorkspaceId,
} from './tenants.js';

const COOKIE = 'halo_session';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Session HMAC key. No hardcoded fallback and no DASHBOARD_PASSWORD reuse:
 * a guessable key lets anyone mint a session cookie for any workspace.
 * ensureSessionSecret() runs at boot so this never throws in practice.
 */
function sessionSecret(env = readEnvFile()) {
  const secret = (env.HALO_SESSION_SECRET || process.env.HALO_SESSION_SECRET || '').trim();
  if (secret.length < 32) {
    throw new Error(
      'HALO_SESSION_SECRET missing or too short (need >= 32 chars). Dashboard refuses to sign or verify sessions.'
    );
  }
  return secret;
}

/**
 * Generate and persist a strong session secret on first boot so a fresh deploy
 * is secure by default rather than falling back to a shared constant.
 * @returns {{ created: boolean }}
 */
export function ensureSessionSecret() {
  const env = readEnvFile();
  const current = (env.HALO_SESSION_SECRET || process.env.HALO_SESSION_SECRET || '').trim();
  if (current.length >= 32) return { created: false };
  const generated = crypto.randomBytes(48).toString('base64url');
  writeEnvFile({ HALO_SESSION_SECRET: generated });
  process.env.HALO_SESSION_SECRET = generated;
  return { created: true };
}

/** Length-safe constant-time string compare for credential checks. */
function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  // Compare digests so differing lengths do not short-circuit or throw.
  const digestA = crypto.createHash('sha256').update(bufA).digest();
  const digestB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(digestA, digestB) && bufA.length === bufB.length;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signSession(payload, env = readEnvFile()) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', sessionSecret(env)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token, env = readEnvFile()) {
  const raw = String(token || '');
  const i = raw.lastIndexOf('.');
  if (i < 1) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expect = crypto.createHmac('sha256', sessionSecret(env)).update(body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8'));
    if (!payload?.workspaceId || !payload?.email) return null;
    if (payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(MAX_AGE_MS / 1000);
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === 'production' || process.env.HALO_COOKIE_SECURE === '1') {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function createSessionToken(tenant, env = readEnvFile()) {
  return signSession(
    {
      email: tenant.email,
      workspaceId: tenant.workspaceId,
      role: tenant.role,
      exp: Date.now() + MAX_AGE_MS,
    },
    env
  );
}

/**
 * Resolve cabinet for request:
 * 1) halo_session cookie
 * 2) Basic auth matching DASHBOARD_USER/PASSWORD → WAFFi workspace `default`
 */
export async function resolveRequestTenant(req, env = readEnvFile()) {
  const cookies = parseCookies(req);
  const payload = verifySessionToken(cookies[COOKIE], env);
  if (payload) {
    // Prefer live DB workspace_id so CRM stays correct after tenant repairs / re-seeds.
    try {
      const live = await getTenantByEmail(payload.email, env);
      if (live?.workspaceId) {
        return {
          email: live.email,
          workspaceId: live.workspaceId,
          role: live.role || payload.role || 'user',
          via: 'session',
        };
      }
    } catch {
      /* fall through to cookie payload */
    }
    return {
      email: payload.email,
      workspaceId: payload.workspaceId,
      role: payload.role || 'user',
      via: 'session',
    };
  }

  const pass = (env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '').trim();
  const user = (env.DASHBOARD_USER || process.env.DASHBOARD_USER || 'admin').trim();
  if (!pass) return null;

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return null;
  const u = decoded.slice(0, i);
  const p = decoded.slice(i + 1);
  if (!constantTimeEquals(u, user) || !constantTimeEquals(p, pass)) return null;

  return {
    email: user.includes('@') ? user.toLowerCase() : 'wafficompany@gmail.com',
    workspaceId: (env.WORKSPACE_ID || '').trim() || waffiWorkspaceId(),
    role: 'owner',
    via: 'basic',
  };
}

export async function loginWithPassword(email, password, env = readEnvFile()) {
  const row = await getTenantAuthRow(email, env);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error('Invalid email or password');
  }
  return getTenantByEmail(email, env);
}

export { COOKIE, tenantPublic };
