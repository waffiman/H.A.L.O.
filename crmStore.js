/**
 * Unified CRM store — routes to Notion or Supabase by CRM_BACKEND.
 */
import { crmBackend } from './crm/constants.js';

async function adapter() {
  return crmBackend() === 'supabase'
    ? import('./crm/supabaseAdapter.js')
    : import('./crm/notionAdapter.js');
}

export function isSupabaseCrm() {
  return crmBackend() === 'supabase';
}

export function isCrmConfigured(env = process.env) {
  if (String(env.CRM_BACKEND || '').trim().toLowerCase() === 'supabase') {
    return Boolean(
      String(env.SUPABASE_URL || '').trim() && String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    );
  }
  return Boolean(String(env.NOTION_TOKEN || '').trim() && String(env.NOTION_DATABASE_ID || '').trim());
}

export async function listByStatus(statusName) {
  const a = await adapter();
  return a.listByStatus(statusName);
}

export async function findLeadsByName(statusName, searchToken) {
  const a = await adapter();
  return a.findLeadsByName(statusName, searchToken);
}

export async function findCrmBySenderName(searchToken) {
  const a = await adapter();
  return a.findCrmBySenderName(searchToken);
}

export async function updateStatus(id, statusName, extra = {}) {
  const a = await adapter();
  return a.updateStatus(id, statusName, extra);
}

export async function setProcessingAt(id, iso) {
  const a = await adapter();
  return a.setProcessingAt(id, iso);
}

export async function ensureProcessingAt(id, iso) {
  const a = await adapter();
  return a.ensureProcessingAt(id, iso);
}

export async function updateNameAndIceBreaker(id, fields) {
  const a = await adapter();
  return a.updateNameAndIceBreaker(id, fields);
}

export async function createLead(fields) {
  const a = await adapter();
  return a.createLead(fields);
}

export async function createLeadSleep(fields) {
  const a = await adapter();
  return a.createLeadSleep(fields);
}

export async function listLeadSleepPages(opts) {
  const a = await adapter();
  return a.listLeadSleepPages(opts);
}

export async function findLeadSleepByUrls(urls) {
  const a = await adapter();
  return a.findLeadSleepByUrls(urls);
}

export async function promoteLeadSleepToProposal1(fields) {
  const a = await adapter();
  return a.promoteLeadSleepToProposal1(fields);
}

export async function fetchKnownProfileSlugs(opts) {
  const a = await adapter();
  return a.fetchKnownProfileSlugs(opts);
}

export async function readNotes(id) {
  const a = await adapter();
  return a.readNotes(id);
}

export async function appendNote(id, text) {
  const a = await adapter();
  return a.appendNote(id, text);
}

export async function countByStatus() {
  const a = await adapter();
  return a.countByStatus();
}

export async function listLeadsPage(opts) {
  const a = await adapter();
  return a.listLeadsPage(opts);
}

export async function getLead(id) {
  const a = await adapter();
  return a.getLead(id);
}

export async function patchLead(id, fields) {
  const a = await adapter();
  return a.patchLead(id, fields);
}

export async function deleteLead(id) {
  const a = await adapter();
  return a.deleteLead(id);
}
