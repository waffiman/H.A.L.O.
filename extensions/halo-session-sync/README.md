# HALO Session Sync (Chrome MV3)

Official companion extension for [H.A.L.O.](https://waffiweb.com): one-click sync of **your own** LinkedIn / X session cookies into your HALO cabinet.

## What it does

1. You sign in to HALO (same email/password as the dashboard), or reuse an existing dashboard session.
2. You open `linkedin.com` or `x.com` while signed in.
3. You click **Sync session**.
4. The extension reads only the needed session cookies (`li_at` / `auth_token`+`ct0` and related jar entries) and `POST`s them to `/api/extension/sync-session`.

Cookies are read **only on explicit Sync**. Nothing is harvested in the background.

## Load unpacked (dev)

1. Deploy/restart `outreach-dashboard` so Bearer auth + `/api/extension/sync-session` are live.
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select this folder.
3. In the popup, set **HALO API URL** to your dashboard origin (e.g. `http://31.70.101.111:3080` or your HTTPS host).
4. Sign in → open LinkedIn or X → Sync.

## Configure API base for Store builds

Edit [`config.js`](config.js) `DEFAULT_API_BASE` to your **stable HTTPS** `HALO_PUBLIC_URL` before packaging the zip for Chrome Web Store.

## Privacy

Public policy (no login): `https://<halo-host>/extension-privacy.html`  
Draft source: `docs/PRIVACY_POLICY_DRAFT.md`. Store listing must link the public HTTPS URL. Fallback host: waffiweb.com if needed.

## Packaging for Chrome Web Store

```bash
# from this folder
zip -r ../halo-session-sync-1.0.0.zip . -x "*.md" -x "scripts/*" -x "docs/*" -x ".* "
```

Include: `manifest.json`, `*.js`, `popup.html`, `popup.css`, `icons/*` (logo.svg + PNGs).

## Non-goals

Does not replace dashboard LinkedIn/X password Sign-in — that path stays available.
