/** HALO first-run setup guide — multi-step overlay */
(function () {
  const STORAGE_KEY = 'halo_setup_guide_dismissed';

  const STEPS = [
    {
      kicker: 'Step 1 of 4 · LinkedIn',
      title: 'Connect your LinkedIn',
      highlight: 'LinkedIn',
      lead: 'This is the only account H.A.L.O. needs from you to send invites and DMs.',
      bullets: [
        'Open LinkedIn in the sidebar → enter email & password → Sign in.',
        'Approve the login in your LinkedIn mobile app if asked.',
        'Keep that LinkedIn account closed in your personal browser while H.A.L.O. runs.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <defs>
            <linearGradient id="obg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#22c55e" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#86efac" stop-opacity="0.05"/>
            </linearGradient>
          </defs>
          <ellipse class="ob-blob" cx="118" cy="88" rx="68" ry="48" fill="url(#obg1)"/>
          <rect class="ob-stroke" x="24" y="40" width="96" height="88" rx="10"/>
          <rect class="ob-stroke ob-fill-soft" x="34" y="56" width="76" height="14" rx="4"/>
          <text class="ob-micro" x="72" y="66">email</text>
          <rect class="ob-stroke ob-fill-soft" x="34" y="78" width="76" height="14" rx="4"/>
          <circle class="ob-fill-accent ob-an-dot" cx="42" cy="85" r="2"/>
          <circle class="ob-fill-accent ob-an-dot2" cx="50" cy="85" r="2"/>
          <circle class="ob-fill-accent ob-an-dot3" cx="58" cy="85" r="2"/>
          <rect class="ob-stroke ob-fill-accent ob-an-signin" x="34" y="98" width="44" height="14" rx="7"/>
          <text class="ob-micro" x="56" y="108" fill="#fff">Sign in</text>
          <g class="ob-an-phone">
            <rect class="ob-stroke" x="138" y="44" width="34" height="56" rx="6"/>
            <circle class="ob-stroke ob-fill-accent ob-an-approve" cx="155" cy="64" r="10"/>
            <path class="ob-stroke ob-an-check-line" d="M150 64l4 4 8-8"/>
          </g>
        </svg>`,
    },
    {
      kicker: 'Step 2 of 4 · Brain keys',
      title: 'Add your LLM API keys',
      highlight: 'LLM',
      lead: 'Three roles write every message. Apify enrich and CRM hosting are already included — no setup.',
      bullets: [
        'Settings → Integrations → paste Researcher, Copywriter, and Inspector API keys.',
        'Pick a model for each role (defaults work fine to start).',
        'Optional: Telegram Chat ID for phone alerts. Then Save.',
      ],
      art: `
        <svg class="ob-svg" viewBox="0 0 200 160" aria-hidden="true">
          <ellipse class="ob-blob" cx="108" cy="92" rx="70" ry="44"/>
          <rect class="ob-stroke ob-an-key" x="40" y="48" width="44" height="56" rx="10"/>
          <text class="ob-micro" x="62" y="72">R</text>
          <rect class="ob-stroke" x="92" y="48" width="44" height="56" rx="10"/>
          <text class="ob-micro" x="114" y="72">C</text>
          <rect class="ob-stroke" x="144" y="48" width="36" height="56" rx="10"/>
          <text class="ob-micro" x="162" y="72">I</text>
          <path class="ob-stroke ob-fill-accent ob-an-check" d="M54 92l4 4 8-8"/>
          <path class="ob-stroke ob-fill-accent" d="M106 92l4 4 8-8"/>
          <path class="ob-stroke ob-fill-accent" d="M154 92l4 4 8-8"/>
          <text class="ob-label-sm" x="100" y="132">Researcher · Copywriter · Inspector</text>
        </svg>`,
    },
    {
      kicker: 'Step 3 of 4 · Sales Brain',
      title: 'Teach H.A.L.O. your voice',
      highlight: 'voice',
      lead: 'A short portrait beats a long prompt — who you sell to, how you sound, what “won” means.',
      bullets: [
        'Open Brain → set tone, offer, and Ideal Customer Profile chips.',
        'Choose your outcome (e.g. Book a call) and paint availability if needed.',
        'Brain analysis quietly improves copy from real CRM results over time.',
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
      kicker: 'Step 4 of 4 · Go live',
      title: 'Turn on Stage A & B',
      highlight: 'Go live',
      lead: 'That’s it — LinkedIn + LLM keys are enough to start. Stages do the rest.',
      bullets: [
        'Dashboard → enable Stage A (invites + first ice DM) and Stage B (inbox replies).',
        'CRM pipeline: Lead😴 → Conversation 💬 → Active ✅ / Lost❌.',
        'Use Save and restart once so the agent picks up your keys and stages.',
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
          <text class="ob-label-sm" x="58" y="122">A · reaches out</text>
          <text class="ob-label-sm" x="142" y="122">B · replies</text>
          <rect class="ob-stroke ob-fill-accent" x="70" y="132" width="60" height="16" rx="8"/>
          <text class="ob-micro" x="100" y="143" fill="#fff">Save &amp; restart</text>
        </svg>`,
    },
  ];

  let step = 0;
  let open = false;
  let dismissing = false;

  let root, backdrop, card, kickerEl, titleEl, highlightEl, bulletsEl, artEl, dotsEl, nextBtn, closeBtn, plane, leadEl, progressEl;

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
    if (leadEl) {
      leadEl.textContent = s.lead || '';
      leadEl.classList.toggle('hidden', !s.lead);
    }
    bulletsEl.innerHTML = s.bullets
      .map(
        (b, i) =>
          `<li><span class="ob-bullet-num" aria-hidden="true">${i + 1}</span><span class="ob-bullet-text">${escapeHtml(b)}</span></li>`
      )
      .join('');
    artEl.innerHTML = s.art;
    dotsEl.innerHTML = STEPS.map(
      (_, i) => `<span class="ob-dot${i === step ? ' active' : i < step ? ' done' : ''}" aria-hidden="true"></span>`
    ).join('');
    if (progressEl) {
      progressEl.style.width = `${((step + 1) / STEPS.length) * 100}%`;
    }
    nextBtn.textContent = step >= STEPS.length - 1 ? 'Finish' : 'Next';
    nextBtn.setAttribute('aria-label', step >= STEPS.length - 1 ? 'Finish setup guide' : 'Next step');
  }

  function resetPlane() {
    if (!plane) return;
    plane.classList.remove('flying', 'folding');
    plane.classList.add('hidden');
    plane.style.removeProperty('left');
    plane.style.removeProperty('top');
    plane.style.removeProperty('opacity');
    plane.style.removeProperty('transform');
    plane.style.removeProperty('--px');
    plane.style.removeProperty('--py');
    plane.style.removeProperty('--rot');
    plane.style.removeProperty('--sc');
    plane.setAttribute('aria-hidden', 'true');
  }

  function show() {
    if (dismissing) return;
    step = 0;
    open = true;
    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    card.classList.remove('onboarding-fold-away');
    backdrop?.classList.remove('onboarding-backdrop-out');
    resetPlane();
    renderStep();
    nextBtn.focus();
  }

  function hideInstant() {
    open = false;
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
  }

  /** Ease that starts quick, then bleeds speed like a paper plane losing lift. */
  function paperEase(u) {
    // Fast launch → long soft coast
    const a = 1 - Math.pow(1 - u, 1.55);
    return a * (0.55 + 0.45 * (1 - Math.pow(1 - u, 2.8)));
  }

  /**
   * Paper-plane path: loft / nose-up early, wide soft arc across the dashboard,
   * then a decelerating glide into the FAQ nav.
   */
  function buildPaperPath(sx, sy, tx, ty) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const m = Math.min(48, W * 0.05, H * 0.05);
    // Launch loft — climb above the modal toward the open sky
    const loftX = sx + Math.max(120, W * 0.18);
    const loftY = Math.max(m + 20, sy - H * 0.28);
    // High cruise — float across the upper third with a soft nose-up arc
    const cruise1 = { x: Math.min(W - m, W * 0.72), y: Math.max(m + 16, H * 0.1) };
    const cruise2 = { x: W * 0.42, y: Math.max(m + 28, H * 0.07) };
    // Soft sink / turn toward FAQ (usually lower-left in sidebar)
    const sink = { x: Math.max(m + 20, W * 0.16), y: H * 0.38 };
    const approach = { x: (tx + sink.x) * 0.5, y: (ty + sink.y) * 0.55 };
    return [
      { x: sx, y: sy },
      { x: loftX, y: loftY },
      cruise1,
      cruise2,
      sink,
      approach,
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
    const clamped = Math.max(0, Math.min(1, u));
    const segCount = points.length - 1;
    const segT = clamped * segCount;
    const seg = Math.min(segCount - 1, Math.floor(segT));
    const localT = segT - seg;
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[seg + 1];
    const p3 = points[Math.min(points.length - 1, seg + 2)];
    const pos = catmullRom(p0, p1, p2, p3, localT);
    const aheadT = Math.min(1, localT + 0.04);
    const ahead = catmullRom(p0, p1, p2, p3, aheadT);
    const dx = ahead.x - pos.x;
    const dy = ahead.y - pos.y;
    // SVG nose points LEFT (sharp tip at x≈6); +180 aligns nose with velocity.
    const headingDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
    // Soft wind: nose lifts early (negative pitch in screen Y-down coords ≈ climb),
    // then settles as speed bleeds off near the end.
    const noseLift = -14 * Math.sin(Math.PI * Math.min(1, clamped * 1.15)) * (1 - clamped * 0.55);
    // Gentle bank / paper flutter — not a spin
    const flutter = Math.sin(clamped * Math.PI * 2.4) * 7 * (1 - clamped * 0.65);
    const wobble = Math.sin(clamped * Math.PI * 5.1) * 2.2 * (1 - clamped);
    return {
      x: pos.x,
      y: pos.y,
      angle: headingDeg + noseLift + flutter + wobble,
    };
  }

  function placePlane(x, y, angleDeg, scale, opacity) {
    if (!plane) return;
    // Drive position only via CSS vars + transform — avoids left:0/top:0 flash
    plane.style.setProperty('--px', `${x}px`);
    plane.style.setProperty('--py', `${y}px`);
    plane.style.setProperty('--rot', `${angleDeg}deg`);
    plane.style.setProperty('--sc', String(scale));
    plane.style.opacity = String(opacity);
  }

  async function dismissWithPlane() {
    if (dismissing || !open) return;
    dismissing = true;
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }

    const faqBtn =
      document.querySelector('.sidebar button.nav-item[data-page="faq"]') ||
      document.querySelector('[data-page="faq"]');
    const start = (nextBtn || closeBtn || card)?.getBoundingClientRect?.() || {
      left: window.innerWidth * 0.5,
      top: window.innerHeight * 0.55,
      width: 40,
      height: 40,
    };
    const end = faqBtn?.getBoundingClientRect() || {
      left: 28,
      top: window.innerHeight - 96,
      width: 40,
      height: 40,
    };

    const sx = start.left + start.width / 2;
    const sy = start.top + start.height / 2;
    const tx = end.left + end.width / 2;
    const ty = end.top + end.height / 2;

    card.classList.add('onboarding-fold-away');
    backdrop?.classList.add('onboarding-backdrop-out');

    try {
      if (plane) {
        const path = buildPaperPath(sx, sy, tx, ty);
        const first = samplePath(path, 0);
        placePlane(first.x, first.y, first.angle, 1.15, 1);
        plane.classList.remove('hidden');
        plane.setAttribute('aria-hidden', 'false');
        plane.classList.add('flying');
        // Force layout so first frame isn't 0,0
        void plane.offsetWidth;

        const dur = 2600;
        const t0 = performance.now();
        await new Promise((resolve) => {
          function frame(now) {
            const u = Math.min(1, (now - t0) / dur);
            // Distance along path decelerates; residual “airspeed” for scale
            const along = paperEase(u);
            const sample = samplePath(path, along);
            const airspeed = Math.max(0.18, 1 - along * 0.72);
            const scale = 1.12 * airspeed + 0.28;
            const opacity = 1 - Math.pow(along, 2.4) * 0.2;
            placePlane(sample.x, sample.y, sample.angle, scale, opacity);
            if (u < 1) requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });

        plane.classList.add('folding');
        faqBtn?.classList.add('nav-kinetic-hit');
        setTimeout(() => faqBtn?.classList.remove('nav-kinetic-hit'), 700);
        await wait(320);
      }
    } finally {
      hideInstant();
      resetPlane();
      dismissing = false;
    }
  }

  function next() {
    if (step >= STEPS.length - 1) {
      void dismissWithPlane();
      return;
    }
    step += 1;
    renderStep();
  }

  function bind() {
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
    leadEl = root.querySelector('.ob-lead');
    progressEl = root.querySelector('.ob-progress-bar');
    plane = document.getElementById('onboarding-plane');

    nextBtn?.addEventListener('click', next);
    closeBtn?.addEventListener('click', () => void dismissWithPlane());
    backdrop?.addEventListener('click', () => void dismissWithPlane());
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') void dismissWithPlane();
      if (e.key === 'Enter' && document.activeElement === nextBtn) next();
    });
  }

  function shouldAutoOpen() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  }

  window.HaloOnboarding = {
    open: show,
    reopen() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      show();
    },
  };
  /** Legacy alias used by FAQ “First-time setup”. */
  window.haloOpenSetupGuide = () => window.HaloOnboarding.reopen();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bind();
      if (shouldAutoOpen()) show();
    });
  } else {
    bind();
    if (shouldAutoOpen()) show();
  }
})();
