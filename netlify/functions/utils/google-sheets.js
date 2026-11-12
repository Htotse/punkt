// netlify/functions/utils/google-sheets.js
// Форвард колбеку WFP у Google Apps Script, який пише замовлення в Google Sheet
// (аркуші "success" / "no success" / "_wayforpay_log"). Скрипт читає поля у форматі
// колбеку WFP, тож шлемо їх під тими самими іменами — без перетворень.
// Apps Script не бачить заголовків запиту, тому спільний секрет іде в тілі (поле `secret`).

const REQUEST_TIMEOUT_MS = 7000;

// Лише поля, які читає скрипт (+ причина відмови для "no success").
// cardPan, authCode і підпис WFP у таблицю не потрапляють
const FORWARDED_FIELDS = [
  "orderReference",
  "transactionStatus",
  "reason",
  "reasonCode",
  "amount",
  "currency",
  "createdDate",
  "processingDate",
  "email",
  "phone",
  "clientName",
  "deliveryName",
  "deliveryPhone",
  "deliveryAddress",
  "products",
  "productName",
  "productCount",
  "productPrice",
  "clientFields",
  "clientComment",
];

export function buildSheetsPayload(callbackData, secret) {
  const payload = {};
  for (const field of FORWARDED_FIELDS) {
    if (callbackData?.[field] != null) payload[field] = callbackData[field];
  }
  payload.secret = secret;
  return payload;
}

// Без GOOGLE_SHEETS_WEBHOOK_URL / _SECRET — пропускаємо (локальна розробка).
// Кидає помилку при не-2xx або відповіді скрипта "error: ..." — виклик обгортати в try/catch
export async function sendOrderToSheets(callbackData) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!webhookUrl || !secret) {
    return { skipped: true, reason: "GOOGLE_SHEETS_WEBHOOK_URL / GOOGLE_SHEETS_WEBHOOK_SECRET not set" };
  }

  // /exec відповідає 302 на script.googleusercontent.com — fetch іде за редиректом сам
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSheetsPayload(callbackData, secret)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = (await response.text().catch(() => "")).trim();
  if (!response.ok || /^error/i.test(text)) {
    throw new Error(`Google Sheets ${response.status}: ${text.slice(0, 300)}`);
  }
  return { result: text };
}
