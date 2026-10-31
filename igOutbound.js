/**
 * Instagram Stage A phase: expire → accept → outbound (enrich → DeepResearch → score → ice → send → Lead😴).
 * Find step: IG_TARGET_HANDLES (comma) and/or ig_outbound_queue.json handles.
 */
import fs from 'fs';
import path from 'path';
import * as crm from './crmStore.js';
import { STATUS_LEAD } from './crm/constants.js';
import { channelFromUrl, canonicalInstagramProfileUrl, instagramHandleFromUrl } from './leadChannel.js';
import { dataRoot } from './dataRoot.js';
import { enrichIgProfileBasic } from './igEnrich.js';
import { sendIgIceBreaker } from './igSend.js';
import { expireStaleIgLeads, promoteAcceptedIgLeads } from './igAccept.js';
import { generateIceBreaker } from './enrichAndWrite.js';
import { igSessionIdPresent } from './igSessionHealth.js';

function queueFile() {
  return path.join(dataRoot(), 'ig_outbound_queue.json');
}

function readQueueHandles() {
  const fromEnv = String(process.env.IG_TARGET_HANDLES || '')
    .split(/[,\s]+/)
    .map((s) => s.replace(/^@/, '').trim())
    .filter(Boolean);
  let fromFile = [];
  try {
    const raw = JSON.parse(fs.readFileSync(queueFile(), 'utf8'));
    const arr = Array.isArray(raw) ? raw : raw?.handles || [];
    fromFile = arr.map((x) => String(x || '').replace(/^@/, '').trim()).filter(Boolean);
  } catch {
    /* optional */
  }
  return [...new Set([...fromEnv, ...fromFile])];
}

function writeQueueRemainder(handles) {
  try {
    fs.writeFileSync(queueFile(), JSON.stringify({ handles }, null, 2));
  } catch {
    /* ignore */
  }
}

async function alreadyInCrm(url) {
  const leads = await crm.listByStatus(STATUS_LEAD).catch(() => []);
  const conv = await crm.listByStatus('Conversation 💬').catch(() => []);
  const all = [...(leads || []), ...(conv || [])];
  const want = canonicalInstagramProfileUrl(url);
  return all.some((l) => channelFromUrl(l.url) === 'instagram' && canonicalInstagramProfileUrl(l.url) === want);
}

/**
 * One lead: basic enrich → optional DeepResearch → score → ice → send → CRM Lead😴.
 */
export async function processIgCandidate(handleOrUrl) {
  const handle = instagramHandleFromUrl(handleOrUrl);
  if (!handle) return { ok: false, status: 'bad_handle' };
  const url = canonicalInstagramProfileUrl(handle);
  if (await alreadyInCrm(url)) return { ok: false, status: 'already_in_crm', handle };

  // Enrich first (web API → our Playwright parser; never Apify). DeepResearch next if armed.
  const profile = await enrichIgProfileBasic(handle);
  console.log(`[IG] enrich @${handle} via ${profile.enrichSource || 'unknown'}`);
  const linkCandidates = [
    ...(profile.linkCandidates || []),
    profile.externalUrl,
  ].filter(Boolean);
  let card = {
    id: null,
    url: profile.url,
    name: profile.name,
    headline: profile.headline,
    company: '',
    about: profile.biography,
    extraLinks: [...new Set(linkCandidates)].map((u) => ({ url: u })),
  };

  // Persist a temporary-shaped card for DeepResearch tools (needs lead.id for patch).
  // DeepResearch runs after we have CRM id — for IG we research before insert using in-memory profile.
  if (process.env.DEEP_RESEARCH_ENABLED === '1') {
    try {
      const { DEEP_RESEARCH_TOOLS } = await import('./deepResearch.js');
      const { generateDeepResearchUpdate } = await import('./salesBrain.js');
      const facts = [];
      for (const tool of DEEP_RESEARCH_TOOLS) {
        try {
          const found = await tool.run(card);
          if (Array.isArray(found)) facts.push(...found.filter((item) => item?.text));
        } catch (e) {
          console.warn(`[IG] DeepResearch tool ${tool.id}:`, e?.message || e);
        }
      }
      if (facts.length) {
        const update = await generateDeepResearchUpdate({
          profile: card,
          links: card.extraLinks || [],
          currentAbout: card.about || '',
          additions: facts,
          emptyFields: ['headline', 'company', 'location', 'email'],
        });
        card = {
          ...card,
          about: update.about || card.about,
          headline: update.fills?.headline || card.headline,
          company: update.fills?.company || '',
        };
        console.log(`[IG] DeepResearch @${handle}: ${facts.length} fact(s)`);
      }
    } catch (e) {
      console.warn('[IG] DeepResearch skip:', e?.message || e);
    }
  }

  let leadScore = null;
  let scoreBreakdown = null;
  try {
    const { scoreLead } = await import('./leadScoring.js');
    const { readSalesPolicy } = await import('./brainStore.js');
    const scored = await scoreLead(
      {
        name: profile.name,
        headline: profile.headline,
        about: card.about,
        description: profile.biography,
        company: card.company || '',
        location: '',
        link: profile.url,
        extraLinks: card.extraLinks,
      },
      readSalesPolicy()
    );
    leadScore = scored.score;
    scoreBreakdown = scored.breakdown;
    console.log(`[IG] score @${handle}: ${leadScore}/10`);
  } catch (e) {
    console.warn('[IG] score failed:', e?.message || e);
  }

  const ice = await generateIceBreaker({
    name: profile.name,
    headline: profile.headline,
    about: card.about,
    description: profile.biography,
    company: '',
    linkedinUrl: profile.url,
  });
  const iceText = String(ice || '').trim();
  if (!iceText) return { ok: false, status: 'no_ice', handle };

  const sent = await sendIgIceBreaker(handle, iceText);
  if (!sent.ok) return { ok: false, status: sent.status, error: sent.error, handle };

  const created = await crm.createIgLead({
    url: profile.url,
    name: profile.name,
    ice: iceText,
    about: card.about,
  });
  if (leadScore != null) {
    await crm.patchLead(created.id, { leadScore, scoreBreakdown, about: card.about }).catch(() => {});
  }
  console.log(`[IG] Lead😴 created @${handle} id=${created.id}`);
  return { ok: true, status: 'sent_and_created', handle, id: created.id, leadScore };
}

export async function runIgOutboundPhase() {
  if (process.env.CHANNEL_INSTAGRAM_ENABLED !== '1') {
    return { disabled: true };
  }
  if (!igSessionIdPresent().present) {
    console.log('[IG] Stage A skip — no sessionid');
    return { noSession: true };
  }

  const expired = await expireStaleIgLeads().catch((e) => {
    console.error('[IG expire]', e.message);
    return { expired: 0 };
  });
  const accepted = await promoteAcceptedIgLeads().catch((e) => {
    console.error('[IG accept]', e.message);
    return { promoted: 0 };
  });

  const max = Math.max(0, Math.min(Number(process.env.IG_LEADS_PER_RUN || 3) || 3, 20));
  let queue = readQueueHandles();
  if (!queue.length) {
    try {
      const { searchIgByPortrait } = await import('./igLeadSearch.js');
      const found = await searchIgByPortrait({ max: Math.max(max, 5) });
      queue = found.candidates.map((c) => c.handle);
      console.log(`[IG] portrait search "${found.query}" → ${queue.length} handle(s)`);
    } catch (e) {
      console.log(`[IG] no targets and search failed: ${e?.message || e}`);
      return { expired, accepted, sent: 0, queue: 0, searchError: String(e?.message || e) };
    }
  }
  if (!queue.length) {
    console.log('[IG] portrait search returned 0 handles');
    return { expired, accepted, sent: 0, queue: 0 };
  }

  let sent = 0;
  const remainder = [...queue];
  while (sent < max && remainder.length) {
    const handle = remainder.shift();
    try {
      const r = await processIgCandidate(handle);
      if (r.ok) sent++;
      else console.log(`[IG] skip @${handle}: ${r.status}${r.error ? ` (${r.error})` : ''}`);
    } catch (e) {
      console.error(`[IG] @${handle}:`, e?.message || e);
    }
  }
  writeQueueRemainder(remainder);
  console.log(`[IG SUMMARY] sent=${sent} queueLeft=${remainder.length}`);
  return { expired, accepted, sent, queueLeft: remainder.length };
}
