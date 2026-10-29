import { describe, it, expect } from "vitest";
import { parseAllowedOrigins, resolveAllowOrigin } from "./cors.js";

const allowed = parseAllowedOrigins(
  "https://punkt-otse.webflow.io/; https://www.punktpublishing.com/, https://punktpublishing.com"
);

describe("parseAllowedOrigins", () => {
  it("розбирає список через ; або , і прибирає кінцевий слеш", () => {
    expect(allowed).toEqual([
      "https://punkt-otse.webflow.io",
      "https://www.punktpublishing.com",
      "https://punktpublishing.com",
    ]);
  });

  it("порожнє значення дає порожній список", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe("resolveAllowOrigin", () => {
  it("повертає origin запиту, якщо він у списку", () => {
    expect(resolveAllowOrigin("https://www.punktpublishing.com", allowed)).toBe("https://www.punktpublishing.com");
    expect(resolveAllowOrigin("https://punkt-otse.webflow.io", allowed)).toBe("https://punkt-otse.webflow.io");
  });

  it("чужий origin не отримує дозволу", () => {
    expect(resolveAllowOrigin("https://evil.example", allowed)).toBe("https://punkt-otse.webflow.io");
  });

  it("порожній список дозволяє всім (локальна розробка)", () => {
    expect(resolveAllowOrigin("https://anything.example", [])).toBe("*");
  });
});
