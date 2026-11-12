import { describe, it, expect, vi, afterEach } from "vitest";
import { buildSheetsPayload, sendOrderToSheets } from "./google-sheets.js";

const callback = {
  merchantAccount: "punktpublishing_com",
  merchantSignature: "abc",
  orderReference: "12345678",
  transactionStatus: "Approved",
  amount: 390,
  currency: "UAH",
  authCode: "123456",
  cardPan: "41****1111",
  email: "buyer@mail.com",
  phone: "380501234567",
  deliveryName: "Тест Отримувач",
  deliveryPhone: "380679999999",
  deliveryAddress: "Нова Пошта; UKR; Київська; Бориспіль; Відділення №1",
  products: [{ name: "Енеїда", price: 390, count: 1 }],
  clientComment: "Подзвоніть перед відправкою",
  createdDate: 1762858800,
};

describe("buildSheetsPayload", () => {
  it("передає поля колбеку під тими ж іменами + secret, без карткових даних і підпису", () => {
    const payload = buildSheetsPayload(callback, "s3cret");
    expect(payload).toMatchObject({
      orderReference: "12345678",
      transactionStatus: "Approved",
      amount: 390,
      deliveryPhone: "380679999999",
      products: [{ name: "Енеїда", price: 390, count: 1 }],
      clientComment: "Подзвоніть перед відправкою",
      secret: "s3cret",
    });
    expect(payload).not.toHaveProperty("cardPan");
    expect(payload).not.toHaveProperty("authCode");
    expect(payload).not.toHaveProperty("merchantSignature");
  });
});

describe("sendOrderToSheets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("пропускає без env", async () => {
    vi.stubEnv("GOOGLE_SHEETS_WEBHOOK_URL", "");
    vi.stubEnv("GOOGLE_SHEETS_WEBHOOK_SECRET", "");
    expect(await sendOrderToSheets(callback)).toMatchObject({ skipped: true });
  });

  it("шле JSON POST і повертає відповідь скрипта", async () => {
    vi.stubEnv("GOOGLE_SHEETS_WEBHOOK_URL", "https://script.google.com/macros/s/x/exec");
    vi.stubEnv("GOOGLE_SHEETS_WEBHOOK_SECRET", "s3cret");
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendOrderToSheets(callback)).toEqual({ result: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://script.google.com/macros/s/x/exec");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).secret).toBe("s3cret");
  });

  it("кидає помилку на відповідь скрипта 'error: ...'", async () => {
    vi.stubEnv("GOOGLE_SHEETS_WEBHOOK_URL", "https://script.google.com/macros/s/x/exec");
    vi.stubEnv("GOOGLE_SHEETS_WEBHOOK_SECRET", "s3cret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Error: unauthorized", { status: 200 })));
    await expect(sendOrderToSheets(callback)).rejects.toThrow("unauthorized");
  });
});
