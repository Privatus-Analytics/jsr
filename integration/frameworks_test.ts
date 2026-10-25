// Runs the adapters inside the real frameworks. Needs network access the
// first time to download them: deno test --allow-env --allow-net integration/
import { Hono } from "jsr:@hono/hono@^4";
import { secureHeaders } from "jsr:@hono/hono@^4/secure-headers";
import { NONCE } from "jsr:@hono/hono@^4/secure-headers";
import { Application } from "jsr:@oak/oak@^17";
import { App } from "jsr:@fresh/core@^2";
import { fresh, hono, oak } from "../src/middleware.ts";

const PAGE = "<html><head><title>Hi</title></head><body>Hello</body></html>";
const options = { siteId: "pa_TEST123456", enabled: true };

function check(text: string, contentLength: string | null) {
  if (
    !text.includes('data-site="pa_TEST123456"') ||
    !text.includes("</script>\n</head>")
  ) {
    throw new Error(`tag missing: ${text}`);
  }
  if (contentLength !== null && Number(contentLength) !== text.length) {
    throw new Error(`content-length ${contentLength} != ${text.length}`);
  }
}

Deno.test("real Hono app", async () => {
  const app = new Hono();
  app.use(secureHeaders({ contentSecurityPolicy: { scriptSrc: [NONCE] } }));
  app.use(hono({ ...options, props: { plan: "pro" } }));
  app.get("/", (c) => c.html(PAGE));
  app.get("/api", (c) => c.json({ ok: true }));
  const res = await app.request("/");
  const text = await res.text();
  check(text, res.headers.get("content-length"));
  if (!/nonce="[^"]+">window\.privatusPageProps/.test(text)) {
    throw new Error(`nonce missing: ${text}`);
  }
  const api = await app.request("/api");
  if ((await api.text()).includes("pa.js")) throw new Error("json changed");
});

Deno.test("real Oak app", async () => {
  const app = new Application();
  app.use(oak(options));
  app.use((ctx) => {
    ctx.response.type = "html";
    ctx.response.body = PAGE;
  });
  const res = await app.handle(new Request("http://localhost/"));
  const text = await res!.text();
  check(text, res!.headers.get("content-length"));
});

Deno.test("real Fresh 2 app", async () => {
  const app = new App()
    .use(fresh(options))
    .get(
      "/",
      () => new Response(PAGE, { headers: { "content-type": "text/html" } }),
    );
  const handler = app.handler();
  const res = await handler(new Request("http://localhost/"));
  const text = await res.text();
  check(text, res.headers.get("content-length"));
});
