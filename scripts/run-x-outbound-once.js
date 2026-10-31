#!/usr/bin/env node
/**
 * One-shot X outbound: enrich (if needed) → score → ice → DM → Conversation.
 * Optional: X_OUTBOUND_HANDLES=farman32740,Agzer19
 * Does not open LinkedIn. Hold cycle lock C; stop linkedin-agent first.
 */
import dotenv from 'dotenv';
import { applyTenantEnv } from '../tenantEnv.js';
import path from 'path';

dotenv.config({ override: true });
applyTenantEnv();

process.env.CHANNEL_X_ENABLED = '1';
process.env.ALLOW_AUTO_LOGIN = '0';
if (process.env.X_LEADS_PER_RUN == null || String(process.env.X_LEADS_PER_RUN).trim() === '') {
  process.env.X_LEADS_PER_RUN = '5';
}

const { withCycleLock } = await import('../cycleLock.js');

async function run() {
  try {
    const { enrichReadyXLeads } = await import('../xEnrich.js');
    await enrichReadyXLeads();
  } catch (e) {
    console.error('X enrich:', e?.message || e);
  }
  const { runXOutboundPhase } = await import('../xOutbound.js');
  return runXOutboundPhase();
}

const locked = await withCycleLock('C', () => run(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('X outbound one-shot skipped:', locked.reason);
  process.exit(2);
}
console.log('X outbound one-shot finished.', JSON.stringify(locked?.result || {}));
process.exit(locked?.result?.ok > 0 ? 0 : 1);
