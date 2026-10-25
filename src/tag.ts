/**
 * Builds the Privatus Analytics script tag.
 *
 * @module
 */

import { escapeHtml, normalizeKey, type PropsInput } from "./attributes.ts";
import { currentEnvironment, type EnvSource, readEnv } from "./env.ts";
import { pagePropsJson } from "./page_props.ts";

/** Where `/js/pa.js` is served from by default. */
export const DEFAULT_SCRIPT_HOST = "https://privatusstats.com";
/** Tracker modules you can load. */
export const MODULES: readonly string[] = [
  "engage",
  "auto",
  "vitals",
  "clicks",
  "ask",
];
/** Single-page app modes. */
export const SPA_MODES: readonly string[] = ["auto", "history", "hash", "off"];
/** The name of the page props function the tracker reads. */
export const PROPS_FUNCTION = "privatusPageProps";
/** The official queue stub, so `privatus.track` calls made before pa.js loads are kept. */
export const QUEUE_STUB =
  "window.privatus=window.privatus||{q:[]};['track','pageview','props','optOut','optIn','ready']" +
  ".forEach(function(m){window.privatus[m]=window.privatus[m]||function(){window.privatus.q.push(" +
  "[m,Array.prototype.slice.call(arguments)])}})";

/** One of the single-page app modes. */
export type SpaMode = "auto" | "history" | "hash" | "off";

/** A list setting: an array, or one comma separated string. */
export type ListOption = string | readonly string[] | null;

/**
 * Page props: an object, or a function called on each request.
 * The function gets the web `Request` (when there is one) and the framework
 * context (Hono `c`, Oak `ctx`, Fresh `ctx`) when a middleware calls it.
 */
export type PropsOption<C = unknown> =
  | PropsInput
  | ((request: Request | undefined, context: C | undefined) => PropsInput);

/** Settings for the tag. Every one is optional except the site id. */
export interface PrivatusOptions<C = unknown> {
  /** The site id (starts with `pa_`). Falls back to the PRIVATUS_SITE_ID environment variable. */
  siteId?: string | null;
  /** Origin that serves `/js/pa.js`. Falls back to PRIVATUS_SCRIPT_HOST, then https://privatusstats.com. */
  scriptHost?: string | null;
  /** Tracker modules, for example `["engage", "auto"]`. Unset keeps the tracker default. `[]` loads none. */
  modules?: ListOption;
  /** Path globs the tracker never counts, for example `["/admin/*"]`. */
  excludedPaths?: ListOption;
  /** Hostnames to count. Unset counts every host. */
  domains?: ListOption;
  /** One of auto, history, hash, off. Only a mode other than auto is printed. */
  spa?: SpaMode | null;
  /** `true` turns off the automatic pageview. */
  manual?: boolean | null;
  /** `true` or `false` forces the tag on or off. Unset uses `enabledEnvironments`. */
  enabled?: boolean | null;
  /** Environments that get the tag when `enabled` is unset. Default `["production"]`. */
  enabledEnvironments?: readonly string[];
  /** Other `data-*` attributes, for example `{ "data-mask": "/orders/*->/orders/:id" }`. */
  extraAttributes?: Record<
    string,
    string | number | boolean | null | undefined
  >;
  /** Page props sent with every pageview and event. Never put anything that points to one person here. */
  props?: PropsOption<C>;
  /** `true` prints the queue stub first. */
  queueStub?: boolean | null;
  /** Content Security Policy nonce for the tag and the inline scripts. */
  nonce?: string | null;
  /** The current request, passed to a props function. */
  request?: Request;
  /** The framework context, passed to a props function. */
  context?: C;
  /** Where to read environment variables first, for example the Worker `env` or Hono `c.env`. */
  env?: EnvSource;
}

/** What `createPrivatus` returns. */
export interface Privatus<C = unknown> {
  /** The settings this instance was made with. */
  readonly options: PrivatusOptions<C>;
  /** The tag HTML. `overrides` change settings for one call. Props are merged over the configured ones. */
  tag(overrides?: PrivatusOptions<C>): string;
  /** Whether a tag would print (there is a site id and the tag is on). */
  shouldRender(overrides?: PrivatusOptions<C>): boolean;
}

function pick<C, K extends keyof PrivatusOptions<C>>(
  config: PrivatusOptions<C>,
  overrides: PrivatusOptions<C>,
  key: K,
): PrivatusOptions<C>[K] {
  return overrides[key] !== undefined ? overrides[key] : config[key];
}

function list(value: ListOption | undefined): string[] | null {
  if (value == null) return null;
  const items = typeof value === "string" ? [value] : Array.from(value);
  return items
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function resolveSiteId<C>(
  config: PrivatusOptions<C>,
  overrides: PrivatusOptions<C>,
): string | undefined {
  const value = String(pick(config, overrides, "siteId") ?? "").trim();
  if (value !== "") return value;
  return readEnv("PRIVATUS_SITE_ID", pick(config, overrides, "env"));
}

function resolveScriptHost<C>(
  config: PrivatusOptions<C>,
  overrides: PrivatusOptions<C>,
): string {
  let value = String(pick(config, overrides, "scriptHost") ?? "").trim();
  if (value === "") {
    value = readEnv("PRIVATUS_SCRIPT_HOST", pick(config, overrides, "env")) ??
      "";
  }
  if (value === "") value = DEFAULT_SCRIPT_HOST;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isEnabled<C>(
  config: PrivatusOptions<C>,
  overrides: PrivatusOptions<C>,
): boolean {
  const forced = pick(config, overrides, "enabled");
  if (forced != null) return forced === true;
  const environments = pick(config, overrides, "enabledEnvironments") ??
    ["production"];
  const environment = currentEnvironment(pick(config, overrides, "env"));
  return environments.map(String).includes(environment);
}

function resolveProps<C>(
  props: PropsOption<C> | undefined,
  request: Request | undefined,
  context: C | undefined,
): Map<string, unknown> {
  const value = typeof props === "function" ? props(request, context) : props;
  const keyed = new Map<string, unknown>();
  if (value == null || typeof value !== "object") return keyed;
  const pairs = value instanceof Map
    ? Array.from(value.entries())
    : Object.entries(value);
  for (const [key, item] of pairs) keyed.set(normalizeKey(key), item);
  return keyed;
}

function inlineScript(code: string, nonce: string | null | undefined): string {
  const opening = nonce ? `<script nonce="${escapeHtml(nonce)}">` : "<script>";
  return `${opening}${code}</script>`;
}

const ATTRIBUTE_NAME = /^[^\s"'<>\/=]+$/;

function scriptTag(attrs: Map<string, string | true>): string {
  const parts = Array.from(attrs.entries()).map(([name, value]) =>
    value === true ? name : `${name}="${escapeHtml(value)}"`
  );
  return `<script ${parts.join(" ")}></script>`;
}

function render<C>(
  config: PrivatusOptions<C>,
  overrides: PrivatusOptions<C>,
): string {
  const siteId = resolveSiteId(config, overrides);
  if (!siteId || !isEnabled(config, overrides)) return "";

  const request = pick(config, overrides, "request");
  const context = pick(config, overrides, "context");
  const nonce = pick(config, overrides, "nonce");
  const props = resolveProps(config.props, request, context);
  if (overrides.props !== undefined) {
    for (
      const [key, value] of resolveProps(overrides.props, request, context)
    ) {
      props.set(key, value);
    }
  }
  const propsJson = pagePropsJson(props);

  const attrs = new Map<string, string | true>([
    ["defer", true],
    ["src", `${resolveScriptHost(config, overrides)}/js/pa.js`],
    ["data-site", siteId],
  ]);
  const lists: Array<[keyof PrivatusOptions<C>, string]> = [
    ["modules", "data-modules"],
    ["excludedPaths", "data-exclude"],
    ["domains", "data-domains"],
  ];
  for (const [key, attribute] of lists) {
    const values = list(pick(config, overrides, key) as ListOption | undefined);
    // Unset keeps the tracker default. An empty modules list loads none.
    if (values && (key === "modules" || values.length > 0)) {
      attrs.set(attribute, values.join(","));
    }
  }
  const spa = String(pick(config, overrides, "spa") ?? "");
  if (SPA_MODES.includes(spa) && spa !== "auto") attrs.set("data-spa", spa);
  if (pick(config, overrides, "manual") === true) {
    attrs.set("data-manual", "true");
  }
  const extra = pick(config, overrides, "extraAttributes") ?? {};
  for (const [name, value] of Object.entries(extra)) {
    if (value == null || !ATTRIBUTE_NAME.test(name)) {
      continue;
    }
    attrs.set(name, value === true ? true : String(value));
  }
  if (nonce) attrs.set("nonce", String(nonce));
  if (propsJson) attrs.set("data-props", PROPS_FUNCTION);

  const html: string[] = [];
  if (pick(config, overrides, "queueStub") === true) {
    html.push(inlineScript(QUEUE_STUB, nonce));
  }
  if (propsJson) {
    html.push(
      inlineScript(
        `window.${PROPS_FUNCTION}=function(){return ${propsJson}}`,
        nonce,
      ),
    );
  }
  html.push(scriptTag(attrs));
  return html.join("\n");
}

/**
 * Makes a Privatus instance with your settings. Use it when you call the tag
 * in many places:
 *
 * ```ts
 * const privatus = createPrivatus({ siteId: "pa_YOURSITEID", props: { app_version: "2.4" } });
 * privatus.tag({ props: { section: "billing" } });
 * ```
 */
export function createPrivatus<C = unknown>(
  options: PrivatusOptions<C> = {},
): Privatus<C> {
  return {
    options,
    tag: (overrides = {}) => render(options, overrides),
    shouldRender: (overrides = {}) =>
      !!resolveSiteId(options, overrides) && isEnabled(options, overrides),
  };
}

/**
 * The script tag HTML. Put it in the `<head>`.
 *
 * ```ts
 * tag({ siteId: "pa_YOURSITEID" });
 * // <script defer src="https://privatusstats.com/js/pa.js" data-site="pa_YOURSITEID"></script>
 * ```
 *
 * Returns "" when there is no site id or the tag is off (by default it is on
 * only when PRIVATUS_ENV, DENO_ENV or NODE_ENV is "production").
 */
export function tag<C = unknown>(options: PrivatusOptions<C> = {}): string {
  return render(options, {});
}

/** Whether `tag(options)` would print anything. */
export function shouldRender<C = unknown>(
  options: PrivatusOptions<C> = {},
): boolean {
  return createPrivatus(options).shouldRender();
}

/** The queue stub as a script tag, with the nonce when you pass one. */
export function queueStub(nonce?: string | null): string {
  return inlineScript(QUEUE_STUB, nonce);
}
