/**
 * Stage A outbound connect + acceptance (feature-flagged; default OFF).
 */
import { resolveConnectPeopleSearchUrl } from './prospectSearch.js';
import {
  fetchKnownProfileSlugs,
  probeProfileConnectionDegree,
  profileSlugFromUrl,
  canonicalProfileUrl,
} from './connectionsSync.js';
import {
  upsertLeadSleepPage,
  listAllLeadSleepPages,
  promoteLeadSleepToProposal1,
  markLeadSleepInviteSent,
} from './connectLeads.js';
import { connectLedgerSlugs, recordConnectSent, wasConnectSentRecently } from './connectSentLedger.js';

function shouldSkipProspect(slug, knownSlugs, ledgerSlugs) {
  if (!slug) return true;
  const s = String(slug).toLowerCase();
  if (knownSlugs.has(s)) return true;
  if (ledgerSlugs.has(s)) return true;
  if (wasConnectSentRecently(s)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function promoteMatch(lead, row) {
  await promoteLeadSleepToProposal1({
    id: lead.id,
    url: row.url || lead.url,
    name: row.name || '',
  });
  const label = row.name ? ` (${row.name})` : ' (name pending — enrich will fill)';
  console.log(`Accepted → ready for enrich/ice (Lead😴): ${row.slug || lead.slug}${label}`);
}

/**
 * Phase 1: People search from Portrait → connect invites → Lead😴
 * Also: Lead😴 rows that were never invited (manual adds) get a Connect from their CRM link first.
 */
export async function runStageAConnectPhase(page) {
  if (process.env.STAGE_A_OUTBOUND_CONNECT !== '1') {
    return { skipped: true, sent: 0, failed: 0, crmSkipped: 0, manualSent: 0 };
  }

  const dryRun = process.env.CONNECT_DRY_RUN === '1';
  const { searchUrl, keywords, keywordFallbacks, source } = resolveConnectPeopleSearchUrl();
  console.log(`--- Stage A connect phase (source=${source}, keywords="${keywords}") ---`);
  if (dryRun) console.log('[CONNECT_DRY_RUN=1] Navigation only — no Connect clicks.');

  let knownSlugs = new Set();
  try {
    knownSlugs = await fetchKnownProfileSlugs();
  } catch (e) {
    console.error('fetchKnownProfileSlugs:', e.message);
  }
  const ledgerSlugs = connectLedgerSlugs();
  const maxPerRun = Math.max(1, Number(process.env.CONNECT_MAX_PER_RUN || 15));

  let manualSent = 0;
  let manualFailed = 0;
  let sessionDead = false;

  // Manual / CRM-queued Lead😴: go straight to their Link — no People search, no My Network scrolls.
  // Shares invite budget N with portrait People search (manual queue goes first).
  // Not enough N this run → leftover Lead😴 wait for the next Stage A (not dropped).
  if (process.env.STAGE_A_LEAD_SLEEP_CONNECT !== '0') {
    const sleepLeads = await listAllLeadSleepPages().catch(() => []);
    const needsInvite = sleepLeads.filter((l) => {
      const slug = String(l.slug || profileSlugFromUrl(l.url) || '').toLowerCase();
      if (!slug || !l.url) return false;
      if (ledgerSlugs.has(slug) || wasConnectSentRecently(slug)) return false;
      return true;
    });
    if (needsInvite.length) {
      console.log(
        `--- Lead😴 outbound (no prior invite): ${needsInvite.length} candidate(s), budget ${maxPerRun} ---`
      );
      const { sendConnectFromProfile } = await import('./linkedinConnect.js');
      for (const lead of needsInvite) {
        if (manualSent >= maxPerRun) break;
        const url = canonicalProfileUrl(lead.url);
        if (!url) continue;
        const probe = await probeProfileConnectionDegree(page, url);
        if (probe.status === 'auth_dead') {
          sessionDead = true;
          break;
        }
        if (probe.status === 'connected') {
          try {
            await promoteMatch(lead, {
              slug: lead.slug,
              url: probe.url || url,
              name: probe.name || '',
            });
          } catch (e) {
            console.error(`Promote failed ${lead.slug}:`, e.message);
          }
          await sleep(1500);
          continue;
        }
        if (probe.status === 'pending') {
          console.log(`Lead😴 already pending: ${lead.slug}`);
          await sleep(1200);
          continue;
        }
        if (probe.status !== 'not_connected') {
          console.log(`Lead😴 probe ${lead.slug} → ${probe.status} (skip invite)`);
          await sleep(1200);
          continue;
        }
        if (dryRun) {
          console.log(`[dry-run] Would connect Lead😴: ${url}`);
          manualSent++;
          continue;
        }
        const result = await sendConnectFromProfile(page, url, process.env.CONNECT_NOTE || '');
        const slug = profileSlugFromUrl(url);
        if (result.ok) {
          if (slug) recordConnectSent(slug);
          try {
            await markLeadSleepInviteSent(lead.id);
          } catch (e) {
            console.error(`Processing at after invite ${slug}:`, e.message);
          }
          manualSent++;
          console.log(`Lead😴 invite sent: ${url}`);
        } else if (
          result.reason === 'already_connected'
        ) {
          try {
            await promoteMatch(lead, { slug, url, name: probe.name || '' });
          } catch (e) {
            console.error(`Promote failed ${slug}:`, e.message);
          }
        } else if (
          result.reason === 'already_pending' ||
          result.reason === 'no_connect_button' ||
          result.reason === 'email_required'
        ) {
          if (slug) recordConnectSent(slug);
          console.log(`Lead😴 invite ${slug} → ${result.reason}`);
        } else {
          manualFailed++;
          console.log(`Lead😴 invite failed ${slug}: ${result.reason}`);
        }
        await sleep(2500 + Math.floor(Math.random() * 2000));
      }
    }
  }

  if (sessionDead) {
    return {
      sent: manualSent,
      failed: manualFailed,
      skipped: 0,
      manualSent,
      sessionDead: true,
      searchUrl,
      keywords,
      dryRun,
    };
  }

  const remaining = Math.max(0, maxPerRun - manualSent);
  if (remaining <= 0) {
    console.log(`Connect People search skipped — invite budget used by Lead😴 outbound (${manualSent}).`);
    return {
      sent: manualSent,
      failed: manualFailed,
      skipped: 0,
      manualSent,
      searchUrl,
      keywords,
      dryRun,
    };
  }

  const { runLinkedInConnect } = await import('./linkedinConnect.js');
  const result = await runLinkedInConnect(page, {
    searchUrl,
    searchKeywords: keywords,
    keywordFallbacks,
    maxPerRun: remaining,
    note: process.env.CONNECT_NOTE || '',
    knownSlugs,
    ledgerSlugs,
    dryRun,
    shouldSkipProspect: (slug) => shouldSkipProspect(slug, knownSlugs, ledgerSlugs),
    onInviteSent: async (url) => {
      const slug = profileSlugFromUrl(url);
      if (slug) recordConnectSent(slug);
      if (dryRun) return;
      await upsertLeadSleepPage({ url });
    },
  });

  return {
    ...result,
    sent: (result.sent || 0) + manualSent,
    failed: (result.failed || 0) + manualFailed,
    manualSent,
    searchUrl,
    keywords,
    dryRun,
  };
}

/**
 * Phase 2: mark accepted Lead😴 as ready for enrich + ice (status stays Lead😴).
 * Primary: open each CRM profile link (no My Network scroll).
 * Fallback: My Connections only for leads we did not resolve via profile this run.
 */
export async function runStageAAcceptancePhase(page) {
  const leads = await listAllLeadSleepPages();
  if (!leads.length) {
    console.log('Acceptance phase: no Lead😴 pages in CRM.');
    return { promoted: 0, promotedIds: [] };
  }

  const slugToLead = new Map(
    leads.map((l) => [String(l.slug || profileSlugFromUrl(l.url) || '').toLowerCase(), l]).filter(([s]) => s)
  );
  console.log(`--- Stage A acceptance phase (${slugToLead.size} Lead😴 slug(s)) ---`);

  const promotedSlugs = new Set();
  const promotedIds = [];
  /** Slugs with a definitive profile read this run (connected/pending/not_connected/bad_url). */
  const resolvedSlugs = new Set();
  let promoted = 0;
  let profileChecked = 0;
  let sessionDead = false;

  const viaProfile = process.env.ACCEPTANCE_VIA_PROFILE !== '0';
  // Cover typical Lead😴 backlog (~60–100) in one Stage A; leftovers → next run + optional My Network.
  const hardMax = Math.max(20, Number(process.env.ACCEPTANCE_PROFILE_MAX || 120));
  const profileMax = Math.min(hardMax, Math.max(slugToLead.size, 1));

  if (viaProfile) {
    console.log(`Acceptance via profile links (cap ${profileMax} / hardMax ${hardMax})…`);
    const list = [...slugToLead.values()].filter((l) => l.url);
    for (const lead of list) {
      if (profileChecked >= profileMax) break;
      if (sessionDead) break;
      profileChecked++;
      const slug = String(lead.slug || profileSlugFromUrl(lead.url) || '').toLowerCase();
      const probe = await probeProfileConnectionDegree(page, lead.url);
      console.log(`Profile probe ${slug || lead.url} → ${probe.status}`);
      if (probe.status === 'auth_dead') {
        sessionDead = true;
        break;
      }
      if (['connected', 'pending', 'not_connected', 'bad_url'].includes(probe.status) && slug) {
        resolvedSlugs.add(slug);
      }
      if (probe.status === 'connected') {
        try {
          await promoteMatch(lead, { slug, url: probe.url || lead.url, name: probe.name || '' });
          promoted++;
          if (lead.id) promotedIds.push(lead.id);
          if (slug) promotedSlugs.add(slug);
        } catch (e) {
          console.error(`Promote failed ${slug}:`, e.message);
        }
      }
      await sleep(1800 + Math.floor(Math.random() * 1200));
    }
  }

  if (sessionDead) {
    console.log('Acceptance: session dead during profile probes.');
    return { promoted, promotedIds, sessionDead: true, profileChecked };
  }

  // My Network only for leads we never got a clear profile status for (cap miss / unknown).
  const needFallback = [...slugToLead.keys()].filter(
    (s) => !promotedSlugs.has(s) && !resolvedSlugs.has(s)
  );
  const useMynetwork =
    process.env.ACCEPTANCE_MYNETWORK_FALLBACK !== '0' && needFallback.length > 0 && !sessionDead;

  let scannedCount = profileChecked;
  if (useMynetwork) {
    console.log(`Acceptance My Network fallback for ${needFallback.length} unresolved slug(s)…`);
    const { scrapeNewConnectionUrls } = await import('./connectionsSync.js');
    const scraped = await scrapeNewConnectionUrls(page, {
      mode: 'acceptance',
      targetSlugs: new Set(needFallback),
      maxNew: needFallback.length,
      knownSlugs: new Set(),
    });

    if (scraped.sessionDead) {
      console.log('Acceptance scrape: session dead.');
      return {
        promoted,
        promotedIds,
        sessionDead: true,
        profileChecked,
        scannedCount: scraped.scannedCount,
      };
    }
    if (scraped.browserCrashed) {
      console.log('Acceptance scrape: Chromium crashed on My Connections.');
      return {
        promoted,
        promotedIds,
        sessionDead: false,
        browserCrashed: true,
        profileChecked,
        scannedCount: scraped.scannedCount,
      };
    }

    scannedCount = (scraped.scannedCount || 0) + profileChecked;
    for (const row of scraped.acceptanceMatches || []) {
      if (promotedSlugs.has(row.slug)) continue;
      const lead = slugToLead.get(row.slug);
      if (!lead) continue;
      try {
        await promoteMatch(lead, row);
        promoted++;
        if (lead.id) promotedIds.push(lead.id);
        promotedSlugs.add(row.slug);
      } catch (e) {
        console.error(`Promote failed ${row.slug}:`, e.message);
      }
    }
  } else if (needFallback.length === 0) {
    console.log('Acceptance My Network fallback skipped — all Lead😴 resolved via profile links.');
  }

  console.log(
    `[Acceptance SUMMARY] promoted=${promoted} profileChecked=${profileChecked} scanned=${scannedCount} unresolved=${needFallback.length}`
  );
  return { promoted, promotedIds, sessionDead: false, matches: promoted, profileChecked, scannedCount };
}

/**
 * Enrich + ice send for messageable Lead😴 (accepted / ice-ready). One browser close/reopen cycle.
 */
export async function runStageAP1EnrichSendPass(ctx) {
  const {
    getLeads,
    matchesTarget,
    hasRealIceBreaker,
    enrichOneLead,
    sendIceAndPromote,
    pauseBrowserForEnrich,
    resumeBrowserForSend,
    sendCap,
    sessionAlive,
    pageRef,
    promotedIds = [],
  } = ctx;

  const { STATUS_LEAD, isLeadReadyForIcePipeline } = await import('./crm/constants.js');
  const readyIds = new Set(promotedIds);
  const backlog = (await getLeads(STATUS_LEAD))
    .filter(matchesTarget)
    .filter((l) =>
      isLeadReadyForIcePipeline(l, {
        promotedIds: readyIds,
        hasIce: (msg) => hasRealIceBreaker(msg),
      })
    );
  const needsWork = backlog.filter(
    (l) => !hasRealIceBreaker(l.msg || l.ice) || (l.name && hasRealIceBreaker(l.msg || l.ice))
  );
  if (!needsWork.length) {
    console.log('Lead enrich/send pass: nothing to do.');
    return { enriched: 0, sent: 0 };
  }

  console.log(`--- Lead enrich/send pass (${needsWork.length} lead(s)) ---`);
  let sent = 0;
  let enriched = 0;

  const toEnrich = needsWork.filter((l) => !hasRealIceBreaker(l.msg || l.ice));
  if (toEnrich.length && process.env.SKIP_ENRICH !== '1') {
    await pauseBrowserForEnrich();
    for (const lead of toEnrich) {
      const r = await enrichOneLead(lead);
      if (r.ok) enriched++;
    }
    await resumeBrowserForSend();
  } else if (toEnrich.length) {
    console.log('SKIP_ENRICH=1 — skip enrich in Lead pass.');
  }

  const fresh = (await getLeads(STATUS_LEAD))
    .filter(matchesTarget)
    .filter((l) =>
      isLeadReadyForIcePipeline(l, {
        promotedIds: readyIds,
        hasIce: (msg) => hasRealIceBreaker(msg),
      })
    );
  for (const lead of fresh) {
    if (sent >= sendCap) break;
    if (!sessionAlive()) break;
    if (!lead?.name || lead.name.length < 2) continue;
    if (!hasRealIceBreaker(lead.msg || lead.ice)) continue;
    const ok = await sendIceAndPromote(lead);
    if (ok) sent++;
    if (!sessionAlive()) break;
  }

  console.log(`[Lead pass SUMMARY] enriched=${enriched} iceSent=${sent}`);
  return { enriched, sent };
}
