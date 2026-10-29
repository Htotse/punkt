# Env-змінні

Перелік без значень — `.env.example`. Реальні значення:
- **Локально** — `.env` у корені (у `.gitignore`); тримати **тестовий** мерчант WFP
  (`test_merch_n1`, `WFP_TEST_MODE=true`), щоб локальні тести не проводили реальні оплати
- **Прод** — Netlify env (UI або `npx netlify env:set KEY "value"`). Нові значення діють
  лише після наступного деплою. `.env` і `.env.production` Netlify **не читає**

| Змінна | Де | Для чого | Прод (Netlify) |
|---|---|---|---|
| `WFP_MERCHANT_ACCOUNT` | checkout | merchantAccount у підписі | `punktpublishing_com` |
| `WFP_MERCHANT_DOMAIN` | checkout | merchantDomainName, без протоколу | `punktpublishing.com` |
| `WFP_SECRET_KEY` | checkout, wfp-callback | live-секрет HMAC | задано |
| `WFP_TEST_SECRET_KEY` | checkout, wfp-callback | секрет sandbox | задано (не використовується) |
| `WFP_TEST_MODE` | checkout, wfp-callback | `"true"` → тестовий секрет | `false` |
| `WFP_SERVICE_URL` | checkout | `serviceUrl` для колбеку; без нього листів немає | `https://punkt-shop.netlify.app/.netlify/functions/wfp-callback` |
| `BREVO_API_KEY` | brevo | авторизація Brevo API | задано |
| `BREVO_ORDER_CONFIRMATION_TEMPLATE_ID` | brevo | ID шаблону листа | задано |
| `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | brevo | відправник (опційно) | задано |
| `CORS_ALLOWED_ORIGIN` | checkout | allow-list через кому; порожньо = `*` | `https://punkt-otse.webflow.io,https://www.punktpublishing.com,https://punktpublishing.com` |
| `CHECKOUT_ENDPOINT` | cart.js (build-time) | URL checkout-функції | не задано (дефолт — прод-URL) |
| `MAKE_WEBHOOK_URL` | wfp-callback | форвард колбеку в Make.com | не задано (вимкнено) |
| `DEBUG_WFP_CALLBACK` | wfp-callback | `"1"` → лог сирого колбеку | не задавати в проді |

Обов'язкові для email-підтвердження: `WFP_SERVICE_URL`, секрет WFP (через
`WFP_TEST_MODE`), `BREVO_API_KEY`, `BREVO_ORDER_CONFIRMATION_TEMPLATE_ID`.
Netlify Blobs окремих змінних не потребує.

WFP і Brevo змінювати разом у межах сервісу: `WFP_MERCHANT_ACCOUNT`, `WFP_SECRET_KEY`,
`WFP_MERCHANT_DOMAIN` і `WFP_TEST_MODE` мають належати одному мерчанту, інакше WFP
відхилить підпис.
