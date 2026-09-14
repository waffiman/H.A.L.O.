/**
 * LinkedIn ICP lead score from Apify profile vs Brain Client portrait.
 * Prefer Brain **Inspector** LLM (with role fallback); rubric is backup.
 * Informational only — does not change outreach order.
 *
 * Rubric (max 100 → display/store 1–10):
 *  role 0–30 | industry 0–20 | company size 0–15 | region 0–15 | seniority 0–10 | profile 0–10
 */
import { readSalesPolicy } from './brainStore.js';

const ROLE_SYNONYMS = [
  ['ceo', 'chief executive', 'founder', 'co-founder', 'cofounder', 'owner', 'managing director', 'md'],
  ['cto', 'chief technology', 'vp engineering', 'head of engineering', 'engineering lead'],
  ['cmo', 'chief marketing', 'vp marketing', 'head of marketing', 'marketing lead', 'growth lead'],
  ['coo', 'chief operating', 'vp operations', 'head of ops', 'ops lead', 'operations'],
  ['cfo', 'chief financial', 'vp finance', 'head of finance'],
  ['product', 'cpo', 'head of product', 'vp product', 'product lead'],
  ['sales', 'head of sales', 'vp sales', 'revenue', 'cro'],
  ['founder', 'co-founder', 'cofounder', 'owner', 'solopreneur'],
];

const SENIORITY_HIGH =
  /\b(ceo|cto|cmo|coo|cfo|cpo|cro|founder|co-?founder|owner|chief|president|vp\b|vice\s*president|director|head\s+of|managing\s+director|partner|principal)\b/i;
const SENIORITY_MID = /\b(manager|lead|senior|supervisor|team\s*lead)\b/i;
const SENIORITY_JUNIOR = /\b(intern|junior|assistant|coordinator|associate|trainee|entry)\b/i;

const SIZE_RANGES = {
  solo: [1, 1],
  '2_10': [2, 10],
  '11_50': [11, 50],
  '51_200': [51, 200],
  '200_plus': [200, 1_000_000],
};

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return norm(s)
    .split(/[\s,/|]+/)
    .filter((t) => t.length > 1);
}

function fuzzyIncludes(hay, needle) {
  const h = norm(hay);
  const n = norm(needle);
  if (!h || !n) return false;
  if (h.includes(n) || n.includes(h)) return true;
  const nt = tokens(n);
  if (!nt.length) return false;
  return nt.every((t) => h.includes(t) || synonymHit(h, t));
}

function synonymHit(hay, word) {
  for (const group of ROLE_SYNONYMS) {
    if (!group.includes(word) && !group.some((g) => word.includes(g) || g.includes(word))) continue;
    if (group.some((g) => hay.includes(g))) return true;
  }
  return false;
}

function experienceBlob(profile) {
  const exp = Array.isArray(profile.experience) ? profile.experience : [];
  return exp
    .slice(0, 8)
    .map((e) => {
      if (!e || typeof e !== 'object') return String(e || '');
      const co = typeof e.company === 'string' ? e.company : e.company?.name || '';
      return [e.title || e.position, co, e.description || e.summary || e.duration]
        .filter(Boolean)
        .join(' ');
    })
    .join(' | ');
}

function educationBlob(profile) {
  const edu = Array.isArray(profile.education) ? profile.education : [];
  return edu
    .slice(0, 6)
    .map((e) => {
      if (!e || typeof e !== 'object') return String(e || '');
      return [e.school, e.degree, e.field_of_study || e.field, e.description]
        .filter(Boolean)
        .join(' ');
    })
    .join(' | ');
}

function skillsBlob(profile) {
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  return skills
    .map((s) => (typeof s === 'string' ? s : s?.name || s?.title || ''))
    .filter(Boolean)
    .join(', ');
}

function scoreRole(profile, portrait) {
  const roles = Array.isArray(portrait?.roles) ? portrait.roles : [];
  if (!roles.length) return { points: 15, max: 30, detail: 'no portrait roles — neutral' };
  const blob = [
    profile.headline,
    profile.topRole,
    profile.currentTitle,
    profile.about,
    experienceBlob(profile),
    skillsBlob(profile),
  ]
    .filter(Boolean)
    .join(' | ');
  let best = 0;
  let matched = '';
  for (const role of roles) {
    if (fuzzyIncludes(blob, role)) {
      best = Math.max(best, 30);
      matched = role;
    } else {
      const rt = tokens(role);
      const hits = rt.filter((t) => fuzzyIncludes(blob, t) || synonymHit(norm(blob), t)).length;
      if (rt.length && hits / rt.length >= 0.5) {
        best = Math.max(best, 15);
        matched = role;
      }
    }
  }
  return {
    points: best,
    max: 30,
    detail: best ? `matched “${matched}”` : 'no role match',
  };
}

function scoreIndustry(profile, portrait) {
  const industries = Array.isArray(portrait?.industries) ? portrait.industries : [];
  if (!industries.length) return { points: 10, max: 20, detail: 'no portrait industries — neutral' };
  const blob = [
    profile.industry,
    profile.headline,
    profile.about,
    profile.company,
    experienceBlob(profile),
    educationBlob(profile),
    skillsBlob(profile),
  ]
    .filter(Boolean)
    .join(' | ');
  for (const ind of industries) {
    if (fuzzyIncludes(blob, ind)) return { points: 20, max: 20, detail: `matched “${ind}”` };
  }
  for (const ind of industries) {
    const it = tokens(ind);
    const hits = it.filter((t) => fuzzyIncludes(blob, t)).length;
    if (it.length && hits / it.length >= 0.5) {
      return { points: 10, max: 20, detail: `partial “${ind}”` };
    }
  }
  return { points: 0, max: 20, detail: 'no industry match' };
}

function parseEmployeeCount(profile) {
  const n = Number(
    profile.employeeCount ??
      profile.companySize ??
      profile.company_employee_count ??
      profile.employees ??
      NaN
  );
  if (Number.isFinite(n) && n > 0) return n;
  const raw = String(profile.companySizeText || profile.company_size || '').toLowerCase();
  const m = raw.match(/(\d+)\s*[-–to]+\s*(\d+)/);
  if (m) return Math.round((Number(m[1]) + Number(m[2])) / 2);
  const single = raw.match(/(\d+)\s*\+/);
  if (single) return Number(single[1]);
  if (/self[- ]?employed|solo|1\b/.test(raw)) return 1;
  return null;
}

function scoreCompanySize(profile, portrait) {
  const want = String(portrait?.companySize || '').trim();
  if (!want || !SIZE_RANGES[want]) {
    return { points: 8, max: 15, detail: 'no portrait size — neutral' };
  }
  const count = parseEmployeeCount(profile);
  if (count == null) return { points: 5, max: 15, detail: 'company size unknown' };
  const [lo, hi] = SIZE_RANGES[want];
  if (count >= lo && count <= hi) return { points: 15, max: 15, detail: `${count} in range` };
  // adjacent bucket
  const keys = Object.keys(SIZE_RANGES);
  const idx = keys.indexOf(want);
  for (const j of [idx - 1, idx + 1]) {
    if (j < 0 || j >= keys.length) continue;
    const [a, b] = SIZE_RANGES[keys[j]];
    if (count >= a && count <= b) return { points: 8, max: 15, detail: `${count} adjacent bucket` };
  }
  return { points: 0, max: 15, detail: `${count} out of range` };
}

function continentHint(location) {
  const l = norm(location);
  if (!l) return '';
  if (/united states|usa|canada|mexico|brazil|argentina|chile|colombia|peru/.test(l)) return 'americas';
  if (/uk|united kingdom|germany|france|spain|italy|poland|ukraine|netherlands|europe|sweden|norway|denmark|ireland|portugal|belgium|switzerland|austria|czech|romania|greece|turkey/.test(l))
    return 'europe';
  if (/uae|dubai|saudi|israel|india|singapore|japan|china|korea|hong kong|australia|new zealand|asia/.test(l))
    return 'apac';
  return '';
}

function scoreRegion(profile, portrait) {
  const regions = Array.isArray(portrait?.regions) ? portrait.regions : [];
  if (!regions.length) return { points: 8, max: 15, detail: 'no portrait regions — neutral' };
  const loc = [profile.location, profile.country, profile.city].filter(Boolean).join(', ');
  for (const r of regions) {
    if (fuzzyIncludes(loc, r) || fuzzyIncludes(r, loc)) {
      return { points: 15, max: 15, detail: `matched “${r}”` };
    }
  }
  const leadC = continentHint(loc);
  if (leadC && regions.some((r) => continentHint(r) === leadC)) {
    return { points: 8, max: 15, detail: 'same continent' };
  }
  return { points: 0, max: 15, detail: 'no region match' };
}

function scoreSeniority(profile, portrait) {
  const blob = [profile.headline, profile.topRole, profile.currentTitle, experienceBlob(profile)]
    .filter(Boolean)
    .join(' ');
  const dm = Array.isArray(portrait?.decisionMaker) ? portrait.decisionMaker : [];
  let points = 0;
  let detail = 'junior / unclear';
  if (SENIORITY_HIGH.test(blob)) {
    points = 10;
    detail = 'decision-maker title';
  } else if (SENIORITY_MID.test(blob)) {
    points = 5;
    detail = 'mid-level title';
  } else if (SENIORITY_JUNIOR.test(blob)) {
    points = 0;
    detail = 'junior title';
  } else {
    points = 3;
    detail = 'title seniority unclear';
  }
  if (dm.length && points < 10) {
    for (const d of dm) {
      if (fuzzyIncludes(blob, d)) {
        points = 10;
        detail = `decision maker “${d}”`;
        break;
      }
    }
  }
  return { points, max: 10, detail };
}

function scoreCompleteness(profile) {
  let points = 0;
  const parts = [];
  if (profile.hasPhoto || profile.profilePicture || profile.photoUrl) {
    points += 1;
    parts.push('photo');
  }
  if (String(profile.about || '').trim().length > 40) {
    points += 2;
    parts.push('about');
  }
  const exp = Array.isArray(profile.experience) ? profile.experience : [];
  if (exp.length > 0 || profile.topRole) {
    points += 2;
    parts.push('experience');
  }
  const edu = Array.isArray(profile.education) ? profile.education : [];
  if (edu.length > 0) {
    points += 1;
    parts.push('education');
  }
  if (Array.isArray(profile.skills) && profile.skills.length > 0) {
    points += 2;
    parts.push('skills');
  }
  const extras =
    (Array.isArray(profile.certifications) && profile.certifications.length) ||
    (Array.isArray(profile.languages) && profile.languages.length) ||
    (Array.isArray(profile.projects) && profile.projects.length) ||
    (Array.isArray(profile.honors) && profile.honors.length) ||
    (Array.isArray(profile.volunteer) && profile.volunteer.length);
  if (extras) {
    points += 2;
    parts.push('extras');
  }
  return {
    points: Math.min(10, points),
    max: 10,
    detail: parts.length ? parts.join(', ') : 'sparse profile',
  };
}

function resolvePortrait(salesPolicyOrPortrait = null) {
  let portrait = salesPolicyOrPortrait;
  if (portrait && portrait.portrait) portrait = portrait.portrait;
  if (!portrait) {
    try {
      portrait = readSalesPolicy().portrait;
    } catch {
      portrait = {};
    }
  }
  return portrait || {};
}

/**
 * Deterministic rubric fallback (1–10).
 * @param {object} profileData Apify-normalized profile
 * @param {object} [salesPolicyOrPortrait] full sales policy or portrait fields
 * @returns {{ score: number, breakdown: object }}
 */
export function computeLeadScore(profileData, salesPolicyOrPortrait = null) {
  const portrait = resolvePortrait(salesPolicyOrPortrait);
  const role = scoreRole(profileData, portrait);
  const industry = scoreIndustry(profileData, portrait);
  const companySize = scoreCompanySize(profileData, portrait);
  const region = scoreRegion(profileData, portrait);
  const seniority = scoreSeniority(profileData, portrait);
  const profile = scoreCompleteness(profileData);
  const rawTotal = Math.max(
    0,
    Math.min(
      100,
      role.points +
        industry.points +
        companySize.points +
        region.points +
        seniority.points +
        profile.points
    )
  );
  const score = Math.max(1, Math.min(10, Math.round(rawTotal / 10) || 1));
  return {
    score,
    score100: rawTotal,
    breakdown: {
      role,
      industry,
      companySize,
      region,
      seniority,
      profile,
      total: score,
      total100: rawTotal,
      max: 10,
      source: 'rubric',
    },
  };
}

/**
 * Preferred path: Inspector LLM → OpenRouter/shared fallback → deterministic rubric.
 * Set LEAD_SCORE_LLM=0 to force rubric only.
 */
export async function scoreLead(profileData, salesPolicyOrPortrait = null) {
  const portrait = resolvePortrait(salesPolicyOrPortrait);
  if (process.env.LEAD_SCORE_LLM !== '0') {
    try {
      const { scoreLeadIcpFit } = await import('./salesBrain.js');
      const llm = await scoreLeadIcpFit({ profile: profileData, portrait });
      if (llm?.score != null) {
        console.log(`  Lead score (Inspector LLM): ${llm.score}/10`);
        return llm;
      }
      console.log('  Lead score LLM empty — using rubric fallback');
    } catch (e) {
      console.error('  Lead score LLM failed — rubric fallback:', e.message);
    }
  }
  return computeLeadScore(profileData, portrait);
}

export function leadScoreColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  // 1–10 scale
  if (n <= 2) return '#ef4444';
  if (n <= 4) return '#f97316';
  if (n <= 6) return '#eab308';
  if (n <= 8) return '#84cc16';
  return '#22c55e';
}
