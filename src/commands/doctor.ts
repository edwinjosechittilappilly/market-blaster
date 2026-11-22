import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { ADAPTERS } from "../destinations/index.ts";
import { META } from "../destinations/meta.ts";
import { modeOf, withGithubToken } from "../destinations/mode.ts";
import { loadEnvWithSources, redact } from "../env.ts";
import type { Command } from "../io.ts";
import { ALL_ENV_VARS } from "../destinations/meta.ts";

export const run: Command = async (args, io) => {
  const { values } = parseArgs({ args, options: { online: { type: "boolean", default: false } } });
  const config = loadConfig(io.cwd);
  const loaded = loadEnvWithSources(config.root, io.env, io.keychain);
  const env = await withGithubToken(loaded.env, io.run);
  let failures = 0;

  for (const id of config.destinations) {
    const info = modeOf(id, config, env);
    let line = `${id.padEnd(12)} ${info.mode.padEnd(8)} ${META[id].kind}`;
    if (info.missing.length) line += `  missing: ${info.missing.join(", ")}`;
    if (info.note) line += `  (${info.note})`;
    // Credentials only matter in API mode or when they are what is missing; a handoff by choice needs none.
    const credentialsMatter = info.mode !== "handoff" || info.missing.length > 0;
    if (META[id].env.length && credentialsMatter) {
      line += `  credentials: ${META[id].env.map((key) => `${key}=${loaded.sources[key] ?? (env[key] ? "gh" : "unset")}`).join(", ")}`;
    }
    if (info.mode === "missing") failures++;

    const adapter = ADAPTERS[id];
    if (values.online && info.mode === "api" && adapter.verify) {
      try {
        await adapter.verify({ fetch: io.fetch, env, config, timeoutMs: 15_000, run: io.run });
        line += "  online: ok";
      } catch (err) {
        failures++;
        line += `  online: ${redact((err as Error).message, env, ALL_ENV_VARS)}`;
      }
    }
    io.out(line);
    if (id === "linkedin" && env.LINKEDIN_TOKEN_ISSUED) {
      const issued = Date.parse(env.LINKEDIN_TOKEN_ISSUED);
      if (Number.isFinite(issued) && Date.now() - issued > 50 * 86_400_000) {
        io.out("  LinkedIn token is older than 50 days; run mblast auth linkedin");
      }
    }
  }
  if (!values.online) io.out("\nrun `mblast doctor --online` to test each API credential with one read request");
  return failures ? 1 : 0;
};
