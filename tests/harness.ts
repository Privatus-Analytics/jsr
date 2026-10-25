// A tiny test harness that runs the same files under `deno test` and `bun test`,
// with no outside dependencies.

type TestFn = () => void | Promise<void>;

interface DenoTestLike {
  test(name: string, fn: TestFn): void;
}

const g = globalThis as unknown as {
  Deno?: DenoTestLike;
  Bun?: unknown;
  test?: (name: string, fn: TestFn) => void;
  process?: { env: Record<string, string | undefined> };
};

// Bun does not put `test` on globalThis, so load it from bun:test. The name is
// in a variable so Deno does not try to resolve it.
const bunTestModule = "bun:test";
const bunTest: ((name: string, fn: TestFn) => void) | undefined = g.Deno
  ? undefined
  : g.Bun
  ? (await import(bunTestModule)).test
  : g.test;

/** Registers a test with whichever runner is running. */
export function test(name: string, fn: TestFn): void {
  if (g.Deno) {
    g.Deno.test(name, fn);
  } else if (bunTest) {
    bunTest(name, fn);
  } else {
    throw new Error("No test runner found");
  }
}

/** The runtime name, for messages. */
export const runtime: string = g.Deno ? "deno" : g.Bun ? "bun" : "other";

function show(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => v instanceof Map ? [...v] : v);
  } catch {
    return String(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Map && b instanceof Map) {
    return deepEqual([...a], [...b]);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length &&
      ka.every((k) =>
        deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        )
      );
  }
  return false;
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (!deepEqual(actual, expected)) {
    throw new Error(`Expected ${show(expected)}\n     got ${show(actual)}`);
  }
}

export function assert(condition: unknown, message = "Assertion failed"): void {
  if (!condition) throw new Error(message);
}

export function assertIncludes(text: string, part: string): void {
  if (!text.includes(part)) {
    throw new Error(`Expected ${show(text)} to include ${show(part)}`);
  }
}

export function assertExcludes(text: string, part: string): void {
  if (text.includes(part)) {
    throw new Error(`Expected ${show(text)} not to include ${show(part)}`);
  }
}

/** Sets environment variables for the length of `fn`, on Deno or Bun. */
export async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const deno = (globalThis as unknown as {
    Deno?: {
      env: {
        get(k: string): string | undefined;
        set(k: string, v: string): void;
        delete(k: string): void;
      };
    };
  }).Deno;
  const get = (k: string) => deno ? deno.env.get(k) : g.process?.env[k];
  const set = (k: string, v: string | undefined) => {
    if (deno) {
      if (v === undefined) deno.env.delete(k);
      else deno.env.set(k, v);
    } else if (g.process) {
      if (v === undefined) delete g.process.env[k];
      else g.process.env[k] = v;
    }
  };
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = get(k);
    set(k, v);
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) set(k, v);
  }
}

/** Clears the variables the package reads, so the host shell does not leak in. */
export const CLEAN_ENV: Record<string, undefined> = {
  PRIVATUS_SITE_ID: undefined,
  PRIVATUS_SCRIPT_HOST: undefined,
  PRIVATUS_ENV: undefined,
  DENO_ENV: undefined,
  NODE_ENV: undefined,
};
