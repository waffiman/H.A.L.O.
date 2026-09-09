/**
 * Deterministic IANA timezone from LinkedIn/Apify location strings.
 * No LLM — city/country keyword map + country defaults.
 */
const CITY_TZ = [
  // Americas
  [/new\s*york|brooklyn|manhattan|nyc\b/i, 'America/New_York'],
  [/boston|massachusetts|\bma\b/i, 'America/New_York'],
  [/miami|orlando|tampa|florida|\bfl\b/i, 'America/New_York'],
  [/toronto|ottawa|montreal|quebec/i, 'America/Toronto'],
  [/chicago|illinois|\bil\b/i, 'America/Chicago'],
  [/austin|dallas|houston|texas|\btx\b/i, 'America/Chicago'],
  [/denver|colorado|\bco\b/i, 'America/Denver'],
  [/phoenix|arizona|\baz\b/i, 'America/Phoenix'],
  [/los\s*angeles|san\s*francisco|seattle|portland|san\s*diego|california|\bca\b|washington\s*state|\bwa\b|oregon/i, 'America/Los_Angeles'],
  [/vancouver|british\s*columbia|\bbc\b/i, 'America/Vancouver'],
  [/mexico\s*city/i, 'America/Mexico_City'],
  [/s[aã]o\s*paulo|rio\s*de\s*janeiro|brazil/i, 'America/Sao_Paulo'],
  [/buenos\s*aires|argentina/i, 'America/Argentina/Buenos_Aires'],
  [/bogot[aá]|colombia/i, 'America/Bogota'],
  [/santiago.*chile|chile/i, 'America/Santiago'],
  [/lima|peru/i, 'America/Lima'],

  // Europe
  [/london|manchester|birmingham|edinburgh|glasgow|united\s*kingdom|\buk\b|england|scotland|wales/i, 'Europe/London'],
  [/dublin|ireland/i, 'Europe/Dublin'],
  [/paris|lyon|marseille|france/i, 'Europe/Paris'],
  [/berlin|munich|hamburg|frankfurt|cologne|germany|deutschland/i, 'Europe/Berlin'],
  [/amsterdam|rotterdam|netherlands|holland/i, 'Europe/Amsterdam'],
  [/brussels|belgium/i, 'Europe/Brussels'],
  [/zurich|geneva|switzerland/i, 'Europe/Zurich'],
  [/vienna|austria/i, 'Europe/Vienna'],
  [/rome|milan|italy|italia/i, 'Europe/Rome'],
  [/madrid|barcelona|spain|espa[nñ]a/i, 'Europe/Madrid'],
  [/lisbon|portugal/i, 'Europe/Lisbon'],
  [/stockholm|sweden/i, 'Europe/Stockholm'],
  [/oslo|norway/i, 'Europe/Oslo'],
  [/copenhagen|denmark/i, 'Europe/Copenhagen'],
  [/helsinki|finland/i, 'Europe/Helsinki'],
  [/warsaw|poland|krak[oó]w/i, 'Europe/Warsaw'],
  [/prague|czechia|czech/i, 'Europe/Prague'],
  [/budapest|hungary/i, 'Europe/Budapest'],
  [/bucharest|romania/i, 'Europe/Bucharest'],
  [/athens|greece/i, 'Europe/Athens'],
  [/kyiv|kiev|ukraine/i, 'Europe/Kyiv'],
  [/istanbul|turkey|t[uü]rkiye/i, 'Europe/Istanbul'],
  [/tel\s*aviv|israel/i, 'Asia/Jerusalem'],
  [/dubai|abu\s*dhabi|uae|united\s*arab/i, 'Asia/Dubai'],
  [/riyadh|saudi/i, 'Asia/Riyadh'],

  // Asia-Pacific
  [/singapore/i, 'Asia/Singapore'],
  [/hong\s*kong/i, 'Asia/Hong_Kong'],
  [/tokyo|japan/i, 'Asia/Tokyo'],
  [/seoul|korea/i, 'Asia/Seoul'],
  [/shanghai|beijing|shenzhen|china/i, 'Asia/Shanghai'],
  [/mumbai|delhi|bangalore|bengaluru|hyderabad|india/i, 'Asia/Kolkata'],
  [/sydney|melbourne|brisbane|australia/i, 'Australia/Sydney'],
  [/auckland|wellington|new\s*zealand/i, 'Pacific/Auckland'],
];

/** Country / region fallbacks when no city match (last resort). */
const COUNTRY_TZ = [
  [/\bunited\s*states\b|\busa\b|\bu\.s\.a\.?\b/i, 'America/New_York'],
  [/\bcanada\b/i, 'America/Toronto'],
  [/\bmexico\b/i, 'America/Mexico_City'],
  [/\bbrazil\b/i, 'America/Sao_Paulo'],
  [/\buk\b|\bunited\s*kingdom\b/i, 'Europe/London'],
  [/\bgermany\b/i, 'Europe/Berlin'],
  [/\bfrance\b/i, 'Europe/Paris'],
  [/\bnetherlands\b/i, 'Europe/Amsterdam'],
  [/\bspain\b/i, 'Europe/Madrid'],
  [/\bitaly\b/i, 'Europe/Rome'],
  [/\bpoland\b/i, 'Europe/Warsaw'],
  [/\bukraine\b/i, 'Europe/Kyiv'],
  [/\bindia\b/i, 'Asia/Kolkata'],
  [/\baustralia\b/i, 'Australia/Sydney'],
  [/\bsingapore\b/i, 'Asia/Singapore'],
  [/\bjapan\b/i, 'Asia/Tokyo'],
  [/\bisrael\b/i, 'Asia/Jerusalem'],
  [/\buae\b|\bunited\s*arab\b/i, 'Asia/Dubai'],
];

/**
 * @param {string} location - Apify location.full or free-text "City, Country"
 * @returns {string} IANA timezone or ''
 */
export function timezoneFromLocation(location) {
  const loc = String(location || '').trim();
  if (!loc) return '';
  for (const [re, tz] of CITY_TZ) {
    if (re.test(loc)) return tz;
  }
  for (const [re, tz] of COUNTRY_TZ) {
    if (re.test(loc)) return tz;
  }
  return '';
}
