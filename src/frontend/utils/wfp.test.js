import { describe, it, expect } from "vitest";
import { toMoney, mapCartToWfpArrays, unixSeconds, buildWfpPayload } from "./wfp.js";

describe("toMoney", () => {
  it("formats an integer with two decimals", () => {
    expect(toMoney(100)).toBe("100.00");
  });

  it("rounds to two decimals", () => {
    expect(toMoney(547.3)).toBe("547.30");
  });

  it("treats missing/undefined as zero", () => {
    expect(toMoney(undefined)).toBe("0.00");
  });
});

describe("mapCartToWfpArrays", () => {
  it("keeps items in the same order across all arrays", () => {
    const cart = [
      { name: "Vase A, S", price: 120, cnt: 1 },
      { name: "Vase B", price: 85, cnt: 2 },
    ];

    expect(mapCartToWfpArrays(cart)).toEqual({
      productName: ["Vase A, S", "Vase B"],
      productPrice: ["120.00", "85.00"],
      productCount: ["1", "2"],
      productId: ["", ""],
    });
  });

  it("returns empty arrays for an empty cart", () => {
    expect(mapCartToWfpArrays([])).toEqual({
      productName: [],
      productPrice: [],
      productCount: [],
      productId: [],
    });
  });
});

describe("unixSeconds", () => {
  it("converts a Date to whole seconds since epoch", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(unixSeconds(date)).toBe(Math.floor(date.getTime() / 1000));
  });
});

describe("buildWfpPayload", () => {
  it("sums item price*count into amount and mirrors product arrays", () => {
    const cart = [
      { name: "Vase A, S", price: 120, cnt: 1 },
      { name: "Vase B", price: 85, cnt: 2 },
    ];

    const payload = buildWfpPayload(cart);

    expect(payload.amount).toBe("290.00"); // 120*1 + 85*2
    expect(payload.currency).toBe("UAH");
    expect(payload.productName).toEqual(["Vase A, S", "Vase B"]);
    expect(payload.productPrice).toEqual(["120.00", "85.00"]);
    expect(payload.productCount).toEqual(["1", "2"]);
    expect(payload.orderReference).toBeUndefined(); // генерує checkout.js
  });

  it("додає productId (шлях сторінки товару) для Meta CAPI, порожній — якщо посилання немає", () => {
    const cart = [
      { name: "A", price: 100, cnt: 1, productPageLink: "https://punkt-otse.webflow.io/books/aeneidos" },
      { name: "B", price: 50, cnt: 1 },
    ];
    expect(buildWfpPayload(cart).productId).toEqual(["/books/aeneidos", ""]);
  });
});
