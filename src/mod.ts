/**
 * Privatus Analytics for Deno, Bun, Cloudflare Workers and Node.
 *
 * Prints the cookieless Privatus Analytics script tag, plus the HTML
 * attributes for custom events and click maps. It only builds HTML. It never
 * sends events from your server, sets no cookies and reads nothing about your
 * visitors. See https://privatusanalytics.com/docs.
 *
 * @example
 * ```ts
 * import { clickAttr, eventAttrs, tag } from "@privatus-analytics/analytics";
 *
 * tag({ siteId: "pa_YOURSITEID", enabled: true });
 * eventAttrs("Report exported", { format: "csv" });
 * clickAttr("pricing.cta");
 * ```
 *
 * @module
 */

export {
  type Attributes,
  clickAttr,
  clickData,
  escapeHtml,
  eventAttrs,
  eventData,
  isValidClick,
  MAX_KEY,
  MAX_NAME,
  MAX_PROPS,
  MAX_VALUE,
  normalizeKey,
  normalizeProps,
  type PropsInput,
  toHtml,
} from "./attributes.ts";
export { MAX_ITEMS, pagePropsJson, type PagePropValue } from "./page_props.ts";
export {
  createPrivatus,
  DEFAULT_SCRIPT_HOST,
  type ListOption,
  MODULES,
  type Privatus,
  type PrivatusOptions,
  PROPS_FUNCTION,
  type PropsOption,
  QUEUE_STUB,
  queueStub,
  shouldRender,
  SPA_MODES,
  type SpaMode,
  tag,
} from "./tag.ts";
export {
  currentEnvironment,
  ENVIRONMENT_VARIABLES,
  type EnvSource,
  readEnv,
} from "./env.ts";

/** The package version. */
export const VERSION = "1.0.0";
