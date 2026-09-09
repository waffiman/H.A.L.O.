/**
 * Apply HALO CRM schema to Supabase (requires SUPABASE_DB_URL or DATABASE_URL).
 * Usage: node scripts/apply-supabase-schema.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '..', 'sql', 'halo_crm_leads.sql');

async function connectPg(conn) {
  try {
    const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return client;
  } catch (e) {
    if (!/ENOTFOUND|ENETUNREACH|Invalid URL/i.test(String(e.message))) throw e;
    const { resolve6 } = await import('dns/promises');
    const m = conn.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/(.+)/);
    if (!m) throw e;
    const [, user, passEnc, host, port, database] = m;
    const pass = decodeURIComponent(passEnc);
    const [ipv6] = await resolve6(host);
    const client = new pg.Client({
      host: ipv6,
      port: Number(port),
      user,
      password: pass,
      database,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    return client;
  }
}

async function main() {
  const conn =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL;
  if (!conn) {
    console.error('Set SUPABASE_DB_URL (postgresql://...)');
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await connectPg(conn);
  try {
    await client.query(sql);
    const { rows } = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='leads'"
    );
    console.log('Schema applied. leads table exists:', rows[0]?.n === 1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
