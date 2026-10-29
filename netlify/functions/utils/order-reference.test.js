import { describe, it, expect } from "vitest";
import { generateOrderReference, ORDER_REFERENCE_DIGITS } from "./order-reference.js";

describe("generateOrderReference", () => {
  it("генерує рівно 8 цифр без нуля на початку", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateOrderReference()).toMatch(/^[1-9]\d{7}$/);
    }
    expect(ORDER_REFERENCE_DIGITS).toBe(8);
  });

  it("враховує задану кількість цифр", () => {
    expect(generateOrderReference(6)).toMatch(/^[1-9]\d{5}$/);
  });

  it("номери випадкові, а не однакові", () => {
    const references = new Set(Array.from({ length: 50 }, () => generateOrderReference()));
    expect(references.size).toBeGreaterThan(40);
  });
});
