# Backend (Netlify Functions)

Кожна функція — окремий файл у `netlify/functions/`, спільна логіка — у
`netlify/functions/utils/`. Папка `netlify/functions/` комітиться в git (на відміну від
`.netlify/`) — так GitHub → Netlify деплоїть функції автоматично.

Функції в Lambda-форматі (`export async function handler(event)`), ESM-синтаксис;
Netlify транспілює їх через esbuild.

```
netlify/functions/
├── checkout.js          # Purchase: валідація, HMAC-підпис, offline-запит до WFP, fallback на form POST
├── wfp-callback.js      # serviceUrl: перевірка підпису колбеку, ACK для WFP, Brevo email
├── cleanup-orders.js    # scheduled (@daily у netlify.toml): чистка старих записів замовлень
└── utils/
    ├── validate-wfp.js  # типи/діапазони payload, amount == Σ price × count
    ├── order-reference.js # генерація orderReference (8 випадкових цифр)
    ├── order-store.js   # Netlify Blobs: товари замовлення, позначка "лист надіслано"
    ├── brevo.js         # Brevo Transactional Email API
    └── cors.js          # CORS allow-list з кількох доменів
```

## Потік оплати

1. `cart.js` → `POST checkout` з `{ provider: "wayforpay", wfp: {...} }` (payload без
   merchant-полів, підпису й `orderReference`, див. `src/frontend/utils/wfp.js`)
2. `checkout.js`:
   - перевіряє обов'язкові поля й `validateWfpPayload`
   - **генерує `orderReference`** — 8 випадкових цифр (`10000000`–`99999999`, `crypto.randomInt`);
     номер з браузера ігнорується. `saveOrderWithUniqueReference` одразу зберігає товари в
     Netlify Blobs і при збігу з наявним записом генерує новий номер (до 5 спроб). Сховище
     недоступне → номер без перевірки, лист піде без товарів
   - підставляє з ENV `merchantAccount`, `merchantDomainName`, секрет, `serviceUrl`
     (`WFP_SERVICE_URL`; клієнтське значення ігнорується)
   - рахує підпис: `merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName[];productCount[];productPrice[]`
   - шле `POST https://secure.wayforpay.com/pay?behavior=offline`; є `url` → `mode: "offline"`
     (`payUrl`), інакше → `mode: "form"` (фронт сам сабмітить форму). У відповіді також
     `orderReference`

**Ризик збігу номерів.** WFP вимагає унікальний `orderReference` назавжди, а сховище
пам'ятає номери лише 7 днів. 8 цифр = 90 000 000 варіантів: ~50% шанс хоча б одного
збігу на ~11 000 замовленнях за весь час (WFP відхилить таку оплату). Кількість цифр —
`ORDER_REFERENCE_DIGITS` в `utils/order-reference.js`.
3. Після оплати WFP шле колбек на `serviceUrl` → `wfp-callback.js`

## wfp-callback.js

- Парсить тіло гнучко: JSON, form-urlencoded, text/plain, base64
- Підпис колбеку: `merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode`
- Завжди відповідає ACK `{ orderReference, status: "accept", time, signature }`,
  підпис `orderReference;status;time`. Помилки email/сховища ACK не блокують
- Лист шле лише при `transactionStatus === "Approved"` і валідному підписі
- Що WFP **не** повертає в колбеку: товари (`productName[]` тощо), ім'я покупця, адресу
  доставки. Є `email`, `phone`, `amount`, `currency`, `createdDate` тощо
- Опційний форвард нормалізованого payload у Make.com, якщо задано `MAKE_WEBHOOK_URL`
- `DEBUG_WFP_CALLBACK=1` — лог сирого тіла (cardPan/authCode маскуються)

## Email (Brevo) — `utils/brevo.js`

- `POST https://api.brevo.com/v3/smtp/email`, заголовок `api-key`, звичайний `fetch` без SDK
- Шаблон за `BREVO_ORDER_CONFIRMATION_TEMPLATE_ID`; `sender` з `BREVO_SENDER_*`, якщо
  задано, інакше відправник шаблону
- `params`: `orderNumber`, `orderDate`, `phone`, `products`, `total` (`products` і `total` —
  готові рядки: `"Назва ×2 — 400.00, ..."`, `"1250.00 UAH"`)
- В акаунті Brevo **вимкнено блокування невідомих IP** — інакше Netlify Functions
  (динамічні IP) отримують 401

## Товари замовлення — Netlify Blobs (`utils/order-store.js`)

Потрібно, бо WFP не повертає товари в колбеку. Store `orders`, ключ — `orderReference`.

- `checkout.js` → `saveOrderWithUniqueReference` → `saveOrder` (`onlyIfNew`: збіг номера →
  новий номер); збій лише логується
- `wfp-callback.js` → `getOrder` (одна повторна спроба через 2 с) → лист з `products` →
  `markEmailSent` замінює запис на `{ status: "sent" }`, тож повторний колбек лист не
  дублює. Запису немає → лист без товарів + warn у лозі
- `cleanup-orders.js` щодня видаляє записи, старші за 7 днів (вбудованого TTL у Blobs немає)
- Лише **eventual consistency**: `connectLambda(event)` не передає `uncachedEdgeURL`, тож
  `consistency: "strong"` падає з `BlobsConsistencyError`
- Env-змінних не потрібно; `netlify dev` використовує локальне сховище

## CORS — `utils/cors.js`

`fetch` з Webflow до функції — cross-origin, тож `checkout.js` повертає
`Access-Control-Allow-Origin`. `CORS_ALLOWED_ORIGIN` — кілька доменів через кому; у
відповідь іде origin запиту, якщо він у списку. Порожньо = `*`. `wfp-callback.js` викликає
сервер WFP, тож там `*`.

## Логи Netlify (Functions → wfp-callback)

| Ситуація | Лог |
|---|---|
| Колбек не прийшов (немає `serviceUrl`) | нічого; у checkout — warn `WFP_SERVICE_URL is not set` |
| Невалідний підпис | warn `WFP callback signature mismatch` |
| Немає email у колбеку | warn `no customer email in payload` |
| Лист надіслано | `Brevo order confirmation email sent` з `messageId` |
| Повторний колбек | `confirmation email already sent, skipping` |
| Помилка Brevo / сховища | error `Brevo ... failed` / `Order store ... failed` |

## Документація WFP

Purchase API і serviceUrl: https://wiki.wayforpay.com/view/852102 — звіряти перед зміною
підписів. Генератор тестового підпису: https://wiki.wayforpay.com/ru/wiki/default/test
