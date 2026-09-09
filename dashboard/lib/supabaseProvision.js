/**
 * Supabase CRM connect — validate credentials and persist .env.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT, readEnvFile, writeEnvFile } from './env.js';
import { validateSupabaseCredentials, supabaseConfigured } from './crmApi.js';

export { supabaseConfigured };

export async function provisionSupabaseCrm(url, serviceRoleKey, { workspaceId = 'default' } = {}) {
  const projectUrl = String(url || '').trim();
  const key = String(serviceRoleKey || '').trim();
  if (!projectUrl) throw new Error('Supabase Project URL is required');
  if (!key) throw new Error('Supabase service_role key is required');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(projectUrl.replace(/\/+$/, '') + '/')) {
    throw new Error('Project URL should look like https://YOUR-REF.supabase.co');
  }

  await validateSupabaseCredentials(projectUrl, key);

  writeEnvFile({
    SUPABASE_URL: projectUrl.replace(/\/+$/, ''),
    SUPABASE_SERVICE_ROLE_KEY: key,
    CRM_BACKEND: 'supabase',
    WORKSPACE_ID: String(workspaceId || 'default').trim() || 'default',
  });

  return { ok: true, backend: 'supabase' };
}

export function readCrmSchemaSql() {
  const sqlPath = path.join(APP_ROOT, 'sql', 'halo_crm_leads.sql');
  if (!fs.existsSync(sqlPath)) throw new Error('Schema file missing: sql/halo_crm_leads.sql');
  return fs.readFileSync(sqlPath, 'utf8');
}

export function supabaseDashboardUrl(env = readEnvFile()) {
  const url = (env.SUPABASE_URL || '').trim();
  const m = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (!m) return url || '';
  return `https://supabase.com/dashboard/project/${m[1]}`;
}
