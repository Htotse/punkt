// netlify/functions/utils/meta-capi.js
// Meta Conversions API (CAPI): подія Purchase з сервера після підтвердженої оплати WFP.
// Браузерний піксель Purchase не бачить — оплата завершується на сторінці WFP.
// PageView/AddToCart/InitiateCheckout ідуть лише з браузера, тож дедуплікація
// браузер↔сервер не потрібна. event_id = orderReference: повторний колбек WFP Meta відкине.
// Документація: https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api

import crypto from "crypto";

const GRAPH_API_VERSION = "v27.0";
const MAX_HEADER_VALUE_LENGTH = 500;

const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Meta: лише цифри з кодом країни. Український номер без коду (0XXXXXXXXX) → 380XXXXXXXXX
export function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `38${digits}`;
  return digits;
}

const truncate = (value) => String(value || "").slice(0, MAX_HEADER_VALUE_LENGTH);

// Дані браузера покупця з запиту на checkout (його шле браузер напряму, не WFP).
// Для подій з action_source "website" Meta вимагає event_source_url і client_user_agent
export function getClientContext(headers = {}) {
  const header = (name) => headers[name] || headers[name.toLowerCase()] || "";
  const forwardedFor = String(header("x-forwarded-for")).split(",")[0].trim();
  return {
    clientIp: truncate(header("x-nf-client-connection-ip") || forwardedFor),
    clientUserAgent: truncate(header("user-agent")),
    eventSourceUrl: truncate(header("referer")),
  };
}

// order — запис з Blobs (може бути null), payment — перевірені підписом поля колбеку WFP
export function buildPurchaseEvent({ orderReference, amount, currency, email, phone, order, now = Date.now() }) {
  const userData = {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedEmail) userData.em = [sha256(normalizedEmail)];
  if (normalizedPhone) userData.ph = [sha256(normalizedPhone)];
  if (order?.clientIp) userData.client_ip_address = order.clientIp;
  if (order?.clientUserAgent) userData.client_user_agent = order.clientUserAgent;

  const customData = {
    value: Number(amount),
    currency: String(currency || "UAH"),
    order_id: String(orderReference),
    content_type: "product",
  };

  const productIds = Array.isArray(order?.productId) ? order.productId : [];
  const contents = productIds
    .map((id, i) => ({
      id,
      quantity: Number(order.productCount?.[i]) || 1,
      item_price: Number(order.productPrice?.[i]) || 0,
    }))
    .filter((item) => item.id);

  if (contents.length > 0) {
    customData.contents = contents;
    customData.content_ids = [...new Set(contents.map((item) => item.id))];
  }
  if (Array.isArray(order?.productCount)) {
    customData.num_items = order.productCount.reduce((sum, count) => sum + (Number(count) || 0), 0);
  }

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(now / 1000),
    event_id: String(orderReference),
    action_source: "website",
    user_data: userData,
    custom_data: customData,
  };
  if (order?.eventSourceUrl) event.event_source_url = order.eventSourceUrl;
  return event;
}

// Без META_PIXEL_ID / META_CAPI_TOKEN — тихо пропускаємо (локальна розробка).
// Кидає помилку, якщо Meta відповіла не 2xx — виклик обгортати в try/catch
export async function sendPurchaseEvent(params) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_TOKEN;
  if (!pixelId || !accessToken) {
    return { skipped: true, reason: "META_PIXEL_ID / META_CAPI_TOKEN not set" };
  }

  const body = { data: [buildPurchaseEvent(params)] };
  const testEventCode = process.env.META_TEST_EVENT_CODE;
  if (testEventCode) body.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Meta CAPI ${response.status}: ${JSON.stringify(result?.error || result)}`);
  }
  return result;
}
