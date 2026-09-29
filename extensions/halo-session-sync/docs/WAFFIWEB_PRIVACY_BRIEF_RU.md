# Инструкция для команды waffiweb.com — Privacy Policy для Chrome-расширения HALO

## Зачем

Google Chrome Web Store требует **публичный HTTPS URL** Privacy Policy для расширения с правом `cookies` (**HALO Session Sync**). Страница должна открываться **без логина**.

## Можно ли не на waffiweb.com?

**Да.** Подойдёт любой стабильный публичный URL, например:

- лендинг / статика HALO: `https://<ваш-halo-host>/extension-privacy.html` (уже есть в репо HALO)
- или страница на `https://waffiweb.com/...`

Нельзя: страница только за логином дашборда, PDF в Google Drive «по запросу», localhost.

## Если публикуете на waffiweb.com (предпочтительно для бренда)

Сделайте **одну** публичную страницу, например:

`https://waffiweb.com/privacy-halo-extension`

или

`https://waffiweb.com/halo/extension-privacy`

### Обязательное содержание (коротко)

1. **Какие данные:** session cookies LinkedIn (`li_at` и связанные) и X (`auth_token`, `ct0` и связанные) — **только по клику Sync**.
2. **Зачем:** перенос сессии в личный кабинет HALO для автоматизации outreach.
3. **Третьим лицам:** не продаём / не передаём; только на бэкенд HALO (WAFFi).
4. **Хранение:** JWT HALO может лежать в `chrome.storage.local`; пароли не храним; cookies соцсетей в расширении после Sync не копим.
5. **Безопасность:** HTTPS / TLS.
6. **Удаление:** Log out в расширении / удаление расширения.
7. **Контакт:** waffiweb.com (или support email).

Готовый текст (EN): в репо HALO  
`extensions/halo-session-sync/docs/PRIVACY_POLICY_DRAFT.md`  
и HTML-версия на HALO: `dashboard/public/extension-privacy.html`.

### Техтребования

- [ ] HTTP **200**, без редиректа на логин
- [ ] HTTPS (валидный сертификат)
- [ ] Индексация не обязательна; URL должен открываться в инкогнито
- [ ] После публикации прислать **финальный URL** команде HALO для поля Privacy Policy в Chrome Web Store

### Чего не нужно

- Не нужна отдельная политика для всего сайта, если уже есть — достаточно **dedicated** страницы про расширение (или явная секция с якорем, если Google примет; надёжнее отдельный URL).
- Не встраивать форму логина на эту страницу.
