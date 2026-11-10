// netlify/functions/utils/order-store.js
// Сховище замовлень (Netlify Blobs): checkout.js зберігає товари, wfp-callback.js
// дістає їх для email і Meta CAPI Purchase (WFP не повертає товари в serviceUrl-колбеку), cleanup-orders.js
// видаляє старі записи (у Blobs немає вбудованого TTL)

import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "orders";
export const ORDER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ORDER_READ_RETRY_DELAY_MS = 2000;

// Функції в Lambda-форматі (export handler(event)) — контекст Blobs береться з event.
// Лише eventual consistency: connectLambda не передає uncachedEdgeURL, без якого
// strong-режим падає з BlobsConsistencyError
function openStore(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_PRODUCT_ID_LENGTH = 200;

// productId (шлях сторінки товару, для Meta CAPI) приходить з браузера і в підпис WFP не
// входить — зберігаємо лише масив рядків тієї ж довжини, що й productName, інакше пропускаємо
function sanitizeProductIds(productId, expectedLength) {
  if (!Array.isArray(productId) || productId.length !== expectedLength) return undefined;
  return productId.map((id) => (typeof id === "string" ? id.slice(0, MAX_PRODUCT_ID_LENGTH) : ""));
}

// client — дані браузера покупця з запиту на checkout (getClientContext у meta-capi.js)
export function buildOrderRecord(wfp, now = Date.now(), client = {}) {
  const record = {
    status: "pending",
    productName: wfp.productName.map(String),
    productCount: wfp.productCount.map(String),
    productPrice: wfp.productPrice.map(String),
    amount: String(wfp.amount),
    currency: String(wfp.currency),
    createdAt: now,
  };
  const productId = sanitizeProductIds(wfp.productId, record.productName.length);
  if (productId) record.productId = productId;
  if (client.clientIp) record.clientIp = client.clientIp;
  if (client.clientUserAgent) record.clientUserAgent = client.clientUserAgent;
  if (client.eventSourceUrl) record.eventSourceUrl = client.eventSourceUrl;
  return record;
}

// record -> [{ name, count, price }] для brevo.js
export function getOrderItems(record) {
  if (!record || !Array.isArray(record.productName)) return [];
  return record.productName.map((name, i) => ({
    name,
    count: record.productCount?.[i],
    price: record.productPrice?.[i],
  }));
}

export function isExpired(createdAt, now = Date.now(), ttlMs = ORDER_TTL_MS) {
  const n = Number(createdAt);
  // запис без коректної дати вважаємо простроченим, щоб він не лишився назавжди
  if (!n) return true;
  return now - n > ttlMs;
}

// onlyIfNew — не перезаписуємо існуюче замовлення з тим самим orderReference.
// Повертає true, якщо запис створено
export async function saveOrder(event, wfp, client = {}) {
  const store = openStore(event);
  const record = buildOrderRecord(wfp, Date.now(), client);
  const { modified } = await store.setJSON(String(wfp.orderReference), record, {
    onlyIfNew: true,
    metadata: { createdAt: record.createdAt },
  });
  return modified;
}

// Свіжий запис з checkout.js може ще не поширитись (eventual, до 60 с) — одна повторна спроба
const ORDER_REFERENCE_ATTEMPTS = 5;

// Генерує номер і зберігає товари; номер, який уже є в сховищі (останні 7 днів), → новий номер
export async function saveOrderWithUniqueReference(event, wfp, generateReference, client = {}) {
  for (let attempt = 1; attempt <= ORDER_REFERENCE_ATTEMPTS; attempt++) {
    const orderReference = generateReference();
    if (await saveOrder(event, { ...wfp, orderReference }, client)) return orderReference;
    console.warn("Order reference collision, generating a new one", { orderReference });
  }
  throw new Error(`Could not generate a unique orderReference in ${ORDER_REFERENCE_ATTEMPTS} attempts`);
}

export async function getOrder(event, orderReference, retryDelayMs = ORDER_READ_RETRY_DELAY_MS) {
  const store = openStore(event);
  const key = String(orderReference);
  const order = await store.get(key, { type: "json" });
  if (order || !retryDelayMs) return order;

  await wait(retryDelayMs);
  return store.get(key, { type: "json" });
}

// Замінюємо запис короткою позначкою — повторний колбек WFP не надішле лист вдруге
export async function markEmailSent(event, orderReference) {
  const store = openStore(event);
  const now = Date.now();
  await store.setJSON(String(orderReference), { status: "sent", sentAt: now }, {
    metadata: { createdAt: now },
  });
}

export async function deleteExpiredOrders(event, now = Date.now()) {
  const store = openStore(event);
  const { blobs } = await store.list();
  let deletedCount = 0;

  for (const { key } of blobs) {
    const entry = await store.getMetadata(key);
    if (entry && !isExpired(entry.metadata?.createdAt, now)) continue;
    await store.delete(key);
    deletedCount++;
  }

  return deletedCount;
}
