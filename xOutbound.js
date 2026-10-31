/**
 * Stage A X step 3 — LinkedIn-parity outbound for X Lead😴:
 * reload card → score → ice → sendXDm → Conversation 💬.
 * Runs after People search + Apify enrich (browser already closed).
 */
import * as crm from './crmStore.js';
import { STATUS_LEAD, STATUS_CONVERSATION, LEAD_READY_MARKER } from './crm/constants.js';
import { channelFromUrl, xHandleFromUrl } from './leadChannel.js';
import { generateIceBreaker } from './enrichAndWrite.js';
import { sendXDm } from './xSend.js';
import { xAuthTokenPresent } from './xSessionHealth.js';
import { X_ENRICH_MARKER } from './xEnrich.js';

export const X_DM_SENT_MARKER = 'X DM sent';
const X_MSG_READY_MARKER = 'X message gate';

function leadHasMarker(lead, marker) {
  return String(lead?.notes || '').includes(marker);
}

function iceText(lead) {
  return String(lead?.msg || lead?.ice || lead?.iceBreaker || lead?.ice_breaker || '').trim();
}

/** Optional one-shot filter: X_OUTBOUND_HANDLES=farman32740,Agzer19 */
function handleAllowlist() {
  const raw = String(process.env.X_OUTBOUND_HANDLES || '')
    .split(/[,\s]+/)
    .map((s) => s.replace(/^@/, '').trim().toLowerCase())
    .filter(Boolean);
  return raw.length ? new Set(raw) : null;
}

export async function leadsNeedingXOutbound() {
  const allow = handleAllowlist();
  const rows = await crm.listByStatus(STATUS_LEAD);
  return rows.filter((lead) => {
    if (channelFromUrl(lead.url) !== 'x') return false;
    const handle = xHandleFromUrl(lead.url);
    if (!handle) return false;
    if (allow && !allow.has(handle.toLowerCase())) return false;
    if (leadHasMarker(lead, X_DM_SENT_MARKER)) return false;
    // Enriched preferred; gate-ready + LEAD_READY still OK if Apify skipped.
    if (
      !leadHasMarker(lead, X_ENRICH_MARKER) &&
      !leadHasMarker(lead, X_MSG_READY_MARKER) &&
      !leadHasMarker(lead, LEAD_READY_MARKER) &&
      !String(lead.notes || '').includes('ready for enrich')
    ) {
      return false;
    }
    return true;
  });
}

async function scoreLeadCard(lead) {
  try {
    const { scoreLead } = await import('./leadScoring.js');
    const { readSalesPolicy } = await import('./brainStore.js');
    const scored = await scoreLead(
      {
        name: lead.name,
        headline: lead.headline,
        about: lead.about,
        description: lead.about || lead.description,
        company: lead.company || '',
        location: lead.location || '',
        link: lead.url,
        extraLinks: lead.extraLinks || lead.extra_links || [],
      },
      readSalesPolicy()
    );
    await crm
      .patchLead(lead.id, { leadScore: scored.score, scoreBreakdown: scored.breakdown })
      .catch(() => {});
    console.log(`X score @${xHandleFromUrl(lead.url)}: ${scored.score}/10`);
    return scored;
  } catch (e) {
    console.warn(`X score skip: ${e?.message || e}`);
    return null;
  }
}

async function ensureIce(lead) {
  let ice = iceText(lead);
  if (ice) return ice;
  ice = String(
    await generateIceBreaker({
      name: lead.name,
      headline: lead.headline,
      about: lead.about,
      description: lead.about || lead.description,
      company: lead.company || '',
      location: lead.location || '',
      linkedinUrl: lead.url,
    }) || ''
  ).trim();
  if (ice) {
    await crm.patchLead(lead.id, { msg: ice }).catch(() => {});
  }
  return ice;
}

async function smartTimingAllows(lead) {
  try {
    const { readSalesPolicy } = await import('./brainStore.js');
    const cfg = readSalesPolicy().smartTiming;
    if (!cfg?.enabled) return { ok: true };
    const { isWithinSendWindow } = await import('./timezoneResolver.js');
    return isWithinSendWindow(cfg, lead.timezone);
  } catch {
    return { ok: true };
  }
}

/**
 * Process one X Lead😴 end-to-end (score → ice → DM → Conversation).
 */
export async function processXOutboundLead(lead) {
  const handle = xHandleFromUrl(lead.url);
  if (!handle) return { ok: false, reason: 'bad_handle' };

  let working = lead;
  try {
    const fresh = await crm.getLead(lead.id);
    if (fresh) working = { ...lead, ...fresh };
  } catch {
    /* keep */
  }

  if (!String(working.name || '').trim() || String(working.name).length < 2) {
    return { ok: false, reason: 'missing_name', handle };
  }

  await scoreLeadCard(working);

  const timing = await smartTimingAllows(working);
  if (!timing.ok) {
    console.log(`X Smart Timing skip @${handle}: ${timing.reason || 'outside window'}`);
    return { ok: false, reason: 'smart_timing', handle, deferred: true };
  }

  const ice = await ensureIce(working);
  if (!ice) return { ok: false, reason: 'no_ice', handle };

  const sent = await sendXDm(handle, ice);
  if (!sent.ok) {
    return {
      ok: false,
      reason: sent.reason || 'send_failed',
      handle,
      sessionOk: sent.sessionOk,
    };
  }

  await crm.patchLead(working.id, { msg: ice }).catch(() => {});
  await crm
    .appendNote(
      working.id,
      [
        X_DM_SENT_MARKER,
        `channel=x | mode=ice_breaker | reason=${sent.reason}`,
        `full message:\n${ice}`,
      ].join('\n')
    )
    .catch(() => {});
  try {
    await crm.setProcessingAt(working.id);
  } catch {
    await crm.patchLead(working.id, { processingAt: new Date().toISOString() }).catch(() => {});
  }
  await crm.patchLead(working.id, { status: STATUS_CONVERSATION }).catch(() => {});
  console.log(`X outbound @${handle}: Conversation 💬 (${sent.reason})`);
  return { ok: true, reason: sent.reason, handle };
}

/**
 * @returns {{ ok: number, failed: number, deferred: number, skipped?: boolean, reason?: string }}
 */
export async function runXOutboundPhase() {
  if (process.env.CHANNEL_X_ENABLED !== '1') {
    console.log('X outbound skipped (CHANNEL_X_ENABLED!=1).');
    return { ok: 0, failed: 0, deferred: 0, skipped: true, reason: 'channel_off' };
  }
  if (!xAuthTokenPresent().present) {
    console.log('X outbound skipped (no auth_token).');
    return { ok: 0, failed: 0, deferred: 0, skipped: true, reason: 'no_auth' };
  }
  const { xChannelBlockedOnPasscode } = await import('./xPasscode.js');
  if (xChannelBlockedOnPasscode()) {
    console.log('X outbound skipped — waiting for X chat passcode.');
    return { ok: 0, failed: 0, deferred: 0, skipped: true, reason: 'needs_passcode' };
  }

  const cap = Math.max(1, Math.min(10, Number(process.env.X_LEADS_PER_RUN || 5) || 5));
  const leads = await leadsNeedingXOutbound();
  const batch = leads.slice(0, cap);
  console.log(`X outbound: ${leads.length} due (cap ${cap})`);
  let ok = 0;
  let failed = 0;
  let deferred = 0;

  for (const lead of batch) {
    try {
      const result = await processXOutboundLead(lead);
      if (result.ok) ok++;
      else if (result.deferred) deferred++;
      else {
        failed++;
        console.error(`X outbound @${result.handle || '?'}: ${result.reason}`);
        if (result.reason === 'auth_wall' || result.sessionOk === false) break;
      }
    } catch (e) {
      console.error(`X outbound:`, e?.message || e);
      failed++;
    }
    // Human gap between DMs (same spirit as LinkedIn ice delay)
    await new Promise((r) => setTimeout(r, 12000 + Math.floor(Math.random() * 8000)));
  }
  console.log(`[X outbound SUMMARY] ok=${ok} failed=${failed} deferred=${deferred}`);
  return { ok, failed, deferred, remaining: Math.max(0, leads.length - batch.length) };
}
