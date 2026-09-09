/**
 * LinkedIn geoUrn map + Brain portrait region chips (shared agent + dashboard).
 * IDs from LinkedIn People search geo facets (country/region).
 */

export const REGION_ALIASES = {
  US: 'USA',
  'U.S.': 'USA',
  'U.S.A.': 'USA',
  'United States': 'USA',
  'United States of America': 'USA',
  UK: 'UK',
  'U.K.': 'UK',
  'United Kingdom': 'UK',
  'Great Britain': 'UK',
  England: 'UK',
  UAE: 'United Arab Emirates',
  Dubai: 'United Arab Emirates',
  'Czech Republic': 'Czechia',
  'South Korea': 'Korea',
  'Republic of Korea': 'Korea',
};

/** @type {Record<string, string[]>} */
export const REGION_GEO_URNS = {
  Global: [],
  Remote: [],

  // Broad regions (composite geoUrn)
  'North America': ['103644278', '101174742', '103323778'],
  Europe: ['100506914'],
  'Asia Pacific': [
    '101452733',
    '102454443',
    '101355337',
    '105149562',
    '102454922',
    '104187078',
    '102890883',
    '102713980',
    '105490917',
  ],
  'Latin America': ['106057199', '103323778', '100446943', '100876405', '104621616'],
  'Middle East & Africa': [
    '104305776',
    '100459316',
    '101620260',
    '104035573',
    '106155005',
    '105365835',
  ],
  DACH: ['101282230', '103883259', '106693272'],
  Benelux: ['102890719', '100565514', '104769905'],
  Nordics: ['105117694', '103819153', '104514075', '100456013'],
  'UK & Ireland': ['101165590', '104738515'],

  // Americas
  USA: ['103644278'],
  Canada: ['101174742'],
  Mexico: ['103323778'],
  Brazil: ['106057199'],
  Argentina: ['100446943'],
  Colombia: ['100876405'],
  Chile: ['104621616'],
  Peru: ['102927786'],
  Ecuador: ['106373116'],

  // Europe
  UK: ['101165590'],
  Ireland: ['104738515'],
  Germany: ['101282230'],
  France: ['105015875'],
  Netherlands: ['102890719'],
  Belgium: ['100565514'],
  Luxembourg: ['104769905'],
  Switzerland: ['106693272'],
  Austria: ['103883259'],
  Italy: ['103350119'],
  Spain: ['105646813'],
  Portugal: ['100364837'],
  Sweden: ['105117694'],
  Norway: ['103819153'],
  Denmark: ['104514075'],
  Finland: ['100456013'],
  Poland: ['105072130'],
  Czechia: ['104508036'],
  Romania: ['106670623'],
  Hungary: ['100288700'],
  Greece: ['104677530'],
  Ukraine: ['102264497'],
  Turkey: ['102105699'],

  // Middle East
  'United Arab Emirates': ['104305776'],
  'Saudi Arabia': ['100459316'],
  Israel: ['101620260'],
  Qatar: ['104170880'],
  Egypt: ['106155005'],

  // Africa
  'South Africa': ['104035573'],
  Nigeria: ['105365835'],
  Kenya: ['100710459'],

  // Asia Pacific
  Australia: ['101452733'],
  'New Zealand': ['105490917'],
  Singapore: ['102454443'],
  Japan: ['101355337'],
  Korea: ['105149562'],
  'Hong Kong': ['102454922'],
  Taiwan: ['104187078'],
  China: ['102890883'],
  India: ['102713980'],
  Pakistan: ['101022442'],
  Philippines: ['103121019'],
  Indonesia: ['102478259'],
  Malaysia: ['106808692'],
  Thailand: ['105146118'],
  Vietnam: ['104195383'],
};

export const PORTRAIT_REGION_GROUPS = [
  {
    label: 'Broad',
    items: [
      { id: 'Global', label: 'Global' },
      { id: 'Remote', label: 'Remote' },
      { id: 'North America', label: 'North America' },
      { id: 'Europe', label: 'Europe' },
      { id: 'Asia Pacific', label: 'Asia Pacific' },
      { id: 'Latin America', label: 'Latin America' },
      { id: 'Middle East & Africa', label: 'Middle East & Africa' },
      { id: 'DACH', label: 'DACH' },
      { id: 'Benelux', label: 'Benelux' },
      { id: 'Nordics', label: 'Nordics' },
      { id: 'UK & Ireland', label: 'UK & Ireland' },
    ],
  },
  {
    label: 'Americas',
    items: [
      { id: 'USA', label: 'USA' },
      { id: 'Canada', label: 'Canada' },
      { id: 'Mexico', label: 'Mexico' },
      { id: 'Brazil', label: 'Brazil' },
      { id: 'Argentina', label: 'Argentina' },
      { id: 'Colombia', label: 'Colombia' },
      { id: 'Chile', label: 'Chile' },
      { id: 'Peru', label: 'Peru' },
      { id: 'Ecuador', label: 'Ecuador' },
    ],
  },
  {
    label: 'Europe',
    items: [
      { id: 'UK', label: 'UK' },
      { id: 'Ireland', label: 'Ireland' },
      { id: 'Germany', label: 'Germany' },
      { id: 'France', label: 'France' },
      { id: 'Netherlands', label: 'Netherlands' },
      { id: 'Belgium', label: 'Belgium' },
      { id: 'Luxembourg', label: 'Luxembourg' },
      { id: 'Switzerland', label: 'Switzerland' },
      { id: 'Austria', label: 'Austria' },
      { id: 'Italy', label: 'Italy' },
      { id: 'Spain', label: 'Spain' },
      { id: 'Portugal', label: 'Portugal' },
      { id: 'Sweden', label: 'Sweden' },
      { id: 'Norway', label: 'Norway' },
      { id: 'Denmark', label: 'Denmark' },
      { id: 'Finland', label: 'Finland' },
      { id: 'Poland', label: 'Poland' },
      { id: 'Czechia', label: 'Czechia' },
      { id: 'Romania', label: 'Romania' },
      { id: 'Hungary', label: 'Hungary' },
      { id: 'Greece', label: 'Greece' },
      { id: 'Ukraine', label: 'Ukraine' },
      { id: 'Turkey', label: 'Turkey' },
    ],
  },
  {
    label: 'Middle East & Africa',
    items: [
      { id: 'United Arab Emirates', label: 'UAE' },
      { id: 'Saudi Arabia', label: 'Saudi Arabia' },
      { id: 'Israel', label: 'Israel' },
      { id: 'Qatar', label: 'Qatar' },
      { id: 'Egypt', label: 'Egypt' },
      { id: 'South Africa', label: 'South Africa' },
      { id: 'Nigeria', label: 'Nigeria' },
      { id: 'Kenya', label: 'Kenya' },
    ],
  },
  {
    label: 'Asia Pacific',
    items: [
      { id: 'Australia', label: 'Australia' },
      { id: 'New Zealand', label: 'New Zealand' },
      { id: 'Singapore', label: 'Singapore' },
      { id: 'Japan', label: 'Japan' },
      { id: 'Korea', label: 'South Korea' },
      { id: 'Hong Kong', label: 'Hong Kong' },
      { id: 'Taiwan', label: 'Taiwan' },
      { id: 'China', label: 'China' },
      { id: 'India', label: 'India' },
      { id: 'Pakistan', label: 'Pakistan' },
      { id: 'Philippines', label: 'Philippines' },
      { id: 'Indonesia', label: 'Indonesia' },
      { id: 'Malaysia', label: 'Malaysia' },
      { id: 'Thailand', label: 'Thailand' },
      { id: 'Vietnam', label: 'Vietnam' },
    ],
  },
];

export function normalizeRegionId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (REGION_ALIASES[s]) return REGION_ALIASES[s];
  const lower = s.toLowerCase();
  for (const [alias, canonical] of Object.entries(REGION_ALIASES)) {
    if (alias.toLowerCase() === lower) return canonical;
  }
  return s;
}

export function normalizeRegionList(list = []) {
  return [...new Set(list.map(normalizeRegionId).filter(Boolean))];
}

export function allRegionChipIds() {
  const ids = new Set();
  for (const group of PORTRAIT_REGION_GROUPS) {
    for (const item of group.items) ids.add(item.id);
  }
  return [...ids];
}
