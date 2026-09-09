/**
 * Notion helpers for Lead😴 — routed through crmStore (Notion or Supabase).
 */
import {
  canonicalProfileUrl,
  profileSlugFromUrl,
} from './connectionsSync.js';
import * as crm from './crmStore.js';
import { connectLedgerSlugs, wasConnectSentRecently } from './connectSentLedger.js';
import { STATUS_LOST } from './crm/constants.js';

const STATUS_LEAD = 'Lead😴';
const STATUS_PROPOSAL_1 = 'Proposal 1️⃣';

export async function createLeadSleepPage({ url }) {
  const cleanUrl = canonicalProfileUrl(url);
  if (!cleanUrl) throw new Error(`Invalid LinkedIn URL: ${url}`);
  const row = await crm.createLeadSleep({ url: cleanUrl });
  // Belt-and-suspenders: invite clock = Processing at (UTC now).
  if (row?.id) {
    try {
      await crm.setProcessingAt(row.id, new Date().toISOString());
    } catch (e) {
      console.error('Lead😴 Processing at after create:', e.message);
    }
  }
  return row;
}

export async function upsertLeadSleepPage({ url }) {
  const cleanUrl = canonicalProfileUrl(url);
  if (!cleanUrl) throw new Error(`Invalid LinkedIn URL: ${url}`);
  const existing = await findLeadSleepPagesByUrls([cleanUrl]);
  if (existing.length) {
    // Called after a successful Connect — refresh invite clock.
    try {
      await crm.setProcessingAt(existing[0].id, new Date().toISOString());
    } catch (e) {
      console.error('Lead😴 Processing at refresh:', e.message);
    }
    console.log(`Lead😴 already exists: ${cleanUrl} (${existing[0].id}) — Processing at updated`);
    return existing[0];
  }
  return createLeadSleepPage({ url: cleanUrl });
}

/** Stamp Processing at = invite-sent time (for existing CRM Lead😴). */
export async function markLeadSleepInviteSent(id, iso = new Date().toISOString()) {
  if (!id) return;
  await crm.setProcessingAt(id, iso);
}

export async function listAllLeadSleepPages(opts) {
  return crm.listLeadSleepPages(opts);
}

export async function promoteLeadSleepToProposal1(fields) {
  return crm.promoteLeadSleepToProposal1(fields);
}

export async function findLeadSleepPagesByUrls(urls = []) {
  return crm.findLeadSleepByUrls(urls);
}

/**
 * Close Lead😴 that never accepted after CONNECT_ACCEPT_WAIT_DAYS.
 * Uses Processing at (invite/create clock). Only leads we already invited (ledger).
 * Moves to Lost❌ (not hard-delete) so CRM history + dedupe stay intact.
 * @returns {{ expired: number, skipped: number, waitDays: number }}
 */
export async function expireStaleLeadSleepPages({
  waitDays = Number(process.env.CONNECT_ACCEPT_WAIT_DAYS ?? 21),
  now = new Date(),
} = {}) {
  if (process.env.CONNECT_ACCEPT_EXPIRE === '0') {
    return { expired: 0, skipped: 0, waitDays: 0, disabled: true };
  }
  const days = Number(waitDays);
  if (!Number.isFinite(days) || days <= 0) {
    return { expired: 0, skipped: 0, waitDays: 0, disabled: true };
  }

  const leads = await listAllLeadSleepPages().catch(() => []);
  if (!leads.length) return { expired: 0, skipped: 0, waitDays: days };

  const ledger = connectLedgerSlugs();
  const cutoffMs = days * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  let expired = 0;
  let skipped = 0;

  for (const lead of leads) {
    const slug = String(lead.slug || profileSlugFromUrl(lead.url) || '').toLowerCase();
    const invited = Boolean(slug && (ledger.has(slug) || wasConnectSentRecently(slug)));
    if (!invited) {
      skipped++;
      continue;
    }
    const clockRaw = lead.processingAt || lead.createdAt;
    if (!clockRaw) {
      skipped++;
      continue;
    }
    const clockMs = Date.parse(clockRaw);
    if (!Number.isFinite(clockMs)) {
      skipped++;
      continue;
    }
    if (nowMs - clockMs < cutoffMs) continue;

    try {
      await crm.updateStatus(lead.id, STATUS_LOST, {
        lostReason: 'connect_not_accepted',
      });
      expired++;
      console.log(
        `Lead😴 expired → Lost❌ (${days}d): ${slug || lead.url} clock=${new Date(clockMs).toISOString()}`
      );
    } catch (e) {
      console.error(`Expire Lead😴 failed ${slug}:`, e.message);
    }
  }

  if (expired) {
    console.log(`[Lead😴 expire] closed ${expired} (waitDays=${days}, skipped=${skipped})`);
  }
  return { expired, skipped, waitDays: days };
}

export { STATUS_LEAD, STATUS_PROPOSAL_1 };
