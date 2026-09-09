/** HALO Notion 2-click connect — first-time users only */
(function () {
  const STORAGE_DISMISS = 'halo_notion_setup_dismissed';
  const INTEGRATION_URL = 'https://www.notion.so/my-integrations';

  let apiFn = null;
  let onConnected = null;
  let isConfigured = () => true;
  let step = 1;
  let token = '';
  let selectedPageId = '';
  let pages = [];

  const root = () => document.getElementById('notion-connect-root');
  const backdrop = () => root()?.querySelector('.nc-backdrop');
  const card = () => root()?.querySelector('.nc-card');
  const step1 = () => root()?.querySelector('[data-nc-step="1"]');
  const step2 = () => root()?.querySelector('[data-nc-step="2"]');
  const tokenInput = () => root()?.querySelector('#nc-token');
  const pageList = () => root()?.querySelector('#nc-page-list');
  const pageSearch = () => root()?.querySelector('#nc-page-search');
  const statusEl = () => root()?.querySelector('#nc-status');
  const btnValidate = () => root()?.querySelector('#nc-btn-validate');
  const btnProvision = () => root()?.querySelector('#nc-btn-provision');
  const btnBack = () => root()?.querySelector('#nc-btn-back');

  function setStatus(msg, isError = false) {
    const el = statusEl();
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('nc-status-error', !!isError);
  }

  function showStep(n) {
    step = n;
    step1()?.classList.toggle('hidden', n !== 1);
    step2()?.classList.toggle('hidden', n !== 2);
    root()?.querySelectorAll('.nc-dot').forEach((d, i) => {
      d.classList.toggle('active', i + 1 === n);
      d.classList.toggle('done', i + 1 < n);
    });
    btnBack()?.classList.toggle('hidden', n !== 2);
    btnValidate()?.classList.toggle('hidden', n !== 1);
    btnProvision()?.classList.toggle('hidden', n !== 2);
  }

  function open() {
    const el = root();
    if (!el || isConfigured()) return;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    showStep(token && selectedPageId ? 2 : token ? 2 : 1);
    if (tokenInput() && token) tokenInput().value = token;
    if (step === 2) loadPages();
  }

  function close() {
    const el = root();
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_DISMISS, '1');
    } catch {
      /* ignore */
    }
    close();
  }

  function maybeAutoOpen() {
    if (isConfigured()) return;
    try {
      if (localStorage.getItem(STORAGE_DISMISS) === '1') return;
    } catch {
      /* ignore */
    }
    setTimeout(open, 600);
  }

  function renderPages(list) {
    const el = pageList();
    if (!el) return;
    if (!list.length) {
      el.innerHTML =
        '<p class="nc-empty">No pages found. In Notion, open a page → ⋯ → Connections → add your integration, then click Refresh.</p>';
      return;
    }
    el.innerHTML = list
      .map(
        (p) => `<label class="nc-page-item${p.id === selectedPageId ? ' selected' : ''}">
          <input type="radio" name="nc-page" value="${escapeAttr(p.id)}"${p.id === selectedPageId ? ' checked' : ''} />
          <span class="nc-page-title">${escapeHtml(p.title)}</span>
        </label>`
      )
      .join('');
    el.querySelectorAll('input[name="nc-page"]').forEach((input) => {
      input.onchange = () => {
        selectedPageId = input.value;
        el.querySelectorAll('.nc-page-item').forEach((item) => {
          item.classList.toggle('selected', item.querySelector('input')?.value === selectedPageId);
        });
        if (btnProvision()) btnProvision().disabled = !selectedPageId;
      };
    });
    if (btnProvision()) btnProvision().disabled = !selectedPageId;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function loadPages() {
    if (!apiFn || !token) return;
    setStatus('Loading pages…');
    try {
      const q = pageSearch()?.value?.trim() || '';
      const data = await apiFn('/api/notion/pages', {
        method: 'POST',
        body: JSON.stringify({ token, query: q }),
      });
      pages = data.pages || [];
      if (!selectedPageId && pages[0]) selectedPageId = pages[0].id;
      renderPages(pages);
      setStatus(pages.length ? `Found ${pages.length} page(s). Pick where to create the CRM.` : '');
    } catch (e) {
      setStatus(e.message || 'Failed to load pages', true);
      renderPages([]);
    }
  }

  async function validateToken() {
    if (!apiFn) return;
    token = tokenInput()?.value?.trim() || '';
    if (!token) {
      setStatus('Paste your Notion integration token first.', true);
      return;
    }
    if (btnValidate()) btnValidate().disabled = true;
    setStatus('Checking token…');
    try {
      const data = await apiFn('/api/notion/validate', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setStatus(`Connected as ${data.name || 'integration'}.`);
      showStep(2);
      await loadPages();
    } catch (e) {
      setStatus(e.message || 'Invalid token', true);
    } finally {
      if (btnValidate()) btnValidate().disabled = false;
    }
  }

  async function provision() {
    if (!apiFn || !token || !selectedPageId) return;
    if (btnProvision()) btnProvision().disabled = true;
    setStatus('Creating H.A.L.O. CRM database…');
    try {
      const data = await apiFn('/api/notion/provision', {
        method: 'POST',
        body: JSON.stringify({ token, parentPageId: selectedPageId }),
      });
      setStatus('CRM ready!');
      close();
      if (typeof onConnected === 'function') await onConnected(data);
      window.dispatchEvent(new CustomEvent('halo-notion-connected', { detail: data }));
    } catch (e) {
      setStatus(e.message || 'Failed to create CRM', true);
      if (btnProvision()) btnProvision().disabled = !selectedPageId;
    }
  }

  function bindEvents() {
    root()?.querySelector('.nc-close')?.addEventListener('click', dismiss);
    backdrop()?.addEventListener('click', dismiss);
    root()?.querySelector('.nc-later')?.addEventListener('click', dismiss);
    btnValidate()?.addEventListener('click', validateToken);
    btnProvision()?.addEventListener('click', provision);
    btnBack()?.addEventListener('click', () => {
      showStep(1);
      setStatus('');
    });
    root()?.querySelector('#nc-btn-refresh-pages')?.addEventListener('click', loadPages);
    pageSearch()?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadPages();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root() && !root().classList.contains('hidden')) dismiss();
    });
  }

  function init({ api, onConnected: cb, isConfigured: configuredFn }) {
    apiFn = api;
    onConnected = cb;
    isConfigured = configuredFn || isConfigured;
    bindEvents();
  }

  window.HaloNotionConnect = { init, open, close, maybeAutoOpen, isDismissed: () => {
    try { return localStorage.getItem(STORAGE_DISMISS) === '1'; } catch { return false; }
  }};
})();
