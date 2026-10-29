// netlify/functions/utils/order-reference.js

import crypto from "crypto";

export const ORDER_REFERENCE_DIGITS = 8;

export function generateOrderReference(digits = ORDER_REFERENCE_DIGITS) {
  const min = 10 ** (digits - 1);
  return String(crypto.randomInt(min, 10 ** digits));
}
