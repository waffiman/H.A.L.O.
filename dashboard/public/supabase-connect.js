/** HALO Supabase connect — one 3-step wizard (SQL + credentials + finish) */
(function () {
  const STORAGE_DISMISS = 'halo_supabase_setup_dismissed';

  let apiFn = null;
  let onConnected = null;
  let isConfigured = () => false;
  let step = 1;
  let projectUrl = '';
  let serviceRoleKey = '';
  let schemaSql = '';
  let eventsBound = false;

  const root = () => document.getElementById('supabase-connect-root');
  const backdrop = () => root()?.querySelector('.sc-backdrop');
  const urlInput = () => root()?.querySelector('#sc-url');
  const keyInput = () => root()?.querySelector('#sc-key');
  const statusEl = () => root()?.querySelector('#sc-status');
  const status3El = () => root()?.querySelector('#sc-status-3');
  const btnPrimary = () => root()?.querySelector('#sc-btn-primary');
  const btnBack = () => root()?.querySelector('#sc-btn-back');
  const schemaPre = () => root()?.querySelector('#sc-schema-sql');

  function setStatus(msg, isError = false, target = 2) {
    const el = target === 3 ? status3El() : statusEl();
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('nc-status-error', !!isError);
  }

  function showStep(n) {
    step = n;
    root()?.querySelectorAll('[data-sc-step]').forEach((el) => {
      el.classList.toggle('hidden', Number(el.getAttribute('data-sc-step')) !== n);
    });
    root()?.querySelectorAll('.sc-dot').forEach((d, i) => {
      d.classList.toggle('active', i + 1 === n);
      d.classList.toggle('done', i + 1 < n);
    });
    btnBack()?.classList.toggle('hidden', n === 1);
    const btn = btnPrimary();
    if (btn) {
      btn.disabled = false;
      btn.textContent = n === 3 ? 'Connect CRM' : 'Continue';
    }
    if (n === 1) setStatus('', false, 2);
    if (n !== 3) setStatus('', false, 3);
  }

  function openConnect() {
    const el = root();
    if (!el) return;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    showStep(1);
    loadSchemaIfNeeded();
    if (urlInput() && projectUrl) urlInput().value = projectUrl;
    if (keyInput() && serviceRoleKey) keyInput().value = serviceRoleKey;
  }

  /** Same wizard — kept for older call sites */
  function openGuide() {
    openConnect();
  }

  function closeConnect() {
    const el = root();
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }

  function closeGuide() {
    closeConnect();
  }

  function dismissConnect() {
    try {
      localStorage.setItem(STORAGE_DISMISS, '1');
    } catch {
      /* ignore */
    }
    closeConnect();
  }

  async function loadSchemaIfNeeded() {
    const pre = schemaPre();
    if (schemaSql) {
      if (pre) pre.textContent = schemaSql;
      return;
    }
    if (!apiFn) return;
    if (pre) pre.textContent = 'Loading schema…';
    try {
      const data = await apiFn('/api/crm/schema');
      schemaSql = data.sql || '';
      if (pre) pre.textContent = schemaSql || '-- Empty schema response';
    } catch (e) {
      if (pre) pre.textContent = `-- Failed to load schema: ${e.message || 'error'}`;
    }
  }

  /**
   * Copy text to the clipboard.
   * navigator.clipboard exists only in a secure context (https or localhost),
   * so a dashboard opened over plain http at a LAN/VPS address has no Clipboard
   * API at all — fall back to execCommand there.
   * @param {string} text
   * @returns {Promise<boolean>} true when the text actually reached the clipboard
   */
  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* denied or unavailable — try the legacy path below */
    }
    let ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
    }
  }

  /**
   * The schema <pre> ships as .sr-only (clipped to 1px), so anything written
   * into it — including load errors — is invisible. Reveal it whenever the user
   * needs to read or hand-copy the SQL.
   */
  function revealSchemaBlock() {
    const pre = schemaPre();
    if (!pre) return;
    pre.classList.remove('sr-only');
    pre.classList.add('sg-schema-visible');
    pre.removeAttribute('aria-hidden');
    try {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* selection is a convenience, not required */
    }
  }

  /** Transient label on the Copy SQL button (step 1 has no status line). */
  function flashCopyButton(msg) {
    const btn = root()?.querySelector('#sc-copy-schema');
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = msg;
    clearTimeout(flashCopyButton.timer);
    flashCopyButton.timer = setTimeout(() => {
      btn.textContent = btn.dataset.label;
    }, 2400);
  }

  async function copySchema() {
    await loadSchemaIfNeeded();
    if (!schemaSql) {
      // loadSchemaIfNeeded() wrote the reason into the (hidden) <pre> — show it
      // instead of leaving the button looking dead.
      revealSchemaBlock();
      flashCopyButton('Could not load SQL');
      return;
    }
    if (await writeClipboard(schemaSql)) {
      flashCopyButton('Copied!');
      return;
    }
    revealSchemaBlock();
    flashCopyButton('Copy manually ↓');
  }

  async function validateCredentials() {
    if (!apiFn) return false;
    projectUrl = urlInput()?.value?.trim() || '';
    serviceRoleKey = keyInput()?.value?.trim() || '';
    if (!projectUrl) {
      setStatus('Paste your Supabase Project URL first.', true, 2);
      return false;
    }
    if (!serviceRoleKey) {
      setStatus('Paste your service_role key first.', true, 2);
      return false;
    }
    const btn = btnPrimary();
    if (btn) btn.disabled = true;
    setStatus('Checking connection and leads table…', false, 2);
    try {
      await apiFn('/api/supabase/validate', {
        method: 'POST',
        body: JSON.stringify({ url: projectUrl, serviceRoleKey }),
      });
      setStatus('Connection OK — leads table found.', false, 2);
      return true;
    } catch (e) {
      const msg = e.message || 'Validation failed';
      if (/does not exist|relation.*leads|PGRST205|Could not find the table/i.test(msg)) {
        setStatus(
          'Keys work, but the leads table is missing. Go Back → Step 1, Copy SQL, run it in Supabase SQL Editor, then Continue again.',
          true,
          2
        );
      } else if (/JWT|Invalid API key|401|403/i.test(msg)) {
        setStatus('Invalid URL or service_role key. Check Project Settings → API.', true, 2);
      } else {
        setStatus(msg, true, 2);
      }
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function connect() {
    if (!apiFn || !projectUrl || !serviceRoleKey) return;
    const btn = btnPrimary();
    if (btn) btn.disabled = true;
    setStatus('Saving Supabase CRM…', false, 3);
    try {
      const data = await apiFn('/api/supabase/provision', {
        method: 'POST',
        body: JSON.stringify({ url: projectUrl, serviceRoleKey }),
      });
      setStatus('CRM connected!', false, 3);
      closeConnect();
      if (typeof onConnected === 'function') await onConnected(data);
      window.dispatchEvent(new CustomEvent('halo-supabase-connected', { detail: data }));
    } catch (e) {
      setStatus(e.message || 'Failed to connect', true, 3);
      if (btn) btn.disabled = false;
    }
  }

  async function onPrimary() {
    if (step === 1) {
      showStep(2);
      return;
    }
    if (step === 2) {
      const ok = await validateCredentials();
      if (ok) showStep(3);
      return;
    }
    if (step === 3) await connect();
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    root()?.querySelector('.sc-close')?.addEventListener('click', dismissConnect);
    backdrop()?.addEventListener('click', dismissConnect);
    root()?.querySelector('.sc-later')?.addEventListener('click', dismissConnect);
    btnPrimary()?.addEventListener('click', () => {
      onPrimary().catch(() => {});
    });
    btnBack()?.addEventListener('click', () => {
      if (step === 3) showStep(2);
      else showStep(1);
      setStatus('', false, 2);
      setStatus('', false, 3);
    });
    root()?.querySelector('#sc-copy-schema')?.addEventListener('click', () => {
      copySchema().catch(() => {});
    });

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (root() && !root().classList.contains('hidden')) dismissConnect();
    });
  }

  function init({ api, onConnected: cb, isConfigured: configuredFn }) {
    apiFn = api;
    onConnected = cb;
    isConfigured = configuredFn || isConfigured;
    bindEvents();
  }

  window.HaloSupabaseConnect = {
    init,
    openConnect,
    openGuide,
    closeConnect,
    closeGuide,
    loadSchemaIfNeeded,
  };
})();
