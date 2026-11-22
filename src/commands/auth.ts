import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { findConfig } from "../config.ts";
import { AUTH_ENV_VARS, loadEnvWithSources } from "../env.ts";
import { keychainSet } from "../keychain.ts";
import type { IO } from "../io.ts";
import { UserError } from "../types.ts";

// LinkedIn's own example app registers an http://localhost redirect, so plain HTTP loopback is accepted.
const REDIRECT = "http://localhost:8723/callback";
type Options = {
  get?: (key: string) => string | undefined;
  set?: (key: string, value: string) => void;
  input?: (piped: boolean) => Promise<string>;
  platform?: string;
  now?: () => Date;
};

async function readSecret(piped: boolean): Promise<string> {
  if (piped) {
    if (process.stdin.isTTY) throw new UserError("--stdin requires piped input");
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    return text.replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY) throw new UserError("Use --stdin to read a piped value");
  process.stdout.write("Value: ");
  const stdin = process.stdin;
  const previous = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = "";
      const onData = (chunk: Buffer) => {
        for (const char of chunk.toString("utf8")) {
          if (char === "\u0003" || char === "\u0004") { cleanup(); reject(new UserError("Input cancelled")); return; }
          if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
          if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
          else value += char;
        }
      };
      const cleanup = () => stdin.off("data", onData);
      stdin.on("data", onData);
    });
  } finally {
    stdin.setRawMode(previous);
    stdin.pause();
    process.stdout.write("\n");
  }
}

export async function run(args: string[], io: IO, options: Options = {}): Promise<number> {
  const [action, ...rest] = args;
  const root = findConfig(io.cwd);
  const get = options.get ?? io.keychain;
  const set = options.set ?? keychainSet;
  if (action === "set") {
    const key = rest[0];
    if (!key || !AUTH_ENV_VARS.includes(key)) throw new UserError(`Unknown credential key; known: ${AUTH_ENV_VARS.join(", ")}`);
    if (rest.length > 2 || (rest[1] && rest[1] !== "--stdin")) throw new UserError("Usage: mblast auth set <KEY> [--stdin]");
    const value = await (options.input ?? readSecret)(rest[1] === "--stdin");
    if (!value) throw new UserError("Credential cannot be empty");
    try { set(key, value); } catch { throw new UserError(`Could not save ${key} in Keychain; on non-macOS use .env`); }
    io.out(`Saved ${key} in Keychain`);
    return 0;
  }
  if (action !== "list" && action !== "linkedin" || rest.length) throw new UserError("Usage: mblast auth set <KEY> [--stdin] | list | linkedin");
  const { env, sources } = loadEnvWithSources(root ? dirname(root) : io.cwd, io.env, get);
  if (action === "list") {
    for (const key of AUTH_ENV_VARS) io.out(`${key}: ${sources[key] ?? "unset"}`);
    return 0;
  }
  const clientId = env.LINKEDIN_CLIENT_ID;
  const clientSecret = env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new UserError("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first");
  const state = randomBytes(32).toString("hex");
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, state, scope: "openid profile w_member_social" });
  const url = `https://www.linkedin.com/oauth/v2/authorization?${params.toString().replace(/\+/g, "%20")}`;
  const server = createServer();
  let timer: NodeJS.Timeout | undefined;
  try {
    const code = await new Promise<string>((resolve, reject) => {
      server.on("error", () => reject(new UserError("Could not start LinkedIn callback server on localhost:8723")));
      server.on("request", (req, res) => {
        const callback = new URL(req.url ?? "/", REDIRECT);
        if (callback.pathname !== "/callback") { res.writeHead(404).end(); return; }
        if (callback.searchParams.get("state") !== state) { res.writeHead(401).end("Invalid state"); return; }
        const code = callback.searchParams.get("code");
        if (!code) { res.writeHead(400).end("Authorization failed"); reject(new UserError("LinkedIn authorization was declined or failed")); return; }
        res.end("Authorization received. You can close this window.");
        resolve(code);
      });
      timer = setTimeout(() => reject(new UserError("LinkedIn authorization timed out")), 300_000);
      server.listen(8723, "localhost", () => {
        io.out(`Register redirect URI ${REDIRECT} in your LinkedIn app.`);
        io.out(url);
        const platform = options.platform ?? process.platform;
        const opener = platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : undefined;
        if (opener) void io.run(opener, [url]).catch(() => io.err("Could not open browser; use the authorization URL above"));
      });
    });
    let response: Response;
    try {
      response = await io.fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, client_secret: clientSecret }),
        signal: AbortSignal.timeout(15_000), redirect: "error",
      });
    } catch { throw new UserError("LinkedIn token exchange failed"); }
    if (!response.ok) throw new UserError(`LinkedIn token exchange failed (HTTP ${response.status})`);
    let data: { access_token?: unknown; expires_in?: unknown };
    try { data = await response.json() as typeof data; } catch { throw new UserError("Invalid LinkedIn token response"); }
    if (typeof data.access_token !== "string" || !data.access_token || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new UserError("Invalid LinkedIn token response");
    const now = (options.now ?? (() => new Date()))();
    try { set("LINKEDIN_ACCESS_TOKEN", data.access_token); set("LINKEDIN_TOKEN_ISSUED", now.toISOString()); }
    catch { throw new UserError("Could not save LinkedIn credentials in Keychain; on non-macOS use .env"); }
    for (const key of ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_TOKEN_ISSUED"]) {
      if (sources[key] && sources[key] !== "keychain") io.err(`${key} is overridden by ${sources[key]}; remove it there`);
    }
    io.out(`LinkedIn token expires ${new Date(now.getTime() + data.expires_in * 1000).toISOString()}`);
    return 0;
  } finally {
    clearTimeout(timer);
    server.close();
  }
}
