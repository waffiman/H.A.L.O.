# Chrome Web Store — submit now (HALO on trycloudflare)

## Privacy (already live)

Public URL (paste into Store **Privacy Policy** field):

**https://small-glenn-field-portal.trycloudflare.com/extension-privacy.html**

Also linked from HALO landing / dashboard / login footers as `/extension-privacy.html`.

Opens without login (verified).

## API base (already set)

`config.js` → `DEFAULT_API_BASE = https://small-glenn-field-portal.trycloudflare.com`

## Zip (upload this for Chrome Web Store update)

**Ready zip path:**

`c:\Users\micha\OneDrive\Рабочий стол\WAFFi\Cold Outreach Agent\extensions\halo-session-sync-1.3.0.zip`

Rebuild if needed:

```powershell
cd "c:\Users\micha\OneDrive\Рабочий стол\WAFFi\Cold Outreach Agent\extensions\halo-session-sync"
Compress-Archive -Path manifest.json,config.js,background.js,popup.js,popup.html,popup.css,dashboard-bridge.js,icons `
  -DestinationPath ..\halo-session-sync-1.3.0.zip -Force
```

## Store listing essentials

- Name: HALO Session Sync
- Privacy Policy URL: the URL above
- Single purpose: Sync user’s own LinkedIn/X session cookies to their HALO cabinet on explicit Sync
- Justifications: cookies / storage / activeTab / tabs / host permissions as in prior notes
- Screenshots 1280×800
- Visibility: Unlisted (recommended first) or Public

## If tunnel URL ever changes again

1. Update Store Privacy Policy URL to the new `/extension-privacy.html`
2. Bump extension version + new `DEFAULT_API_BASE` + host_permissions → upload new zip

## If Google rejects trycloudflare host

Publish the same text on waffiweb.com and swap only the Privacy URL (extension API can stay on tunnel until you have a stable domain).
