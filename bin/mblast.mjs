#!/usr/bin/env node
// A source checkout runs the TypeScript directly, so a dist/ left over from `npm pack` can never shadow newer
// source. Published packages ship no src/ (Node cannot strip TypeScript in node_modules), so they run dist/.
import { existsSync } from "node:fs";
const entry = existsSync(new URL("../src/cli.ts", import.meta.url)) ? "../src/cli.ts" : "../dist/cli.js";
const { main } = await import(entry);

process.exitCode = await main(process.argv.slice(2));
