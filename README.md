# Privatus Analytics for Deno, Bun and the web

**Real visitor numbers for your Deno, Bun or web app. No cookies, no cookie pop-up, no bots.**

You want to know if people use your Deno, Bun or web app. But Google Analytics
uses cookies, so in many countries you must show a cookie pop-up first (the box
that asks visitors to say yes to cookies). Many people click no, so they never
show up in your numbers. Bots add fake visits on top.

This package adds the Privatus Analytics script to your app. Print the tag
yourself, or let a small middleware put it in the page head for you. It works
with Hono, Oak, Fresh, Deno.serve, Bun.serve, Cloudflare Workers and Node. The
script sets no cookies and keeps no IP addresses. Bots are filtered out before
they are counted.

So you see how many real people came, which pages they looked at and where they
came from, on one simple dashboard. A report comes to your inbox each week, and
you can set alerts for when traffic jumps or drops. And you don't need a cookie
pop-up for your analytics.

**Free plan, no card:** 10,000 events a month (an event is a page view or an action you track) on up to 3 sites. [Start free at privatusanalytics.com](https://privatusanalytics.com).

- **No cookies.** No cookies and no hidden IDs on your visitors' devices, and no IP
  addresses are kept. Laws differ by country, so check your own legal advice.
- **Real people, not bots.** Known bots, data centers and spam visits are left
  out on every plan.
- **Small and fast.** The script is about 3 KB when compressed.

## What this package does

- Print the tag yourself, or let a small middleware put it in the `<head>` for
  you.
- Works with Hono, Oak, Fresh 2, `Deno.serve`, `Bun.serve`, Cloudflare Workers
  and Node.
- The package only builds HTML: the browser script tag and a few HTML
  attributes. It never sends events from your server, sets no cookies and reads
  nothing about your visitors.

You need a Privatus Analytics account to see your reports, and there is a
free plan. [Sign up at privatusanalytics.com](https://privatusanalytics.com).

## Requirements

- Deno 2, Bun 1.1 or later, Node 20 or later, or Cloudflare Workers. It uses
  only web standard features (`Request`, `Response` and web streams), and no
  Node built-in modules.
- A Privatus Analytics site id (it starts with `pa_`). You find it under Site
  settings, Tracking.

## Install

```sh
deno add jsr:@privatus-analytics/analytics   # Deno
bunx jsr add @privatus-analytics/analytics   # Bun
npx jsr add @privatus-analytics/analytics    # Node
```

For the full setup guide and every tracker option, see the
[Privatus Analytics docs](https://privatusanalytics.com/docs).

Set your site id with an environment variable:

```sh
PRIVATUS_SITE_ID=pa_YOURSITEID
```

or pass it in code: `tag({ siteId: "pa_YOURSITEID" })`.

## Add the tag

Put the tag in the `<head>` of your pages:

```ts
import { tag } from "@privatus-analytics/analytics";

const html = `<!doctype html>
<html>
  <head>
    <title>My app</title>
    ${tag()}
  </head>
  <body>...</body>
</html>`;
```

In production it prints:

```html
<script defer src="https://privatusstats.com/js/pa.js" data-site="pa_YOURSITEID"></script>
```

The tag prints nothing when there is no site id, and nothing outside
production (see below). With `queueStub: true` it then prints only the queue
stub (see [Track from your own JavaScript](#track-from-your-own-javascript)).
If your pages use a Content Security Policy (CSP) nonce, pass it as `nonce`
and every script the package prints gets it.

In JSX (Hono, Fresh, Preact), print the HTML without escaping it, for example
with `dangerouslySetInnerHTML` or Hono's `raw()`.

If you call the tag in many places, make one instance with your settings:

```ts
import { createPrivatus } from "@privatus-analytics/analytics";

export const privatus = createPrivatus({
  siteId: "pa_YOURSITEID",
  modules: ["engage", "auto"],
});

privatus.tag(); // anywhere
privatus.tag({ excludedPaths: ["/preview/*"] }); // change a setting for one page
```

### Or let the middleware add it

If you would rather not touch your pages, use the middleware from
`@privatus-analytics/analytics/middleware`. It adds the tag just before `</head>` in
`text/html` responses with status 200. It skips background requests made by page scripts (those with
the `X-Requested-With: XMLHttpRequest` header), pages without a `<head>`, pages that
already have the tag before `</head>`, and responses with a `Content-Encoding`
header (already compressed). So add it before any compression step.

The page is changed as a stream, so it is never held in memory in full. The
`Content-Length` header is removed, because the length changes. Only UTF-8
pages are changed (the usual case).

**Hono:**

```ts
import { Hono } from "@hono/hono";
import { hono as privatus } from "@privatus-analytics/analytics/middleware";

const app = new Hono();
app.use(privatus({ siteId: "pa_YOURSITEID" }));
```

It also reads `PRIVATUS_SITE_ID` and the other variables from `c.env` (handy
on Cloudflare Workers), and uses the nonce from Hono's `secureHeaders`
middleware when you set `scriptSrc: [NONCE]`.

**Oak:** add it first, so it sees what every route sends back.

```ts
import { Application } from "@oak/oak";
import { oak as privatus } from "@privatus-analytics/analytics/middleware";

const app = new Application();
app.use(privatus({ siteId: "pa_YOURSITEID" }));
```

It changes string, byte and stream bodies. Set `ctx.response.type = "html"`
(Oak also guesses HTML for text that starts with `<!DOCTYPE`, `<html` or
`<body`).

**Fresh 2:**

```ts
// routes/_middleware.ts
import { fresh as privatus } from "@privatus-analytics/analytics/middleware";

export default privatus({ siteId: "pa_YOURSITEID" });
```

or `app.use(privatus({ siteId: "pa_YOURSITEID" }))` in `main.ts`.

**Deno.serve, Bun.serve and Cloudflare Workers:** wrap your fetch handler.

```ts
import { withPrivatus } from "@privatus-analytics/analytics/middleware";

Deno.serve(withPrivatus(handler, { siteId: "pa_YOURSITEID" }));
Bun.serve({ fetch: withPrivatus(handler) });
export default { fetch: withPrivatus(handler) }; // Workers: reads env.PRIVATUS_SITE_ID
```

**Any other framework:** call `inject(response, { request })` on a web
`Response`. It returns a new `Response` with the tag, or the same one when
there is nothing to do.

The middleware types are loose on purpose, so the package does not depend on
any framework.

## Configuration

Every setting is optional except the site id. You can pass any of them to
`tag()`, `createPrivatus()`, `privatus.tag()` (for one call) and the
middleware.

```ts
createPrivatus({
  siteId: "pa_YOURSITEID", // or PRIVATUS_SITE_ID
  scriptHost: "https://privatusstats.com", // or PRIVATUS_SCRIPT_HOST
  modules: ["engage", "auto", "vitals", "clicks", "ask"],
  excludedPaths: ["/admin/*", "/preview/*"],
  domains: ["example.com", "www.example.com"],
  spa: "auto", // auto, history, hash or off
  manual: false, // true turns off the automatic pageview
  enabled: undefined, // true or false forces the tag on or off
  enabledEnvironments: ["production"],
  extraAttributes: { "data-mask": "/orders/*->/orders/:id" },
  props: (request, context) => ({ plan: "pro" }),
  queueStub: false,
  nonce: undefined,
});
```

| Setting               | Default                         | What it does                                                                                                                                               |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `siteId`              | `PRIVATUS_SITE_ID`              | The `data-site` attribute. Nothing prints without it                                                                                                       |
| `scriptHost`          | `https://privatusstats.com`     | Where `/js/pa.js` is served (or `PRIVATUS_SCRIPT_HOST`). Change it only if you host your own copy                                                          |
| `modules`             | tracker default (`engage`)      | The `data-modules` attribute. Setting it replaces the default, so keep `engage` for time on page and scroll depth. `[]` loads none                         |
| `excludedPaths`       | none                            | The `data-exclude` attribute. Path patterns the tracker never counts, like `/admin/*`                                                                                          |
| `domains`             | all hosts                       | The `data-domains` attribute. Count only these hostnames                                                                                                   |
| `spa`                 | `auto`                          | The `data-spa` attribute, for single-page apps                                                                                                             |
| `manual`              | `false`                         | The `data-manual` attribute                                                                                                                                |
| `enabled`             | unset                           | `true` or `false` forces the tag on or off everywhere                                                                                                      |
| `enabledEnvironments` | `["production"]`                | Environments that get the tag when `enabled` is unset                                                                                                      |
| `extraAttributes`     | `{}`                            | Any other `data-*` attribute. `true` prints the name alone                                                                                                 |
| `props`               | `{}`                            | Page props sent with every pageview and event. An object, or a function that gets the request. See below                                                  |
| `queueStub`           | `false`                         | Prints a small script first, so `privatus.track` calls made before the tracker loads are kept and sent later                                               |
| `nonce`               | none                            | The CSP nonce for the scripts. In the middleware it can be a function `(request, context) => string`                                                       |
| `env`                 | none                            | An object to read the environment variables from first, like the Worker `env`. The Hono middleware and `withPrivatus` fill it in for you                   |
| `autoInject`          | `true`                          | Middleware only. `false` turns it off without removing it                                                                                                  |

Each tracker attribute is explained in the
[script attributes reference](https://privatusanalytics.com/docs/tracker/attributes),
and the modules in [Modules](https://privatusanalytics.com/docs/tracker/modules).

### Development and test

The tag prints only in production, so your own clicking around never reaches
your reports. The package finds the environment from the first of these
variables that is set: `PRIVATUS_ENV`, `DENO_ENV`, `NODE_ENV`. If none is set,
it counts as development. It reads them safely on every runtime. On Deno it
reads them only when env access is already allowed (`--allow-env`), so it
never asks for permission. Without access, pass `enabled: true` or `env`.

To see the tag while you build, set `enabled: true`. The tracker also ignores
`localhost` unless you pass `data-allow-local` or `data-debug` (see
[Debug mode](https://privatusanalytics.com/docs/tracker/debug)):

```ts
tag({ enabled: true, extraAttributes: { "data-debug": "true" } });
```

### Leaving people out

Use `data-exclude` through `excludedPaths` for admin areas. To leave out
signed-in staff, print the tag only for other people:

```ts
const head = user?.isAdmin ? "" : privatus.tag();
```

## Product analytics: see which features people use

Privatus Analytics can show which buttons, forms and features people really use. You
add a few attributes to your HTML. The tracker reads them in the browser and
sends the events. Your server still sends nothing.

### Name events well

Use a short "Noun verb" name, like `Report exported` or `Invite sent`. Put the
details in props, not in the name. So write `Report exported` with
`format: "csv"`, not `Report exported as CSV`. Then all exports add up in one
place, and you can split them by format.

### Events on buttons, links and forms

`eventAttrs` returns the attributes as HTML, to put inside a tag you write
yourself:

```ts
import { eventAttrs } from "@privatus-analytics/analytics";

`<button ${eventAttrs("Report exported", { format: "csv", source: "toolbar" })}>Export</button>`;
```

It prints:

```html
<button data-privatus-event="Report exported" data-privatus-prop-format="csv" data-privatus-prop-source="toolbar">Export</button>
```

In JSX, use `eventData`. It returns an object with the full attribute names,
so you spread it into the element:

```tsx
import { eventData } from "@privatus-analytics/analytics";

<button {...eventData("Report exported", { format: "csv" })}>Export</button>;
```

With Hono's `html` template, wrap the text in `raw()`, because `html` escapes
everything you put in it.

On a form, the event is sent when the form is submitted:

```tsx
<form action="/newsletter" method="post" {...eventData("Newsletter joined", { list: "weekly" })}>
```

The rules:

- The name is trimmed and cut to 120 characters. An empty name prints nothing.
- Prop keys are made lowercase. Anything that is not a letter, a digit or `_`
  becomes `_`, so `"Report Type"` becomes `report_type`. Keys are cut to 64
  characters.
- At most 30 props. Values become text: `true`, `false`, numbers as written,
  lists joined with commas. `null` and `undefined` values are left out. Values
  are cut to 500 characters.
- Everything is escaped for HTML.
- The attributes print in every environment, even when the tag is off. They do
  nothing without the tracker, so your pages look the same in development and
  production.

### Click maps

A click map shows where people click on a page. Give the important parts a
name so they stay easy to find, even when the page changes:

```ts
`<a href="/pricing" ${clickAttr("pricing.cta")}>See plans</a>`;
<a href="/pricing" {...clickData("pricing.cta")}>See plans</a>; // JSX
```

A name may use letters, digits and `_ . : -`, up to 100 characters. Anything
else prints nothing, and outside production the package writes a warning
with `console.warn`.

### Page props: plan, role and other groups

Page props are sent with every pageview and event on the page. Use them to
split your reports by plan, role, app version, feature flag or account tier.

Set them for every page with a function. It runs on each request and gets the
web `Request` and, in the middleware, the framework context (Hono `c`, Oak
`ctx` or Fresh `ctx`):

```ts
app.use(privatus({
  props: (request, c) => ({ plan: c?.get("plan"), app_version: "2.4" }),
}));
```

A plain object works too. You can also set or change props for one page. They
are merged over the configured ones, and `null` removes one:

```ts
privatus.tag({ props: { section: "billing", role: null } });
```

The tag then prints a small script before the tracker, with your nonce when
you have one, and points the tracker at it:

```html
<script nonce="...">window.privatusPageProps=function(){return {"plan":"pro","role":"admin"}}</script>
<script defer src="https://privatusstats.com/js/pa.js" data-site="pa_YOURSITEID" data-props="privatusPageProps"></script>
```

Keys follow the same rules as event props. Numbers and `true` or `false` stay
as they are, and lists stay lists (up to 30 items). The props are escaped so
they are safe inside a script. `pagePropsJson(props)` gives you the same JSON
if you need it.

**Never put names, emails, user ids or anything that points to one person in
props.** Privatus Analytics counts visitors without any id. Put groups (like the plan or
the role), not people. The server also removes emails and long ids it finds.

### Track from your own JavaScript

For things that are not a click or a submit, call the tracker from your
browser JavaScript, as the
[JavaScript API docs](https://privatusanalytics.com/docs/tracker/javascript-api)
explain:

```js
privatus.track("Feature used", { feature: "export" });
```

If your code may run before the tracker has loaded, switch on the queue stub.
It prints a tiny script before the tracker that keeps your calls in a list and
sends them once the tracker is ready:

```ts
createPrivatus({ queueStub: true });
```

or for one page: `privatus.tag({ queueStub: true })`. The stub prints even
when the tag is off (in development, or with no site id). Then the tag prints
only the stub, with no tracker, so your `privatus.track(...)` calls never fail.
They wait in the list and are never sent. `queueStub(nonce)` returns the stub
script on its own.

### See the results

- [Funnels](https://privatusanalytics.com/docs/features/funnels): how many
  people go from one step to the next.
- [Click maps](https://privatusanalytics.com/docs/features/click-maps): where
  people click.
- [Goals](https://privatusanalytics.com/docs/features/goals): turn an event
  into a goal to count conversions.
- [Events](https://privatusanalytics.com/docs/events): every custom event and
  its props.

## Privacy

The script sets no cookies and stores nothing in the browser. The event, click
and props helpers only print HTML attributes and a small script. The package
never makes network requests and never reads IP addresses, browser details or
visitor ids. Keep people out of your props and event props: no names, emails
or user ids. See the
[privacy documentation](https://privatusanalytics.com/docs/privacy) for what is
collected.

If you have a privacy policy, it should say which tools handle your visitors' data. You can paste this:

> This website uses [Privatus Analytics](https://privatusanalytics.com/privacy-analytics) to count visits. It
> does not use cookies and does not follow you from one website to another. Your IP address is used for a moment
> to count visits and is never stored.

Change it to fit your site. The [privacy policy generator](https://privatusanalytics.com/tools/privacy-policy-generator)
makes a longer version with your site's name in it.

## Development

The checks run in Docker so your local Deno and Bun do not matter:

```sh
./run-docker.sh
```

It runs `deno fmt --check`, `deno lint`, the tests under Deno, the adapters
inside real Hono, Oak and Fresh apps, `deno publish --dry-run`, and then the
same tests under Bun.

## Contributing

Bug reports and pull requests are welcome at
https://github.com/Privatus-Analytics/jsr.

## License

MIT. See [LICENSE](LICENSE). Privatus Analytics is a product of Two Phase LLC,
Wyoming, USA.
