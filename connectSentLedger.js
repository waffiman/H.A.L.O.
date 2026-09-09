/**
 * Optional safety ledger: slugs we sent connect invites to (survives CRM write failure).
 */
import fs from 'fs';
import path from 'path';

const LEDGER_PATH = path.join(process.cwd(), 'connect_sent_slugs.json');
const TTL_MS = Number(process.env.CONNECT_LEDGER_TTL_MS || 30 * 24 * 60 * 60 * 1000);

function readRaw() {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    }
  } catch {
    /* fall through */
  }
  return { entries: {} };
}

function writeRaw(data) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function pruneConnectLedger() {
  const data = readRaw();
  const now = Date.now();
  const entries = data.entries || {};
  let changed = false;
  for (const [slug, ts] of Object.entries(entries)) {
    if (now - Number(ts) > TTL_MS) {
      delete entries[slug];
      changed = true;
    }
  }
  if (changed) writeRaw({ entries });
  return entries;
}

export function recordConnectSent(slug) {
  if (!slug) return;
  const data = readRaw();
  data.entries = data.entries || {};
  data.entries[String(slug).toLowerCase()] = Date.now();
  writeRaw(data);
}

export function wasConnectSentRecently(slug) {
  if (!slug) return false;
  const entries = pruneConnectLedger();
  const ts = entries[String(slug).toLowerCase()];
  if (!ts) return false;
  return Date.now() - Number(ts) <= TTL_MS;
}

export function connectLedgerSlugs() {
  return new Set(Object.keys(pruneConnectLedger()));
}
