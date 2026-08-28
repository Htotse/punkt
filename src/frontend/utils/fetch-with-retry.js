// fetch з повторними спробами (exponential backoff) для тимчасових мережевих/серверних збоїв.
// 4xx-відповіді НЕ ретраяться — це помилки клієнтського запиту, повтор дасть той самий результат.

export async function fetchWithRetry(url, options, { retries = 2, baseDelayMs = 800 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < retries) {
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
