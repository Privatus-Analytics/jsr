/**
 * Page props (plan, role and so on) as JSON that is safe inside a `<script>`.
 *
 * @module
 */

import {
  cut,
  MAX_VALUE,
  normalizeProps,
  type PropsInput,
} from "./attributes.ts";

/** Most items kept in one list value. */
export const MAX_ITEMS = 30;

/** A JSON value a page prop can hold. */
export type PagePropValue =
  | string
  | number
  | boolean
  | Array<
    string | number | boolean
  >;

function scalar(value: unknown): string | number | boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  return cut(String(value), MAX_VALUE);
}

function jsonValue(value: unknown): PagePropValue | undefined {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item != null)
      .slice(0, MAX_ITEMS)
      .map(scalar)
      .filter((item): item is string | number | boolean => item !== undefined);
  }
  return scalar(value);
}

const UNSAFE = /[<>&\u2028\u2029]/g;

/** Escapes `< > &` and the two line separators so JSON can sit inside a `<script>`. */
export function scriptSafeJson(json: string): string {
  return json.replace(
    UNSAFE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * The props as a JSON object string that is safe inside a `<script>`, or
 * undefined when there are no props to send.
 *
 * Keys follow the event prop rules. Numbers, booleans and lists keep their JSON types.
 */
export function pagePropsJson(props: PropsInput): string | undefined {
  // Build the JSON by hand so keys that look like numbers keep their place.
  const parts: string[] = [];
  for (const [key, raw] of normalizeProps(props)) {
    const value = jsonValue(raw);
    if (value !== undefined) {
      parts.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
    }
  }
  if (parts.length === 0) return undefined;
  return scriptSafeJson(`{${parts.join(",")}}`);
}
