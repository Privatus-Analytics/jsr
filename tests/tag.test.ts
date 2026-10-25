import {
  createPrivatus,
  type PrivatusOptions,
  QUEUE_STUB,
  queueStub,
  shouldRender,
  tag,
} from "../src/mod.ts";
import {
  assert,
  assertEquals,
  assertExcludes,
  assertIncludes,
  CLEAN_ENV,
  test,
  withEnv,
} from "./harness.ts";

const base: PrivatusOptions = { siteId: "pa_TEST123456", enabled: true };
const on = (more: PrivatusOptions = {}) => tag({ ...base, ...more });

test("prints the basic snippet", () => {
  assertEquals(
    on(),
    '<script defer src="https://privatusstats.com/js/pa.js" data-site="pa_TEST123456"></script>',
  );
});

test("prints nothing without a site id", async () => {
  await withEnv(CLEAN_ENV, () => {
    assertEquals(tag({ enabled: true }), "");
    assertEquals(tag({ siteId: "  ", enabled: true }), "");
  });
});

test("prints nothing when disabled or outside production", async () => {
  assertEquals(on({ enabled: false }), "");
  await withEnv({ ...CLEAN_ENV, NODE_ENV: "test" }, () => {
    assertEquals(tag({ siteId: "pa_X" }), "");
    assert(!shouldRender({ siteId: "pa_X" }));
  });
  await withEnv(CLEAN_ENV, () => {
    assertEquals(tag({ siteId: "pa_X" }), "");
  });
});

test("is on in production by default", async () => {
  await withEnv({ ...CLEAN_ENV, NODE_ENV: "production" }, () => {
    assertIncludes(tag({ siteId: "pa_X" }), 'data-site="pa_X"');
  });
  await withEnv({ ...CLEAN_ENV, DENO_ENV: "production" }, () => {
    assertIncludes(tag({ siteId: "pa_X" }), 'data-site="pa_X"');
  });
});

test("PRIVATUS_ENV wins over NODE_ENV", async () => {
  await withEnv(
    { ...CLEAN_ENV, PRIVATUS_ENV: "staging", NODE_ENV: "production" },
    () => {
      assertEquals(tag({ siteId: "pa_X" }), "");
      assertIncludes(
        tag({ siteId: "pa_X", enabledEnvironments: ["staging"] }),
        "pa_X",
      );
    },
  );
});

test("reads the site id, host and environment from an env object", async () => {
  await withEnv(CLEAN_ENV, () => {
    const env = {
      PRIVATUS_SITE_ID: "pa_ENV",
      PRIVATUS_SCRIPT_HOST: "https://stats.example.com/",
      PRIVATUS_ENV: "production",
    };
    assertEquals(
      tag({ env }),
      '<script defer src="https://stats.example.com/js/pa.js" data-site="pa_ENV"></script>',
    );
  });
});

test("reads the site id and host from process or Deno env", async () => {
  await withEnv(
    {
      ...CLEAN_ENV,
      PRIVATUS_SITE_ID: "pa_FROMENV",
      PRIVATUS_SCRIPT_HOST: "https://cdn.example.com/",
    },
    () => {
      assertEquals(
        tag({ enabled: true }),
        '<script defer src="https://cdn.example.com/js/pa.js" data-site="pa_FROMENV"></script>',
      );
    },
  );
});

test("adds modules and exclusions", () => {
  const html = on({
    modules: ["engage", "auto"],
    excludedPaths: ["/admin/*", "/preview/*"],
  });
  assertIncludes(html, 'data-modules="engage,auto"');
  assertIncludes(html, 'data-exclude="/admin/*,/preview/*"');
});

test("an empty modules list loads none", () => {
  assertIncludes(on({ modules: [] }), 'data-modules=""');
  assertExcludes(on({ excludedPaths: [] }), "data-exclude");
});

test("adds domains, spa mode and manual mode", () => {
  const html = on({
    domains: "example.com, www.example.com",
    spa: "hash",
    manual: true,
  });
  assertIncludes(html, 'data-domains="example.com,www.example.com"');
  assertIncludes(html, 'data-spa="hash"');
  assertIncludes(html, 'data-manual="true"');
});

test("ignores an unknown spa mode and the auto default", () => {
  assertExcludes(on({ spa: "bogus" as "auto" }), "data-spa");
  assertExcludes(on({ spa: "auto" }), "data-spa");
});

test("escapes attribute values", () => {
  assertIncludes(on({ excludedPaths: ['/a"b'] }), 'data-exclude="/a&quot;b"');
  assertIncludes(tag({ siteId: "pa_<x>", enabled: true }), "pa_&lt;x&gt;");
});

test("adds extra attributes and a nonce", () => {
  const html = on({
    extraAttributes: {
      "data-mask": "/orders/*->/orders/:id",
      "data-debug": true,
      "data-off": null,
      'bad"name': "x",
    },
    nonce: "abc123",
  });
  assertIncludes(html, 'data-mask="/orders/*-&gt;/orders/:id"');
  assertIncludes(html, " data-debug ");
  assertIncludes(html, 'nonce="abc123"');
  assertExcludes(html, "data-off");
  assertExcludes(html, "bad");
});

test("page props print an inline script before the tag and data-props on it", () => {
  assertEquals(
    on({ props: { plan: "pro", role: "admin" } }),
    '<script>window.privatusPageProps=function(){return {"plan":"pro","role":"admin"}}</script>\n' +
      '<script defer src="https://privatusstats.com/js/pa.js" data-site="pa_TEST123456" data-props="privatusPageProps"></script>',
  );
});

test("the props script gets the nonce", () => {
  assert(
    on({ props: { plan: "pro" }, nonce: "abc" }).startsWith(
      '<script nonce="abc">window.privatusPageProps=',
    ),
  );
});

test("empty props print no script and no data-props", () => {
  assertExcludes(on({ props: { plan: null } }), "privatusPageProps");
});

test("props can be a function that gets the request and context", () => {
  const request = new Request("https://example.com/billing");
  const html = on({
    request,
    context: { plan: "team" },
    props: (req, ctx) => ({
      path: new URL(req!.url).pathname,
      plan: (ctx as { plan: string }).plan,
    }),
  });
  assertIncludes(html, '{"path":"/billing","plan":"team"}');
});

test("per call props are merged over configured props and null removes one", () => {
  const privatus = createPrivatus({
    ...base,
    props: { plan: "pro", role: "admin" },
  });
  assertIncludes(
    privatus.tag({ props: { role: null, tier: "gold" } }),
    '{"plan":"pro","tier":"gold"}',
  );
  assertIncludes(privatus.tag(), '{"plan":"pro","role":"admin"}');
});

test("per call options override the configuration", () => {
  const privatus = createPrivatus({ ...base, modules: ["engage"] });
  assertIncludes(
    privatus.tag({ modules: ["vitals"] }),
    'data-modules="vitals"',
  );
  assertEquals(privatus.tag({ enabled: false }), "");
  assert(privatus.shouldRender());
});

test("the props function is not called when the tag is off", () => {
  assertEquals(
    tag({
      siteId: "pa_X",
      enabled: false,
      props: () => {
        throw new Error("should not run");
      },
    }),
    "",
  );
});

test("queue stub prints the official stub first", () => {
  const parts = on({ queueStub: true, nonce: "abc", props: { plan: "pro" } })
    .split("\n");
  assertEquals(parts[0], `<script nonce="abc">${QUEUE_STUB}</script>`);
  assertIncludes(parts[1], "privatusPageProps");
  assertIncludes(parts[2], "/js/pa.js");
});

test("the queue stub is the official one", () => {
  assertEquals(
    QUEUE_STUB,
    "window.privatus=window.privatus||{q:[]};['track','pageview','props','optOut','optIn','ready'].forEach(function(m){window.privatus[m]=window.privatus[m]||function(){window.privatus.q.push([m,Array.prototype.slice.call(arguments)])}})",
  );
  assertEquals(queueStub(), `<script>${QUEUE_STUB}</script>`);
  assertEquals(queueStub("n"), `<script nonce="n">${QUEUE_STUB}</script>`);
});

test("queue stub is off by default", () => {
  assertIncludes(on({ queueStub: true }), "q:[]");
  assertExcludes(on(), "q:[]");
});
