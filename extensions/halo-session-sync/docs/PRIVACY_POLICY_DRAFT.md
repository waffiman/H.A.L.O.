# Privacy Policy draft — HALO Session Sync

Publish this (or an equivalent page) at a stable public URL such as `https://waffiweb.com/privacy-halo-extension` and paste that URL into the Chrome Web Store listing.

## Summary

HALO Session Sync is a Chrome extension by WAFFi for users of the H.A.L.O. product. Its sole purpose is to let you transfer **your own** LinkedIn or X (Twitter) session cookies to **your own** HALO cabinet when you click Sync.

## Data we access

On an explicit Sync click only, the extension may read:

- LinkedIn: session cookie `li_at` and related `linkedin.com` cookies needed to restore the session
- X / Twitter: `auth_token`, `ct0`, and related `x.com` / `twitter.com` cookies

The extension does not read browsing history, does not scrape page content for ads, and does not collect cookies in the background.

## How data is used

Cookies are sent over HTTPS (or your configured HALO API origin) to the HALO dashboard API so H.A.L.O. can run outreach automation as you. They are not used for advertising.

## Third parties

Session cookies are not sold or shared with third parties. They are sent only to the HALO backend operated by WAFFi for your account.

## Storage

- HALO login session token may be stored in `chrome.storage.local` on your device so you do not re-enter the password every time.
- Passwords are never stored in the extension.
- Social session cookies are not kept in the extension after Sync; they are transmitted to HALO once per Sync.

## Security

Transfers use TLS when the HALO API origin is HTTPS. Treat session cookies as full account credentials.

## Deletion / revocation

Use **Log out** in the extension to remove the stored HALO token from this browser. You can also remove the extension. On the HALO side, replace or clear the cabinet session (Sign in again / paste new cookies / contact support).

## Contact

WAFFi — https://waffiweb.com
