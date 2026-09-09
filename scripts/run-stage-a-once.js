#!/usr/bin/env node
/** One-shot Stage A pipeline only — does not start the scheduler / Stage B. */
import dotenv from 'dotenv';
dotenv.config({ override: true });

// Import first (module top-level dotenv), then force one-shot overrides.
const { runStageA } = await import('../index.js');

process.env.STAGE_A_ONESHOT = '1';
process.env.OUTREACH_PAUSED = '0';
process.env.SKIP_STAGE_A = '0';
process.env.SKIP_STAGE_B = '1';
process.env.FORCE_STAGE_A = '1';
process.env.ALLOW_AUTO_LOGIN = process.env.ALLOW_AUTO_LOGIN || '0';
process.env.SYNC_MAX_NEW = process.env.SYNC_MAX_NEW || '5';
process.env.STAGE_A_SEND_MAX = process.env.STAGE_A_SEND_MAX || '5';

try {
  await runStageA();
  console.log('Stage A one-shot finished.');
  process.exit(0);
} catch (e) {
  console.error('Stage A one-shot failed:', e.message);
  process.exit(1);
}
