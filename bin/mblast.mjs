#!/usr/bin/env node
// A source checkout runs the TypeScript directly when this Node can strip types (22.18+, 23.6+), so a dist/ left
// over from `npm pack` never shadows newer source. Older Node (23.0-23.5 need a flag) and published packages,
// which ship no src/, run dist/.
import { existsSync } from "node:fs";
const source = existsSync(new URL("../src/cli.ts", import.meta.url)) && Boolean(process.features.typescript);
const entry = source ? "../src/cli.ts" : "../dist/cli.js";
const { main } = await import(entry);

process.exitCode = await main(process.argv.slice(2));
