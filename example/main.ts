// The example app for the Privatus Analytics conformance tests
// (https://github.com/Privatus-Analytics/conformance), made with Hono. The
// suite builds it with example/Dockerfile and checks every route in a real
// browser; its CONTRACT.md says what each route must print. The site id and
// script host come from PRIVATUS_SITE_ID and PRIVATUS_SCRIPT_HOST.
//
// Run it yourself: deno run --allow-net --allow-env example/main.ts
import { Hono } from "jsr:@hono/hono@^4";
import { clickAttr, createPrivatus, eventAttrs } from "../src/mod.ts";
import { hono as privatusMiddleware } from "../src/middleware.ts";

const NONCE = "testnonce";
const NASTY = "</script><script>window.__pwned=1</script>  &<>\"'";
const PAGE_PROPS = { plan: "pro", role: "admin", beta: true, seats: 3 };

// Forced on, so the tag prints whatever the environment. The site id and
// script host come from the environment.
const privatus = createPrivatus({ enabled: true });
const scriptHost = (Deno.env.get("PRIVATUS_SCRIPT_HOST") ??
  "https://privatusstats.com").replace(/\/$/, "");

type Env = { Variables: { secureHeadersNonce: string } };

function layout(
  title: string,
  body: string,
  props: Record<string, unknown> = PAGE_PROPS,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
${privatus.tag({ props, queueStub: true, nonce: NONCE })}
</head>
<body>
${body}
</body>
</html>
`;
}

function offPage(queueStub: boolean): string {
  const html = privatus.tag({
    enabled: false,
    props: PAGE_PROPS,
    queueStub,
    nonce: NONCE,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Off</title>
<meta name="privatus-off-start">${html}<meta name="privatus-off-end">
</head>
<body><h1>Off</h1></body>
</html>
`;
}

const AUTO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Auto inject</title>
</head>
<body><h1>Auto inject</h1><p>No tag in the template. The middleware adds it.</p></body>
</html>
`;

const app = new Hono<Env>();

// The nonce goes where Hono's secureHeaders middleware keeps it, so the
// Privatus middleware finds it there by itself.
app.use(async (c, next) => {
  c.set("secureHeadersNonce", NONCE);
  await next();
  c.header(
    "Content-Security-Policy",
    `script-src 'nonce-${NONCE}' ${scriptHost}`,
  );
});

app.get("/", (c) => c.html(layout("Home", "<h1>Home</h1>")));

app.get("/event", (c) =>
  c.html(layout(
    "Events",
    `<h1>Events</h1>
<button type="button" ${
      eventAttrs("Report exported", { format: "csv", source: "toolbar" })
    }>Export report</button>
<p><a href="#pricing" ${clickAttr("pricing.cta")}>Pricing</a></p>
<form action="/event" method="get" ${eventAttrs("Signup form")}>
  <button type="submit">Sign up</button>
</form>`,
  )));

app.get("/nasty", (c) =>
  c.html(layout(
    "Nasty",
    `<h1>Nasty values</h1>
<button type="button" ${
      eventAttrs("Nasty value", { nasty: NASTY })
    }>Nasty</button>`,
    { ...PAGE_PROPS, nasty: NASTY },
  )));

// Off with the queue stub on prints only the stub, so privatus.track calls
// still work. Off without it prints nothing.
app.get("/off", (c) => c.html(offPage(true)));
app.get("/off-plain", (c) => c.html(offPage(false)));

// Auto inject on this route only, so the other routes test the tag alone.
app.use("/auto", privatusMiddleware({ enabled: true }));
app.get("/auto", (c) => c.html(AUTO_PAGE));

const port = Number(Deno.env.get("PORT") ?? "8080");
Deno.serve({ hostname: "0.0.0.0", port }, app.fetch);
