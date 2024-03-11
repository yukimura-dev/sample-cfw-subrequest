import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCode } from "hono/utils/http-status";

type Bindings = {
  SUB_SERVICE: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * ServiceBindingで接続したWorkersを用いてサブリクエストを発行する
 *
 * - total-request:リクエストの総数 (default: 1)
 * - max-request-per-worker: 1つのWorkerで発行するリクエストの最大数 (default: 1)
 * - r2-connection-enabled: R2Bucketに接続するかどうか (default: false)
 *   - true: R2Bucketに対するgetリクエストを発行する
 *   - false: 外部URLに対してHTTP GETリクエストを発行する
 *
 * e.g. GET /?total-request=2001&max-request-per-worker=1000&r2-connection-enabled=true
 */
app.get("/", async (c) => {
  const totalRequest = Number(c.req.query("total-request") ?? 1);
  const maxRequestPerWorker = Number(
    c.req.query("max-request-per-worker") ?? 1,
  );
  const r2ConnectionEnabled =
    c.req.query("r2-connection-enabled") === "true" ? "true" : "false";

  const loopCount = Math.ceil(totalRequest / maxRequestPerWorker);
  for (let i = 0; i < loopCount; i++) {
    const offset = i * maxRequestPerWorker;
    let limit = maxRequestPerWorker;
    if (offset + maxRequestPerWorker > totalRequest) {
      limit = totalRequest - offset;
    }

    // ServiceBindingsで接続したWorker宛にfetchする場合、引数のURLは絶対パスではければならない。ドメイン名は何を指定しても良い。
    const urlWithQuery = `https://localhost/?offset=${offset}&limit=${limit}&r2-connection-enabled=${r2ConnectionEnabled}`;
    try {
      const response = await c.env.SUB_SERVICE.fetch(urlWithQuery, c.req.raw);
      if (!response.ok) {
        const msg = await response.text();
        throw new HTTPException(response.status as StatusCode, {
          message: msg,
        });
      }
      await response.text();
    } catch (e) {
      console.error("error!", e);
      if (e instanceof HTTPException) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : "unknown error";
      throw new HTTPException(500, {
        message: `${msg}`,
      });
    }
  }

  return c.text(
    `all request success! totalRequest: ${totalRequest}, maxRequestPerWorker: ${maxRequestPerWorker}`,
  );
});

export default app;
