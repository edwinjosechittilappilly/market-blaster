import { measureBody } from "../limits.ts";
import { HttpError } from "../types.ts";
import type { Ctx, Destination, ResolvedPost } from "../types.ts";
import { META } from "./meta.ts";
import { requestJson, redactAdapter } from "./http.ts";

function input(post: ResolvedPost, ctx: Ctx) {
  return {
    publicationId: ctx.config.hashnode.publicationId, title: post.title, contentMarkdown: post.body,
    tags: [], originalArticleURL: post.canonical,
  };
}

type GraphqlData = {
  createDraft: { draft: { id: string } };
  publishPost: { post: { id: string; url: string } };
  publishDraft: { post: { id: string; url: string } };
  updatePost: { post: { id: string; url: string } };
};
async function graphql(ctx: Ctx, query: string, variables?: object): Promise<GraphqlData> {
  const result = await requestJson<{ data: GraphqlData; errors?: unknown[] }>(
    ctx, "hashnode", "https://gql.hashnode.com", {
      method: "POST", headers: { authorization: ctx.env.HASHNODE_TOKEN ?? "", "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (result.errors?.length) {
    throw new HttpError(
      422, `hashnode 422: ${redactAdapter(JSON.stringify(result.errors).slice(0, 200), ctx, "hashnode")}`,
    );
  }
  return result.data;
}

export const hashnode: Destination = {
  id: "hashnode", kind: "article", env: META.hashnode.env,
  limit: (text, ctx) => measureBody("hashnode", text, ctx.config),
  payload: (post, ctx, opts) => ({
    query: opts?.stage
      ? "mutation ($input: CreateDraftInput!) { createDraft(input: $input) { draft { id } } }"
      : "mutation ($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }",
    variables: { input: input(post, ctx) },
  }),
  async verify(ctx) { await graphql(ctx, "query { me { id username } }"); },
  async create(post, ctx, opts) {
    if (opts.stage) {
      const data = await graphql(
        ctx, "mutation ($input: CreateDraftInput!) { createDraft(input: $input) { draft { id } } }",
        { input: input(post, ctx) },
      );
      const id = data.createDraft.draft.id;
      return { id: `draft:${id}`, url: `https://hashnode.com/draft/${id}` };
    }
    const data = await graphql(
      ctx, "mutation ($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }",
      { input: input(post, ctx) },
    );
    return data.publishPost.post;
  },
  async update(id, post, ctx, opts) {
    if (id.startsWith("draft:")) {
      const draftId = id.slice(6);
      await graphql(ctx, "mutation ($input: UpdateDraftInput!) { updateDraft(input: $input) { draft { id } } }", {
        input: { draftId, title: post.title, contentMarkdown: post.body, originalArticleURL: post.canonical },
      });
      if (opts.stage) return { id, url: `https://hashnode.com/draft/${draftId}` };
      const data = await graphql(
        ctx, "mutation ($input: PublishDraftInput!) { publishDraft(input: $input) { post { id url } } }",
        { input: { draftId } },
      );
      return data.publishDraft.post;
    }
    const data = await graphql(
      ctx, "mutation ($input: UpdatePostInput!) { updatePost(input: $input) { post { id url } } }",
      { input: { id, title: post.title, contentMarkdown: post.body, originalArticleURL: post.canonical } },
    );
    return data.updatePost.post;
  },
};
