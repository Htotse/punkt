// netlify/functions/utils/cors.js
// CORS allow-list: CORS_ALLOWED_ORIGIN може містити кілька доменів через кому.
// Браузер приймає в Access-Control-Allow-Origin лише одне значення, тому повертаємо
// той origin запиту, який є у списку

const normalizeOrigin = (origin) => String(origin || "").trim().replace(/\/+$/, "").toLowerCase();

export function parseAllowedOrigins(value) {
  return String(value || "")
    .split(/[,;\s]+/)
    .map(normalizeOrigin)
    .filter(Boolean);
}

// Порожній список = "*" (локальна розробка). Origin не зі списку отримує перший
// дозволений домен — браузер такий запит заблокує
export function resolveAllowOrigin(requestOrigin, allowedOrigins) {
  if (allowedOrigins.length === 0) return "*";
  const origin = normalizeOrigin(requestOrigin);
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

export function getCorsHeaders(event) {
  const headers = event.headers || {};
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGIN);
  return {
    "Access-Control-Allow-Origin": resolveAllowOrigin(headers.origin || headers.Origin, allowedOrigins),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
