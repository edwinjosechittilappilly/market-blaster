import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { withStateLock, writeFileAtomic } from "../state.ts";
import { UserError } from "../types.ts";

const directories = [
  { id: "devhunt", name: "DevHunt", url: "https://devhunt.org/account/tools/new", note: "Developer tools only; free listing, chosen launch week is paid." },
  { id: "alternativeto", name: "AlternativeTo", url: "https://alternativeto.net/faq/", note: "Released software; account and verified email required; review can be slow." },
  { id: "uneed", name: "Uneed", url: "https://www.uneed.best/submit-a-tool", note: "Free submission; queue and public visibility conditions apply." },
  { id: "indie-hackers", name: "Indie Hackers", url: "https://www.indiehackers.com/", note: "Product page availability and submission URL unverified; sign in and check." },
  { id: "product-hunt", name: "Product Hunt", url: "https://www.producthunt.com/posts/new", note: "For a genuine product launch; check current eligibility." },
];
type LaunchState = Record<string, { status: "listed"; url: string }>;

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { mark: { type: "string" }, url: { type: "string" } } });
  if (positionals.length || (!!values.mark !== !!values.url)) throw new UserError("usage: launch [--mark <directory> --url U]");
  const config = loadConfig(io.cwd);
  const dir = resolve(config.root, config.campaignsDir);
  const file = resolve(dir, "_launch.json");
  return withStateLock(dir, async () => {
      const state: LaunchState = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as LaunchState : {};
      if (values.mark && values.url) {
        const key = values.mark.toLowerCase().replace(/[\s_-]+/g, "");
        const target = directories.find((entry) => entry.id.replace(/-/g, "") === key || entry.name.toLowerCase().replace(/[\s_-]+/g, "") === key);
        if (!target) throw new UserError(`unknown launch directory ${values.mark}`);
        let url: URL;
        try { url = new URL(values.url); } catch { throw new UserError("--url must be an https URL"); }
        if (url.protocol !== "https:" || url.username || url.password) throw new UserError("--url must be an https URL");
        state[target.id] = { status: "listed", url: values.url };
        writeFileAtomic(file, `${JSON.stringify(state, null, 2)}\n`);
        io.out(`${target.name}: listed ${values.url}`);
      } else {
        for (const entry of directories) io.out(`${entry.name}: ${state[entry.id] ? `listed ${state[entry.id].url}` : "todo"}\n  Submit: ${entry.url}\n  ${entry.note}`);
      }
      return 0;
    });
};
