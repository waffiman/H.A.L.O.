#!/usr/bin/env node
/**
 * One-shot IG outbound: process one handle (env IG_TARGET_HANDLES or argv).
 * Usage: IG_TARGET_HANDLES=someuser node scripts/run-ig-once.js
 */
import dotenv from 'dotenv';
import { applyTenantEnv } from '../tenantEnv.js';
import path from 'path';

dotenv.config({ override: true });
applyTenantEnv();

process.env.CHANNEL_INSTAGRAM_ENABLED = '1';
process.env.ALLOW_AUTO_LOGIN = '0';
process.env.IG_LEADS_PER_RUN = '1';

const fromArg = String(process.argv[2] || '')
  .replace(/^@/, '')
  .trim();
if (fromArg) process.env.IG_TARGET_HANDLES = fromArg;

const { withCycleLock } = await import('../cycleLock.js');
const { runIgOutboundPhase } = await import('../igOutbound.js');

const locked = await withCycleLock('C', () => runIgOutboundPhase(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('IG one-shot skipped:', locked.reason);
  process.exit(2);
}
console.log('IG one-shot finished.', JSON.stringify(locked?.result || {}));
process.exit(locked?.result?.sent > 0 ? 0 : 1);
