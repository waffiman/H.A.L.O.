/**
 * One-shot Brain analysis (Notion + LLM only, no LinkedIn).
 * Usage: node scripts/run-brain-analysis-once.js
 */
import { withCycleLock } from '../cycleLock.js';
import { runBrainAnalysis } from '../brainAnalyzer.js';

await withCycleLock('Brain', runBrainAnalysis, {
  skipIfBusy: false,
  waitMs: Number(process.env.LOCK_WAIT_MS || 900000),
});
