// cart script for webflow + wayforpay (Purchase)
"use strict";

import { getCartWithExpiry, setCartWithExpiry } from "./utils/cart-storage.js";
import { buildWfpPayload, postViaForm } from "./utils/wfp.js";
import { fetchWithRetry } from "./utils/fetch-with-retry.js";

window.Webflow ||= [];
window.Webflow.push(() => {
  const ENABLE_AUTO_REDIRECT = true;

  // Бекенд (Netlify Function), який рахує HMAC і викликає WayForPay offline.
  // Parcel підставляє CHECKOUT_ENDPOINT на етапі збірки з env-змінної (.env локально,
  // Netlify env vars у проді) — див. .env.example. Прод-URL нижче лише запасний дефолт
  // на випадок, якщо змінна не задана під час білду.
  const CHECKOUT_ENDPOINT =
    process.env.CHECKOUT_ENDPOINT || "https://punkt-shop.netlify.app/.netlify/functions/checkout";

  // Сторінка кошика, куди редіректити після додавання товару (заповнити перед деплоєм)
  // const CART_PAGE_URL = "https://www.saule-objects.com/cart";
  const CART_PAGE_URL = "https://punkt-otse.webflow.io/cart";

  // ==============================
  // ДОДАВАННЯ / ІНКРЕМЕНТ / ДЕКРЕМЕНТ / ВИДАЛЕННЯ
  // ==============================
  function addToCart(button) {
    const product = button?.closest(".product");
    if (!product) {
      console.warn("addToCart: .product не знайдено для кнопки", button);
      return;
    }

    const rawName = product.dataset.name;
    const authorName = product.dataset.author;
    const imgSrc = product.dataset.imgSrc;
    const productPageLink = product.dataset.productPage;
    const rawPrice = product.dataset.price || "";
    const price = parseInt(rawPrice.replace(/[^\d]/g, ""), 10);

    if (!rawName || Number.isNaN(price)) {
      console.warn("addToCart: відсутні name/price у data-* атрибутах", { rawName, rawPrice });
      return;
    }

    const name = rawName;
    const cart = getCartWithExpiry();

    const existing = cart.find(
      (item) => item.name === rawName && item.price === price
    );

    if (existing) existing.cnt += 1;
    else cart.push({ name, authorName, imgSrc, price, cnt: 1, productPageLink });

    setCartWithExpiry(cart);
    renderCart();
    updateGlobalCartQuantity();
  }

  // Делегування кліків: додати у кошик
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-add-to-cart");
    if (!btn) return;
    if (btn.tagName === "A") e.preventDefault();
    addToCart(btn);
    // редірект на сторінку кошика після додавання (лише якщо URL заданий)
    // if (CART_PAGE_URL) {
    //   setTimeout(() => {
    //     window.location.href = CART_PAGE_URL;
    //   }, 100);
    // }
  });

  function updateItemQuantityInDom(itemIndex, updatedCart) {
    const productElement = cartContainer?.querySelector(
      `[data-cart="product"][data-index="${itemIndex}"]`
    );
    const quantityElement = productElement?.querySelector(".cart_product_qantity");

    if (!productElement || !quantityElement) {
      renderCart();
      return;
    }

    quantityElement.textContent = updatedCart[itemIndex].cnt;
    updateCartTotalPrice(updatedCart);
  }

  function updateCartTotalPrice(cart) {
    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.cnt, 0);
    const totalPriceElement = document.getElementById("cart-subtotal-num");
    if (totalPriceElement) totalPriceElement.textContent = `${totalPrice}`;
  }

  function incrementItem(index) {
    const cart = getCartWithExpiry();
    if (index < 0 || index >= cart.length) return;

    cart[index].cnt += 1;
    setCartWithExpiry(cart);

    updateItemQuantityInDom(index, cart);
    updateGlobalCartQuantity();
  }

  function decrementItem(index) {
    const cart = getCartWithExpiry();
    if (index < 0 || index >= cart.length) return;

    if (cart[index].cnt > 1) {
      cart[index].cnt -= 1;
      setCartWithExpiry(cart);

      updateItemQuantityInDom(index, cart);
    } else {
      cart.splice(index, 1);
      setCartWithExpiry(cart);
      renderCart();
    }

    updateGlobalCartQuantity();
  }

  // Видалення
  // function removeFromCart(index) {
  //   const cart = getCartWithExpiry();
  //   if (index < 0 || index >= cart.length) return;
  //   cart.splice(index, 1);
  //   setCartWithExpiry(cart);
  //   renderCart();
  //   updateGlobalCartQuantity();
  // }

  // Делегування кліків усередині кошика: +/-/видалення
  const cartContainer = document.getElementById("cart-product-list");
  cartContainer?.addEventListener("click", (e) => {
    const plus = e.target.closest('[data-cart="plus-btn"]');
    if (plus) {
      const wrap = plus.closest('[data-cart="product"]');
      const index = wrap ? Number(wrap.dataset.index) : -1;
      if (index >= 0) incrementItem(index);
      return;
    }

    const minus = e.target.closest('[data-cart="minus-btn"]');
    if (minus) {
      const wrap = minus.closest('[data-cart="product"]');
      const index = wrap ? Number(wrap.dataset.index) : -1;
      if (index >= 0) decrementItem(index);
      return;
    }

    // const removeBtn = e.target.closest(".remove-btn");
    // if (removeBtn) {
    //   e.preventDefault();
    //   const wrap = removeBtn.closest(".summary-product");
    //   const index = wrap ? Number(wrap.dataset.index) : -1;
    //   if (index >= 0) removeFromCart(index);
    // }
  });

  // ==============================
  // РЕНДЕР КОШИКА
  // ==============================
  function renderCart() {
    const cart = getCartWithExpiry();
    const container = document.getElementById("cart-product-list");
    const cartBottom = document.getElementById("cart-bottom");

    if (!container) return;
    container.innerHTML = "";
    let total = 0;

    if (cart.length === 0) {
      container.innerHTML += `
        <div class="cart_inner_empty_wrap">
          <p class="cart_inner_empty_text">Кошик порожній</p>
          <a href="/" class="checkout_button_empty">Перейти до каталогу</a>
        </div>
      `;
      if (cartBottom) cartBottom.style.display = "none";
    } else {
      cart.forEach((item, index) => {
        const itemTotal = item.price * item.cnt;
        total += itemTotal;

        container.innerHTML += `
          <div data-cart="product" class="cart_product_wr" data-index="${index}">
            <a class="cart_product_img_wr" href="${item.productPageLink}" >
              <img src="${item.imgSrc}" loading="lazy" alt="Обкладинка книги ${item.name}" class="cart_product_img">
            </a>
            <a class="cart_product_info_wr" href="${item.productPageLink}">
              <div class="cart_product_author">${item.authorName || ""}</div>
              <div class="cart_product_name">${item.name}</div>
            </a>
            <div class="cart_product_quantity_wr flex-wrap">
              <div class="cart_product_quantity_text">Кількість</div>
              <div class="cart_quantity_counter_wr">
                <div data-cart="minus-btn" class="minus_btn_wr">
                  <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 24 24" fill="none"><path d="M15.4559 12.648H8.54395V11.352H15.4559V12.648Z" fill="currentColor"></path></svg>
                </div>
                <div class="cart_product_qantity">${item.cnt}</div>
                <div data-cart="plus-btn" class="plus_btn_wr">
                  <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 24 24" fill="none"><path d="M15.4559 12.648H8.54395V11.352H15.4559V12.648Z" fill="currentColor"></path><path d="M11.3515 15.456L11.3515 8.54398L12.6475 8.54398L12.6475 15.456L11.3515 15.456Z" fill="currentColor"></path></svg>
                </div>
              </div>
            </div>
            <div class="cart_product_price_wr flex-wrap">
              <div>${item.price}</div>
              <div class="currency_text">UAH</div>
            </div>
          </div>
        `;
      });

      if (cartBottom) cartBottom.style.display = "flex";
    }

    const checkoutPriceEl = document.getElementById("cart-subtotal-num");
    if (checkoutPriceEl) checkoutPriceEl.textContent = `${total}`;
  }

  function updateGlobalCartQuantity() {
    const cart = getCartWithExpiry();
    const totalItems = cart.reduce((sum, item) => sum + item.cnt, 0);
    const cartQuantityEl = document.querySelectorAll('[data-cart-button="quantity-el"]');
    const cartQuantityNums = document.querySelectorAll('[data-cart-button="quantity-number"]');

    cartQuantityEl.forEach((el) => {
      el.style.display = cart.length === 0 ? "none" : "flex";
    });
    cartQuantityNums.forEach((el) => {
      el.textContent = totalItems;
    });
  }

  // ==============================
  // ЧЕК-АУТ
  // ==============================
  function setCheckoutButtonLoading(btn, isLoading) {
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = "Обробка...";
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.disabled = false;
    }
  }

  async function submitOrder(btn) {
    const cart = getCartWithExpiry();
    const wfpPayload = buildWfpPayload(cart);

    try {
      const res = await fetchWithRetry(CHECKOUT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "wayforpay",
          wfp: wfpPayload, // бек рахує merchantSignature та викликає offline
        }),
      });
      const data = await res.json();
      console.log("Відповідь з Netlify (checkout):", data);

      // A) Offline-режим — отримали URL для оплати
      if (data && data.mode === "offline" && data.payUrl) {
        console.log("payUrl:", data.payUrl);
        if (ENABLE_AUTO_REDIRECT) {
          window.location.href = data.payUrl; // редірект на платіжну сторінку
        }
        return;
      }

      // B) Fallback — бек повернув поля для стандартного HTML POST
      if (data && data.mode === "form" && data.wfp?.actionUrl && data.wfp?.fields) {
        console.log("Fallback to form POST:", data.wfp);
        if (ENABLE_AUTO_REDIRECT) {
          postViaForm(data.wfp.actionUrl, data.wfp.fields);
        }
        return;
      }

      console.error("Не отримано даних для оплати WayForPay:", data);
      alert("Не вдалося ініціювати оплату. Спробуйте ще раз.");
      setCheckoutButtonLoading(btn, false);
    } catch (err) {
      console.error("Помилка оформлення замовлення (WayForPay):", err);
      alert("Не вдалося створити замовлення. Спробуйте ще раз.");
      setCheckoutButtonLoading(btn, false);
    }
  }

  // Клік по кнопці оформлення замовлення
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".checkout_button");
    if (!btn || btn.disabled) return;
    e.preventDefault();

    if (getCartWithExpiry().length === 0) {
      alert("Ваш кошик порожній!");
      return;
    }

    setCheckoutButtonLoading(btn, true);
    submitOrder(btn);
  });

  // Ініціалізація
  renderCart();
  updateGlobalCartQuantity();
});
