// netlify/functions/wfp-callback.js
// WayForPay — serviceUrl callback handler (Netlify Functions)
// 1) Приймає POST від WFP (JSON / x-www-form-urlencoded / text/plain)
// 2) Перевіряє підпис (HMAC-MD5) callback-а
// 3) Відповідає WFP JSON'ом {orderReference, status:"accept", time, signature}
// 4) TODO: відправка email-підтвердження через Brevo SMTP (після успішної оплати)

import crypto from "crypto";

// Дебаг-лог вмикається лише явно через ENV DEBUG_WFP_CALLBACK=1
const DEBUG = process.env.DEBUG_WFP_CALLBACK === "1";

// HMAC-MD5 → hex
function hmacMd5Hex(message, secret) {
  return crypto.createHmac("md5", secret).update(message, "utf8").digest("hex");
}

// Безпечний String
const s = (v) => (v == null ? "" : String(v));

// Надійне читання тіла з підтримкою base64 і "кривих" content-type
async function readBodyFlexible(event) {
  let raw = event.body || "";
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(raw, "base64").toString("utf8"); } catch (_) {}
  }

  const headers = event.headers || {};
  const ct = (headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
  const trimmed = raw.trim();

  if (DEBUG) {
    console.log("WFP CT:", ct || "<none>");
    console.log("WFP RAW:", trimmed.slice(0, 200));
  }

  // 1) JSON або text/plain з JSON
  if (ct.includes("application/json") || ct.includes("text/plain")) {
    try { const o = JSON.parse(trimmed); if (o && typeof o === "object") return o; } catch (_) {}
  }

  // 2) FORM-URLENCODED
  if (ct.includes("application/x-www-form-urlencoded")) {
    // 2a) Евристика: форма, але всередині чистий JSON
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try { const o = JSON.parse(trimmed); if (o && typeof o === "object") return o; } catch (_) {}
    }
    // 2b) Звичайний розбір форми
    try {
      const params = new URLSearchParams(raw);
      const obj = {};
      let count = 0;
      let firstKey = null;
      for (const [k, v] of params.entries()) {
        if (count === 0) firstKey = k;
        obj[k] = v;
        count++;
      }
      // 2c) Евристика: одна пара, ключ схожий на JSON — парсимо ключ
      if (count === 1 && firstKey && firstKey.trim().startsWith("{")) {
        try {
          const decoded = decodeURIComponent(firstKey);
          const maybe = JSON.parse(decoded);
          if (maybe && typeof maybe === "object") return maybe;
        } catch (_) {}
        try {
          const maybe2 = JSON.parse(firstKey);
          if (maybe2 && typeof maybe2 === "object") return maybe2;
        } catch (_) {}
      }
      return obj;
    } catch (_) {}
  }

  // 3) Фолбек: спробувати JSON за замовчуванням
  try { const o = JSON.parse(trimmed); if (o && typeof o === "object") return o; } catch (_) {}

  // 4) Останній шанс — querystring
  const qs = event.queryStringParameters || {};
  if (Object.keys(qs).length > 0) return qs;

  return {};
}

export async function handler(event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ error: "Method Not Allowed. Expecting POST to serviceUrl." }),
    };
  }

  // 1) Тіло
  const data = await readBodyFlexible(event);

  if (DEBUG) {
    // Лог без чутливих полів
    const safeLog = { ...data };
    if (safeLog.cardPan) safeLog.cardPan = "<masked>";
    if (safeLog.authCode) safeLog.authCode = "<hidden>";
    console.log("WFP callback raw (safe):", JSON.stringify(safeLog).slice(0, 2000));
  }

  // 2) Секрет — той самий live/test перемикач, що й у checkout.js
  const SECRET = process.env.WFP_TEST_MODE === "true"
    ? process.env.WFP_TEST_SECRET_KEY
    : process.env.WFP_SECRET_KEY;

  if (!SECRET) {
    console.error("Missing WFP secret env var");
  }

  // 3) Дістаємо поля
  const merchantAccount   = s(data.merchantAccount);
  const orderReference    = s(data.orderReference);
  const amount            = s(data.amount);
  const currency          = s(data.currency);
  const authCode          = s(data.authCode);
  const cardPan           = s(data.cardPan);
  const transactionStatus = s(data.transactionStatus);
  const reasonCode        = s(data.reasonCode);

  // Підпис від WFP — інколи приходить як "merchantSignature", інколи як "signature"
  const merchantSignature = s(data.merchantSignature || data.signature);

  // 4) Перевірка підпису відповідного callback (Purchase/serviceUrl):
  let isSignatureValid = false;
  if (SECRET) {
    const message = [
      merchantAccount,
      orderReference,
      amount,
      currency,
      authCode,
      cardPan,
      transactionStatus,
      reasonCode,
    ].join(";");

    const calcSig = hmacMd5Hex(message, SECRET);
    isSignatureValid = calcSig === merchantSignature;

    if (!isSignatureValid) {
      console.warn("WFP callback signature mismatch", {
        orderReference,
        expected: calcSig,
        got: merchantSignature || "<empty>",
      });
    }
  }

  // 5) Збираємо ACK для WFP (обов'язкова відповідь)
  const status = "accept";
  const time = Math.floor(Date.now() / 1000);
  let responseSignature = "no-secret";
  if (SECRET) {
    responseSignature = hmacMd5Hex([orderReference, status, String(time)].join(";"), SECRET);
  }

  const ackBody = {
    orderReference,
    status,
    time,
    signature: responseSignature,
  };

  const success = transactionStatus === "Approved";

  // 6) TODO(Brevo): після success && isSignatureValid — надіслати email-підтвердження
  // замовлення через Brevo SMTP (спільна утиліта ще не написана, див. CLAUDE.md TODO).

  // 7) Опційний форвард нормалізованого payload у зовнішню автоматизацію (Make.com тощо).
  // Вимкнено за замовчуванням — активується лише якщо задано MAKE_WEBHOOK_URL в ENV.
  const makeUrl = process.env.MAKE_WEBHOOK_URL || "";
  if (makeUrl) {
    const forwardPayload = {
      provider: "wayforpay",
      ok: success && isSignatureValid,
      signatureValid: isSignatureValid,
      merchantAccount,
      orderReference,
      amount,
      currency,
      transactionStatus,
      reason: s(data.reason),
      reasonCode,
      authCode,
      cardPan,
      cardType: s(data.cardType),
      issuerBankCountry: s(data.issuerBankCountry),
      issuerBankName: s(data.issuerBankName),
      createdDate: s(data.createdDate),
      processingDate: s(data.processingDate),
      settlementDate: s(data.settlementDate),
      clientFirstName: s(data.clientFirstName),
      clientLastName: s(data.clientLastName),
      clientEmail: s(data.email || data.clientEmail),
      clientPhone: s(data.phone || data.clientPhone),
      productName: Array.isArray(data.productName) ? data.productName : (data.productName ? [data.productName] : []),
      productCount: Array.isArray(data.productCount) ? data.productCount : (data.productCount ? [data.productCount] : []),
      productPrice: Array.isArray(data.productPrice) ? data.productPrice : (data.productPrice ? [data.productPrice] : []),
      deliveryList: s(data.deliveryList),
      alternativeCurrency: s(data.alternativeCurrency),
      alternativeAmount: s(data.alternativeAmount),
      raw: data,
    };

    try {
      await fetch(makeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forwardPayload),
      });
    } catch (e) {
      console.error("Forward to Make failed:", e);
    }
  } else if (DEBUG) {
    console.warn("MAKE_WEBHOOK_URL is not set — skipping forward to Make");
  }

  // 8) Відповідь WFP
  return {
    statusCode: 200,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify(ackBody),
  };
}
