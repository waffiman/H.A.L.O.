/**
 * Timezone helpers for Smart Timing (ice-breaker send window).
 * City/country maps live in locationTimezone.js — this module adds window checks.
 */
import { timezoneFromLocation } from './locationTimezone.js';

/**
 * @param {string} locationString
 * @returns {{ timezone: string|null, utcOffset: number|null }}
 */
export function resolveTimezone(locationString) {
  const timezone = timezoneFromLocation(locationString) || null;
  if (!timezone) return { timezone: null, utcOffset: null };
  try {
    const utcOffset = utcOffsetHours(timezone);
    return { timezone, utcOffset };
  } catch {
    return { timezone, utcOffset: null };
  }
}

export function getCurrentHourInTimezone(tz) {
  if (!tz) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const raw = formatter.format(new Date());
    const hour = parseInt(raw, 10);
    // Some engines return "24" for midnight
    if (hour === 24) return 0;
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

function utcOffsetHours(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(now);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const h = Number(m[2]) || 0;
  const min = Number(m[3]) || 0;
  return sign * (h + min / 60);
}

export function formatTzBadge(tz) {
  if (!tz) return '';
  try {
    const off = utcOffsetHours(tz);
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    const label = mm ? `UTC${sign}${hh}:${String(mm).padStart(2, '0')}` : `UTC${sign}${hh}`;
    const short = tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : tz;
    return `${short} (${label})`;
  } catch {
    return tz;
  }
}

/**
 * @param {{ enabled?: boolean, windowStart?: number, windowEnd?: number, preferredStart?: number, preferredEnd?: number }} smartTiming
 * @param {string} timezone IANA
 * @returns {{ ok: boolean, hour: number|null, reason?: string }}
 */
export function isWithinSendWindow(smartTiming, timezone) {
  if (!smartTiming?.enabled) return { ok: true, hour: null };
  const tz = String(timezone || '').trim();
  if (!tz) return { ok: true, hour: null }; // no tz → anytime
  const hour = getCurrentHourInTimezone(tz);
  if (hour == null) return { ok: true, hour: null };
  const start = clampHour(smartTiming.windowStart, 9);
  const end = clampHour(smartTiming.windowEnd, 17);
  if (start === end) return { ok: true, hour }; // 24h window
  let inWindow;
  if (start < end) {
    inWindow = hour >= start && hour < end;
  } else {
    // overnight window e.g. 22–6
    inWindow = hour >= start || hour < end;
  }
  return {
    ok: inWindow,
    hour,
    reason: inWindow
      ? undefined
      : `${hour}:00 in ${tz} is outside ${start}-${end}`,
  };
}

export function isInPreferredWindow(smartTiming, timezone) {
  if (!smartTiming?.enabled) return false;
  const tz = String(timezone || '').trim();
  if (!tz) return false;
  const hour = getCurrentHourInTimezone(tz);
  if (hour == null) return false;
  const start = clampHour(smartTiming.preferredStart, 9);
  const end = clampHour(smartTiming.preferredEnd, 11);
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function nextWindowHint(smartTiming, timezone) {
  if (!smartTiming?.enabled || !timezone) return '';
  const start = clampHour(smartTiming.windowStart, 9);
  const check = isWithinSendWindow(smartTiming, timezone);
  if (check.ok) return '';
  const badge = formatTzBadge(timezone);
  return `Next window: ${String(start).padStart(2, '0')}:00 ${badge || timezone}`;
}

function clampHour(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(n)));
}

/** Normalize sales_policy.smartTiming */
export function normalizeSmartTiming(raw) {
  const base = {
    enabled: false,
    windowStart: 9,
    windowEnd: 17,
    preferredStart: 9,
    preferredEnd: 11,
  };
  if (!raw || typeof raw !== 'object') return { ...base };
  return {
    enabled: raw.enabled === true || raw.enabled === 1 || raw.enabled === '1',
    windowStart: clampHour(raw.windowStart, base.windowStart),
    windowEnd: clampHour(raw.windowEnd, base.windowEnd),
    preferredStart: clampHour(raw.preferredStart, base.preferredStart),
    preferredEnd: clampHour(raw.preferredEnd, base.preferredEnd),
  };
}

export { timezoneFromLocation };
