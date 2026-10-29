import { describe, it, expect } from "vitest";
import { buildOrderRecord, getOrderItems, isExpired, ORDER_TTL_MS } from "./order-store.js";

const wfp = {
  orderReference: "PUNKT_1730000000000",
  amount: "1250.00",
  currency: "UAH",
  productName: ["Книга А", "Книга Б"],
  productCount: ["1", "2"],
  productPrice: ["450.00", "400.00"],
};

describe("buildOrderRecord", () => {
  it("зберігає товари, суму і час створення зі статусом pending", () => {
    expect(buildOrderRecord(wfp, 1000)).toEqual({
      status: "pending",
      productName: ["Книга А", "Книга Б"],
      productCount: ["1", "2"],
      productPrice: ["450.00", "400.00"],
      amount: "1250.00",
      currency: "UAH",
      createdAt: 1000,
    });
  });
});

describe("getOrderItems", () => {
  it("збирає товари в однаковому порядку з усіх масивів", () => {
    expect(getOrderItems(buildOrderRecord(wfp))).toEqual([
      { name: "Книга А", count: "1", price: "450.00" },
      { name: "Книга Б", count: "2", price: "400.00" },
    ]);
  });

  it("повертає порожній масив для відсутнього запису чи позначки sent", () => {
    expect(getOrderItems(null)).toEqual([]);
    expect(getOrderItems({ status: "sent", sentAt: 1 })).toEqual([]);
  });
});

describe("isExpired", () => {
  const now = 10 * ORDER_TTL_MS;

  it("свіжий запис не прострочений", () => {
    expect(isExpired(now - 1000, now)).toBe(false);
  });

  it("запис, старший за 7 днів, прострочений", () => {
    expect(isExpired(now - ORDER_TTL_MS - 1, now)).toBe(true);
  });

  it("запис без дати вважається простроченим", () => {
    expect(isExpired(undefined, now)).toBe(true);
  });
});
