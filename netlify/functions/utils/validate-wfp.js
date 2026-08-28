// Перевірка типів/діапазонів payload перед підписом WayForPay.
// Джерело правди про товари тут відсутнє (немає серверного каталогу цін) —
// ця перевірка ловить некоректні/неузгоджені дані, а не підміну ціни товару.

const ALLOWED_CURRENCIES = ["UAH", "USD", "EUR"];

export function validateWfpPayload(wfp) {
  const errors = [];

  const amount = Number(wfp.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push("amount must be a positive number");
  }

  if (!ALLOWED_CURRENCIES.includes(wfp.currency)) {
    errors.push(`currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`);
  }

  let pricesSum = 0;
  (wfp.productPrice || []).forEach((price, i) => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      errors.push(`productPrice[${i}] must be a positive number`);
    }
    const count = Number((wfp.productCount || [])[i]);
    if (Number.isFinite(p) && Number.isFinite(count)) {
      pricesSum += p * count;
    }
  });

  (wfp.productCount || []).forEach((count, i) => {
    const c = Number(count);
    if (!Number.isInteger(c) || c <= 0) {
      errors.push(`productCount[${i}] must be a positive integer`);
    }
  });

  if (errors.length === 0 && Math.abs(pricesSum - amount) > 0.01) {
    errors.push("amount does not match sum(productPrice × productCount)");
  }

  return errors;
}
