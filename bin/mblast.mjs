#!/usr/bin/env node
// Node runs src/*.ts directly (type stripping, Node 22.18+). Install with `npm link` from a clone:
// stripping does not apply under node_modules.
import { main } from "../src/cli.ts";

process.exitCode = await main(process.argv.slice(2));
