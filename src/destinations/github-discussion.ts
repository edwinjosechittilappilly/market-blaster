import { measureBody } from "../limits.ts";
import { HttpError, UserError } from "../types.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { META } from "./meta.ts";
import { redactAdapter, requestJson } from "./http.ts";

const CREATE = "mutation ($input: CreateDiscussionInput!) { createDiscussion(input: $input) { discussion { id url } } }";
const UPDATE = "mutation ($input: UpdateDiscussionInput!) { updateDiscussion(input: $input) { discussion { id url } } }";
const LOOKUP = "query ($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id discussionCategories(first: 25) { nodes { id name } } } }";

async function graphql<T>(ctx: Ctx, query: string, variables?: object): Promise<T> {
  const result = await requestJson<{ data: T; errors?: unknown[] }>(ctx, "github-discussion", "https://api.github.com/graphql", {
    method: "POST", headers: { authorization: `Bearer ${ctx.env.GITHUB_TOKEN ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (result.errors?.length && !(query === CREATE && (result.data as { createDiscussion?: unknown } | undefined)?.createDiscussion) && !(query === UPDATE && (result.data as { updateDiscussion?: unknown } | undefined)?.updateDiscussion)) {
    const message = redactAdapter(JSON.stringify(result.errors).slice(0, 200), ctx, "github-discussion");
    if (query === CREATE || query === UPDATE) {
      const error = new Error(`github-discussion: ${message}`);
      error.name = "UncertainResponseError";
      throw error;
    }
    throw new HttpError(422, `github-discussion 422: ${message}`);
  }
  return result.data;
}

function body(post: ResolvedPost): string {
  return post.canonical && !post.body.includes(post.canonical) ? `${post.body}\n\nOriginally published at ${post.canonical}` : post.body;
}

type Discussion = { id: string; url: string };
async function lookup(ctx: Ctx) {
  const { repo, category } = ctx.config.githubDiscussion;
  const match = repo?.match(/^([^/]+)\/([^/]+)$/);
  if (!match || !category) throw new UserError("github-discussion requires githubDiscussion.repo (owner/name) and category");
  const data = await graphql<{ repository: { id: string; discussionCategories: { nodes: { id: string; name: string }[] } } | null }>(ctx, LOOKUP, { owner: match[1], name: match[2] });
  const repository = data.repository;
  const selected = repository?.discussionCategories.nodes.find((item) => item?.name === category);
  if (!repository || !selected) throw new UserError(`github-discussion: repository or category not found: ${repo} / ${category}`);
  return { repository, selected };
}
export const githubDiscussion: Destination = {
  id: "github-discussion", kind: "article", env: META["github-discussion"].env,
  limit: (text, ctx) => measureBody("github-discussion", text, ctx.config),
  payload: (post) => ({ query: CREATE, variables: { input: { title: post.title, body: body(post) } } }),
  async verify(ctx) { await lookup(ctx); },
  async create(post, ctx) {
    const { repository, selected } = await lookup(ctx);
    const result = await graphql<{ createDiscussion: { discussion: Discussion } }>(ctx, CREATE, { input: { repositoryId: repository.id, categoryId: selected.id, title: post.title, body: body(post) } });
    return result.createDiscussion.discussion;
  },
  async update(id, post, ctx) {
    const result = await graphql<{ updateDiscussion: { discussion: Discussion } }>(ctx, UPDATE, { input: { discussionId: id, title: post.title, body: body(post) } });
    return result.updateDiscussion.discussion;
  },
};
