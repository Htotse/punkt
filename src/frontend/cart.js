// cart script for webflow + wayforpay (Purchase)
"use strict";

import { getCartWithExpiry, setCartWithExpiry } from "./utils/cart-storage.js";
import { buildWfpPayload, postViaForm } from "./utils/wfp.js";

window.Webflow ||= [];
window.Webflow.push(() => {
  const ENABLE_AUTO_REDIRECT = true;

  // Бекенд (Netlify Function), який рахує HMAC і викликає WayForPay offline
  // const CHECKOUT_ENDPOINT = "https://saule-backend.netlify.app/.netlify/functions/checkout";
  const CHECKOUT_ENDPOINT = "";

  // Сторінка кошика, куди редіректити після додавання товару (заповнити перед деплоєм)
  // const CART_PAGE_URL = "https://www.saule-objects.com/cart";
  const CART_PAGE_URL = "";

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
    const imgSrc = product.dataset.imgSrc;
    const productPageLink = product.dataset.productPage;
    const rawPrice = product.dataset.price || "";
    const price = parseInt(rawPrice.replace(/[^\d]/g, ""), 10);

    const rawSize = product.dataset.productSize;
    const size = !rawSize || rawSize === "undefined" || rawSize === "null" ? "" : rawSize;

    if (!rawName || Number.isNaN(price)) {
      console.warn("addToCart: відсутні name/price у data-* атрибутах", { rawName, rawPrice });
      return;
    }

    const name = size ? `${rawName}, ${size}` : rawName;
    const cart = getCartWithExpiry();

    const existing = cart.find(
      (item) => item.rawName === rawName && item.price === price && item.size === size
    );

    if (existing) existing.cnt += 1;
    else cart.push({ rawName, name, imgSrc, price, cnt: 1, productPageLink, size });

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
    if (CART_PAGE_URL) {
      setTimeout(() => {
        window.location.href = CART_PAGE_URL;
      }, 100);
    }
  });

  // Інкремент/декремент
  document.addEventListener("click", (e) => {
    const plus = e.target.closest(".plus-btn");
    if (plus) {
      const wrap = plus.closest(".summary-product");
      const index = wrap ? Number(wrap.dataset.index) : -1;
      if (index >= 0) incrementItem(index);
      return;
    }
    const minus = e.target.closest(".minus-btn");
    if (minus) {
      const wrap = minus.closest(".summary-product");
      const index = wrap ? Number(wrap.dataset.index) : -1;
      if (index >= 0) decrementItem(index);
      return;
    }
  });

  function incrementItem(index) {
    const cart = getCartWithExpiry();
    if (index < 0 || index >= cart.length) return;
    cart[index].cnt += 1;
    setCartWithExpiry(cart);
    renderCart();
    updateGlobalCartQuantity();
  }

  function decrementItem(index) {
    const cart = getCartWithExpiry();
    if (index < 0 || index >= cart.length) return;
    if (cart[index].cnt > 1) cart[index].cnt -= 1;
    else cart.splice(index, 1);
    setCartWithExpiry(cart);
    renderCart();
    updateGlobalCartQuantity();
  }

  // Видалення
  function removeFromCart(index) {
    const cart = getCartWithExpiry();
    if (index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    setCartWithExpiry(cart);
    renderCart();
    updateGlobalCartQuantity();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-btn");
    if (!btn) return;
    e.preventDefault();
    const wrap = btn.closest(".summary-product");
    const index = wrap ? Number(wrap.dataset.index) : -1;
    if (index >= 0) removeFromCart(index);
  });

  // ==============================
  // РЕНДЕР КОШИКА
  // ==============================
  function renderCart() {
    const cart = getCartWithExpiry();
    const container = document.getElementById("cart-container");
    const cartBottom = document.querySelector(".cart-bottom");

    if (!container) return;
    container.innerHTML = "";
    let total = 0;

    if (cart.length === 0) {
      container.innerHTML += `
        <div class="cart-inner-empty-wrap">
          <p class="cart-inner-empty-text">Your cart is empty</p>
          <a href="" class="checkout-button-empty">Discover all products</a>
        </div>
      `;
      if (cartBottom) cartBottom.style.display = "none";
    } else {
      cart.forEach((item, index) => {
        const itemTotal = item.price * item.cnt;
        total += itemTotal;

        container.innerHTML += `
          <div class="summary-product" data-index="${index}">
            <a class="sum-image-wrap" href="${item.productPageLink}">
              <div>
                <img src="${item.imgSrc}" loading="lazy" alt="" class="product-min-image">
              </div>
            </a>
            <div class="sum-info">
              <div class="sum-col">
                <div class="sum-product-name">${item.name}</div>
                <div class="flex-wrap">
                  <span class="dollar">€</span>
                  <p class="sum-price">${item.price}</p>
                </div>
              </div>
              <div class="sum-col is-02">
                <div class="flex-wrap">
                  <p>Quantity:</p>
                  <div class="quantity-wrap">
                    <div class="minus-btn"><p>-</p></div>
                    <span class="quantity">${item.cnt}</span>
                    <div class="plus-btn"><p>+</p></div>
                  </div>
                </div>
                <button type="button" class="remove-btn" aria-label="Remove from cart">Remove</button>
              </div>
            </div>
          </div>
        `;
      });

      if (cartBottom) cartBottom.style.display = "block";
    }

    const checkoutPriceEl = document.querySelector(".checkout-cost");
    if (checkoutPriceEl) checkoutPriceEl.textContent = `${total}`;
  }

  function updateGlobalCartQuantity() {
    const cart = getCartWithExpiry();
    const totalItems = cart.reduce((sum, item) => sum + item.cnt, 0);
    document.querySelectorAll(".cart-quantity").forEach((el) => {
      el.textContent = totalItems;
    });
  }

  // ==============================
  // ЧЕК-АУТ
  // ==============================
  function submitOrder() {
    const cart = getCartWithExpiry();
    if (cart.length === 0) {
      alert("Ваш кошик порожній!");
      return;
    }

    const wfpPayload = buildWfpPayload(cart);

    fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "wayforpay",
        wfp: wfpPayload, // бек рахує merchantSignature та викликає offline
      }),
    })
      .then((res) => res.json())
      .then((data) => {
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
      })
      .catch((err) => {
        console.error("Помилка оформлення замовлення (WayForPay):", err);
        alert("Не вдалося створити замовлення. Спробуйте ще раз.");
      });
  }

  // Клік по кнопці оформлення замовлення
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".checkout-button");
    if (!btn) return;
    e.preventDefault();
    submitOrder();
  });

  // Ініціалізація
  renderCart();
  updateGlobalCartQuantity();
});
