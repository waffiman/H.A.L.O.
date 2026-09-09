/**
 * Shared CRM field enums — Lost reasons + messenger apps.
 */
export const LOST_REASONS = [
  { id: 'not_interested', label: 'Not interested' },
  { id: 'wrong_person', label: 'Wrong person' },
  { id: 'no_budget', label: 'No budget' },
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'has_solution', label: 'Already has a solution' },
  { id: 'competitor', label: 'Went with competitor' },
  { id: 'unsubscribe', label: 'Asked to stop / unsubscribe' },
  { id: 'hostile', label: 'Hostile / rude' },
  { id: 'non_fit', label: 'Outside ICP / non-fit' },
  { id: 'no_reply', label: 'No reply (silence)' },
  { id: 'connect_not_accepted', label: 'Connect not accepted' },
  { id: 'other', label: 'Other' },
];

export const LOST_REASON_IDS = LOST_REASONS.map((r) => r.id);

export function normalizeLostReason(raw, { fallback = 'other' } = {}) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (LOST_REASON_IDS.includes(s)) return s;
  const aliases = {
    notinterested: 'not_interested',
    wrongperson: 'wrong_person',
    nobudget: 'no_budget',
    badtiming: 'bad_timing',
    already_has_solution: 'has_solution',
    has_a_solution: 'has_solution',
    stop: 'unsubscribe',
    opt_out: 'unsubscribe',
    rude: 'hostile',
    nonfit: 'non_fit',
    outside_icp: 'non_fit',
    silence: 'no_reply',
    no_response: 'no_reply',
    connect_timeout: 'connect_not_accepted',
    invite_expired: 'connect_not_accepted',
    not_accepted: 'connect_not_accepted',
  };
  if (aliases[s]) return aliases[s];
  return fallback;
}

export const MESSENGER_APPS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'viber', label: 'Viber' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'phone', label: 'Phone' },
];

export const MESSENGER_APP_IDS = MESSENGER_APPS.map((a) => a.id);

export function normalizeMessengerApp(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  return MESSENGER_APP_IDS.includes(s) ? s : '';
}
