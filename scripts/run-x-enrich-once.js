#!/usr/bin/env node
/** One-shot X enrich (step 2). No browser, no ice, no Brave. */
import dotenv from 'dotenv';
import { applyTenantEnv } from '../tenantEnv.js';
import path from 'path';

dotenv.config({ override: true });
applyTenantEnv();

process.env.X_SEARCH_ONESHOT = '1';
process.env.CHANNEL_X_ENABLED = '1';

const { enrichReadyXLeads } = await import('../xEnrich.js');

try {
  const result = await enrichReadyXLeads();
  console.log('X enrich one-shot finished.', JSON.stringify(result));
  process.exit(result?.failed ? 1 : 0);
} catch (e) {
  console.error('X enrich one-shot failed:', e.message);
  process.exit(1);
}
