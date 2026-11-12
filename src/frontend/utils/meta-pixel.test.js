import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackPixelEvent,
  getProductId,
  buildAddToCartParams,
  buildInitiateCheckoutParams,
  getCartSignature,
  trackInitiateCheckoutOnce,
} from "./meta-pixel.js";

const AENEID_URL = "https://punkt-otse.webflow.io/books/aeneidos";
const BOUSSOLLE_URL = "https://punktpublishing.com/books/la-boussolle";

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

describe("getProductId", () => {
  it("takes the path without domain, so staging and prod give the same id", () => {
    expect(getProductId(AENEID_URL)).toBe("/books/aeneidos");
    expect(getProductId("https://punktpublishing.com/books/aeneidos/")).toBe("/books/aeneidos");
  });

  it("accepts relative links", () => {
    expect(getProductId("/books/aeneidos")).toBe("/books/aeneidos");
  });

  it("returns empty string for missing or root-only links", () => {
    expect(getProductId(undefined)).toBe("");
    expect(getProductId("")).toBe("");
    expect(getProductId("#")).toBe("");
  });
});

describe("buildAddToCartParams", () => {
  it("uses the product page path as content_ids", () => {
    expect(buildAddToCartParams({ name: "Енеїда", price: 1600, productPageLink: AENEID_URL })).toEqual({
      content_name: "Енеїда",
      value: 1600,
      currency: "UAH",
      content_type: "product",
      content_ids: ["/books/aeneidos"],
    });
  });

  it("omits content_ids when product page link is empty", () => {
    const params = buildAddToCartParams({ name: "Енеїда", price: 1600, productPageLink: "" });
    expect(params).not.toHaveProperty("content_ids");
    expect(params.value).toBe(1600);
  });
});

describe("buildInitiateCheckoutParams", () => {
  it("sums value and num_items and dedupes content_ids", () => {
    const cart = [
      { name: "A", price: 1600, cnt: 2, productPageLink: AENEID_URL },
      { name: "B", price: 900, cnt: 1, productPageLink: BOUSSOLLE_URL },
      { name: "A2", price: 100, cnt: 1, productPageLink: "https://punktpublishing.com/books/aeneidos" },
    ];
    expect(buildInitiateCheckoutParams(cart)).toEqual({
      value: 4200,
      currency: "UAH",
      num_items: 4,
      content_type: "product",
      content_ids: ["/books/aeneidos", "/books/la-boussolle"],
    });
  });

  it("counts items without a page link in value but not in content_ids", () => {
    const cart = [
      { name: "NoLink", price: 500, cnt: 1 },
      { name: "A", price: 1600, cnt: 1, productPageLink: AENEID_URL },
    ];
    const params = buildInitiateCheckoutParams(cart);
    expect(params.value).toBe(2100);
    expect(params.num_items).toBe(2);
    expect(params.content_ids).toEqual(["/books/aeneidos"]);
  });

  it("omits content_ids when no item has a page link", () => {
    const params = buildInitiateCheckoutParams([{ name: "NoLink", price: 500, cnt: 1 }]);
    expect(params).not.toHaveProperty("content_ids");
  });
});

describe("getCartSignature", () => {
  it("changes when quantity changes", () => {
    const cart = [{ name: "A", price: 100, cnt: 1, productPageLink: AENEID_URL }];
    const changedCart = [{ ...cart[0], cnt: 2 }];
    expect(getCartSignature(cart)).not.toBe(getCartSignature(changedCart));
  });
});

describe("trackInitiateCheckoutOnce", () => {
  it("sends once per unique cart and again when the cart changes", () => {
    const fbq = vi.fn();
    globalThis.window = { fbq };
    const cart = [{ name: "A", price: 100, cnt: 1, productPageLink: "/books/dedupe-test" }];

    trackInitiateCheckoutOnce(cart);
    trackInitiateCheckoutOnce(cart);
    expect(fbq).toHaveBeenCalledTimes(1);

    trackInitiateCheckoutOnce([{ ...cart[0], cnt: 2 }]);
    expect(fbq).toHaveBeenCalledTimes(2);
    expect(fbq).toHaveBeenLastCalledWith("track", "InitiateCheckout", expect.objectContaining({ num_items: 2 }));
  });
});
