import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { Inflate } from "fflate";
import { UserError } from "./types.ts";

export interface ZipLimits { maxEntries: number; maxTotal: number; maxEntry: number; maxRatio: number }
const defaults: ZipLimits = { maxEntries: 2000, maxTotal: 1024 ** 3, maxEntry: 500 * 1024 ** 2, maxRatio: 100 };

/** Extract an archive only after inspecting every central-directory entry. */
export function extractCampaignZip(file: string, root: string, options: Partial<ZipLimits> = {}): void {
  const limits = { ...defaults, ...options };
  const data = readFileSync(file);
  const bad = (reason: string): never => { throw new UserError(`invalid campaign zip: ${reason}`); };
  const u16 = (p: number) => data.readUInt16LE(p);
  const u32 = (p: number) => data.readUInt32LE(p);
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === data.length) { end = p; break; }
  }
  if (end < 0) return bad("missing end record");
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count === 0xffff || start + size !== end) return bad("unsupported directory");
  if (count > limits.maxEntries) return bad("too many entries");
  const entries: { name: string; compressed: number; size: number; method: number; offset: number; directory: boolean }[] = [];
  const names = new Set<string>();
  let total = 0, p = start;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(p) !== 0x02014b50) return bad("invalid directory entry");
    const flags = u16(p + 8), method = u16(p + 10), compressed = u32(p + 20), length = u32(p + 24);
    const nameLength = u16(p + 28), extra = u16(p + 30), comment = u16(p + 32);
    if (p + 46 + nameLength + extra + comment > end) return bad("truncated directory entry");
    const name = data.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    const directory = name.endsWith("/");
    const normalized = directory ? name.slice(0, -1) : name;
    if (!normalized || name.includes("\\") || name.includes("\0") || name.startsWith("/") || /^[a-z]:/i.test(name)
      || normalized.split("/").some((part) => !part || part === "." || part === "..")) return bad(`unsafe path: ${name}`);
    if (names.has(normalized)) return bad(`duplicate path: ${name}`);
    names.add(normalized);
    const mode = u32(p + 38) >>> 16;
    if ((mode & 0xf000) === 0xa000) return bad(`symlink: ${name}`);
    if ((flags & 1) || ![0, 8].includes(method) || compressed === 0xffffffff || length === 0xffffffff) return bad("unsupported entry");
    if (length > limits.maxEntry || (total += length) > limits.maxTotal) return bad("uncompressed size limit exceeded");
    if (length > compressed * limits.maxRatio) return bad("compression ratio limit exceeded");
    entries.push({ name, compressed, size: length, method, offset: u32(p + 42), directory });
    p += 46 + nameLength + extra + comment;
  }
  if (p !== end) return bad("invalid directory size");
  for (const entry of entries) {
    const o = entry.offset;
    if (o + 30 > start || u32(o) !== 0x04034b50) return bad("invalid local header");
    const nameLength = u16(o + 26), extra = u16(o + 28), content = o + 30 + nameLength + extra;
    if (content + entry.compressed > start || data.subarray(o + 30, o + 30 + nameLength).toString("utf8") !== entry.name
      || u16(o + 8) !== entry.method || (u16(o + 6) & 1)) return bad("inconsistent local header");
    const target = join(root, entry.name);
    if (entry.directory) { if (entry.size) return bad("nonempty directory"); mkdirSync(target, { recursive: true }); continue; }
    mkdirSync(dirname(target), { recursive: true });
    const fd = openSync(target, "wx");
    let written = 0;
    try {
      const output = (chunk: Uint8Array) => {
        written += chunk.length;
        if (written > entry.size || written > limits.maxEntry) return bad("uncompressed size mismatch");
        writeSync(fd, chunk);
      };
      if (entry.method === 0) output(data.subarray(content, content + entry.compressed));
      else {
        const inflate = new Inflate(output);
        for (let pos = 0; pos < entry.compressed; pos += 16384) {
          const next = Math.min(pos + 16384, entry.compressed);
          inflate.push(data.subarray(content + pos, content + next), next === entry.compressed);
        }
        if (!entry.compressed) inflate.push(new Uint8Array(), true);
      }
      if (written !== entry.size) return bad("uncompressed size mismatch");
    } finally { closeSync(fd); }
  }
}
