# Чекліст перед продом (WayForPay checkout)

Актуально з моменту, коли з'являються реальні клієнтські токени WFP і проект іде на прод.
До того часу бекенд працює на публічному sandbox-акаунті WFP (`test_merch_n1`,
`WFP_TEST_MODE=true`) — див. `.env.example`.

## 1. Netlify UI → Environment variables (сайт `punkt-shop`)

Локальний `.env` у git не потрапляє — реальні прод-значення треба вручну внести в
**Site settings → Environment variables**:

- `WFP_MERCHANT_ACCOUNT` — реальний клієнтський merchantAccount (замість `test_merch_n1`)
- `WFP_SECRET_KEY` — реальний live-секрет (замість порожнього)
- `WFP_MERCHANT_DOMAIN` — реальний домен, зареєстрований у WFP (без протоколу)
- `WFP_TEST_MODE` — виставити `false` (або прибрати змінну) — інакше прод далі
  підписуватиме sandbox-ключем
- `WFP_TEST_SECRET_KEY` — можна лишити для майбутніх sandbox-тестів або прибрати
- `WFP_SERVICE_URL` — прод-URL колбеку, `https://punkt-shop.netlify.app/.netlify/functions/wfp-callback`
- `CORS_ALLOWED_ORIGIN` — реальний Webflow-домен (напр. `https://punkt-otse.webflow.io`
  або кастомний домен), замість `*`
- `CHECKOUT_ENDPOINT` — прод-URL `checkout`-функції. **Не обов'язково**: якщо не задати,
  `cart.js` збереться із запасним дефолтом `https://punkt-shop.netlify.app/.netlify/functions/checkout`
  (Parcel інлайнить значення на етапі `npm run build`, який Netlify запускає сам при
  push у `main` — переконатись, що змінна виставлена в Netlify UI **до** build, а не
  лише в рантайм-конфізі функцій, бо для фронтенду це build-time підстановка)
- `BREVO_SMTP_HOST/PORT/LOGIN/PASSWORD/SENDER_EMAIL` — коли буде готова Brevo-інтеграція
- `MAKE_WEBHOOK_URL` — лишити порожнім, якщо Make.com не використовується (за
  замовчуванням форвард вимкнено)
- `DEBUG_WFP_CALLBACK` — прибрати/лишити порожнім у проді (не логувати деталі оплат)

## 2. Код у репозиторії

- **`src/frontend/cart.js`** — `CHECKOUT_ENDPOINT` більше не хардкодиться в коді:
  береться з env-змінної на етапі build (Parcel інлайнить `process.env.CHECKOUT_ENDPOINT`),
  з фолбеком на прод-URL `punkt-shop.netlify.app`. Нічого руками правити не треба —
  досить переконатись, що build запускається з правильним значенням змінної (див. п.1)
- **`src/frontend/cart.js:17`** — `CART_PAGE_URL` уже стоїть на
  `https://punkt-otse.webflow.io/cart` — перевірити, що це фінальний URL сторінки кошика
  (зараз редірект після додавання в кошик вимкнений закоментованим блоком `63-66` —
  рішення, чи вмикати, лишається відкритим)
- **`netlify/functions/checkout.js`** — передати в WFP payload реальний `serviceUrl`
  (з `WFP_SERVICE_URL`) і `returnUrl`, якщо вони мають надсилатись з бекенду, а не з
  фронтового `wfp.js` (зараз опційні поля йдуть лише якщо фронт їх передав — перевірити,
  чи `buildWfpPayload` у `wfp.js` взагалі їх формує)

## 3. Перевірка перед публікацією

- `npm run build` локально — переконатись, що прод-збірка проходить без помилок
- Тестовий платіж через сам прод (або staging-гілку Netlify preview) з реальними, але
  мінімальними сумами — переконатись, що `wfp-callback` реально отримує колбек від WFP
  на прод-домені (тут вже не обійтись без тунелю чи прямого прод-деплою, бо WFP має
  достукатись ззовні)
- Перевірити CORS у бою: `fetch` з реального Webflow-сайту до `checkout` — має пройти
  саме з виставленим `CORS_ALLOWED_ORIGIN`, а не залишковим `*`

## 4. Відкрите — Brevo (з CLAUDE.md TODO)

Поки що `wfp-callback.js` не відправляє email — там лише TODO-коментар у гілці
`success && isSignatureValid`. Це окрема робота: написати Brevo SMTP-клієнта і
підключити його до callback перед продом, якщо email-підтвердження критичне для запуску.
