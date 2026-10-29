# Punkt Cart & Checkout

Кастомний кошик і checkout для Webflow-сайту `punktpublishing.com`. Скрипт `dist/cart.js`
вбудовується у Webflow як зовнішній `<script src>`; бекенд — Netlify Functions:
оплата через **WayForPay**, email-підтвердження через **Brevo**.

> Стек навмисно відрізняється від глобального CLAUDE.md (React, Radix тощо): тут
> **vanilla JS (ES-модулі), без фреймворків і TypeScript**, фронт збирає Parcel 2.

## Ключові правила

- HMAC-підпис WayForPay рахується **лише на бекенді**, ніколи у фронтенд-коді
- `checkout.js` і `wfp-callback.js` беруть секрет через один перемикач `WFP_TEST_MODE`
  (`WFP_SECRET_KEY` / `WFP_TEST_SECRET_KEY`) — тримати їх синхронними, інакше підпис
  на checkout і перевірка на callback розійдуться
- Порядок полів у рядку підпису WFP — строго за документацією, не з пам'яті
- Нову логіку виносити в окремі модулі `utils/`, а не розростати `cart.js` чи функції
- Секрети — лише в `.env` (локально, не комітити) і Netlify env (прод)
- Push у `main` = деплой на прод з реальними платежами

## Git

- Commit: `type: короткий опис` (`feat:` / `fix:` / `refactor:` / `chore:`); повідомлення
  пропонувати самому, проаналізувавши зміни
- Завжди питати підтвердження перед `git push`; не пушити напряму в `main`
- Питати перед додаванням нових npm-пакетів

## Документація — читати перед роботою з відповідною частиною

| Задача | Файл |
|---|---|
| Netlify Functions: checkout, WFP-колбек, підписи, Brevo, Netlify Blobs, CORS | [docs/backend.md](docs/backend.md) |
| `cart.js`, Parcel, вбудовування у Webflow, тестова HTML-сторінка | [docs/frontend.md](docs/frontend.md) |
| Env-змінні: де використовуються, що обов'язкове, що задано в Netlify | [docs/env.md](docs/env.md) |
| Локальна розробка, тести, MCP-інструменти, деплой | [docs/dev-and-deploy.md](docs/dev-and-deploy.md) |
| Перед продом / відкриті TODO / захист checkout | [docs/prod-checklist.md](docs/prod-checklist.md) |

Оновлювати відповідний файл у `docs/`, коли змінюється описана там логіка.
