# Локальна розробка, тести, деплой

## Інфраструктура

- GitHub `github.com/Htotse/punkt` → Netlify, сайт **punkt-shop**
  (`https://punkt-shop.netlify.app`, admin: `https://app.netlify.com/projects/punkt-shop`),
  підключений через `netlify link`
- `netlify-cli` — devDependency, запускати через `npx netlify ...`

## Локальна розробка

```
npm run dev
```

`scripts/dev.sh` піднімає одночасно:
1. `parcel watch src/frontend/cart.js --dist-dir dist` — перезбірка фронту при змінах
2. `netlify dev --live` — функції з `netlify/functions` **і публічний тунель**

У виводі шукати публічний URL (`https://<random>--<site>.netlify.live` або
`Live Dev Server: ...`) — його підставляти, коли WFP чи реальний Webflow мають
достукатись до локальних функцій. Для локального тесту колбеку WFP задати в `.env`
`WFP_SERVICE_URL=<live-url>/.netlify/functions/wfp-callback`. `Ctrl+C` зупиняє обидва процеси.

`netlify.toml` → `[dev]` навмисно **без** `command`: `netlify dev` лише роздає `dist/` і
функції. `parcel watch` порт не відкриває, тож `netlify dev` завис би, чекаючи на нього.

`netlify dev` не завжди перезавантажує змінені модулі функцій — якщо поведінка не
змінилась після правки, перезапустити сервер.

### Тестова сторінка

`test/local-preview.html` — тестові товари (`.product`, `.js-add-to-cart`,
`#cart-product-list`, `.checkout_button`) і заглушка `window.Webflow = { push: fn => fn() }`;
підвантажує `../dist/cart.js`. Дає перевірити кошик і checkout без живого Webflow.

### Тестові листи

Локальні тести з email у колбеку шлють **справжні** листи через Brevo — вказувати свою
адресу. Тестові картки WFP sandbox: https://wiki.wayforpay.com/view/852472

## Юніт-тести

`npm test` (vitest) — чисті функції: `src/frontend/utils/wfp.js`,
`netlify/functions/utils/order-store.js`, `netlify/functions/utils/cors.js`,
`netlify/functions/utils/order-reference.js`.
DOM-логіку `cart.js` юніт-тестами не покриваємо (для цього — E2E).

## MCP-інструменти (local scope)

- **Playwright MCP** (`claude mcp add playwright npx @playwright/mcp@latest`) — керувати
  браузером: клікати по `test/local-preview.html`, заповнювати генератор тестового підпису
  WFP і читати обчислений `merchantSignature`
- **Brevo MCP** (`claude mcp add --transport http brevo https://mcp.brevo.com/v1/brevo/mcp
  --header "Authorization: Bearer <token>"`) — токен у Brevo: Account → SMTP & API →
  API Keys з увімкненою опцією MCP

## Деплой

Push у `main` → Netlify сам запускає `npm run build` і деплоїть `dist/` та
`netlify/functions/`. Ручний деплой не потрібен. У проді задано реальний мерчант WFP,
тож push у `main` = реальні платежі. Перед релізом — [prod-checklist.md](prod-checklist.md).
