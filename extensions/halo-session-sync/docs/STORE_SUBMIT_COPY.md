# Chrome Web Store — copy/paste for submit (v1.2.3)

## Package

`extensions/halo-session-sync-1.2.3.zip`

## Developer Console

1. Open https://chrome.google.com/webstore/devconsole  
2. Pay one-time developer fee if not done (~$5)  
3. **New item** → upload `halo-session-sync-1.2.3.zip`  
4. Fill fields below → **Submit for review**

---

## Listing

**Name**  
HALO Session Sync

**Summary** (short)  
Sync your LinkedIn and X session with your HALO dashboard in one click.

**Description** (long)

HALO Session Sync is the official companion extension for H.A.L.O. (by WAFFi).

It lets you transfer your own LinkedIn or X (Twitter) session cookies into your own HALO cabinet with one click — no DevTools, no manual cookie paste.

How it works:
1. Sign in with your HALO cabinet email and password.
2. Choose LinkedIn or X — the extension opens that site in your current tab.
3. Make sure you are logged in on that site, then press Synchronize.

Privacy:
- Cookies are read only when you click Synchronize.
- Nothing is collected in the background.
- Session cookies are sent only to your HALO dashboard API.
- Passwords are never stored in the extension.

This extension is intended for H.A.L.O. users. Dashboard password Sign-in remains available as a fallback.

**Category**  
Productivity (or Workflow / Tools)

**Language**  
English

---

## Privacy

**Privacy Policy URL**  
https://small-glenn-field-portal.trycloudflare.com/extension-privacy.html

Confirm in Incognito: page opens, no login wall.

---

## Single purpose

Transfer the user’s own LinkedIn or X session cookies to their HALO cabinet when they click Synchronize.

---

## Permission justifications

**cookies**  
Required to read LinkedIn (`li_at` and related) and X (`auth_token`, `ct0` and related) session cookies only after the user clicks Synchronize, so H.A.L.O. can restore the user’s session in their cabinet.

**storage**  
Stores the HALO session token and last email locally so the user does not re-enter credentials every time. Passwords are never stored. Social cookies are not kept in the extension after Sync.

**activeTab**  
Used when the user interacts with the extension to work with the current browser tab (detect LinkedIn/X and open the chosen network).

**tabs**  
Used to open LinkedIn or X in the current tab after the user picks a network, and to detect whether the active tab is LinkedIn or X before Synchronize.

**Host permissions — linkedin.com / x.com / twitter.com**  
Required for `chrome.cookies` access on those sites and to open them for sync.

**Host permissions — HALO dashboard (trycloudflare / waffiweb)**  
Required to call the HALO login and session-sync API for the user’s cabinet.

---

## Remote code

No — the extension does not execute remote code.

---

## Data usage (privacy practices form)

- Personally identifiable information: Yes (HALO account email used for sign-in; not sold)
- Website content / cookies: Yes — session cookies only on explicit Sync; purpose: app functionality
- Not sold to third parties
- Not used for purposes unrelated to the extension’s single purpose

---

## Screenshots (prepare before submit)

At least one **1280×800** PNG/JPEG. Suggested set:
1. Login screen  
2. Choose LinkedIn / X  
3. Synchronize ready on LinkedIn or X  
4. Active state after sync  

---

## Visibility

Start with **Unlisted** (only people with the link). Switch to Public after approve if you want.
