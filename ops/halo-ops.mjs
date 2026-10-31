/**
 * halo-ops: the only container that holds /var/run/docker.sock.
 *
 * The dashboard's `docker` binary is a shim (dashboard/bin/docker) that POSTs
 * its argv here. Each request must carry HALO_OPS_TOKEN and match the allowlist
 * in validate.mjs; then the real docker CLI runs it. No published ports — only
 * reachable on the compose network.
 */
import http from 'http';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { validateDockerArgs } from './validate.mjs';

const PORT = Number(process.env.HALO_OPS_PORT || 7070);
const TOKEN = String(process.env.HALO_OPS_TOKEN || '');
const MAX_BODY = 256 * 1024;

if (TOKEN.length < 32) {
  console.error('[halo-ops] HALO_OPS_TOKEN missing or shorter than 32 chars — refusing to start');
  process.exit(1);
}

function tokenOk(got) {
  const a = Buffer.from(String(got || ''));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/docker') return send(res, 404, { ok: false });
  if (!tokenOk(req.headers['x-halo-ops-token'])) return send(res, 401, { ok: false, error: 'unauthorized' });

  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > MAX_BODY) req.destroy();
  });
  req.on('end', () => {
    let argv;
    try {
      argv = JSON.parse(body).argv;
    } catch {
      return send(res, 400, { ok: false, error: 'bad json' });
    }
    const v = validateDockerArgs(argv);
    if (!v.ok) {
      console.warn(`[halo-ops] refused: ${v.reason} :: ${JSON.stringify(argv).slice(0, 300)}`);
      return send(res, 403, { ok: false, code: 126, stdout: '', stderr: `halo-ops refused: ${v.reason}\n` });
    }
    console.log(`[halo-ops] docker ${argv.slice(0, 4).join(' ')}${argv.length > 4 ? ' …' : ''}`);
    execFile('docker', argv, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      send(res, 200, { ok: code === 0, code, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
});

// Tenant one-shots (`docker run --rm …`) block for up to 90 min — no server timeouts.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`[halo-ops] listening on :${PORT}`));
