/**
 * Cursor hook: after a successful `git commit`, push current branch to origin.
 * stdin: afterShellExecution JSON; stdout: optional follow-up (none needed).
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const gitCandidates = [
  path.join(process.env.LOCALAPPDATA || '', 'MinGit', 'cmd', 'git.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop', 'app-3.5.8', 'resources', 'app', 'git', 'cmd', 'git.exe'),
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'git',
];

function findGit() {
  for (const c of gitCandidates) {
    try {
      if (c === 'git' || fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let payload = {};
try {
  payload = JSON.parse(raw || '{}');
} catch {
  process.exit(0);
}

const cmd = String(payload.command || '');
const exitCode = Number(payload.exitCode ?? payload.status ?? 0);
if (!/git(\.exe)?(\s+|$).*\bcommit\b/i.test(cmd) || exitCode !== 0) {
  process.exit(0);
}

const git = findGit();
if (!git) process.exit(0);

try {
  const branch = execFileSync(git, ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!branch || branch === 'HEAD') process.exit(0);
  execFileSync(git, ['push', '-u', 'origin', branch], {
    stdio: 'ignore',
    env: { ...process.env, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o StrictHostKeyChecking=accept-new' },
  });
} catch {
  /* keep commit; push can be retried manually */
}

process.exit(0);
