// Робота з кошиком у localStorage (з TTL 3 дні)

export function setCartWithExpiry(cart) {
  const now = Date.now();
  const data = { items: cart, savedAt: now };
  localStorage.setItem("cart", JSON.stringify(data));
}

export function getCartWithExpiry() {
  const dataStr = localStorage.getItem("cart");
  if (!dataStr) return [];
  try {
    const data = JSON.parse(dataStr);
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (!data.savedAt || now - data.savedAt > threeDays) {
      localStorage.removeItem("cart");
      return [];
    }
    return data.items || [];
  } catch (e) {
    console.error("Помилка читання кошика:", e);
    localStorage.removeItem("cart");
    return [];
  }
}
