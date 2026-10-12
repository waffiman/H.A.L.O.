/**
 * X encrypted-chat passcode state for the cabinet.
 * When Stage A hits pin recovery without X_CHAT_PASSCODE, the X channel pauses.
 */
import fs from 'fs';
import path from 'path';
import { dataRoot } from './dataRoot.js';

export function xPasscodeStateFile(root = dataRoot()) {
  return path.join(root, 'x_passcode_state.json');
}

export function readXPasscodeState(filePath = xPasscodeStateFile()) {
  try {
    if (!fs.existsSync(filePath)) return { needsPasscode: false };
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { needsPasscode: false };
  }
}

export function writeXPasscodeState(patch = {}, filePath = xPasscodeStateFile()) {
  const prev = readXPasscodeState(filePath);
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function xChatPasscodePresent() {
  return String(process.env.X_CHAT_PASSCODE || '').replace(/\D/g, '').length === 4;
}

export function markXPasscodeRequired(reason = 'pin_recovery') {
  const next = writeXPasscodeState({
    needsPasscode: true,
    reason,
    pausedChannel: true,
  });
  import('./notify.js')
    .then(({ notify }) =>
      notify({
        type: 'session',
        key: 'x_chat_passcode',
        title: 'X chat passcode needed',
        message:
          'Stage A hit X encrypted-chat passcode recovery. The X channel is paused until you enter the 4-digit passcode on the X page.',
        once: true,
      })
    )
    .catch(() => {});
  return next;
}

export function clearXPasscodeRequired() {
  return writeXPasscodeState({
    needsPasscode: false,
    reason: null,
    pausedChannel: false,
  });
}

/** True when Stage A / X DM should refuse to open chat until the operator pastes a passcode. */
export function xChannelBlockedOnPasscode() {
  const state = readXPasscodeState();
  if (!state.needsPasscode) return false;
  if (xChatPasscodePresent()) return false;
  return true;
}
