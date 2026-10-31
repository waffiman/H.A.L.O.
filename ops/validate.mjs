/**
 * Allowlist for docker commands the dashboard may run through halo-ops.
 *
 * The dashboard is internet-facing; it used to hold /var/run/docker.sock
 * directly, so any code-execution bug there meant root on the VPS. Now it can
 * only ask halo-ops to run commands that match the shapes below — the exact
 * calls dashboard/lib/* make today. Anything else is refused.
 */
import path from 'path';

const REPO_ROOT = (process.env.HALO_OPS_REPO_ROOT || '/root/cold-outreach-agent').replace(/\/$/, '');
const AGENT_IMAGE = 'cold-outreach-agent-linkedin-agent';
const COMPOSE_FILE = `${REPO_ROOT}/docker-compose.ionos.yml`;

const FIXED_NAMES = new Set([
  'linkedin-agent',
  'linkedin-repair',
  'x-repair',
  'tg-repair',
  'wa-repair',
  'connect-test',
]);
const TENANT_NAME_RE = /^halo-tenant-[ab]-[A-Za-z0-9_.-]{1,24}$/;
const CONTAINER_ID_RE = /^[0-9a-f]{12,64}$/;
const VOLUME_RE = /^[a-z0-9][a-z0-9_.-]{0,127}$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isAllowedName(n, { allowId = false } = {}) {
  return FIXED_NAMES.has(n) || TENANT_NAME_RE.test(n) || (allowId && CONTAINER_ID_RE.test(n));
}

/** Host path must resolve inside the repo (no .., no symlink tricks in the string). */
function inRepo(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return false;
  const norm = path.posix.normalize(p);
  return norm === REPO_ROOT || norm.startsWith(`${REPO_ROOT}/`);
}

function fail(reason) {
  return { ok: false, reason };
}
const OK = { ok: true };

function validateRun(args) {
  // args after 'run'
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--rm' || a === '-d') {
      i += 1;
    } else if (a === '--name') {
      if (!isAllowedName(args[i + 1] || '')) return fail(`run: name not allowed: ${args[i + 1]}`);
      i += 2;
    } else if (a === '--env-file') {
      const f = args[i + 1] || '';
      if (!inRepo(f) || path.posix.basename(f) !== '.env') return fail(`run: env-file not allowed: ${f}`);
      i += 2;
    } else if (a === '-e') {
      const kv = args[i + 1] || '';
      const k = kv.split('=')[0];
      if (!ENV_KEY_RE.test(k)) return fail(`run: bad env: ${k}`);
      i += 2;
    } else if (a === '-v') {
      const spec = args[i + 1] || '';
      const parts = spec.split(':');
      if (parts.length < 2 || parts.length > 3) return fail(`run: bad volume: ${spec}`);
      const [src, dst, mode] = parts;
      if (mode && !['ro', 'rw'].includes(mode)) return fail(`run: bad volume mode: ${spec}`);
      if (src.startsWith('/')) {
        if (!inRepo(src)) return fail(`run: bind outside repo: ${src}`);
      } else if (!(VOLUME_RE.test(src) && dst.replace(/\/$/, '') === '/app/node_modules')) {
        return fail(`run: named volume not allowed: ${spec}`);
      }
      if (!dst.startsWith('/app')) return fail(`run: mount target not allowed: ${dst}`);
      i += 2;
    } else if (/^--shm-size=\d+[kmg]b?$/i.test(a)) {
      i += 1;
    } else if (a === '-w') {
      if (args[i + 1] !== '/app') return fail('run: workdir must be /app');
      i += 2;
    } else if (a === AGENT_IMAGE) {
      return OK; // remaining args are the command inside the agent container
    } else {
      return fail(`run: flag/image not allowed: ${a}`);
    }
  }
  return fail('run: missing image');
}

function validateCompose(args) {
  // compose -f <file> [--project-directory <dir>] <verb> ... linkedin-agent
  let i = 0;
  if (args[i] !== '-f' || path.posix.normalize(args[i + 1] || '') !== COMPOSE_FILE) {
    return fail('compose: only the repo compose file');
  }
  i += 2;
  if (args[i] === '--project-directory') {
    if (path.posix.normalize(args[i + 1] || '') !== REPO_ROOT) return fail('compose: bad project dir');
    i += 2;
  }
  const rest = args.slice(i).join(' ');
  const allowed = [
    'start linkedin-agent',
    'stop linkedin-agent',
    'up -d --force-recreate linkedin-agent',
    'up -d --force-recreate --no-deps linkedin-agent',
  ];
  return allowed.includes(rest) ? OK : fail(`compose: not allowed: ${rest}`);
}

/** @param {string[]} argv docker argv (without the leading 'docker') */
export function validateDockerArgs(argv) {
  if (!Array.isArray(argv) || !argv.length || argv.some((a) => typeof a !== 'string' || a.includes('\0'))) {
    return fail('bad argv');
  }
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'start':
    case 'stop':
    case 'restart':
      return rest.length === 1 && isAllowedName(rest[0]) ? OK : fail(`${cmd}: name not allowed`);
    case 'rm': {
      const names = rest.filter((a) => a !== '-f');
      return names.length >= 1 && names.every((n) => isAllowedName(n, { allowId: true }))
        ? OK
        : fail('rm: name not allowed');
    }
    case 'inspect': {
      const names = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-f' || rest[i] === '--format') i++;
        else names.push(rest[i]);
      }
      return names.length === 1 && isAllowedName(names[0]) ? OK : fail('inspect: name not allowed');
    }
    case 'ps': {
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (['-q', '-a', '-aq', '-qa'].includes(a)) continue;
        if (a === '-f' || a === '--filter' || a === '--format') {
          i++;
          continue;
        }
        return fail(`ps: flag not allowed: ${a}`);
      }
      return OK;
    }
    case 'run':
      return validateRun(rest);
    case 'compose':
      return validateCompose(rest);
    default:
      return fail(`command not allowed: ${cmd}`);
  }
}
