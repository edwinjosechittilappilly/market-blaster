import { parseArgs } from "node:util";
import type { Command } from "../io.ts";
import { UserError } from "../types.ts";
import { run as brief } from "./brief.ts";
import { run as draft } from "./draft.ts";
import { run as check } from "./check.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { range: { type: "string" }, pr: { type: "string" }, version: { type: "string" } },
  });
  if (positionals.length !== 1 || !values.range) {
    throw new UserError("usage: mblast new <slug> --range A..B [--pr N] [--version V]");
  }
  const slug = positionals[0];
  const briefArgs = [slug, "--range", values.range];
  if (values.pr) briefArgs.push("--pr", values.pr);
  if (values.version) briefArgs.push("--version", values.version);
  const briefResult = await brief(briefArgs, io);
  if (briefResult) return briefResult;
  await draft([slug], io);
  return check([slug], io);
};
