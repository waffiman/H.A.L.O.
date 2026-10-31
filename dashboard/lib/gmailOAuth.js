/**
 * Per-cabinet Gmail OAuth (Google sign-in on the dashboard).
 * Scopes: gmail.send + userinfo.email. Tokens live under the cabinet root
 * as gmail_oauth.json — never in root .env secrets for tenants.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { APP_ROOT, readEnvFile } from './env.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';
import { waffiWorkspaceId } from './tenants.js';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const STATE_TTL_MS = 15 * 60 * 1000;
const pendingStates = new Map();

function oauthConfig(env = readEnvFile()) {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(
    env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${String(env.PUBLIC_DASHBOARD_URL || env.DASHBOARD_PUBLIC_URL || '')
        .trim()
        .replace(/\/$/, '')}/api/email/google/callback`
  ).trim();
  return { clientId, clientSecret, redirectUri };
}

export function gmailOAuthConfigured(env = readEnvFile()) {
  const { clientId, clientSecret, redirectUri } = oauthConfig(env);
  return Boolean(clientId && clientSecret && redirectUri.startsWith('http'));
}

function tokenPath(workspaceId) {
  const paths = tenantPaths(workspaceId);
  return path.join(paths.root, 'gmail_oauth.json');
}

export function readGmailOAuth(workspaceId = waffiWorkspaceId()) {
  try {
    const p = tokenPath(workspaceId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeGmailOAuth(workspaceId, data) {
  ensureTenantRuntime(workspaceId);
  const p = tokenPath(workspaceId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return data;
}

export function clearGmailOAuth(workspaceId = waffiWorkspaceId()) {
  try {
    const p = tokenPath(workspaceId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

export function gmailConnectionStatus(workspaceId = waffiWorkspaceId(), env = readEnvFile()) {
  const configured = gmailOAuthConfigured(env);
  const tok = readGmailOAuth(workspaceId);
  return {
    oauthConfigured: configured,
    connected: Boolean(tok?.refresh_token || tok?.access_token),
    email: tok?.email || '',
    connectedAt: tok?.connectedAt || null,
    scopes: tok?.scope || '',
  };
}

function pruneStates() {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (!v?.exp || v.exp < now) pendingStates.delete(k);
  }
}

export function beginGmailOAuth(workspaceId, env = readEnvFile()) {
  const { clientId, clientSecret, redirectUri } = oauthConfig(env);
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth is not configured — set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and PUBLIC_DASHBOARD_URL (or GOOGLE_OAUTH_REDIRECT_URI)'
    );
  }
  pruneStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, {
    workspaceId: String(workspaceId || waffiWorkspaceId()),
    exp: Date.now() + STATE_TTL_MS,
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return { url: url.toString(), state, redirectUri };
}

export async function finishGmailOAuth(code, state, env = readEnvFile()) {
  pruneStates();
  const pending = pendingStates.get(String(state || ''));
  if (!pending) throw new Error('OAuth state expired — start Connect Google again');
  pendingStates.delete(String(state || ''));
  const { clientId, clientSecret, redirectUri } = oauthConfig(env);
  const body = new URLSearchParams({
    code: String(code || ''),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    throw new Error(tokenJson.error_description || tokenJson.error || `token exchange ${tokenRes.status}`);
  }
  if (!tokenJson.refresh_token && !tokenJson.access_token) {
    throw new Error('Google did not return tokens — try Connect again with consent');
  }

  let email = '';
  if (tokenJson.access_token) {
    try {
      const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        signal: AbortSignal.timeout(15000),
      });
      const me = await meRes.json().catch(() => ({}));
      email = String(me.email || '').trim();
    } catch {
      /* optional */
    }
  }

  const prev = readGmailOAuth(pending.workspaceId) || {};
  const saved = writeGmailOAuth(pending.workspaceId, {
    ...prev,
    access_token: tokenJson.access_token || prev.access_token || '',
    refresh_token: tokenJson.refresh_token || prev.refresh_token || '',
    expiry_date: tokenJson.expires_in
      ? Date.now() + Number(tokenJson.expires_in) * 1000
      : prev.expiry_date || null,
    scope: tokenJson.scope || SCOPES,
    token_type: tokenJson.token_type || 'Bearer',
    email,
    connectedAt: new Date().toISOString(),
    workspaceId: pending.workspaceId,
  });
  return {
    workspaceId: pending.workspaceId,
    email: saved.email,
    connected: true,
  };
}

/** Refresh access token when needed (for later send path). */
export async function getValidGmailAccessToken(workspaceId = waffiWorkspaceId(), env = readEnvFile()) {
  const tok = readGmailOAuth(workspaceId);
  if (!tok?.refresh_token && !tok?.access_token) throw new Error('Gmail not connected');
  if (tok.access_token && tok.expiry_date && Date.now() < Number(tok.expiry_date) - 60000) {
    return tok.access_token;
  }
  if (!tok.refresh_token) return tok.access_token;
  const { clientId, clientSecret } = oauthConfig(env);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tok.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || 'refresh failed');
  writeGmailOAuth(workspaceId, {
    ...tok,
    access_token: json.access_token,
    expiry_date: json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : null,
  });
  return json.access_token;
}

// Keep APP_ROOT referenced so deploy trees that tree-shake oddly still ship the file.
void APP_ROOT;
