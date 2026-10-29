# Чекліст перед продом і відкриті TODO

## Вже зроблено

- [x] Netlify env: реальний мерчант WFP (`punktpublishing_com`, `punktpublishing.com`,
  `WFP_SECRET_KEY`, `WFP_TEST_MODE=false`), `WFP_SERVICE_URL`, Brevo-змінні,
  `CORS_ALLOWED_ORIGIN` з трьома доменами — див. [env.md](env.md)
- [x] Brevo: вимкнено блокування невідомих IP, тестовий лист через шаблон доходить
- [x] Шаблон листа: `orderNumber`, `orderDate`, `phone`, `products`, `total`
- [x] Товари в листі (Netlify Blobs) і захист від повторних листів

## Відкрите

- [ ] **Підміна ціни товару** — обов'язково закрити перед реальними платежами.
  `validate-wfp.js` звіряє лише внутрішню узгодженість (`amount == Σ price × count`).
  Якщо клієнт змінить `item.price` у localStorage/DOM до відправки, і `amount`, і
  `productPrice` рахуються з підробленого значення, тож перевірка проходить. Потрібне
  серверне джерело правди по цінах: захардкоджена мапа товар → ціна у функції або запит
  до Webflow CMS API
- [ ] **`returnUrl`** не задано — після оплати покупець лишається на сторінці WFP. Якщо
  потрібна сторінка «Дякуємо» — додати, напр., `WFP_RETURN_URL` і підставляти в `checkout.js`
- [ ] **Email на сторінці оплати** — у кабінеті WFP зробити обов'язковим, інакше колбек
  прийде без `email` і лист не піде
- [ ] **Перевірити `WFP_MERCHANT_DOMAIN`** на першій реальній оплаті: у кабінеті WFP
  вказано `https://punktpublishing.com`, у Netlify — `punktpublishing.com` (без протоколу,
  як у документації). Якщо WFP відхилить підпис/домен — спробувати з протоколом
- [ ] `CART_PAGE_URL` у `cart.js` = `https://punkt-otse.webflow.io/cart`, редірект після
  додавання в кошик вимкнено — вирішити, чи вмикати і на якому домені
- [ ] `DEBUG_WFP_CALLBACK` — переконатися, що в Netlify не задано

## Перевірка після деплою

1. `npm run build` локально проходить без помилок
2. Реальна оплата на мінімальну суму з живого сайту з власним email
3. У логах Netlify (Functions → wfp-callback): `Brevo order confirmation email sent`,
   без `signature mismatch`
4. Лист прийшов, товари й сума коректні; Brevo → Transactional → Logs — `Delivered`
5. CORS: оплата ініціюється з кожного домену з `CORS_ALLOWED_ORIGIN`
