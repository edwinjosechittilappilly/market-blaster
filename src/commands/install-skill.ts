import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync, type Stats } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "../io.ts";

/** The skill directory shipped in this repository. */
export const SKILL_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../skills/market-blaster");

export const run: Command = async (_args, io) => {
  const home = io.env.HOME;
  if (!home) {
    io.err("HOME is not set");
    return 1;
  }
  let skipped = 0;
  for (const dir of [join(home, ".agents/skills"), join(home, ".claude/skills")]) {
    const link = join(dir, "market-blaster");
    let existing: Stats | undefined;
    try {
      existing = lstatSync(link);
    } catch {
      existing = undefined;
    }
    if (existing && !existing.isSymbolicLink()) {
      io.out(`skipped ${link}: a real directory or file is there; remove it to link the skill`);
      skipped++;
      continue;
    }
    if (existing) {
      if (readlinkSync(link) === SKILL_SOURCE) {
        io.out(`ok      ${link}`);
        continue;
      }
      unlinkSync(link);
    }
    mkdirSync(dir, { recursive: true });
    symlinkSync(SKILL_SOURCE, link);
    io.out(`linked  ${link} -> ${SKILL_SOURCE}`);
  }
  return skipped ? 1 : 0;
};
