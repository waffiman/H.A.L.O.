/**
 * One process: verify feed with cookies → Stage B for TARGET (no second browser launch).
 */
import dotenv from 'dotenv';
dotenv.config();

process.env.ALLOW_AUTO_LOGIN = '0';
process.env.SKIP_STAGE_B = '0';
process.env.SKIP_CONVERSATION = '0';
process.env.ENABLE_INBOX_REPLIES = process.env.ENABLE_INBOX_REPLIES || '1';
process.env.CONV_MAX_PER_RUN = '1';
process.env.LOST_INBOX_MAX = '0';
process.env.TARGET_LINKEDIN_URL =
  process.env.TARGET_LINKEDIN_URL || 'https://www.linkedin.com/in/dmytro-korobko-86921a2a9/';
process.env.REQUIRE_SESSION = '0';

const { runStageB } = await import('./index.js');
const { readSessionStatus } = await import('./sessionHealth.js');

console.log('=== COMBINED Stage B (single browser) ===');
await runStageB();
const st = readSessionStatus();
console.log('session_status:', JSON.stringify(st));
if (st && st.ok === false) {
  console.error('Stage B finished but session marked dead');
  process.exitCode = 2;
}
