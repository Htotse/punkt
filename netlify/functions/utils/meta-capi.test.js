import crypto from "crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeEmail,
  normalizePhone,
  getClientContext,
  buildPurchaseEvent,
  sendPurchaseEvent,
} from "./meta-capi.js";

const sha256 = (v) => crypto.createHash("sha256").update(v, "utf8").digest("hex");

const order = {
  status: "pending",
  productName: ["Енеїда", "Буссоль"],
  productCount: ["2", "1"],
  productPrice: ["1600.00", "900.00"],
  productId: ["/books/aeneidos", "/books/boussolle"],
  clientIp: "1.2.3.4",
  clientUserAgent: "Mozilla/5.0",
  eventSourceUrl: "https://punktpublishing.com/cart",
};

describe("normalizeEmail / normalizePhone", () => {
  it("email: trim + lowercase", () => {
    expect(normalizeEmail("  Test@Mail.COM ")).toBe("test@mail.com");
  });

  it("phone: лише цифри, український номер без коду отримує 38", () => {
    expect(normalizePhone("+38 (067) 123-45-67")).toBe("380671234567");
    expect(normalizePhone("0671234567")).toBe("380671234567");
    expect(normalizePhone("")).toBe("");
  });
});

describe("getClientContext", () => {
  it("бере IP Netlify, User-Agent і referer", () => {
    expect(
      getClientContext({
        "x-nf-client-connection-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 8.8.8.8",
        "user-agent": "UA",
        referer: "https://punktpublishing.com/cart",
      }),
    ).toEqual({ clientIp: "1.2.3.4", clientUserAgent: "UA", eventSourceUrl: "https://punktpublishing.com/cart" });
  });

  it("фолбек на перший x-forwarded-for, порожні значення без заголовків", () => {
    expect(getClientContext({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }).clientIp).toBe("9.9.9.9");
    expect(getClientContext(undefined)).toEqual({ clientIp: "", clientUserAgent: "", eventSourceUrl: "" });
  });
});

describe("buildPurchaseEvent", () => {
  it("збирає Purchase з товарами, хешованими контактами і даними браузера", () => {
    const event = buildPurchaseEvent({
      orderReference: "12345678",
      amount: "4100.00",
      currency: "UAH",
      email: "Buyer@Mail.com",
      phone: "380671234567",
      order,
      now: 1_700_000_000_123,
    });

    expect(event).toEqual({
      event_name: "Purchase",
      event_time: 1_700_000_000,
      event_id: "12345678",
      action_source: "website",
      event_source_url: "https://punktpublishing.com/cart",
      user_data: {
        em: [sha256("buyer@mail.com")],
        ph: [sha256("380671234567")],
        client_ip_address: "1.2.3.4",
        client_user_agent: "Mozilla/5.0",
      },
      custom_data: {
        value: 4100,
        currency: "UAH",
        order_id: "12345678",
        content_type: "product",
        contents: [
          { id: "/books/aeneidos", quantity: 2, item_price: 1600 },
          { id: "/books/boussolle", quantity: 1, item_price: 900 },
        ],
        content_ids: ["/books/aeneidos", "/books/boussolle"],
        num_items: 3,
      },
    });
  });

  it("без запису в сховищі — лише сума, валюта і контакти", () => {
    const event = buildPurchaseEvent({ orderReference: "1", amount: "100.00", currency: "UAH", email: "", phone: "", order: null });
    expect(event.user_data).toEqual({});
    expect(event.custom_data).toEqual({ value: 100, currency: "UAH", order_id: "1", content_type: "product" });
    expect(event.event_source_url).toBeUndefined();
  });

  it("товари без ID не потрапляють у contents", () => {
    const event = buildPurchaseEvent({
      orderReference: "1",
      amount: "2500.00",
      currency: "UAH",
      order: { ...order, productId: ["", "/books/boussolle"] },
    });
    expect(event.custom_data.content_ids).toEqual(["/books/boussolle"]);
    expect(event.custom_data.contents).toHaveLength(1);
  });
});

describe("sendPurchaseEvent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const params = { orderReference: "1", amount: "100.00", currency: "UAH", email: "a@b.c", order: null };

  it("без env — пропускає без запиту", async () => {
    vi.stubEnv("META_PIXEL_ID", "");
    vi.stubEnv("META_CAPI_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await sendPurchaseEvent(params)).skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("шле подію на піксель з test_event_code, якщо він заданий", async () => {
    vi.stubEnv("META_PIXEL_ID", "123");
    vi.stubEnv("META_CAPI_TOKEN", "tok");
    vi.stubEnv("META_TEST_EVENT_CODE", "TEST1");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events_received: 1 }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendPurchaseEvent(params)).toEqual({ events_received: 1 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/123\/events\?access_token=tok$/);
    const body = JSON.parse(options.body);
    expect(body.test_event_code).toBe("TEST1");
    expect(body.data[0].event_name).toBe("Purchase");
  });

  it("кидає помилку на не-2xx відповідь Meta", async () => {
    vi.stubEnv("META_PIXEL_ID", "123");
    vi.stubEnv("META_CAPI_TOKEN", "tok");
    vi.stubEnv("META_TEST_EVENT_CODE", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "bad" } }) }));
    await expect(sendPurchaseEvent(params)).rejects.toThrow(/Meta CAPI 400/);
  });
});
