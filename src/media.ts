import { extname } from "node:path";
import { UserError } from "./types.ts";

export function isPdf(media: { path: string; kind: string }): boolean {
  return media.kind === "pdf" || extname(media.path).toLowerCase() === ".pdf";
}

export function gistText(media: { path: string; kind: string }, data: Uint8Array): string {
  if (extname(media.path).toLowerCase() !== ".svg" && media.kind !== "text")
    throw new UserError(`gist attachment ${media.path}: only SVG and text are supported`);
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(data); }
  catch { throw new UserError(`gist attachment ${media.path}: invalid UTF-8 text`); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content))
    throw new UserError(`gist attachment ${media.path}: binary content is not supported`);
  return content;
}
