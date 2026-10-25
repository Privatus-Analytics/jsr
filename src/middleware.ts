/**
 * Adds the Privatus Analytics tag just before `</head>` in HTML responses.
 *
 * `inject(response, options)` works with any web `Response` (Deno.serve,
 * Bun.serve, Cloudflare Workers, Node with web streams). The body is rewritten
 * as a stream, so the page is never read into memory in full. There are thin
 * middleware adapters for Hono, Oak and Fresh 2, and `withPrivatus` wraps a
 * plain `fetch` handler.
 *
 * @example Hono
 * ```ts
 * import { Hono } from "@hono/hono";
 * import { hono as privatus } from "@privatus/analytics/middleware";
 *
 * const app = new Hono();
 * app.use(privatus({ siteId: "pa_YOURSITEID" }));
 * ```
 *
 * @module
 */

import type { PrivatusOptions } from "./tag.ts";
import { createPrivatus } from "./tag.ts";

/** Text that shows the page already has the tracker. */
export const MARKER = "/js/pa.js";
/** How much of the page is held while looking for `</head>` before giving up (1 MiB). */
export const MAX_HEAD_BYTES: number = 1024 * 1024;

/** A nonce, or a function that finds it for this request. */
export type NonceOption<C = unknown> =
  | string
  | null
  | ((request: Request | undefined, context: C | undefined) =>
    | string
    | null
    | undefined);

/** Settings for `inject` and the middleware. All tag settings work here too. */
export interface InjectOptions<C = unknown>
  extends Omit<PrivatusOptions<C>, "nonce"> {
  /** `false` turns the middleware off without removing it. Default `true`. */
  autoInject?: boolean;
  /** Content Security Policy nonce, or a function that returns it. */
  nonce?: NonceOption<C>;
}

const encoder = new TextEncoder();
const HEAD_CLOSE = encoder.encode("</head>");
const MARKER_BYTES = encoder.encode(MARKER);

function lower(byte: number): number {
  return byte >= 65 && byte <= 90 ? byte + 32 : byte;
}

// Finds `needle` in `haystack` from `from`, ignoring ASCII case. The needles are
// plain ASCII, and in UTF-8 ASCII bytes never appear inside other characters,
// so a byte search is safe without decoding the page.
function indexOf(
  haystack: Uint8Array,
  needle: Uint8Array,
  from = 0,
  end = haystack.length,
): number {
  const last = end - needle.length;
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (lower(haystack[i + j]) !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (typeof chunk === "string") return encoder.encode(chunk);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return encoder.encode(String(chunk));
}

/**
 * A stream transform that puts `tagHtml` and a new line just before the first
 * `</head>`. It leaves the page alone when `/js/pa.js` shows up before
 * `</head>`, and passes everything through untouched when there is no
 * `</head>` in the first megabyte.
 */
export function headInjector(
  tagHtml: string,
): TransformStream<Uint8Array, Uint8Array> {
  const insert = encoder.encode(`${tagHtml}\n`);
  let buffer: Uint8Array = new Uint8Array(0);
  let done = false;

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const bytes = toBytes(chunk);
      if (done) {
        controller.enqueue(bytes);
        return;
      }
      const searchFrom = Math.max(0, buffer.length - HEAD_CLOSE.length + 1);
      buffer = concat(buffer, bytes);
      const at = indexOf(buffer, HEAD_CLOSE, searchFrom);
      if (at >= 0) {
        done = true;
        if (indexOf(buffer, MARKER_BYTES, 0, at) >= 0) {
          controller.enqueue(buffer);
        } else {
          controller.enqueue(buffer.subarray(0, at));
          controller.enqueue(insert);
          controller.enqueue(buffer.subarray(at));
        }
        buffer = new Uint8Array(0);
      } else if (buffer.length > MAX_HEAD_BYTES) {
        done = true;
        controller.enqueue(buffer);
        buffer = new Uint8Array(0);
      }
    },
    flush(controller) {
      if (buffer.length > 0) controller.enqueue(buffer);
    },
  });
}

/**
 * Puts `tagHtml` before `</head>` in a whole HTML string. Leaves the page alone
 * when it has no `</head>` or already has the tracker.
 */
export function injectHtml(html: string, tagHtml: string): string {
  if (tagHtml === "" || html.includes(MARKER)) return html;
  const at = html.search(/<\/head>/i);
  if (at < 0) return html;
  return `${html.slice(0, at)}${tagHtml}\n${html.slice(at)}`;
}

function isHtml(contentType: string | null | undefined): boolean {
  const type = (contentType ?? "").toLowerCase();
  if (!type.startsWith("text/html")) return false;
  const charset = /charset\s*=\s*"?([^";\s]+)/.exec(type)?.[1];
  return charset === undefined || charset === "utf-8" || charset === "utf8";
}

function isAjax(headers: Headers | undefined): boolean {
  return (headers?.get("x-requested-with") ?? "").toLowerCase() ===
    "xmlhttprequest";
}

function resolveNonce<C>(
  nonce: NonceOption<C> | undefined,
  request: Request | undefined,
  context: C | undefined,
): string | undefined {
  const value = typeof nonce === "function" ? nonce(request, context) : nonce;
  return value ? String(value) : undefined;
}

// The tag for this request, or "" when it should not be added.
function tagFor<C>(
  options: InjectOptions<C>,
  request: Request | undefined,
  context: C | undefined,
  requestHeaders: Headers | undefined,
): string {
  if (options.autoInject === false) return "";
  if (isAjax(requestHeaders ?? request?.headers)) return "";
  const { nonce, ...rest } = options;
  const privatus = createPrivatus<C>({ ...rest, request, context });
  if (!privatus.shouldRender()) return "";
  return privatus.tag({ nonce: resolveNonce(nonce, request, context) });
}

/**
 * Returns a copy of `response` with the tag added just before `</head>`.
 *
 * Only 200 responses with a `text/html` (UTF-8) content type and no
 * `Content-Encoding` are changed. Ajax requests (`X-Requested-With:
 * XMLHttpRequest`) are skipped. Pass `request` so that check and your props
 * function can see it. The `Content-Length` header is removed, because the
 * body is now streamed with a different length.
 */
export function inject<C = unknown>(
  response: Response,
  options: InjectOptions<C> = {},
): Response {
  if (
    response.status !== 200 || response.body === null ||
    response.bodyUsed || !isHtml(response.headers.get("content-type")) ||
    response.headers.has("content-encoding")
  ) {
    return response;
  }
  const tagHtml = tagFor(options, options.request, options.context, undefined);
  if (tagHtml === "") return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(response.body.pipeThrough(headInjector(tagHtml)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** A fetch handler: Deno.serve, Bun.serve, or the `fetch` of a Cloudflare Worker. */
export type FetchHandler<A extends unknown[] = unknown[]> = (
  request: Request,
  ...rest: A
) => Response | Promise<Response>;

/**
 * Wraps a fetch handler so its HTML responses get the tag.
 *
 * ```ts
 * Deno.serve(withPrivatus(handler, { siteId: "pa_YOURSITEID" }));
 * export default { fetch: withPrivatus(handler) }; // Cloudflare Workers
 * ```
 *
 * On Cloudflare Workers the second argument (`env`) is used to read
 * PRIVATUS_SITE_ID and the other variables when you do not pass `env`.
 */
export function withPrivatus<A extends unknown[]>(
  handler: FetchHandler<A>,
  options: InjectOptions<Request> = {},
): (request: Request, ...rest: A) => Promise<Response> {
  return async (request: Request, ...rest: A): Promise<Response> => {
    const response = await handler(request, ...rest);
    const workerEnv = rest[0];
    const env = options.env ??
      (workerEnv && typeof workerEnv === "object" &&
          !(workerEnv instanceof Request)
        ? workerEnv as Record<string, unknown>
        : undefined);
    return inject<Request>(response, { ...options, env, request });
  };
}

/** The parts of a Hono context this middleware uses. */
export interface HonoContextLike {
  req: { raw: Request };
  res: Response | undefined;
  env?: unknown;
  get?: unknown;
}

/**
 * Hono middleware. It also reads environment variables from `c.env` (handy on
 * Cloudflare Workers) and the nonce from Hono's `secureHeaders` middleware.
 *
 * ```ts
 * app.use(hono({ siteId: "pa_YOURSITEID", props: (_req, c) => ({ plan: c?.get("plan") }) }));
 * ```
 */
export function hono<C extends HonoContextLike = HonoContextLike>(
  options: InjectOptions<C> = {},
): (c: C, next: () => Promise<void>) => Promise<void> {
  return async (c: C, next: () => Promise<void>): Promise<void> => {
    await next();
    const response = c.res;
    if (!response) return;
    const env = options.env ??
      (c.env && typeof c.env === "object"
        ? c.env as Record<string, unknown>
        : undefined);
    const nonce = options.nonce !== undefined ? options.nonce : honoNonce(c);
    const changed = inject<C>(response, {
      ...options,
      env,
      nonce,
      request: c.req.raw,
      context: c,
    });
    if (changed === response) return;
    // Clear first: Hono copies the old headers (with the old Content-Length)
    // onto a new response unless the old one is gone.
    c.res = undefined;
    c.res = changed;
  };
}

function honoNonce(c: HonoContextLike): string | undefined {
  if (typeof c.get !== "function") return undefined;
  try {
    const value = (c.get as (key: string) => unknown).call(
      c,
      "secureHeadersNonce",
    );
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The parts of an Oak context this middleware uses. */
export interface OakContextLike {
  request: { headers: Headers; source?: Request };
  response: {
    status: number;
    headers: Headers;
    body?: unknown;
    type?: string;
  };
}

/**
 * Oak middleware. Add it first, so it sees the response every route makes.
 *
 * ```ts
 * app.use(oak({ siteId: "pa_YOURSITEID" }));
 * ```
 *
 * It changes string, `Uint8Array` and stream bodies. Set
 * `ctx.response.type = "html"` (Oak also guesses HTML for strings that start
 * with `<!DOCTYPE`, `<html` or `<body`).
 */
export function oak<C extends OakContextLike = OakContextLike>(
  options: InjectOptions<C> = {},
): (ctx: C, next: () => Promise<unknown>) => Promise<void> {
  return async (ctx: C, next: () => Promise<unknown>): Promise<void> => {
    await next();
    const res = ctx.response;
    const body = res.body;
    if (res.status !== 200 || res.headers.has("content-encoding")) return;
    if (!oakHtml(res, body)) return;
    const isText = typeof body === "string";
    const isBytes = body instanceof Uint8Array;
    const isStream = body instanceof ReadableStream;
    if (!isText && !isBytes && !isStream) return;

    const tagHtml = tagFor(
      options,
      ctx.request.source,
      ctx,
      ctx.request.headers,
    );
    if (tagHtml === "") return;

    if (isText) {
      res.body = injectHtml(body, tagHtml);
    } else if (isBytes) {
      res.body = encoder.encode(
        injectHtml(new TextDecoder().decode(body), tagHtml),
      );
    } else {
      res.body = (body as ReadableStream<Uint8Array>).pipeThrough(
        headInjector(tagHtml),
      );
    }
    res.headers.delete("content-length");
  };
}

function oakHtml(res: OakContextLike["response"], body: unknown): boolean {
  const header = res.headers.get("content-type");
  if (header) return isHtml(header);
  const type = (res.type ?? "").toLowerCase();
  if (type) return type === "html" || type === ".html" || isHtml(type);
  return typeof body === "string" &&
    /^\s*<(?:!DOCTYPE|html|body)/i.test(body);
}

/** The parts of a Fresh 2 context this middleware uses. */
export interface FreshContextLike {
  req: Request;
  next(): Promise<Response>;
}

/**
 * Fresh 2 middleware. Put it in `routes/_middleware.ts` or pass it to `app.use`.
 *
 * ```ts
 * export default fresh({ siteId: "pa_YOURSITEID" });
 * ```
 */
export function fresh<C extends FreshContextLike = FreshContextLike>(
  options: InjectOptions<C> = {},
): (ctx: C) => Promise<Response> {
  return async (ctx: C): Promise<Response> => {
    const response = await ctx.next();
    return inject<C>(response, { ...options, request: ctx.req, context: ctx });
  };
}
