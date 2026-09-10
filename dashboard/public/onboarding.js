/** HALO first-run setup guide — Notion-style multi-step overlay */
(function () {
  const STORAGE_KEY = 'halo_setup_guide_dismissed';

  const STEPS = [
    {
      kicker: 'Step 1 · Connect',
      title: 'Link your LinkedIn account',
      highlight: 'LinkedIn',
      bullets: [
        'LinkedIn section → enter email & password → Sign in.',
        'Approve the request in your LinkedIn mobile app if prompted.',
        'While H.A.L.O. runs, keep that account closed in your browser.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <ellipse class="ob-blob" cx="118" cy="88" rx="68" ry="48"/>
          <rect class="ob-stroke" x="24" y="40" width="96" height="88" rx="8"/>
          <rect class="ob-stroke ob-fill-soft" x="34" y="56" width="76" height="14" rx="4"/>
          <text class="ob-micro" x="72" y="66">email</text>
          <rect class="ob-stroke ob-fill-soft" x="34" y="78" width="76" height="14" rx="4"/>
          <circle class="ob-fill-accent ob-an-dot" cx="42" cy="85" r="2"/>
          <circle class="ob-fill-accent ob-an-dot2" cx="50" cy="85" r="2"/>
          <circle class="ob-fill-accent ob-an-dot3" cx="58" cy="85" r="2"/>
          <rect class="ob-stroke ob-fill-accent ob-an-signin" x="34" y="98" width="40" height="12" rx="6"/>
          <g class="ob-an-phone">
            <rect class="ob-stroke" x="138" y="44" width="34" height="56" rx="6"/>
            <circle class="ob-stroke ob-fill-accent ob-an-approve" cx="155" cy="64" r="10"/>
            <path class="ob-stroke ob-an-check-line" d="M150 64l4 4 8-8"/>
          </g>
        </svg>`,
    },
    {
      kicker: 'Step 2 · Credentials',
      title: 'Add your API keys',
      highlight: 'keys',
      bullets: [
        'Integrations → LLM keys (+ Telegram optional). Apify enrich is included by HALO.',
        'Reveal each field, paste, then Save.',
        'Missing LLM keys block message generation.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <ellipse class="ob-blob" cx="108" cy="92" rx="70" ry="44"/>
          <rect class="ob-stroke ob-an-key" x="52" y="58" width="52" height="34" rx="8"/>
          <circle class="ob-stroke" cx="68" cy="75" r="8"/>
          <path class="ob-stroke" d="M76 75h20M88 75v6M94 75v4"/>
          <path class="ob-stroke ob-an-lock" d="M118 52h22v28h-22z"/>
          <path class="ob-stroke" d="M124 52v-6a7 7 0 0 1 14 0v6"/>
          <path class="ob-stroke ob-fill-accent ob-an-check" d="M128 66l4 4 8-8"/>
        </svg>`,
    },
    {
      kicker: 'Step 3 · Sales Brain',
      title: 'Teach H.A.L.O. your voice',
      highlight: 'voice',
      bullets: [
        'Brain → write how you sell: tone, offer, ICP.',
        'Portrait chips capture who you target & how you sound.',
        'Brain analysis refines the playbook over time.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <ellipse class="ob-blob" cx="112" cy="90" rx="72" ry="46"/>
          <circle class="ob-stroke" cx="68" cy="78" r="16"/>
          <path class="ob-stroke" d="M52 108c6-10 28-10 34 0"/>
          <path class="ob-stroke ob-an-bubble" d="M92 52h72a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H108l-8 10v-10H92a8 8 0 0 1-8-8V60a8 8 0 0 1 8-8z"/>
          <line class="ob-stroke ob-an-line1" x1="98" y1="68" x2="158" y2="68"/>
          <line class="ob-stroke ob-an-line2" x1="98" y1="78" x2="148" y2="78"/>
          <line class="ob-stroke ob-an-line3" x1="98" y1="88" x2="138" y2="88"/>
          <rect class="ob-stroke ob-fill-accent ob-an-chip" x="36" y="118" width="52" height="14" rx="7"/>
          <text class="ob-micro ob-an-chip-text" x="62" y="128">Your tone</text>
        </svg>`,
    },
    {
      kicker: 'Step 4 · Stages',
      title: 'Turn on Stage A & B',
      highlight: 'A & B',
      bullets: [
        'Stage A = your charismatic opener — finds people, sends invites, writes the first DM.',
        'Stage B = your attentive closer — reads inbox replies and keeps conversations moving.',
        'Turn both on in Dashboard; skim Brain suggestions after each revision.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <ellipse class="ob-blob" cx="100" cy="88" rx="76" ry="46"/>
          <g class="ob-an-stage-a">
            <circle class="ob-stroke" cx="58" cy="68" r="12"/>
            <path class="ob-stroke" d="M44 98c4-12 24-12 28 0"/>
            <path class="ob-stroke ob-an-wave" d="M72 58c6-8 14-8 20 0"/>
            <path class="ob-stroke" d="M88 72h28"/>
            <path class="ob-stroke" d="M112 66l6 6-6 6"/>
          </g>
          <g class="ob-an-stage-b">
            <circle class="ob-stroke" cx="142" cy="72" r="12"/>
            <path class="ob-stroke" d="M128 102c4-12 24-12 28 0"/>
            <rect class="ob-stroke" x="118" y="88" width="28" height="20" rx="3"/>
            <line class="ob-stroke ob-an-reply" x1="122" y1="94" x2="142" y2="94"/>
            <line class="ob-stroke ob-an-reply2" x1="122" y1="100" x2="136" y2="100"/>
          </g>
          <text class="ob-label-sm" x="58" y="118">A · reaches out</text>
          <text class="ob-label-sm" x="142" y="118">B · replies</text>
        </svg>`,
    },
    {
      kicker: 'Step 5 · Live CRM',
      title: 'What happens when HALO runs',
      highlight: 'runs',
      bullets: [
        'Stage A syncs connections → Proposal 1 ice DMs.',
        'Stage B watches inbox → Proposal 2 replies.',
        'Notion CRM updates; Telegram alerts on events.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <ellipse class="ob-blob" cx="104" cy="90" rx="72" ry="48"/>
          <rect class="ob-stroke" x="34" y="44" width="48" height="72" rx="6"/>
          <line class="ob-stroke" x1="42" y1="58" x2="74" y2="58"/>
          <line class="ob-stroke" x1="42" y1="68" x2="70" y2="68"/>
          <line class="ob-stroke" x1="42" y1="78" x2="66" y2="78"/>
          <path class="ob-stroke ob-an-flow" d="M86 80h24"/>
          <path class="ob-stroke" d="M104 74l8 6-8 6"/>
          <rect class="ob-stroke ob-an-notion" x="114" y="52" width="52" height="56" rx="6"/>
          <circle class="ob-fill-accent ob-an-pulse" cx="140" cy="68" r="6"/>
          <path class="ob-stroke" d="M124 84h32M124 94h24"/>
        </svg>`,
    },
  ];

  let step = 0;
  let open = false;
  let dismissing = false;

  let root, backdrop, card, kickerEl, titleEl, highlightEl, bulletsEl, artEl, dotsEl, nextBtn, closeBtn, plane;

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderStep() {
    const s = STEPS[step];
    if (!s) return;
    kickerEl.textContent = s.kicker;
    kickerEl.setAttribute('data-step', String(step + 1));
    titleEl.innerHTML = s.title.replace(
      s.highlight,
      `<span class="ob-highlight"><span class="ob-highlight-bar"></span><span class="ob-highlight-text">${escapeHtml(s.highlight)}</span></span>`
    );
    bulletsEl.innerHTML = s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('');
    artEl.innerHTML = s.art;
    dotsEl.innerHTML = STEPS.map(
      (_, i) => `<span class="ob-dot${i === step ? ' active' : ''}" aria-hidden="true"></span>`
    ).join('');
    nextBtn.textContent = step >= STEPS.length - 1 ? 'Finish' : 'Next';
    nextBtn.setAttribute('aria-label', step >= STEPS.length - 1 ? 'Finish setup guide' : 'Next step');
  }

  function resetPlane() {
    if (!plane) return;
    plane.classList.remove('flying', 'folding');
    plane.classList.add('hidden');
    plane.style.removeProperty('left');
    plane.style.removeProperty('top');
    plane.style.removeProperty('--fly-x');
    plane.style.removeProperty('--fly-y');
    plane.style.removeProperty('opacity');
    plane.style.removeProperty('transform');
    plane.setAttribute('aria-hidden', 'true');
  }

  function show() {
    if (dismissing) return;
    step = 0;
    open = true;
    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    card.classList.remove('onboarding-fold-away');
    resetPlane();
    renderStep();
    nextBtn.focus();
  }

  function hideInstant() {
    open = false;
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
  }

  function buildFlightPath(sx, sy, tx, ty) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const m = Math.min(56, W * 0.06, H * 0.06);
    return [
      { x: sx, y: sy },
      { x: W * 0.78, y: m + 24 },
      { x: W - m, y: H * 0.28 },
      { x: W * 0.68, y: H * 0.12 },
      { x: W * 0.42, y: H * 0.08 },
      { x: W * 0.18, y: H * 0.22 },
      { x: W * 0.12, y: H * 0.48 },
      { x: W * 0.28, y: H * 0.72 },
      { x: W * 0.58, y: H * 0.82 },
      { x: (tx + sx) * 0.45, y: (ty + sy) * 0.5 },
      { x: tx, y: ty },
    ];
  }

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  function samplePath(points, u) {
    const segCount = points.length - 1;
    const segT = u * segCount;
    const seg = Math.min(segCount - 1, Math.floor(segT));
    const localT = segT - seg;
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[seg + 1];
    const p3 = points[Math.min(points.length - 1, seg + 2)];
    const pos = catmullRom(p0, p1, p2, p3, localT);
    const ahead = catmullRom(p0, p1, p2, p3, Math.min(1, localT + 0.025));
    const angle = (Math.atan2(ahead.y - pos.y, ahead.x - pos.x) * 180) / Math.PI + 180;
    const bank = Math.sin(u * Math.PI * 3.2) * 18;
    const scale = 1.15 + Math.sin(u * Math.PI) * 0.2;
    return { pos, angle: angle + bank, scale };
  }

  function flyPlaneToTarget(sx, sy, tx, ty, durationMs = 1900) {
    return new Promise((resolve) => {
      if (!plane) {
        resolve();
        return;
      }
      const path = buildFlightPath(sx, sy, tx, ty);
      plane.classList.remove('hidden', 'flying');
      plane.setAttribute('aria-hidden', 'false');
      const start = performance.now();

      function frame(now) {
        const u = Math.min(1, (now - start) / durationMs);
        const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const { pos, angle, scale } = samplePath(path, eased);
        plane.style.left = `${pos.x}px`;
        plane.style.top = `${pos.y}px`;
        plane.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(${scale})`;
        plane.style.opacity = u > 0.92 ? String(1 - (u - 0.92) / 0.08) : '1';
        if (u < 1) requestAnimationFrame(frame);
        else {
          resetPlane();
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  async function dismissWithPlane() {
    if (dismissing) return;
    dismissing = true;
    localStorage.setItem(STORAGE_KEY, '1');

    const faqBtn = document.querySelector('.nav-item[data-page="faq"]');
    if (!faqBtn || !card || !plane) {
      hideInstant();
      dismissing = false;
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const faqRect = faqBtn.getBoundingClientRect();
    const sx = cardRect.left + cardRect.width / 2;
    const sy = cardRect.top + cardRect.height / 2;
    const tx = faqRect.left + faqRect.width / 2;
    const ty = faqRect.top + faqRect.height / 2;

    card.classList.add('onboarding-fold-away');
    backdrop.classList.add('onboarding-backdrop-out');

    await wait(1000);

    await flyPlaneToTarget(sx, sy, tx, ty, 1900);

    faqBtn.classList.add('nav-kinetic-hit');
    setTimeout(() => faqBtn.classList.remove('nav-kinetic-hit'), 700);

    hideInstant();
    card.classList.remove('onboarding-fold-away');
    backdrop.classList.remove('onboarding-backdrop-out');
    resetPlane();
    open = false;
    dismissing = false;
  }

  function next() {
    if (step < STEPS.length - 1) {
      step += 1;
      renderStep();
    } else {
      dismissWithPlane();
    }
  }

  function init() {
    root = document.getElementById('onboarding-root');
    if (!root) return;

    backdrop = root.querySelector('.onboarding-backdrop');
    card = root.querySelector('.onboarding-card');
    kickerEl = root.querySelector('.ob-kicker');
    titleEl = root.querySelector('.ob-title');
    bulletsEl = root.querySelector('.ob-bullets');
    artEl = root.querySelector('.ob-art');
    dotsEl = root.querySelector('.ob-dots');
    nextBtn = root.querySelector('.ob-next');
    closeBtn = root.querySelector('.ob-close');
    plane = document.getElementById('onboarding-plane');

    closeBtn.addEventListener('click', () => dismissWithPlane());
    nextBtn.addEventListener('click', () => next());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) dismissWithPlane();
    });

    window.haloOpenSetupGuide = show;
    window.haloSetupGuideSeen = () => localStorage.getItem(STORAGE_KEY) === '1';

    if (!localStorage.getItem(STORAGE_KEY)) {
      requestAnimationFrame(() => show());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
