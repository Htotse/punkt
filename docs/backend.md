# Backend (Netlify Functions)

Кожна функція — окремий файл у `netlify/functions/`, спільна логіка — у
`netlify/functions/utils/`. Папка `netlify/functions/` комітиться в git (на відміну від
`.netlify/`) — так GitHub → Netlify деплоїть функції автоматично.

Функції в Lambda-форматі (`export async function handler(event)`), ESM-синтаксис;
Netlify транспілює їх через esbuild.

```
netlify/functions/
├── checkout.js          # Purchase: валідація, HMAC-підпис, offline-запит до WFP, fallback на form POST
├── wfp-callback.js      # serviceUrl: перевірка підпису колбеку, ACK для WFP, Meta Purchase, Brevo email
├── cleanup-orders.js    # scheduled (@daily у netlify.toml): чистка старих записів замовлень
└── utils/
    ├── validate-wfp.js  # типи/діапазони payload, amount == Σ price × count
    ├── order-reference.js # генерація orderReference (8 випадкових цифр)
    ├── order-store.js   # Netlify Blobs: товари замовлення, позначка "лист надіслано"
    ├── brevo.js         # Brevo Transactional Email API
    ├── meta-capi.js     # Meta Conversions API: подія Purchase
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
- Purchase у Meta і лист шле лише при `transactionStatus === "Approved"` і валідному
  підписі; Purchase — **перед** листом, бо `markEmailSent` стирає товари із запису
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

## Meta Conversions API — `utils/meta-capi.js`

Розподіл подій: `PageView` / `AddToCart` / `InitiateCheckout` — **лише браузерний піксель**
(див. [frontend.md](frontend.md#meta-pixel-meta-pixeljs)), `Purchase` — **лише сервер**
(оплата завершується на сторінці WFP, піксель її не бачить). Кожна подія йде одним каналом,
тож дедуплікація браузер↔сервер не потрібна.

- `POST https://graph.facebook.com/v27.0/{META_PIXEL_ID}/events`, токен `META_CAPI_TOKEN`
- `event_id` = `orderReference` — повторний колбек до позначки `sent` Meta відкине як дубль
- `user_data`: `em`/`ph` (SHA-256 після нормалізації: email lowercase, телефон лише цифри з
  `380`), `client_ip_address`, `client_user_agent`
- `custom_data`: `value`/`currency` з колбеку (перевірені підписом), `order_id`, `num_items`,
  `contents` + `content_ids` — ID товару = шлях сторінки, той самий, що в AddToCart
- IP, User-Agent і `event_source_url` (referer) `checkout.js` бере із заголовків запиту
  браузера (`getClientContext`) і зберігає в Blobs; для `action_source: "website"` Meta їх
  вимагає. Cookies `_fbp`/`_fbc` не передаються
- Немає `META_PIXEL_ID`/`META_CAPI_TOKEN` → warn і пропуск. Помилка Meta не блокує лист і ACK,
  але й не повторюється (якщо лист пішов, запис уже `sent`)
- `META_TEST_EVENT_CODE` → подія видна в Events Manager → Test events; у проді не задавати

## Товари замовлення — Netlify Blobs (`utils/order-store.js`)

Потрібно, бо WFP не повертає товари в колбеку. Store `orders`, ключ — `orderReference`.

- `checkout.js` → `saveOrderWithUniqueReference` → `saveOrder` (`onlyIfNew`: збіг номера →
  новий номер); збій лише логується
- Запис: `productName`/`productCount`/`productPrice`, `amount`, `currency`, а для Meta CAPI —
  `productId` (з браузера, у підпис WFP не входить; приймається лише масив рядків тієї ж
  довжини), `clientIp`, `clientUserAgent`, `eventSourceUrl`
- `wfp-callback.js` → `getOrder` (одна повторна спроба через 2 с) → Meta Purchase → лист з `products` →
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
| Purchase у Meta | `Meta CAPI Purchase sent` з `eventsReceived` |
| Немає env Meta | warn `Meta CAPI Purchase skipped` |
| Повторний колбек | `order already processed (email + Meta Purchase), skipping` |
| Помилка Brevo / Meta / сховища | error `Brevo ... failed` / `Meta CAPI Purchase failed` / `Order store ... failed` |

## Документація WFP

Purchase API і serviceUrl: https://wiki.wayforpay.com/view/852102 — звіряти перед зміною
підписів. Генератор тестового підпису: https://wiki.wayforpay.com/ru/wiki/default/test
