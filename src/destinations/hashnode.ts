import { measureBody } from "../limits.ts";
import { HttpError } from "../types.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { META } from "./meta.ts";

function input(post: ResolvedPost, ctx: Ctx) {
  return { publicationId: ctx.config.hashnode.publicationId, title: post.title, contentMarkdown: post.body, tags: [], originalArticleURL: post.canonical };
}

async function graphql(ctx: Ctx, query: string, variables?: object): Promise<{ createDraft: { draft: { id: string } }; publishPost: { post: { id: string; url: string } }; publishDraft: { post: { id: string; url: string } }; updatePost: { post: { id: string; url: string } } }> {
  const response = await ctx.fetch("https://gql.hashnode.com", {
    method: "POST", headers: { authorization: ctx.env.HASHNODE_TOKEN ?? "", "content-type": "application/json" },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  const text = await response.text();
  const safe = (s: string) => Object.values(ctx.env).reduce<string>((v, secret) => secret ? v.split(secret).join("***") : v, s);
  if (!response.ok) throw new HttpError(response.status, `hashnode ${response.status}: ${safe(text.slice(0, 200))}`);
  const result = JSON.parse(text);
  if (result.errors?.length) throw new HttpError(422, `hashnode 422: ${safe(JSON.stringify(result.errors).slice(0, 200))}`);
  return result.data;
}

export const hashnode: Destination = {
  id: "hashnode", kind: "article", env: META.hashnode.env,
  limit: (text, ctx) => measureBody("hashnode", text, ctx.config),
  payload: (post, ctx) => ({ query: "mutation ($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }", variables: { input: input(post, ctx) } }),
  async verify(ctx) { await graphql(ctx, "query { me { id username } }"); },
  async create(post, ctx, opts) {
    if (opts.stage) {
      const data = await graphql(ctx, "mutation ($input: CreateDraftInput!) { createDraft(input: $input) { draft { id } } }", { input: input(post, ctx) });
      const id = data.createDraft.draft.id;
      return { id: `draft:${id}`, url: `https://hashnode.com/draft/${id}` };
    }
    const data = await graphql(ctx, "mutation ($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }", { input: input(post, ctx) });
    return data.publishPost.post;
  },
  async update(id, post, ctx, opts) {
    if (id.startsWith("draft:")) {
      const draftId = id.slice(6);
      await graphql(ctx, "mutation ($input: UpdateDraftInput!) { updateDraft(input: $input) { draft { id } } }", { input: { draftId, title: post.title, contentMarkdown: post.body, originalArticleURL: post.canonical } });
      if (opts.stage) return { id, url: `https://hashnode.com/draft/${draftId}` };
      const data = await graphql(ctx, "mutation ($input: PublishDraftInput!) { publishDraft(input: $input) { post { id url } } }", { input: { draftId } });
      return data.publishDraft.post;
    }
    const data = await graphql(ctx, "mutation ($input: UpdatePostInput!) { updatePost(input: $input) { post { id url } } }", { input: { id, title: post.title, contentMarkdown: post.body, originalArticleURL: post.canonical } });
    return data.updatePost.post;
  },
};
