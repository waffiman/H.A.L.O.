#!/usr/bin/env node
/**
 * Force-send ice DMs to specific X handles (creates Lead😴 if missing, then outbound).
 * Usage:
 *   X_OUTBOUND_HANDLES=farman32740,Agzer19 node scripts/run-x-dm-handles-once.js
 * Optional ice text: X_DM_TEST_TEXT="Hi — quick note…"
 */
import dotenv from 'dotenv';
import { applyTenantEnv } from '../tenantEnv.js';
import path from 'path';

dotenv.config({ override: true });
applyTenantEnv();

process.env.CHANNEL_X_ENABLED = '1';
process.env.ALLOW_AUTO_LOGIN = '0';

const handles = String(process.env.X_OUTBOUND_HANDLES || process.argv[2] || '')
  .split(/[,\s]+/)
  .map((s) => s.replace(/^@/, '').trim())
  .filter(Boolean);
if (!handles.length) {
  console.error('Set X_OUTBOUND_HANDLES=handle1,handle2');
  process.exit(1);
}
process.env.X_OUTBOUND_HANDLES = handles.join(',');
process.env.X_LEADS_PER_RUN = String(Math.max(handles.length, 1));

const { withCycleLock } = await import('../cycleLock.js');
const { canonicalXProfileUrl, channelFromUrl, xHandleFromUrl } = await import('../leadChannel.js');
const crm = await import('../crmStore.js');
const { STATUS_LEAD, STATUS_CONVERSATION, STATUS_ACTIVE, STATUS_LOST } = await import('../crm/constants.js');

async function findXLead(handle) {
  const needle = handle.toLowerCase();
  for (const st of [STATUS_LEAD, STATUS_CONVERSATION, STATUS_ACTIVE, STATUS_LOST]) {
    const rows = await crm.listByStatus(st);
    const hit = rows.find(
      (l) => channelFromUrl(l.url) === 'x' && xHandleFromUrl(l.url)?.toLowerCase() === needle
    );
    if (hit) return hit;
  }
  return null;
}

async function ensureLead(handle) {
  const url = canonicalXProfileUrl(handle);
  const existing = await findXLead(handle);
  if (existing) {
    // Undo false Conversation promote so outbound can retry
    if (existing.status !== STATUS_LEAD || String(existing.notes || '').includes('X DM sent')) {
      let notes = String(existing.notes || '');
      notes = notes
        .replace(/\n?\[[^\]]*\] X DM sent[\s\S]*?(?=\n\[|$)/g, '')
        .replace(/X DM sent/g, 'X DM false-positive cleared')
        .trim();
      await crm.patchLead(existing.id, {
        status: STATUS_LEAD,
        notes: `${notes}\n[retry] reset for confirmed X send`.trim(),
      });
      console.log(`Reset @${handle} → Lead😴 (${existing.id})`);
      return { ...existing, status: STATUS_LEAD, notes };
    }
    return existing;
  }
  const created = await crm.createXLead({ url, name: handle });
  const testIce = String(process.env.X_DM_TEST_TEXT || '').trim();
  if (testIce) await crm.patchLead(created.id, { msg: testIce }).catch(() => {});
  console.log(`Created Lead😴 @${handle} (${created.id})`);
  return created;
}

async function run() {
  for (const h of handles) await ensureLead(h);
  try {
    const { enrichReadyXLeads } = await import('../xEnrich.js');
    await enrichReadyXLeads();
  } catch (e) {
    console.error('X enrich:', e?.message || e);
  }
  const { runXOutboundPhase } = await import('../xOutbound.js');
  return runXOutboundPhase();
}

const locked = await withCycleLock('C', () => run(), { skipIfBusy: true });
if (locked?.skipped) {
  console.log('X DM handles one-shot skipped:', locked.reason);
  process.exit(2);
}
console.log('X DM handles finished.', JSON.stringify(locked?.result || {}));
process.exit(locked?.result?.ok > 0 ? 0 : 1);
