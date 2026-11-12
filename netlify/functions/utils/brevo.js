// netlify/functions/utils/brevo.js
// Brevo Transactional Email API (https://api.brevo.com/v3/smtp/email)

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendTransactionalEmail({ to, templateId, params, sender }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("Missing BREVO_API_KEY env var");
  if (!templateId) throw new Error("Missing templateId (BREVO_ORDER_CONFIRMATION_TEMPLATE_ID?)");
  if (!to || !to.email) throw new Error("Missing recipient email");

  const body = {
    to: [{ email: to.email, name: to.name || undefined }],
    templateId: Number(templateId),
    params,
  };
  if (sender) body.sender = sender;

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brevo API error ${res.status}: ${text}`);
  }

  return res.json().catch(() => null);
}

// items: [{ name, count, price }] -> "Назва ×к-сть — ціна, ..."
function formatProducts(items) {
  return items
    .map(({ name, count, price }) => `${name} ×${count} — ${price}`)
    .join(", ");
}

// WFP createdDate — unix-секунди
function formatOrderDate(createdDate) {
  const n = Number(createdDate);
  if (!n) return "";
  return new Date(n * 1000).toLocaleDateString("uk-UA");
}

// WFP deliveryAddress (apiVersion 2): частини через "; " у колбеку, через ", " у CHECK_STATUS.
// Нормалізуємо до ", ", прибираємо код країни "UKR"
export function formatDeliveryAddress(deliveryAddress) {
  if (!deliveryAddress) return "";
  return String(deliveryAddress)
    .split(/;\s*/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "UKR")
    .join(", ");
}

export async function sendOrderConfirmationEmail({
  to,
  phone,
  orderReference,
  createdDate,
  amount,
  currency,
  items = [],
  delivery = {},
}) {
  const templateId = process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;

  return sendTransactionalEmail({
    to: { email: to },
    templateId,
    sender: senderEmail ? { email: senderEmail, name: senderName || undefined } : undefined,
    params: {
      orderNumber: orderReference,
      orderDate: formatOrderDate(createdDate),
      // Шаблон показує "Отримувач" і "Номер телефону" — це одержувач доставки;
      // без доставки — телефон платника
      recipientName: delivery.name || "",
      phone: delivery.phone || phone,
      deliveryAddress: formatDeliveryAddress(delivery.address),
      products: formatProducts(items),
      total: `${amount} ${currency}`.trim(),
    },
  });
}
