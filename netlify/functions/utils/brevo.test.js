import { describe, it, expect } from "vitest";
import { formatDeliveryAddress } from "./brevo.js";

describe("formatDeliveryAddress", () => {
  it("normalizes callback format (\"; \") and drops country code", () => {
    expect(
      formatDeliveryAddress(
        "Нова Пошта; UKR; Київська; Ірпінь; Відділення №5 (до 30 кг): вул. Сингаївського Миколи, 3Б",
      ),
    ).toBe("Нова Пошта, Київська, Ірпінь, Відділення №5 (до 30 кг): вул. Сингаївського Миколи, 3Б");
  });

  it("keeps CHECK_STATUS format (\", \") as is apart from country code", () => {
    expect(formatDeliveryAddress("Нова Пошта, UKR, Київська, Біла Церква, Поштомат №1186")).toBe(
      "Нова Пошта, UKR, Київська, Біла Церква, Поштомат №1186",
    );
  });

  it("returns empty string for missing address", () => {
    expect(formatDeliveryAddress("")).toBe("");
    expect(formatDeliveryAddress(undefined)).toBe("");
  });
});
