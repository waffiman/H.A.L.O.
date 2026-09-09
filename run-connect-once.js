/**
 * One-shot LinkedIn Connect run (manual Start from dashboard).
 *   CONNECT_SEARCH_URL=... CONNECT_MAX_PER_RUN=10 node run-connect-once.js
 */
import 'dotenv/config';
import { withCycleLock, isLockHeld } from './cycleLock.js';
import { runConnectWithBrowser } from './runConnectBrowser.js';

process.env.ALLOW_AUTO_LOGIN = process.env.ALLOW_AUTO_LOGIN || '0';

async function main() {
  const held = isLockHeld();
  if (held.held) {
    console.error(`Cannot start Connect — cycle lock held by ${held.owner}`);
    process.exit(2);
  }

  const lock = await withCycleLock('C', () => runConnectWithBrowser(), {
    skipIfBusy: true,
    waitMs: 0,
  });

  if (lock.skipped) {
    console.error('Connect skipped — lock busy');
    process.exit(2);
  }
  const result = lock.result;
  if (result?.error) {
    console.error('Connect failed:', result.error);
    process.exit(1);
  }
  console.log(
    'Connect finished:',
    JSON.stringify({ sent: result?.sent, failed: result?.failed, skipped: result?.skipped })
  );
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
