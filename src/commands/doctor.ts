import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { ADAPTERS } from "../destinations/index.ts";
import { META } from "../destinations/meta.ts";
import { modeOf, withGithubToken } from "../destinations/mode.ts";
import { loadEnv, redact } from "../env.ts";
import type { Command } from "../io.ts";
import { ALL_ENV_VARS } from "../destinations/meta.ts";

export const run: Command = async (args, io) => {
  const { values } = parseArgs({ args, options: { online: { type: "boolean", default: false } } });
  const config = loadConfig(io.cwd);
  const env = await withGithubToken(loadEnv(config.root, io.env), io.run);
  let failures = 0;

  for (const id of config.destinations) {
    const info = modeOf(id, config, env);
    let line = `${id.padEnd(12)} ${info.mode.padEnd(8)} ${META[id].kind}`;
    if (info.missing.length) line += `  missing: ${info.missing.join(", ")}`;
    if (info.note) line += `  (${info.note})`;
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
  }
  if (!values.online) io.out("\nrun `mblast doctor --online` to test each API credential with one read request");
  return failures ? 1 : 0;
};
