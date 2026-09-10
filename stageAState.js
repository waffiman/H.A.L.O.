/**
 * Stage A due tracking (48h acquisition pipeline).
 */
import fs from 'fs';
import { stageAStateFile } from './dataRoot.js';

function statePath() {
  return stageAStateFile();
}

export function loadStageAState() {
  try {
    if (fs.existsSync(statePath())) {
      return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return { lastRunAt: null };
}

export function saveStageAState(state) {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

export function isStageADue(state = loadStageAState()) {
  if (process.env.FORCE_STAGE_A === '1') return true;
  const interval = Number(process.env.STAGE_A_INTERVAL_MS || 172800000); // 48h
  if (!state.lastRunAt) return true;
  const elapsed = Date.now() - Date.parse(state.lastRunAt);
  return Number.isFinite(elapsed) && elapsed >= interval;
}

export function markStageARan() {
  const state = loadStageAState();
  state.lastRunAt = new Date().toISOString();
  saveStageAState(state);
  return state;
}
