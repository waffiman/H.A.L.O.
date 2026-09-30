# Задача для команды waffiweb.com — Privacy Policy для Chrome-расширения HALO

**Приоритет:** высокий (блокер для публикации в Chrome Web Store)  
**Продукт:** Chrome-расширение **HALO Session Sync** (WAFFi / H.A.L.O.)  
**Язык страницы:** English (основной текст для Google; RU-перевод опционально)  
**Срок:** как можно скорее; после деплоя прислать финальный URL в HALO-чат

---

## Цель

Опубликовать **публичную** страницу Privacy Policy на `waffiweb.com`, чтобы указать её URL в поле **Privacy Policy** листинга Chrome Web Store. Google требует стабильный HTTPS URL без логина для расширений с правом `cookies`.

Эфемерный Cloudflare-туннель HALO для Store **не подходит** (URL меняется после reboot). Нужен постоянный URL на waffiweb.

---

## Что сделать

1. Создать отдельную публичную страницу (не за логином, не за Basic Auth).
2. Предпочтительные URL (любой один — главное зафиксировать и не менять без уведомления):

   - `https://waffiweb.com/privacy-halo-extension`  
   - или `https://waffiweb.com/halo/extension-privacy`  
   - или `https://waffiweb.com/legal/halo-session-sync-privacy`

3. Контент — готовый EN-текст ниже (можно сверстать в стиле сайта; смысл не менять).
4. Опционально: ссылка «Privacy — HALO Session Sync» в футере waffiweb.com.
5. После деплоя: прислать **точный финальный URL** + скрин/подтверждение, что открывается в инкогнито без логина.

---

## Acceptance criteria

- [ ] `GET` → **HTTP 200** (или один 301 на канонический HTTPS, без цепочки на логин)
- [ ] **HTTPS**, валидный сертификат
- [ ] Открывается в **Incognito** без cookies / без аккаунта
- [ ] Нет формы логина, нет paywall, нет «request access»
- [ ] На странице явно названо расширение **HALO Session Sync** и компания **WAFFi**
- [ ] Есть дата **Last updated** (можно `2026-09-29` или дата публикации)
- [ ] Финальный URL передан команде HALO

Индексация в Google Search **не обязательна**.

---

## Готовый текст страницы (EN) — вставить как есть

**Title:** Privacy Policy — HALO Session Sync  

**Last updated:** 2026-09-29 · Product of WAFFi / H.A.L.O.

HALO Session Sync is a Chrome extension for H.A.L.O. users. Its single purpose is to let you transfer **your own** LinkedIn or X (Twitter) session cookies to **your own** HALO cabinet when you click Sync.

### Data we access

Only after an explicit Sync click, the extension may read:

- LinkedIn: `li_at` and related `linkedin.com` cookies needed to restore the session
- X / Twitter: `auth_token`, `ct0`, and related `x.com` / `twitter.com` cookies

It does not read browsing history, does not scrape pages for ads, and does not collect cookies in the background.

### How data is used

Cookies are sent to the HALO dashboard API so H.A.L.O. can run outreach automation on your behalf. They are not used for advertising or sold.

### Third parties

Session cookies are not shared with third parties. They are sent only to the HALO backend operated by WAFFi for your account.

### Storage

- A HALO login session token may be stored in `chrome.storage.local` on your device.
- Passwords are never stored in the extension.
- Social session cookies are not kept in the extension after Sync; they are transmitted once per Sync.

### Security

Transfers use HTTPS/TLS when the HALO API origin is HTTPS. Treat session cookies as full account credentials.

### Deletion

Use **Log out** in the extension to remove the stored HALO token, or uninstall the extension. You can also replace the cabinet session from the HALO dashboard.

### Contact

https://waffiweb.com

---

## Чего не нужно

- Не копировать весь сайт Privacy Policy WAFFi целиком, если он про другое — нужна **dedicated** страница про расширение (или явный якорь; надёжнее отдельный URL).
- Не встраивать логин / кабинет HALO на эту страницу.
- Не ставить noindex ради «скрытности» так, чтобы страница отдавала ошибку ботам Google (обычный публичный HTML ок).

---

## После публикации (для HALO-команды, не для waffiweb)

1. URL → поле Privacy Policy в Chrome Web Store.  
2. При желании обновить футеры HALO, чтобы Privacy вел на waffiweb URL.  
3. `DEFAULT_API_BASE` расширения — отдельно; это **не** обязанность waffiweb (только Privacy page).

---

## Контакт / вопросы

Писать в HALO / WAFFi ops-чат. Референс HTML уже есть в репо HALO: `dashboard/public/extension-privacy.html`.
