// Хелпери для формування payload WayForPay (Purchase) та POST-фолбеку

import { getProductId } from "./meta-pixel.js";

const WFP_CURRENCY = "UAH";
const WFP_DEFAULT_PSP = "card";
const WFP_PAYMENT_SYSTEMS = "card;googlePay;applePay";
const WFP_DELIVERY_LIST = "nova;nova_pl";

export function toMoney(value) {
  // 100 -> "100.00", 547.3 -> "547.30"
  const n = Number(value || 0);
  return n.toFixed(2);
}

export function mapCartToWfpArrays(cart) {
  // однаковий порядок для всіх масивів — критично для підпису
  const productName = [];
  const productPrice = [];
  const productCount = [];
  // ID товару для Meta CAPI Purchase — у WFP і в підпис не йде, checkout.js лише зберігає в Blobs
  const productId = [];

  cart.forEach((item) => {
    productName.push(item.name);
    productPrice.push(toMoney(item.price));
    productCount.push(String(item.cnt));
    productId.push(getProductId(item.productPageLink));
  });

  return { productName, productPrice, productCount, productId };
}

export function unixSeconds(date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}

export function buildWfpPayload(cart) {
  const { productName, productPrice, productCount, productId } = mapCartToWfpArrays(cart);
  const total = cart.reduce((sum, item) => sum + item.price * item.cnt, 0);

  // формуємо payload без підпису й orderReference — бек їх згенерує
  const wfp = {
    // merchantAccount: WFP_MERCHANT_ACCOUNT,
    // merchantDomainName: WFP_MERCHANT_DOMAIN,
    merchantAuthType: "SimpleSignature",
    merchantTransactionType: "AUTO",
    merchantTransactionSecureType: "AUTO",
    apiVersion: "1",
    language: "UA",

    orderDate: unixSeconds(),
    amount: toMoney(total),
    currency: WFP_CURRENCY,

    productName,
    productPrice,
    productCount,
    productId,

    // UX/налаштування
    defaultPaymentSystem: WFP_DEFAULT_PSP,
    paymentSystems: WFP_PAYMENT_SYSTEMS,
    deliveryList: WFP_DELIVERY_LIST,

    // (пізніше додамо)
    // returnUrl: "https://www.saule-objects.com/payment-success",
    // serviceUrl не задається тут — його підставляє checkout.js з ENV WFP_SERVICE_URL
  };

  return wfp;
}

// Відправка POST-форми (fallback, якщо бек поверне "mode: form")
export function postViaForm(actionUrl, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.acceptCharset = "utf-8";
  form.style.display = "none";

  Object.entries(fields).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        const input = document.createElement("input");
        input.name = key.endsWith("[]") ? key : `${key}[]`;
        input.value = String(v);
        form.appendChild(input);
      });
    } else {
      const input = document.createElement("input");
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    }
  });

  document.body.appendChild(form);
  form.submit();
}
