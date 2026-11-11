export class SendTimeoutError extends Error {
  constructor() {
    super("Send confirmation timed out");
    this.name = "SendTimeoutError";
  }
}

// The deadline covers both response headers and reading the JSON body.
export async function sendMessageRequest(url, payload, timeoutMs = 20000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Ошибка отправки: ${response.status}`);
        }
        const data = await response.json();
        if (!data?.idMessage) {
          throw new Error("GREEN-API не вернул ID сообщения. Проверьте чат получателя перед повторной отправкой.");
        }
        return data;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new SendTimeoutError());
          controller.abort();
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
