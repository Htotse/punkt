// netlify/functions/cleanup-orders.js
// Scheduled function (розклад у netlify.toml): видаляє записи замовлень зі сховища,
// старші за 7 днів — і неоплачені, і позначки "лист надіслано"

import { deleteExpiredOrders } from "./utils/order-store.js";

export async function handler(event) {
  try {
    const deletedCount = await deleteExpiredOrders(event);
    console.log(`cleanup-orders: deleted ${deletedCount} expired order records`);
    return { statusCode: 200, body: "" };
  } catch (e) {
    console.error("cleanup-orders failed:", e);
    return { statusCode: 500, body: "" };
  }
}
