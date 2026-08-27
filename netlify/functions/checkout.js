// Netlify Function: WayForPay Purchase (offline-first, fallback to form POST)
// Важливо: merchantAccount / merchantDomainName / secret беремо лише з ENV!

import crypto from "crypto";

export async function handler(event) {
  const allowOrigin = process.env.CORS_ALLOWED_ORIGIN || "*";
  const cors = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { provider, wfp } = body || {};

    if (provider !== "wayforpay" || !wfp) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: "Bad request: expected { provider:'wayforpay', wfp:{...} }" }),
      };
    }

    // ---- серверні захищені значення з ENV
    const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT;
    const MERCHANT_DOMAIN  = process.env.WFP_MERCHANT_DOMAIN;
    const SECRET = process.env.WFP_TEST_MODE === "true"
      ? process.env.WFP_TEST_SECRET_KEY
      : process.env.WFP_SECRET_KEY;

    if (!MERCHANT_ACCOUNT || !MERCHANT_DOMAIN || !SECRET) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: "Missing env vars: WFP_MERCHANT_ACCOUNT / WFP_MERCHANT_DOMAIN / WFP_SECRET_KEY (or WFP_TEST_SECRET_KEY)" })
      };
    }

    // ---- мінімальна валідація payload (окрім merchant-полів, які ми перезапишемо)
    const required = [
      "orderReference",
      "orderDate",
      "amount",
      "currency",
      "productName",
      "productPrice",
      "productCount",
    ];
    for (const k of required) {
      if (wfp[k] == null) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: `Missing field: ${k}` }) };
      }
    }
    if (
      !Array.isArray(wfp.productName) ||
      !Array.isArray(wfp.productPrice) ||
      !Array.isArray(wfp.productCount) ||
      wfp.productName.length !== wfp.productPrice.length ||
      wfp.productName.length !== wfp.productCount.length
    ) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: "productName/productPrice/productCount must be arrays of equal length" }),
      };
    }

    // ---- Серверний baseline полів (перезаписуємо потенційно клієнтські значення)
    const baseFields = {
      merchantAccount: MERCHANT_ACCOUNT,
      merchantAuthType: wfp.merchantAuthType || "SimpleSignature",
      merchantDomainName: MERCHANT_DOMAIN,
      merchantTransactionType: wfp.merchantTransactionType || "AUTO",
      merchantTransactionSecureType: wfp.merchantTransactionSecureType || "AUTO",
      apiVersion: wfp.apiVersion || "1",
      language: wfp.language || "EN",
      defaultPaymentSystem: wfp.defaultPaymentSystem || "card",

      // Обов'язкові з клієнта
      orderReference: String(wfp.orderReference),
      orderDate: String(wfp.orderDate), // UNIX seconds
      amount: String(wfp.amount),       // "N.NN"
      currency: String(wfp.currency),   // "UAH" | "EUR" | інше, якщо ввімкнено
    };

    // ---- Підпис (HMAC_MD5) згідно з докою WFP:
    // merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName[];productCount[];productPrice[]
    const baseParts = [
      String(baseFields.merchantAccount),
      String(baseFields.merchantDomainName),
      String(baseFields.orderReference),
      String(baseFields.orderDate),
      String(baseFields.amount),
      String(baseFields.currency),
      ...wfp.productName.map(String),
      ...wfp.productCount.map(String),
      ...wfp.productPrice.map(String),
    ];
    const baseString = baseParts.join(";");

    const merchantSignature = crypto
      .createHmac("md5", SECRET)
      .update(baseString, "utf8")
      .digest("hex");

    // ---- Прокидаємо додаткові поля (опціональні)
    const passthrough = [
      "returnUrl",
      "serviceUrl",
      "paymentSystems",
      "deliveryList",
      "clientFirstName",
      "clientLastName",
      "clientEmail",
      "clientPhone",
      "orderTimeout",
      "orderLifetime",
      "alternativeCurrency",
      "alternativeAmount",
      "regularMode",
      "regularAmount",
      "dateNext",
      "dateEnd",
      "regularCount",
      "regularOn",
      "regularBehavior",
    ];
    const optionalFields = {};
    for (const k of passthrough) {
      if (wfp[k] != null && wfp[k] !== "") optionalFields[k] = String(wfp[k]);
    }

    // ---- Фінальний payload для запиту
    const payload = {
      ...baseFields,
      merchantSignature,
    };

    // ---- OFFLINE спроба (JSON-відповідь з URL)
    const form = new URLSearchParams();
    Object.entries({ ...payload, ...optionalFields }).forEach(([k, v]) => form.append(k, v));
    (wfp.productName || []).forEach((v) => form.append("productName[]", String(v)));
    (wfp.productPrice || []).forEach((v) => form.append("productPrice[]", String(v)));
    (wfp.productCount || []).forEach((v) => form.append("productCount[]", String(v)));

    let offlineJson = null;
    try {
      const r = await fetch("https://secure.wayforpay.com/pay?behavior=offline", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
        },
        body: form.toString(),
      });
      offlineJson = await r.json().catch(() => null);
    } catch (e) {
      console.warn("WayForPay offline request failed:", e);
    }

    if (offlineJson && offlineJson.url) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          success: true,
          provider: "wayforpay",
          mode: "offline",
          payUrl: offlineJson.url,
        }),
      };
    }

    // ---- Fallback: фронт відправить звичайну форму POST на платіжну сторінку
    const fieldsForForm = {
      ...payload,
      ...optionalFields,
      "productName[]": (wfp.productName || []).map(String),
      "productPrice[]": (wfp.productPrice || []).map(String),
      "productCount[]": (wfp.productCount || []).map(String),
    };

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        provider: "wayforpay",
        mode: "form",
        wfp: {
          actionUrl: "https://secure.wayforpay.com/pay",
          fields: fieldsForForm,
        },
      }),
    };
  } catch (err) {
    console.error("WFP checkout error:", err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
}
