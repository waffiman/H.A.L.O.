/**
 * Cabinet overrides from halo-tenants/<ws>/tenant.env.
 *
 * tenant.env is written from a cabinet's own dashboard session, so it is
 * tenant-controlled input. Only stage/channel flags a cabinet may set are
 * applied; secrets, CRM routing, WORKSPACE_ID and TENANT_DATA_ROOT always come
 * from the root .env / container -e flags and can never be overridden here.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export const TENANT_ENV_KEYS = new Set([
  'OUTREACH_PAUSED',
  'SKIP_STAGE_A',
  'SKIP_STAGE_B',
  'SKIP_CONVERSATION',
  'ENABLE_INBOX_REPLIES',
  'CHANNEL_LINKEDIN_ENABLED',
  'CHANNEL_X_ENABLED',
  'CHANNEL_TELEGRAM_ENABLED',
  'DEEP_RESEARCH_ENABLED',
  'STAGE_A_INTERVAL_MS',
  'STAGE_A_INTERVAL_UNIT',
  'STAGE_B_INTERVAL_MS',
  'STAGE_B_INTERVAL_UNIT',
  'STAGE_A_ACCEPTANCE',
  'STAGE_A_OUTBOUND_CONNECT',
  'STAGE_A_LEGACY_SYNC',
  'CONNECT_MAX_PER_RUN',
  'CONNECT_ACCEPT_WAIT_DAYS',
  'CONNECT_ACCEPT_EXPIRE',
  'CONNECT_DRY_RUN',
  'SYNC_MAX_NEW',
  'SYNC_MAX_SCROLLS',
  'SYNC_FIRST_RUN_LIMIT',
  'CONV_MAX_PER_RUN',
  'LOST_INBOX_MAX',
  'SILENCE_BUSINESS_DAYS',
  'SILENCE_SKIP_WEEKENDS',
  'TARGET_LINKEDIN_URL',
  'X_LEADS_PER_RUN',
  'X_CHAT_PASSCODE',
  'CHANNEL_INSTAGRAM_ENABLED',
  'CHANNEL_EMAIL_ENABLED',
  'CHANNEL_WHATSAPP_ENABLED',
  'IG_LEADS_PER_RUN',
  'IG_ACCEPT_EXPIRE',
  'IG_ACCEPT_WAIT_DAYS',
  'IG_TARGET_HANDLES',
  'BRAIN_ANALYSIS_ENABLED',
  'BRAIN_ANALYSIS_INTERVAL_MS',
  'BRAIN_ANALYSIS_INTERVAL_UNIT',
]);

/** Apply allowlisted tenant.env keys onto process.env. No-op without TENANT_DATA_ROOT. */
export function applyTenantEnv(root = process.env.TENANT_DATA_ROOT) {
  if (!root) return { applied: [], ignored: [] };
  const file = path.join(root, 'tenant.env');
  let parsed = {};
  try {
    parsed = dotenv.parse(fs.readFileSync(file));
  } catch {
    return { applied: [], ignored: [] };
  }
  const applied = [];
  const ignored = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (!TENANT_ENV_KEYS.has(k)) {
      ignored.push(k);
      continue;
    }
    process.env[k] = v;
    applied.push(k);
  }
  const unexpected = ignored.filter((k) => k !== 'WORKSPACE_ID');
  if (unexpected.length) {
    console.warn(`[tenant.env] ignored non-cabinet keys: ${unexpected.join(', ')}`);
  }
  return { applied, ignored };
}
