import { pagePropsJson } from "../src/mod.ts";
import { assert, assertEquals, test } from "./harness.ts";

test("props become a JSON object", () => {
  assertEquals(
    pagePropsJson({ plan: "pro", role: "admin" }),
    '{"plan":"pro","role":"admin"}',
  );
});

test("empty props give undefined", () => {
  assertEquals(pagePropsJson({}), undefined);
  assertEquals(pagePropsJson(null), undefined);
  assertEquals(pagePropsJson(undefined), undefined);
  assertEquals(pagePropsJson({ gone: null }), undefined);
});

test("numbers, booleans and lists keep their JSON types", () => {
  assertEquals(
    pagePropsJson({
      seats: 5,
      ratio: 1.5,
      beta: true,
      old: false,
      flags: ["a", null, "b", 3],
    }),
    '{"seats":5,"ratio":1.5,"beta":true,"old":false,"flags":["a","b",3]}',
  );
});

test("numbers that are not finite are dropped", () => {
  assertEquals(pagePropsJson({ a: NaN, b: Infinity, c: 1 }), '{"c":1}');
});

test("keys are cleaned like event props", () => {
  assertEquals(
    pagePropsJson({ "App Version": "2.1" }),
    '{"app_version":"2.1"}',
  );
});

test("limits props, list items and value length", () => {
  const many: Record<string, number> = {};
  for (let i = 1; i <= 40; i++) many[`p${i}`] = i;
  assertEquals(Object.keys(JSON.parse(pagePropsJson(many)!)).length, 30);
  const list = Array.from({ length: 50 }, (_, i) => String(i));
  assertEquals(JSON.parse(pagePropsJson({ list })!).list.length, 30);
  assertEquals(
    JSON.parse(pagePropsJson({ long: "x".repeat(900) })!).long.length,
    500,
  );
});

test("the JSON is safe inside a script tag", () => {
  const json = pagePropsJson({ note: "</script><b>&\u2028\u2029" })!;
  assertEquals(
    json,
    '{"note":"\\u003c/script\\u003e\\u003cb\\u003e\\u0026\\u2028\\u2029"}',
  );
  assert(!/[<>&\u2028\u2029]/.test(json));
  assertEquals(JSON.parse(json).note, "</script><b>&\u2028\u2029");
});

test("keys that look like numbers keep their place", () => {
  assertEquals(pagePropsJson(new Map([["b", 1], ["2", 2]])), '{"b":1,"2":2}');
});
