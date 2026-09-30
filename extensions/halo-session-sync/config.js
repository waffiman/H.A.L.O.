/**
 * Build-time HALO API origin for the extension.
 * Cabinets share one dashboard host today — login is email+password only.
 * When you have a stable production domain, set it here before Store publish.
 */
export const DEFAULT_API_BASE = 'https://small-glenn-field-portal.trycloudflare.com';

export const STORAGE_KEYS = {
  apiBase: 'halo_api_base',
  sessionToken: 'halo_session_token',
  lastSynced: 'halo_last_synced',
  lastEmail: 'halo_last_email',
};
