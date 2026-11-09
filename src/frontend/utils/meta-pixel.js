// Події Meta Pixel (AddToCart, InitiateCheckout).
// Базовий код пікселя (fbq init + PageView) стоїть у Webflow → Custom code → Head,
// не в бандлі. Тут лише безпечні виклики: якщо fbq немає (блокувальник, локальний
// превʼю) або він кидає помилку — кошик і оплата працюють далі.

const PIXEL_CURRENCY = "UAH";
const PIXEL_CONTENT_TYPE = "product";

export function trackPixelEvent(eventName, params) {
  try {
    const fbq = typeof window !== "undefined" ? window.fbq : undefined;
    if (typeof fbq !== "function") {
      console.debug(`Meta Pixel: fbq недоступний, подію ${eventName} пропущено`);
      return;
    }
    fbq("track", eventName, params);
  } catch (err) {
    console.debug(`Meta Pixel: помилка відправки ${eventName}`, err);
  }
}

function getUniqueProductCodes(cart) {
  const codes = cart.map((item) => item.productCode).filter(Boolean);
  return [...new Set(codes)];
}

export function buildAddToCartParams({ name, price, productCode }) {
  const params = {
    content_name: name,
    value: price,
    currency: PIXEL_CURRENCY,
    content_type: PIXEL_CONTENT_TYPE,
  };
  if (productCode) params.content_ids = [productCode];
  return params;
}

export function buildInitiateCheckoutParams(cart) {
  const params = {
    value: cart.reduce((sum, item) => sum + item.price * item.cnt, 0),
    currency: PIXEL_CURRENCY,
    num_items: cart.reduce((sum, item) => sum + item.cnt, 0),
    content_type: PIXEL_CONTENT_TYPE,
  };
  const contentIds = getUniqueProductCodes(cart);
  if (contentIds.length > 0) params.content_ids = contentIds;
  return params;
}

export function getCartSignature(cart) {
  const itemsKey = cart
    .map((item) => `${item.productCode || item.name}:${item.cnt}`)
    .join("|");
  const total = cart.reduce((sum, item) => sum + item.price * item.cnt, 0);
  return `${itemsKey}#${total}`;
}

// Захист від дублів: повторна спроба оформлення з тим самим кошиком (після помилки
// або «Назад» з WFP — змінна переживає bfcache) не шле InitiateCheckout вдруге.
let lastInitiateCheckoutKey = null;

export function trackInitiateCheckoutOnce(cart) {
  try {
    const cartSignature = getCartSignature(cart);
    if (cartSignature === lastInitiateCheckoutKey) return;
    lastInitiateCheckoutKey = cartSignature;
    trackPixelEvent("InitiateCheckout", buildInitiateCheckoutParams(cart));
  } catch (err) {
    console.debug("Meta Pixel: помилка підготовки InitiateCheckout", err);
  }
}
