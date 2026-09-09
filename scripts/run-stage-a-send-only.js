#!/usr/bin/env node
/** One-shot: send ice for existing Proposal 1️⃣ only (no sync/enrich). */
import dotenv from 'dotenv';
dotenv.config({ override: true });

const { runStageA } = await import('../index.js');

process.env.STAGE_A_ONESHOT = '1';
process.env.OUTREACH_PAUSED = '0';
process.env.SKIP_STAGE_A = '0';
process.env.SKIP_STAGE_B = '1';
process.env.SKIP_SYNC = '1';
process.env.SKIP_ENRICH = '1';
process.env.FORCE_STAGE_A = '1';
process.env.ALLOW_AUTO_LOGIN = process.env.ALLOW_AUTO_LOGIN || '0';
process.env.SYNC_MAX_NEW = process.env.SYNC_MAX_NEW || '5';
process.env.STAGE_A_SEND_MAX = process.env.STAGE_A_SEND_MAX || '5';

try {
  await runStageA();
  console.log('Stage A send-only finished.');
  process.exit(0);
} catch (e) {
  console.error('Stage A send-only failed:', e.message);
  process.exit(1);
}
