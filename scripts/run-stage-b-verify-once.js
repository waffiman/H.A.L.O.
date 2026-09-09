#!/usr/bin/env node
/** One-shot Stage B verify — set overrides AFTER index import (dotenv), then run. */
import dotenv from 'dotenv';
dotenv.config({ override: true });

const { runStageB } = await import('../index.js');

process.env.STAGE_A_ONESHOT = '1';
process.env.OUTREACH_PAUSED = '0';
process.env.SKIP_STAGE_A = '1';
process.env.SKIP_STAGE_B = '0';
process.env.SKIP_CONVERSATION = '0';
process.env.ENABLE_INBOX_REPLIES = '1';
process.env.ALLOW_AUTO_LOGIN = '0';
process.env.CONV_MAX_PER_RUN = process.env.CONV_MAX_PER_RUN || '5';
process.env.LOST_INBOX_MAX = process.env.LOST_INBOX_MAX || '15';
process.env.SILENCE_BUSINESS_DAYS = process.env.SILENCE_BUSINESS_DAYS || '2';
process.env.SILENCE_SKIP_WEEKENDS = process.env.SILENCE_SKIP_WEEKENDS || '1';
process.env.TARGET_LINKEDIN_URL = '';

try {
  await runStageB();
  console.log('Stage B one-shot finished.');
  process.exit(0);
} catch (e) {
  console.error('Stage B one-shot failed:', e.message);
  process.exit(1);
}
