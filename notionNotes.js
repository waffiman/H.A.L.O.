/**
 * CRM page notes — routed through crmStore.
 */
import * as crm from './crmStore.js';

export async function readPageBodyText(pageId) {
  return crm.readNotes(pageId);
}

export async function appendPageNote(pageId, text) {
  return crm.appendNote(pageId, text);
}
