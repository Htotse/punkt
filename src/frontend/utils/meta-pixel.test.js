import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackPixelEvent,
  buildAddToCartParams,
  buildInitiateCheckoutParams,
  getCartSignature,
  trackInitiateCheckoutOnce,
} from "./meta-pixel.js";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  delete globalThis.window;
  vi.restoreAllMocks();
});

describe("trackPixelEvent", () => {
  it("calls fbq track with event name and params", () => {
    const fbq = vi.fn();
    globalThis.window = { fbq };
    trackPixelEvent("AddToCart", { value: 1 });
    expect(fbq).toHaveBeenCalledWith("track", "AddToCart", { value: 1 });
  });

  it("does not throw when window is missing", () => {
    expect(() => trackPixelEvent("AddToCart", {})).not.toThrow();
  });

  it("does not throw when fbq is missing", () => {
    globalThis.window = {};
    expect(() => trackPixelEvent("AddToCart", {})).not.toThrow();
  });

  it("does not throw when fbq itself throws", () => {
    globalThis.window = {
      fbq: () => {
        throw new Error("blocked");
      },
    };
    expect(() => trackPixelEvent("AddToCart", {})).not.toThrow();
  });
});

describe("buildAddToCartParams", () => {
  it("includes content_ids when product code is present", () => {
    expect(buildAddToCartParams({ name: "Енеїда", price: 1600, productCode: "aeneid" })).toEqual({
      content_name: "Енеїда",
      value: 1600,
      currency: "UAH",
      content_type: "product",
      content_ids: ["aeneid"],
    });
  });

  it("omits content_ids when product code is empty", () => {
    const params = buildAddToCartParams({ name: "Енеїда", price: 1600, productCode: "" });
    expect(params).not.toHaveProperty("content_ids");
    expect(params.value).toBe(1600);
  });
});

describe("buildInitiateCheckoutParams", () => {
  it("sums value and num_items and dedupes content_ids", () => {
    const cart = [
      { name: "A", price: 1600, cnt: 2, productCode: "aeneid" },
      { name: "B", price: 900, cnt: 1, productCode: "la-boussolle" },
      { name: "A2", price: 100, cnt: 1, productCode: "aeneid" },
    ];
    expect(buildInitiateCheckoutParams(cart)).toEqual({
      value: 4200,
      currency: "UAH",
      num_items: 4,
      content_type: "product",
      content_ids: ["aeneid", "la-boussolle"],
    });
  });

  it("counts legacy items without productCode in value but not in content_ids", () => {
    const cart = [
      { name: "Old", price: 500, cnt: 1 },
      { name: "New", price: 1600, cnt: 1, productCode: "aeneid" },
    ];
    const params = buildInitiateCheckoutParams(cart);
    expect(params.value).toBe(2100);
    expect(params.num_items).toBe(2);
    expect(params.content_ids).toEqual(["aeneid"]);
  });

  it("omits content_ids when no item has a code", () => {
    const params = buildInitiateCheckoutParams([{ name: "Old", price: 500, cnt: 1 }]);
    expect(params).not.toHaveProperty("content_ids");
  });
});

describe("getCartSignature", () => {
  it("changes when quantity changes", () => {
    const cart = [{ name: "A", price: 100, cnt: 1, productCode: "a" }];
    const changedCart = [{ name: "A", price: 100, cnt: 2, productCode: "a" }];
    expect(getCartSignature(cart)).not.toBe(getCartSignature(changedCart));
  });
});

describe("trackInitiateCheckoutOnce", () => {
  it("sends once per unique cart and again when the cart changes", () => {
    const fbq = vi.fn();
    globalThis.window = { fbq };
    const cart = [{ name: "A", price: 100, cnt: 1, productCode: "dedupe-test" }];

    trackInitiateCheckoutOnce(cart);
    trackInitiateCheckoutOnce(cart);
    expect(fbq).toHaveBeenCalledTimes(1);

    trackInitiateCheckoutOnce([{ ...cart[0], cnt: 2 }]);
    expect(fbq).toHaveBeenCalledTimes(2);
    expect(fbq).toHaveBeenLastCalledWith("track", "InitiateCheckout", expect.objectContaining({ num_items: 2 }));
  });
});
