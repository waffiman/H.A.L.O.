/**
 * Build-time / operator config for HALO Session Sync.
 * Set HALO_API_BASE to your stable HTTPS dashboard origin before Store publish.
 * Local / VPS defaults work for Load unpacked testing.
 */
export const DEFAULT_API_BASE = 'http://31.70.101.111:3080';

export const STORAGE_KEYS = {
  apiBase: 'halo_api_base',
  sessionToken: 'halo_session_token',
  lastSynced: 'halo_last_synced',
  lastEmail: 'halo_last_email',
};
