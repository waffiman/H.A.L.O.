// Fixed banner on non-prod environments, so the two dashboards can't be confused.
fetch('/api/health', { credentials: 'same-origin' })
  .then((r) => r.json())
  .then(({ env }) => {
    if (env !== 'preprod') return;
    const bar = document.createElement('div');
    bar.textContent = 'PRE-PROD: test environment, no real clients or outreach';
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;padding:3px 8px;text-align:center;' +
      'font:600 12px/1.4 system-ui,sans-serif;background:#f5c518;color:#111;pointer-events:none';
    document.body.append(bar);
  })
  .catch(() => {});
