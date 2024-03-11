import { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCode } from "hono/utils/http-status";

type Bindings = {
  BUCKET: R2Bucket;
  R2_TEST_FILE_KEY: string;
  FETCH_TEST_ENDPOINT_PATH: string;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * R2にテストファイルをアップロードする (管理コンソールからアップロードしても良い)
 *
 * $ curl -X PUT -T ${filename} ${url}/test-file
 * $ curl -X PUT -T test.txt https://localhost:49755/test-file
 */
app.put("/r2-test-file", async (c) => {
  const bucket = c.env.BUCKET;
  const key = c.env.R2_TEST_FILE_KEY;
  const body = await c.req.arrayBuffer();
  await bucket.put(c.env.R2_TEST_FILE_KEY, body);

  return new Response(`Put ${key} successfully!`);
});

/**
 * サブリクエストを発行する
 *
 * - offset: ログ出力時に使用するオフセット (default: 0)
 * - limit: リクエスト回数 (default: 0)
 * - r2-connection-enabled: R2Bucketに接続するかどうか (default: false)
 *   - true: R2Bucketに対するgetリクエストを発行する
 *   - false: 外部URLに対してHTTP GETリクエストを発行する
 *
 * e.g. GET /?offset=0&limit=1000&r2-connection-enabled=true
 */
app.get("/", async (c) => {
  const offset = Number(c.req.query("offset") ?? 0);
  const limit = Number(c.req.query("limit") ?? 0);
  const r2ConnectionEnabled = c.req.query("r2-connection-enabled") === "true";
  const paramInfoInMsg = `offset: ${offset}, limit: ${limit}, r2-connection-enabled: ${r2ConnectionEnabled}`;
  console.log(`start sub request. ${paramInfoInMsg}`);

  try {
    await fetchForEach(c, r2ConnectionEnabled, offset, limit);
  } catch (e) {
    console.error("error!", e);
    if (e instanceof HTTPException) {
      throw e;
    }

    const message = e instanceof Error ? e.message : "unknown error";
    throw new HTTPException(500, {
      message: `${message}`,
    });
  }

  console.log(`successfully sub request. ${paramInfoInMsg}`);
  return c.text(`successfully sub request. ${paramInfoInMsg}`);
});

async function fetchForEach(
  c: Context,
  r2ConnectionEnabled: boolean,
  offset: number,
  limit: number,
) {
  for (let i = offset; i < offset + limit; i++) {
    if (r2ConnectionEnabled) {
      // 1001件以上同じWorkerでfetchするとエラー (サブリクエスト数の上限超過)
      //   - Too many API requests by single worker invocation.
      await fetchFromR2Object(c.env.BUCKET, c.env.R2_TEST_FILE_KEY);
    } else {
      // 1001件以上同じWorkerでfetchするとエラー (サブリクエスト数の上限超過)
      //   - Too many subrequests.
      await fetchFromUrl(c.env.FETCH_TEST_ENDPOINT_PATH);
    }
    console.log(`end request i: ${i}`);
  }
}

async function fetchFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new HTTPException(response.status as StatusCode, {
      message: `${response.statusText}. url: ${url}`,
    });
  }
}

async function fetchFromR2Object(bucket: R2Bucket, key: string) {
  const obj = await bucket.get(key);
  if (!obj) {
    throw new HTTPException(404, {
      message: `Not found. key: ${key}`,
    });
  }
}

export default app;
