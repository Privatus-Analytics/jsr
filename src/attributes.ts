/**
 * Data attributes the tracker reads for custom events and click maps.
 *
 * @module
 */

import { productionLike } from "./env.ts";

/** Longest event name, in characters. */
export const MAX_NAME = 120;
/** Longest prop key, in characters. */
export const MAX_KEY = 64;
/** Most props kept per event or page. */
export const MAX_PROPS = 30;
/** Longest prop value, in characters. */
export const MAX_VALUE = 500;

const CLICK_NAME = /^[A-Za-z0-9_.:-]{1,100}$/;

/** Props as a plain object or a Map. Keys are cleaned, `null` and `undefined` values are left out. */
export type PropsInput =
  | Record<string, unknown>
  | Map<string, unknown>
  | null
  | undefined;

/** An attribute map: attribute name to value. */
export type Attributes = Record<string, string>;

/** Escapes `& < > " '` so a value is safe inside an HTML attribute. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Cuts a string to `max` characters (code points, not UTF-16 units). */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

/** Lowercases a key, swaps anything outside a-z 0-9 _ for _, and cuts it to 64 characters. */
export function normalizeKey(key: unknown): string {
  return String(key).toLowerCase().replace(/[^a-z0-9_]/gu, "_").slice(
    0,
    MAX_KEY,
  );
}

function entries(props: PropsInput): Array<[string, unknown]> {
  if (props == null) return [];
  if (props instanceof Map) return Array.from(props.entries());
  if (typeof props !== "object") return [];
  return Object.entries(props);
}

/**
 * Cleans the keys, drops `null` and `undefined` values and keeps the first 30 props.
 * Returns a Map so the order is always the order you gave.
 */
export function normalizeProps(props: PropsInput): Map<string, unknown> {
  const clean = new Map<string, unknown>();
  for (const [rawKey, value] of entries(props)) {
    const key = normalizeKey(rawKey);
    if (key !== "" && value != null) clean.set(key, value);
  }
  return new Map(Array.from(clean.entries()).slice(0, MAX_PROPS));
}

/** A prop value as attribute text: lists joined with commas, cut to 500 characters. */
export function stringValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.filter((item) => item != null).map(String).join(",")
    : String(value);
  return cut(text, MAX_VALUE);
}

/**
 * The attributes for a custom event, as an object you can spread into JSX:
 *
 * ```tsx
 * <button {...eventData("Report exported", { format: "csv" })}>Export</button>
 * ```
 *
 * Returns `{}` when the name is empty.
 */
export function eventData(name: unknown, props?: PropsInput): Attributes {
  const clean = cut(String(name ?? "").trim(), MAX_NAME).trim();
  if (clean === "") return {};
  const attrs: Attributes = { "data-privatus-event": clean };
  for (const [key, value] of normalizeProps(props)) {
    attrs[`data-privatus-prop-${key}`] = stringValue(value);
  }
  return attrs;
}

/**
 * The attributes for a custom event, as HTML to put inside a tag:
 *
 * ```ts
 * `<button ${eventAttrs("Report exported", { format: "csv" })}>Export</button>`
 * ```
 *
 * On a `<form>` the event is sent when the form is submitted.
 * Prints nothing when the name is empty. Every value is escaped.
 */
export function eventAttrs(name: unknown, props?: PropsInput): string {
  return toHtml(eventData(name, props));
}

/** Whether a click map name is valid: letters, digits, `_ . : -` and at most 100 characters. */
export function isValidClick(name: unknown): boolean {
  return name != null && CLICK_NAME.test(String(name));
}

/**
 * The click map name as an object for JSX: `<a {...clickData("pricing.cta")}>`.
 * Returns `{}` when the name is not valid.
 */
export function clickData(name: unknown): Attributes {
  if (isValidClick(name)) return { "data-privatus-click": String(name) };
  warnInvalidClick(name);
  return {};
}

/** The click map name attribute as HTML: `data-privatus-click="pricing.cta"`, or "" when not valid. */
export function clickAttr(name: unknown): string {
  return toHtml(clickData(name));
}

/** Turns an attribute map into HTML, with every value escaped. */
export function toHtml(attrs: Attributes): string {
  return Object.entries(attrs)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
}

function warnInvalidClick(name: unknown): void {
  if (productionLike()) return;
  try {
    console.warn(
      `[privatus-analytics] click map name ${
        JSON.stringify(name ?? null)
      } is not valid. Use letters, digits and _ . : - only, at most 100 characters. Nothing was printed.`,
    );
  } catch {
    // No console. Nothing to do.
  }
}
