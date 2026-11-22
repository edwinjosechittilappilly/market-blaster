#!/usr/bin/env node
// Published packages need JavaScript: Node cannot strip TypeScript in node_modules.
import { existsSync } from "node:fs";
const entry = existsSync(new URL("../dist/cli.js", import.meta.url)) ? "../dist/cli.js" : "../src/cli.ts";
const { main } = await import(entry);

process.exitCode = await main(process.argv.slice(2));
