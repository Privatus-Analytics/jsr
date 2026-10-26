# Changelog

## 1.0.1 - 2026-10-26

- README: a new intro that starts with the problem Privatus Analytics solves.

## 1.0.0 - 2026-10-25

- Initial release on JSR as `@privatus-analytics/analytics`.
- `tag()` and `createPrivatus()` print the script tag. Settings for site id, script host, modules,
  excluded paths, domains, single-page app mode, manual mode, extra attributes and nonce.
- On only in production by default (`PRIVATUS_ENV`, `DENO_ENV` or `NODE_ENV`), read safely on Deno,
  Bun, Node and Cloudflare Workers.
- `eventAttrs` and `eventData` for custom events on buttons, links and forms.
- `clickAttr` and `clickData` for click map names.
- Page props (an object, or a function that gets the request) that print the `privatusPageProps`
  script and `data-props`. `pagePropsJson` for the same JSON.
- `queueStub` setting and `queueStub()` helper, so `privatus.track` calls made before the tracker loads are kept.
- `@privatus-analytics/analytics/middleware`: `inject(response)` adds the tag before `</head>` as a stream,
  plus `hono`, `oak`, `fresh` and `withPrivatus` (for `Deno.serve`, `Bun.serve` and Workers).
- When the tag is off (turned off, outside production by default, or no site id), `tag()` with
  `queueStub: true` now prints the queue stub alone, so `privatus.track` calls never fail. It prints
  no tracker and no page props, and does not call a props function. With `queueStub` off it still
  prints nothing. The middleware still adds nothing when the tag is off.
- `example/`: a Hono app for the conformance tests.
