# Frontend (`src/frontend/`)

Не SPA: один скрипт, який Webflow підвантажує через custom code
`<script src="https://punkt-shop.netlify.app/cart.js">`. Script-теги не підпадають під
CORS, тож інший домен — не проблема (на відміну від `fetch` до функцій, див.
[backend.md](backend.md#cors--utilscorsjs)).

```
src/frontend/
├── cart.js                   # entry point → dist/cart.js
├── utils/
│   ├── cart-storage.js       # кошик у localStorage з TTL 3 дні
│   ├── wfp.js                # buildWfpPayload, postViaForm (fallback-форма на WFP)
│   ├── wfp.test.js           # vitest для wfp.js
│   └── fetch-with-retry.js   # fetch з exponential backoff (4xx не ретраїться)
└── styles/                   # кастомні стилі кошика, окремо від Webflow (поки порожньо)
```

## cart.js

- Код загорнутий у `window.Webflow.push(...)` — виконується, коли Webflow готовий
- Додавання: клік по `.js-add-to-cart` усередині `.product`; дані з `data-name`,
  `data-price`, `data-author`, `data-img-src`, `data-product-page`
- Рендер у `#cart-product-list`, сума в `#cart-subtotal-num`, блок `#cart-bottom`;
  кнопки `[data-cart="plus-btn"]` / `[data-cart="minus-btn"]`; лічильник у шапці —
  `[data-cart-button="quantity-number"]`
- Оформлення: клік по `.checkout_button` → `buildWfpPayload(cart)` → `POST CHECKOUT_ENDPOINT`
  (через `fetchWithRetry`) → редірект на `payUrl` або `postViaForm`
- `CHECKOUT_ENDPOINT` — `process.env.CHECKOUT_ENDPOINT`, який Parcel підставляє **під час
  білду**; без нього — `https://punkt-shop.netlify.app/.netlify/functions/checkout`
- `CART_PAGE_URL` задано, але редірект після додавання в кошик закоментований

## wfp.js

`buildWfpPayload` формує payload без merchant-полів, підпису й `orderReference` (їх додає
бекенд), валюта `UAH`, мова сторінки оплати `UA`, доставка `nova;nova_pl` (відділення й
поштомати Нової Пошти). `serviceUrl` тут **не** задається — його підставляє `checkout.js`
з ENV. `returnUrl` поки не задано.

## Збірка

`npm run build` → `parcel build src/frontend/cart.js --dist-dir dist` → `dist/cart.js`
(Parcel називає файл за вхідним). Netlify роздає `dist/` (`publish = "dist"`).
