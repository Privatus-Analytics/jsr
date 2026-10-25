import {
  fresh,
  hono,
  type HonoContextLike,
  inject,
  injectHtml,
  MAX_HEAD_BYTES,
  oak,
  type OakContextLike,
  withPrivatus,
} from "../src/middleware.ts";
import {
  assert,
  assertEquals,
  assertExcludes,
  assertIncludes,
  test,
} from "./harness.ts";

const options = { siteId: "pa_TEST123456", enabled: true };
const TAG =
  '<script defer src="https://privatusstats.com/js/pa.js" data-site="pa_TEST123456"></script>';
const PAGE = "<html><head><title>Hi</title></head><body>Hello</body></html>";

function html(body: BodyInit, headers: HeadersInit = {}, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function chunked(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

test("adds the tag before </head>", async () => {
  const res = inject(html(PAGE, { "content-length": "60" }), options);
  assertEquals(
    await res.text(),
    `<html><head><title>Hi</title>${TAG}\n</head><body>Hello</body></html>`,
  );
  assertEquals(res.headers.get("content-length"), null);
  assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
  assertEquals(res.status, 200);
});

test("finds </head> split across chunks, in any case", async () => {
  const body = chunked([
    "<html><head><ti",
    "tle>é</title></HE",
    "AD><body>",
    "x",
  ]);
  const text = await inject(html(body), options).text();
  assertEquals(
    text,
    `<html><head><title>é</title>${TAG}\n</HEAD><body>x`,
  );
});

test("keeps multibyte characters whole across chunks", async () => {
  const bytes = new TextEncoder().encode(
    "<head>日本語</head><body>日本語</body>",
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 1) {
        controller.enqueue(bytes.slice(i, i + 1));
      }
      controller.close();
    },
  });
  assertEquals(
    await inject(html(body), options).text(),
    `<head>日本語${TAG}\n</head><body>日本語</body>`,
  );
});

test("leaves pages alone that already have the tag", async () => {
  const page = `<head>${TAG}</head><body></body>`;
  assertEquals(await inject(html(page), options).text(), page);
});

test("leaves pages without a head alone", async () => {
  assertEquals(await inject(html("<p>hi</p>"), options).text(), "<p>hi</p>");
});

test("gives up after a megabyte without </head>", async () => {
  const big = "x".repeat(MAX_HEAD_BYTES + 10);
  const text = await inject(html(chunked([big, "</head>"])), options).text();
  assertEquals(text.length, big.length + 7);
  assertExcludes(text, "pa.js");
});

test("skips other statuses, types, encodings and charsets", () => {
  const cases = [
    html(PAGE, {}, 404),
    new Response(PAGE, { headers: { "content-type": "application/json" } }),
    new Response(PAGE),
    html(PAGE, { "content-encoding": "gzip" }),
    html(PAGE, { "content-type": "text/html; charset=iso-8859-1" }),
  ];
  for (const res of cases) assert(inject(res, options) === res);
});

test("skips Ajax requests", () => {
  const request = new Request("https://example.com/", {
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  const res = html(PAGE);
  assert(inject(res, { ...options, request }) === res);
});

test("skips when the tag is off or autoInject is false", () => {
  const res = html(PAGE);
  assert(inject(res, { ...options, enabled: false }) === res);
  assert(inject(res, { ...options, autoInject: false }) === res);
});

test("passes the request to props and uses a nonce function", async () => {
  const request = new Request("https://example.com/billing");
  const text = await inject(html(PAGE), {
    ...options,
    request,
    props: (req) => ({ section: new URL(req!.url).pathname.slice(1) }),
    nonce: () => "n0nce",
  }).text();
  assertIncludes(text, '<script nonce="n0nce">window.privatusPageProps');
  assertIncludes(text, '{"section":"billing"}');
  assertIncludes(text, 'nonce="n0nce" data-props="privatusPageProps"');
});

test("injectHtml works on whole strings", () => {
  assertEquals(injectHtml("<head></head>", "<x>"), "<head><x>\n</head>");
  assertEquals(injectHtml("<head></head>", ""), "<head></head>");
  assertEquals(injectHtml("<p></p>", "<x>"), "<p></p>");
  const tagged = "<head></head><script src='/js/pa.js'></script>";
  assertEquals(injectHtml(tagged, "<x>"), tagged);
});

test("withPrivatus wraps a fetch handler and reads the Worker env", async () => {
  const handler = withPrivatus(
    (_req: Request, _env: Record<string, string>) => html(PAGE),
  );
  const res = await handler(new Request("https://example.com/"), {
    PRIVATUS_SITE_ID: "pa_WORKER",
    PRIVATUS_ENV: "production",
  });
  assertIncludes(await res.text(), 'data-site="pa_WORKER"');
});

class FakeHono implements HonoContextLike {
  req: { raw: Request };
  env = { PRIVATUS_SITE_ID: "pa_HONO", PRIVATUS_ENV: "production" };
  #res: Response | undefined;
  #vars: Record<string, unknown> = {};
  constructor(url = "https://example.com/") {
    this.req = { raw: new Request(url) };
  }
  get res(): Response | undefined {
    return this.#res;
  }
  set res(value: Response | undefined) {
    // Like Hono: copy the old headers onto a new response.
    if (this.#res && value) {
      value = new Response(value.body, value);
      for (const [k, v] of this.#res.headers) {
        if (k !== "content-type") value.headers.set(k, v);
      }
    }
    this.#res = value;
  }
  get(key: string): unknown {
    return this.#vars[key];
  }
  set(key: string, value: unknown): void {
    this.#vars[key] = value;
  }
}

test("hono middleware rewrites c.res, reads c.env and the secureHeaders nonce", async () => {
  const c = new FakeHono();
  c.set("secureHeadersNonce", "hn");
  c.set("plan", "pro");
  const mw = hono<FakeHono>({
    props: (_req, ctx) => ({ plan: ctx?.get("plan") as string }),
  });
  await mw(c, () => {
    c.res = html(PAGE, { "content-length": "60" });
    return Promise.resolve();
  });
  const text = await c.res!.text();
  assertIncludes(text, 'data-site="pa_HONO"');
  assertIncludes(text, 'nonce="hn"');
  assertIncludes(text, '{"plan":"pro"}');
  assertEquals(c.res!.headers.get("content-length"), null);
});

test("hono middleware leaves JSON alone", async () => {
  const c = new FakeHono();
  const json = Response.json({ ok: true });
  await hono()(c, () => {
    c.res = json;
    return Promise.resolve();
  });
  assert(c.res === json);
});

function oakContext(body: unknown, type?: string): OakContextLike {
  return {
    request: { headers: new Headers(), source: new Request("https://e.com/") },
    response: {
      status: 200,
      headers: new Headers(type ? { "content-type": type } : {}),
      body,
    },
  };
}

test("oak middleware changes string, byte and stream bodies", async () => {
  const mw = oak(options);
  const text = oakContext(PAGE);
  await mw(text, () => Promise.resolve());
  assertIncludes(text.response.body as string, `${TAG}\n</head>`);

  const bytes = oakContext(new TextEncoder().encode(PAGE), "text/html");
  bytes.response.headers.set("content-length", "60");
  await mw(bytes, () => Promise.resolve());
  assertIncludes(
    new TextDecoder().decode(bytes.response.body as Uint8Array),
    TAG,
  );
  assertEquals(bytes.response.headers.get("content-length"), null);

  const stream = oakContext(chunked([PAGE]), "text/html");
  await mw(stream, () => Promise.resolve());
  const out = await new Response(stream.response.body as ReadableStream)
    .text();
  assertIncludes(out, TAG);
});

test("oak middleware skips plain text and Ajax", async () => {
  const mw = oak(options);
  const plain = oakContext("hello </head>");
  await mw(plain, () => Promise.resolve());
  assertEquals(plain.response.body, "hello </head>");

  const ajax = oakContext(PAGE, "text/html");
  ajax.request.headers.set("x-requested-with", "XMLHttpRequest");
  await mw(ajax, () => Promise.resolve());
  assertEquals(ajax.response.body, PAGE);

  const typed = oakContext("<div></div><head></head>");
  typed.response.type = "html";
  await mw(typed, () => Promise.resolve());
  assertIncludes(typed.response.body as string, TAG);
});

test("fresh middleware wraps ctx.next()", async () => {
  const mw = fresh(options);
  const res = await mw({
    req: new Request("https://example.com/"),
    next: () => Promise.resolve(html(PAGE)),
  });
  assertIncludes(await res.text(), TAG);
});
