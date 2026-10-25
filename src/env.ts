/**
 * Reads environment variables on Deno, Bun, Node and Cloudflare Workers without
 * throwing and without a Deno permission prompt.
 *
 * @module
 */

/** A set of environment values, for example the `env` bindings of a Cloudflare Worker. */
export type EnvSource = Record<string, unknown> | undefined | null;

interface DenoLike {
  env?: { get(name: string): string | undefined };
  permissions?: {
    querySync?(
      descriptor: { name: "env"; variable: string },
    ): { state: string };
  };
}

interface ProcessLike {
  env?: Record<string, string | undefined>;
}

/**
 * The value of one environment variable, or undefined.
 *
 * It looks in `source` first (for example `c.env` in Hono or the Worker `env`),
 * then in `Deno.env` (only when env access is already granted, so it never
 * prompts), then in `process.env` (Bun, Node, Workers with Node compatibility).
 */
export function readEnv(name: string, source?: EnvSource): string | undefined {
  const fromSource = source?.[name];
  if (typeof fromSource === "string" && fromSource.trim() !== "") {
    return fromSource.trim();
  }

  const g = globalThis as unknown as { Deno?: DenoLike; process?: ProcessLike };
  try {
    const deno = g.Deno;
    if (deno?.env) {
      const state = deno.permissions?.querySync?.({
        name: "env",
        variable: name,
      })
        .state;
      if (state === undefined || state === "granted") {
        const value = deno.env.get(name);
        if (value !== undefined && value.trim() !== "") return value.trim();
      }
    }
  } catch {
    // No permission or no Deno. Try the next source.
  }

  try {
    const value = g.process?.env?.[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  } catch {
    // process.env can throw in some sandboxes.
  }
  return undefined;
}

/** Variables checked, in order, to find the current environment name. */
export const ENVIRONMENT_VARIABLES: readonly string[] = [
  "PRIVATUS_ENV",
  "DENO_ENV",
  "NODE_ENV",
];

/** The current environment name, from PRIVATUS_ENV, DENO_ENV or NODE_ENV. Defaults to "development". */
export function currentEnvironment(source?: EnvSource): string {
  for (const name of ENVIRONMENT_VARIABLES) {
    const value = readEnv(name, source);
    if (value) return value;
  }
  return "development";
}

/** Whether the current environment is production. */
export function productionLike(source?: EnvSource): boolean {
  return currentEnvironment(source) === "production";
}
