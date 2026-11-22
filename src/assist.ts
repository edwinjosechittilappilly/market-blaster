import { checkCampaign } from "./check.ts";
import { newsletterTargets } from "./destinations/handoffs.ts";
import { META, publishOrder } from "./destinations/meta.ts";
import { modeOf } from "./destinations/mode.ts";
import type { IO } from "./io.ts";
import { isDestinationId, linksIn } from "./links.ts";
import { resolved } from "./publisher.ts";
import { approvalHash, loadState, needsApproval, updateState, withStateLock } from "./state.ts";
import type { Config, Ctx, Destination, DestinationId, Draft, Env } from "./types.ts";

const hosts: Record<string, string[]> = {
  hn: ["news.ycombinator.com"], reddit: ["reddit.com"], x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"], threads: ["threads.net", "threads.com"], medium: ["medium.com"],
  producthunt: ["producthunt.com"], substack: ["substack.com"],
};
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export async function assistCampaign(opts: { config: Config; campaign: string; env: Env; io: IO; adapters: Record<DestinationId, Destination>; only?: DestinationId[] }): Promise<number> {
  const { config, campaign, env, io, adapters } = opts;
  if (!io.isTTY) { io.err("--assist requires an interactive terminal"); return 1; }
  return withStateLock(campaign, async () => {
      const order = publishOrder(config.destinations.filter((id) => (!opts.only || opts.only.includes(id)) && modeOf(id, config, env).mode === "handoff"), config.canonicalHome);
      const state = loadState(campaign);
      const selected = order.filter((id) => state[id]?.status !== "published");
      const checked = checkCampaign(config, campaign, { only: selected });
      for (const finding of checked.findings) io.out(`${finding.destination}: ${finding.level}: ${finding.message}`);
      if (checked.findings.some((finding) => finding.level === "error")) return 1;
      const home = config.canonicalHome;
      const ctx: Ctx = { config, env, fetch: io.fetch, timeoutMs: 30_000, run: io.run };
      let failed = false;
      for (const id of selected) {
        const draft: Draft | undefined = id === "hn" ? { destination: "hn", title: home && isDestinationId(home) ? state[home]?.title ?? checked.drafts.get(home)?.title : config.hn?.title, evidence: [], body: "", path: "" } : checked.drafts.get(id);
        if (!draft || draft.skip) continue;
        if (needsApproval(id) && state[id]?.approvedHash !== approvalHash(draft, config)) {
          io.out(`${id}: refused: draft is not approved or has changed`); failed = true; continue;
        }
        if (id === "hn" && !draft.title) { io.out(home && isDestinationId(home) ? "hn: skipped: home title unavailable; set a title in the home draft" : "hn: skipped: home title unavailable; set hn.title for an external canonical home"); failed = true; continue; }
        if (state[id]?.status === "unknown" || state[id]?.status === "pending" || state[id]?.lastAttempt?.status === "unknown") {
          io.out(`${id}: refused: unknown outcome; resolve with mark`); failed = true; continue;
        }
        const references = [...linksIn(draft.title ?? ""), ...linksIn(draft.body), ...linksIn(draft.canonical ?? "")];
        if (["hn", "reddit"].includes(id) && !draft.canonical && home && isDestinationId(home)) references.push(home);
        const missing = references.find((ref) => !isDestinationId(ref) || state[ref]?.status !== "published" || !state[ref]?.url);
        if (missing || (id === "hn" && !home && !draft.canonical)) {
          io.out(`${id}: blocked: ${missing ? `link target ${missing} is not published` : "canonical home is not published"}`); failed = true; continue;
        }
        const post = resolved(draft, config, state, false);
        const info = adapters[id].handoff?.(post, ctx);
        if (!info?.url) { io.out(`${id}: no compose URL configured`); failed = true; continue; }
        io.out(`${id}: AI policy: ${META[id].ai}`);
        if (META[id].ai === "none") {
          io.out(`title: ${post.title ?? ""}\nURL: ${post.canonical ?? ""}\nwrite any text yourself; HN forbids generated text and automated posting`);
        } else if (META[id].ai === "outline") {
          io.out(`talking points:\n${post.body}\nwrite this yourself; nothing copied`);
        } else {
          io.out(`final text:\n${post.body}`);
          const cmd = process.platform === "darwin" ? ["pbcopy"] : process.platform === "win32" ? ["clip"] : ["xclip", "-selection", "clipboard"];
          try { await io.run(cmd[0], cmd.slice(1), { input: post.body }); } catch (err) { io.out(`${id}: warning: clipboard: ${(err as Error).message}`); }
        }
        const urls = id === "newsletter" ? newsletterTargets(config).map((target) => ({ url: target.url, name: target.name })) : [{ url: info.url, name: id }];
        updateState(campaign, state, id, { status: "handoff", contentHash: post.contentHash, error: undefined });
        for (const target of urls) {
          io.out(`${target.name}: compose ${target.url} (prefills ${info.prefills})`);
          const cmd = process.platform === "darwin" ? ["open", target.url] : process.platform === "win32" ? ["cmd", "/c", "start", "", target.url] : ["xdg-open", target.url];
          try { await io.run(cmd[0], cmd.slice(1)); } catch (err) { io.out(`${id}: warning: open: ${(err as Error).message}`); }
        }
        for (;;) {
          const answer = (await io.prompt("paste the permalink (enter to skip, s to stop): ")).trim();
          if (answer.toLowerCase() === "s") return failed ? 1 : 0;
          if (!answer) break;
          let url: URL;
          try { url = new URL(answer); } catch { io.out("invalid permalink: enter an https URL"); continue; }
          if (url.protocol !== "https:" || url.username || url.password) { io.out("invalid permalink: enter an https URL"); continue; }
          let valid = id === "newsletter" || (hosts[id] ?? []).some((host) => matches(url.hostname, host));
          if (id === "lemmy") valid = url.hostname === new URL(info.url).hostname;
          if (id === "substack" && !valid) valid = /^y(es)?$/i.test((await io.prompt(`Use custom Substack host ${url.hostname}? [y/N] `)).trim());
          if (!valid) { io.out(`${id}: invalid permalink host`); continue; }
          updateState(campaign, state, id, { status: "published", url: answer, contentHash: state[id]?.approvedHash ?? state[id]?.contentHash, error: undefined, lastAttempt: undefined });
          io.out(`${id}: published ${answer}`);
          break;
        }
      }
      return failed ? 1 : 0;
    });
}
