#!/usr/bin/env node
/** One-shot X People search (step 1). Does not run LinkedIn Stage A or the scheduler. */
import dotenv from 'dotenv';
import { applyTenantEnv } from '../tenantEnv.js';
import path from 'path';

dotenv.config({ override: true });
applyTenantEnv();

process.env.X_SEARCH_ONESHOT = '1';
process.env.CHANNEL_X_ENABLED = '1';
process.env.ALLOW_AUTO_LOGIN = '0';
if (process.env.X_LEADS_PER_RUN == null || String(process.env.X_LEADS_PER_RUN).trim() === '') {
  process.env.X_LEADS_PER_RUN = '5';
}

const { withCycleLock } = await import('../cycleLock.js');
const { runXLeadSearchPhase } = await import('../xLeadSearch.js');

const locked = await withCycleLock('C', () => runXLeadSearchPhase(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('X search one-shot skipped:', locked.reason);
  process.exit(2);
}
console.log('X search one-shot finished.', JSON.stringify(locked?.result || {}));
process.exit(0);
