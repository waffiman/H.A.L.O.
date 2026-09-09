/**
 * Periodic Brain analysis: Notion P2+Lost in interval window → rewrite strategy_notes.md.
 * No LinkedIn browser. Must run under cycleLock('Brain', …) so it never overlaps Stage A/B.
 */
import {
  readStrategyNotes,
  writeStrategyNotes,
  readAnalysisState,
  writeAnalysisState,
  isBrainAnalysisDue,
  readUserPrompt,
} from './brainStore.js';
import { readPageBodyText } from './notionNotes.js';
import * as crm from './crmStore.js';

function analysisIntervalMs() {
  return Number(process.env.BRAIN_ANALYSIS_INTERVAL_MS || 604800000);
}

async function queryLeadsByStatus(statusName) {
  const rows = await crm.listByStatus(statusName);
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    status: statusName,
    processingAt: l.processingAt ? l.processingAt.toISOString() : null,
    ice: l.msg || '',
  }));
}

async function callLlm(system, user) {
  const tryOpenAI = async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  };
  const tryGemini = async () => {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return null;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim() || null;
  };
  const tryCohere = async () => {
    const key = process.env.COHERE_API_KEY || process.env.CO_API_KEY;
    if (!key) return null;
    const model = process.env.COHERE_MODEL || 'command-r-plus';
    const res = await fetch('https://api.cohere.ai/v1/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, message: user, preamble: system }),
    });
    if (!res.ok) throw new Error(`Cohere ${res.status}`);
    const data = await res.json();
    return String(data.text || '').trim() || null;
  };

  let raw = null;
  try {
    raw = await tryOpenAI();
  } catch (e) {
    console.error('Brain analysis OpenAI:', e.message);
  }
  if (!raw) {
    try {
      raw = await tryGemini();
    } catch (e) {
      console.error('Brain analysis Gemini:', e.message);
    }
  }
  if (!raw) {
    try {
      raw = await tryCohere();
    } catch (e) {
      console.error('Brain analysis Cohere:', e.message);
    }
  }
  return raw;
}

function buildFallbackNotes(lessons) {
  const chunks = lessons
    .map((block) => block.replace(/\(no signal\)/gi, '').trim())
    .filter((block) => block.length > 20);
  return chunks.join('\n\n').slice(0, 8000);
}

async function analyzeOneLead(lead, priorNotes) {
  const body = await readPageBodyText(lead.id).catch(() => '');
  const system = `You are the outreach strategy brain for WAFFi / H.A.L.O.
Read one CRM lead's outcome notes and extract 2-5 short, actionable lessons for future LinkedIn copy.
Do NOT rewrite the full sales playbook. Output ONLY bullet lessons (plain text), focused on what worked / failed for ice-breakers, replies, or closings.
If notes are empty or useless, output a single line: (no signal).`;
  const user = [
    `Lead: ${lead.name}`,
    `Status: ${lead.status}`,
    `Processing at: ${lead.processingAt || '(none)'}`,
    `Ice-breaker field:\n${lead.ice || '(empty)'}`,
    `Current living strategy notes:\n${priorNotes || '(none)'}`,
    `Full CRM page body:\n${body || '(empty)'}`,
  ].join('\n\n');
  return (await callLlm(system, user)) || '(no signal)';
}

async function mergeStrategyNotes(userPrompt, priorNotes, lessonChunks) {
  const system = `You maintain a single living strategy-notes document for LinkedIn outreach.
Merge prior notes with new per-lead lessons into ONE concise instruction block (max ~800 words).
Keep only durable guidance (voice, CTAs, what to avoid, patterns that convert).
Drop noise and "(no signal)" lines. Plain text / markdown bullets OK.
Output ONLY the updated strategy notes body — no preamble.`;
  const user = [
    `User master prompt (context only — do not copy wholesale):\n${userPrompt.slice(0, 2000)}`,
    `Prior strategy notes:\n${priorNotes || '(none)'}`,
    `New lessons from this analysis window:\n${lessonChunks.join('\n---\n')}`,
  ].join('\n\n');
  const merged = await callLlm(system, user);
  return (merged || priorNotes || '').trim();
}

/**
 * Run full Brain analysis for the current interval window.
 * Caller must hold cycleLock('Brain').
 */
export async function runBrainAnalysis() {
  if (process.env.BRAIN_ANALYSIS_ENABLED === '0') {
    console.log('Brain analysis skipped (BRAIN_ANALYSIS_ENABLED=0).');
    return { skipped: true, reason: 'disabled' };
  }

  const interval = analysisIntervalMs();
  const sinceIso = new Date(Date.now() - interval).toISOString();
  console.log(
    `=== BRAIN ANALYSIS === window=${Math.round(interval / 3600000)}h since=${sinceIso}`
  );

  const [p2, lost] = await Promise.all([
    queryLeadsByStatus('Proposal 2️⃣'),
    queryLeadsByStatus('Lost❌'),
  ]);
  const pool = [...p2, ...lost].filter((l) => {
    if (!l.processingAt) return false;
    return Date.parse(l.processingAt) >= Date.parse(sinceIso);
  });
  console.log(`Brain candidates: ${pool.length} (P2=${p2.length} Lost=${lost.length} in window)`);

  const priorNotes = readStrategyNotes();
  const lessons = [];
  let analyzed = 0;
  for (const lead of pool) {
    try {
      console.log(`Brain analyze: ${lead.name} (${lead.status})`);
      const chunk = await analyzeOneLead(lead, priorNotes);
      lessons.push(`### ${lead.name} [${lead.status}]\n${chunk}`);
      analyzed++;
    } catch (e) {
      console.error(`Brain analyze error ${lead.name}:`, e.message);
    }
  }

  let nextNotes = priorNotes;
  let notesChanged = false;
  if (lessons.length) {
    nextNotes = await mergeStrategyNotes(readUserPrompt(), priorNotes, lessons);
    if (!nextNotes?.trim()) {
      console.warn('Brain merge returned empty — using condensed lessons fallback');
      nextNotes = buildFallbackNotes(lessons);
    }
    if (nextNotes?.trim() && nextNotes.trim() !== (priorNotes || '').trim()) {
      writeStrategyNotes(nextNotes);
      notesChanged = true;
    }
  } else {
    console.log('Brain analysis: no leads in window — strategy notes unchanged.');
  }

  const summary = `Analyzed ${analyzed}/${pool.length} leads in last ${Math.round(interval / 86400000)}d.`;
  writeAnalysisState({
    lastRunAt: new Date().toISOString(),
    leadsAnalyzed: analyzed,
    lastSummary: summary,
  });

  try {
    const { notify } = await import('./notify.js');
    await notify({
      type: 'brain_analysis',
      severity: 'info',
      key: `brain_analysis_${Date.now()}`,
      title: 'Brain analysis complete',
      message: `${summary}\nStrategy notes ${notesChanged ? 'updated' : 'unchanged'}.`,
    });
  } catch (e) {
    console.error('Brain notify:', e.message);
  }

  console.log(`[Brain SUMMARY] ${summary}`);
  return { skipped: false, analyzed, pool: pool.length, summary };
}

export { isBrainAnalysisDue, analysisIntervalMs };
