# Frontend (`src/frontend/`)

Не SPA: один скрипт, який Webflow підвантажує через custom code
`<script src="https://punkt-shop.netlify.app/cart.js">`. Script-теги не підпадають під
CORS, тож інший домен — не проблема (на відміну від `fetch` до функцій, див.
[backend.md](backend.md#cors--utilscorsjs)).

```
src/frontend/
├── cart.js                   # entry point → dist/cart.js
└── utils/
    ├── cart-storage.js       # кошик у localStorage з TTL 3 дні
    ├── wfp.js                # buildWfpPayload, postViaForm (fallback-форма на WFP)
    ├── wfp.test.js           # vitest для wfp.js
    ├── meta-pixel.js         # безпечні події Meta Pixel (AddToCart, InitiateCheckout)
    ├── meta-pixel.test.js    # vitest для meta-pixel.js
    └── fetch-with-retry.js   # fetch з exponential backoff (4xx не ретраїться)
```

## cart.js

- Код загорнутий у `window.Webflow.push(...)` — виконується, коли Webflow готовий
- Додавання: клік по `.js-add-to-cart` усередині `.product`; дані з `data-name`,
  `data-price`, `data-author`, `data-img-src`, `data-product-page` (посилання на сторінку
  товару; зберігається в кошику як `productPageLink` і слугує ID товару для Meta Pixel)
- Рендер у `#cart-product-list`, сума в `#cart-subtotal-num`, блок `#cart-bottom`;
  кнопки `[data-cart="plus-btn"]` / `[data-cart="minus-btn"]`; лічильник у шапці —
  `[data-cart-button="quantity-number"]`
- Оформлення: клік по `.checkout_button` → `buildWfpPayload(cart)` → `POST CHECKOUT_ENDPOINT`
  (через `fetchWithRetry`) → редірект на `payUrl` або `postViaForm`
- `CHECKOUT_ENDPOINT` — `process.env.CHECKOUT_ENDPOINT`, який Parcel підставляє **під час
  білду**; без нього — `https://punkt-shop.netlify.app/.netlify/functions/checkout`
- `CART_PAGE_URL` задано, але редірект після додавання в кошик закоментований

## Meta Pixel (`meta-pixel.js`)

Базовий код пікселя (`fbq('init')` + `PageView`) — у Webflow → Site settings → Custom
code → Head, **не** в бандлі. `cart.js` лише шле події через `trackPixelEvent`, яка
нічого не робить, якщо `fbq` немає (блокувальник), і ковтає його помилки.

- `AddToCart` — всередині `addToCart` після збереження кошика (лише кнопка
  `.js-add-to-cart`, не «+» у кошику): `content_name`, `value` (ціна за 1 шт.),
  `currency: "UAH"`, `content_type: "product"`, `content_ids: [ID товару]`
- `InitiateCheckout` — на початку `submitOrder`, **до** запиту на checkout (поки чекаємо
  бекенд, піксель встигає відправити подію): `value` (сума), `currency`, `num_items`,
  `content_type`, `content_ids` (унікальні коди). Повторно з тим самим кошиком у межах
  сторінки не шлеться (захист від повторних спроб після помилки / «Назад» з WFP)
- `Purchase` з браузера **не** шлеться — його відправляє сервер через Meta CAPI після
  оплати ([backend.md](backend.md#meta-conversions-api--utilsmeta-capijs)). Для нього
  `buildWfpPayload` додає в payload checkout масив `productId` (той самий `getProductId`);
  у WFP і підпис він не йде, `checkout.js` лише зберігає його в Blobs
- ID товару = шлях із `data-product-page` без домену (`getProductId`):
  `https://punkt-otse.webflow.io/books/aeneidos` → `/books/aeneidos`, тож ID однаковий на
  staging і проді. Порожнє посилання → `content_ids` просто не додається

## wfp.js

`buildWfpPayload` формує payload без merchant-полів, підпису й `orderReference` (їх додає
бекенд), валюта `UAH`, мова сторінки оплати `UA`, доставка `nova;nova_pl` (відділення й
поштомати Нової Пошти). `serviceUrl` тут **не** задається — його підставляє `checkout.js`
з ENV. `returnUrl` поки не задано.

## Збірка

`npm run build` → `parcel build src/frontend/cart.js --dist-dir dist` → `dist/cart.js`
(Parcel називає файл за вхідним). Netlify роздає `dist/` (`publish = "dist"`).
