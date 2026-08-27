# Punkt Cart & Checkout

## Опис проекту

Кастомний JS-код кошика та checkout-логіки для сайту на **Webflow**. Скрипт вбудовується
в Webflow через custom code (`<script src="...">`) і не є SPA/React-застосунком — це
незалежний проект від глобального JS-стеку.

Функціонал:
- Кошик у `localStorage` (з TTL 3 дні): додавання, +/-, видалення, рендер
- Ініціація оплати через **WayForPay** (Purchase, offline-режим з підписом на бекенді)
- Підтвердження замовлень / email-сповіщення через **Brevo SMTP** (бекенд, буде додано)

## Стек і залежності

- **Хостинг/деплой**: GitHub (`github.com/Htotse/punkt`) → Netlify, сайт **punkt-shop**
  (`https://punkt-shop.netlify.app`, admin: `https://app.netlify.com/projects/punkt-shop`),
  підключений через `netlify link`; авто-білд і деплой при push у `main`
- **Бекенд**: Netlify Functions (Node.js, серверні функції для checkout/webhook)
- **Платежі**: WayForPay API (HMAC-підпис рахується на бекенді, ніколи на фронтенді)
- **Email**: Brevo SMTP (транзакційні листи, логіка на бекенді)
- **Frontend bundler**: Parcel 2 (`parcel build` / `parcel watch`)
- **Мова**: vanilla JavaScript (ES-модулі), без фреймворків і без TypeScript
- **Локальна розробка**: `netlify-cli` (devDependency) для `netlify dev` і тестового тунелю
- **Юніт-тести**: `vitest` (devDependency), `npm test` — поки покриває лише чисті функції
  в `src/frontend/utils/wfp.js` (payload для WayForPay); DOM-логіку в `cart.js` юніт-тестами
  не покриваємо (для цього краще E2E)
- **Playwright MCP**: підключений локально для цього проєкту (`claude mcp add playwright npx @playwright/mcp@latest`,
  local scope) — дає змогу керувати реальним браузером під час сесії: перевіряти
  `test/local-preview.html` (клік по кнопках кошика), а також заповнювати форму
  генератора тестового підпису WFP і читати обчислене JS значення `merchantSignature`

> Примітка: глобальні правила користувача (React 18, Radix UI тощо) стосуються інших
> проектів. Тут стек навмисно інший — vanilla JS, бо код вбудовується в Webflow як
> зовнішній `<script>`.

## Структура репозиторію

```
punkt-cart-and-checkout/
├── netlify.toml              # build/publish/functions конфіг Netlify
├── package.json
├── .env.example               # перелік потрібних env-змінних (без значень)
├── src/
│   └── frontend/
│       ├── cart.js            # entry point, збирається Parcel у dist/cart.js
│       ├── utils/
│       │   ├── cart-storage.js  # localStorage кошика (get/set з TTL)
│       │   └── wfp.js           # payload для WayForPay, postViaForm fallback
│       └── styles/             # кастомні стилі кошика (поки порожньо)
├── netlify/
│   └── functions/
│       ├── checkout.js         # Purchase: рахує HMAC-підпис, offline-запит з fallback на form POST
│       └── wfp-callback.js     # serviceUrl webhook: перевірка підпису колбеку, ACK-відповідь WFP
├── test/
│   └── local-preview.html      # HTML-харнес для локального тестування без Webflow
└── dist/                       # build output Parcel (у .gitignore)
```

## Frontend-конвенції

- Логіка кошика — у `src/frontend/cart.js`, який імпортує утиліти з `src/frontend/utils/`
- Нову логіку виносити в окремі утиліти в `utils/`, а не розростати `cart.js`
- Кастомні стилі — у `src/frontend/styles/` (окремо від Webflow-стилів)
- Збірка: `npm run build` → `dist/cart.js` (Parcel називає вихідний файл за іменем
  вхідного — `src/frontend/cart.js`). Netlify роздає `dist/` як статику
  (`publish = "dist"` у `netlify.toml`), тому в проді скрипт доступний за
  `https://punkt-shop.netlify.app/cart.js` — саме цей URL вставляється в Webflow
  custom code як `<script src="...">`
- Script-теги не підпадають під CORS — підвантаження самого скрипта з іншого домену не проблема

## Backend-конвенції (netlify/functions)

- Кожна функція — окремий файл у `netlify/functions/`
- HMAC-підпис WayForPay рахується **лише на бекенді**, ніколи у фронтенд-коді
- **CORS**: на відміну від `<script src>`, виклик `fetch(CHECKOUT_ENDPOINT)` з `cart.js`
  до Netlify Function — це cross-origin XHR-запит (домен Webflow ≠ домен Netlify).
  Кожна функція має повертати `Access-Control-Allow-Origin` з дозволеним доменом
  Webflow-сайту, інакше запит впаде через CORS. `checkout.js` вже підставляє
  `WFP_MERCHANT_DOMAIN` замість wildcard, якщо змінна задана — див. TODO нижче
  щодо самого домену
- `netlify/functions/` **комітиться в git** (на відміну від `.netlify/`, яку ігнорує git) —
  саме так GitHub → Netlify інтеграція деплоїть функції автоматично при push
- `checkout.js` — створення платіжної сесії WFP (Purchase, offline-режим з fallback на
  form POST). `wfp-callback.js` — обробка серверного колбеку WFP (`serviceUrl`), перевірка
  підпису, ACK-відповідь. Секрет для обох береться через `WFP_TEST_MODE`-перемикач
  (`WFP_SECRET_KEY` для live / `WFP_TEST_SECRET_KEY` для тестового режиму) — обидві функції
  мають лишатись синхронізованими за цим прапорцем, інакше підпис на checkout і перевірка
  на callback розійдуться
- `wfp-callback.js` опційно форвардить нормалізований payload колбеку у зовнішню
  автоматизацію (напр. Make.com) — вимкнено за замовчуванням, активується лише якщо
  задано `MAKE_WEBHOOK_URL`
- Відправка email через Brevo SMTP після успішної оплати — ще не реалізована,
  див. TODO нижче

## Env-змінні

Перелік у `.env.example`. Реальні значення:
- Локально — `.env` у корені (в `.gitignore`, ніколи не комітити)
- Прод — Netlify UI → Site settings → Environment variables

## Локальна розробка й тестування (без деплою на кожен чих)

Один термінал, одна команда:

```
npm run dev
```

Це запускає `scripts/dev.sh`, який одночасно піднімає:
1. `parcel watch src/frontend/cart.js --dist-dir dist` — фонова збірка фронтенду при кожній зміні
2. `netlify dev --live` — локальний сервер з функціями (`netlify/functions`) **і публічним тунелем**

У виводі `netlify dev --live` шукайте рядок з публічним URL (виду `https://<random>--<site-name>.netlify.live` або `Live Dev Server: ...`) — саме його підставляти в тестові конфіги (`CHECKOUT_ENDPOINT` для перевірки бекенду з реального Webflow-домену тощо). `Ctrl+C` зупиняє обидва процеси одночасно.

`netlify.toml` → `[dev]` навмисно **без** `command` — `netlify dev` лише роздає `dist/` як статику й обслуговує `netlify/functions/`, а не намагається сам запускати `parcel watch` (той не відкриває порт, тож `netlify dev` завис би, якби чекав його як proxy-сервер).

Додатково: відкрити `test/local-preview.html` — мінімальний харнес з тестовими товарами
(`.product`, `.js-add-to-cart`, `#cart-container`, `.checkout-button`) і заглушкою
`window.Webflow` (реальний Webflow-рушій сам виконує чергу `Webflow.push(fn)`; тут її
імітує `{ push: fn => fn() }`), що підвантажує `../dist/cart.js` — дозволяє перевірити
кошик і чекаут, не чіпаючи живий Webflow-сайт.

## Деплой

Push у `main` на GitHub → Netlify автоматично білдить (`npm run build` з `netlify.toml`)
і деплоїть і статику (`dist/`), і функції (`netlify/functions/`). Ручний деплой не потрібен.

**Перед публікацією на прод з реальними клієнтськими токенами WFP** — пройтись за
чеклістом [`PROD_CHECKLIST.md`](./PROD_CHECKLIST.md) (env-змінні в Netlify UI, заміна
`CHECKOUT_ENDPOINT`/CORS з локальних/sandbox значень на прод, Brevo).

## Конвенції коду/гіту (успадковано з глобального CLAUDE.md)

- Commit-повідомлення: `type: короткий опис` (`feat:`, `fix:`, `refactor:`, `chore:`)
- При коміті — сам аналізувати зміни й пропонувати повідомлення
- Завжди питати підтвердження перед `git push`
- Ніколи не пушити напряму в `main`
- Питати перед додаванням нових npm-пакетів
- Функціональні модулі маленькі й сфокусовані; описові англомовні назви змінних

## Відкриті питання / TODO

- [ ] Спільна утиліта Brevo-клієнта + виклик у `wfp-callback.js` після успішної оплати
  (`success && isSignatureValid`) — зараз там лише TODO-коментар
- [ ] Точний домен Webflow-сайту для `WFP_MERCHANT_DOMAIN` і CORS allow-list
  (`checkout.js` вже готовий підставити його замість `*`, щойно значення відоме)
- [ ] `CHECKOUT_ENDPOINT` у `src/frontend/cart.js` — зараз порожній, заповнити після деплою першої функції
- [ ] `CART_PAGE_URL` у `src/frontend/cart.js` — зараз порожній (редірект після додавання в кошик вимкнено), заповнити продовим URL сторінки кошика перед деплоєм
- [ ] Формат і вміст email-шаблонів Brevo (підтвердження замовлення)

_Цей файл оновлюватиметься по мірі додавання бекенд-файлів._
