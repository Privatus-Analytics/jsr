import {
  clickAttr,
  clickData,
  eventAttrs,
  eventData,
  isValidClick,
  toHtml,
} from "../src/mod.ts";
import { assert, assertEquals, test } from "./harness.ts";

test("an event becomes data attributes", () => {
  assertEquals(eventData("Export CSV", { format: "csv", source: "toolbar" }), {
    "data-privatus-event": "Export CSV",
    "data-privatus-prop-format": "csv",
    "data-privatus-prop-source": "toolbar",
  });
  assertEquals(
    eventAttrs("Export CSV", { format: "csv", source: "toolbar" }),
    'data-privatus-event="Export CSV" data-privatus-prop-format="csv" data-privatus-prop-source="toolbar"',
  );
});

test("the event name is trimmed and cut to 120 characters", () => {
  assertEquals(
    eventData("  Export CSV  ")["data-privatus-event"],
    "Export CSV",
  );
  assertEquals(
    eventData("a".repeat(200))["data-privatus-event"],
    "a".repeat(120),
  );
});

test("an empty event name gives nothing", () => {
  assertEquals(eventData("   ", { format: "csv" }), {});
  assertEquals(eventData(null), {});
  assertEquals(eventData(undefined), {});
  assertEquals(eventAttrs(""), "");
});

test("prop keys are lowercased, cleaned and cut to 64 characters", () => {
  const attrs = eventData("Saved", {
    "Report Type": "a",
    "x-y": "b",
    ["K".repeat(80)]: "c",
  });
  assertEquals(attrs["data-privatus-prop-report_type"], "a");
  assertEquals(attrs["data-privatus-prop-x_y"], "b");
  assertEquals(attrs[`data-privatus-prop-${"k".repeat(64)}`], "c");
});

test("values become strings and null values are dropped", () => {
  const attrs = eventData("Saved", {
    on: true,
    off: false,
    count: 3,
    ratio: 1.5,
    tags: ["a", null, "b"],
    gone: null,
    missing: undefined,
  });
  assertEquals(
    ["on", "off", "count", "ratio", "tags"].map((k) =>
      attrs[`data-privatus-prop-${k}`]
    ),
    ["true", "false", "3", "1.5", "a,b"],
  );
  assert(!("data-privatus-prop-gone" in attrs));
  assert(!("data-privatus-prop-missing" in attrs));
});

test("values are cut to 500 characters and at most 30 props are kept", () => {
  const props: Record<string, string> = {};
  for (let i = 1; i <= 40; i++) props[`p${i}`] = "v";
  assertEquals(Object.keys(eventData("Saved", props)).length, 31);
  assertEquals(
    eventData("Saved", { long: "x".repeat(900) })["data-privatus-prop-long"]
      .length,
    500,
  );
});

test("props keep the order you gave, even keys that look like numbers", () => {
  const attrs = eventData("Saved", new Map([["b", 1], ["2", 2], ["a", 3]]));
  assertEquals(Object.values(attrs), ["Saved", "1", "2", "3"]);
});

test("html escapes every value", () => {
  assertEquals(
    eventAttrs('Say "hi" <now>', { note: "a&b", q: "it's" }),
    'data-privatus-event="Say &quot;hi&quot; &lt;now&gt;" data-privatus-prop-note="a&amp;b" data-privatus-prop-q="it&#39;s"',
  );
});

test("a valid click name becomes a data attribute", () => {
  assertEquals(clickData("pricing.cta"), {
    "data-privatus-click": "pricing.cta",
  });
  assertEquals(clickAttr("a-b_c:d.1"), 'data-privatus-click="a-b_c:d.1"');
  assert(isValidClick("pricing.cta"));
});

test("an invalid click name gives nothing", () => {
  const warn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    for (const name of ["", "has space", "x".repeat(101), "<b>", null]) {
      assertEquals(clickData(name), {});
      assertEquals(clickAttr(name), "");
      assert(!isValidClick(name));
    }
  } finally {
    console.warn = warn;
  }
});

test("toHtml joins attributes with spaces", () => {
  assertEquals(toHtml({ a: "1", b: "<" }), 'a="1" b="&lt;"');
});
