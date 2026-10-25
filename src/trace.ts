// Append-only, hash-chained run trace. Every agent step, model call and gate decision is one
// JSON line. Each line carries `prev` (hash of the previous line) and `hash` (sha256 of prev +
// the line's content), so editing, deleting or reordering any line breaks the chain:
// `npm run verify-trace -- <file>` re-computes it offline.
//
// The first line also records `code_sha`: a sha256 over every source file in src/ (sorted by
// path), so a reviewer can check that a committed trace came from the committed code.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const DIR = path.resolve(".aftershock/traces");
let file: string | null = null;
let step = 0;
let prev = "0".repeat(64);

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** sha256 over src/**\/*.ts (path + content, sorted), i.e. the code that produced a trace. */
export function codeSha(root = path.resolve("src")): string {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith(".ts") && files.push(p); } };
  walk(root);
  return sha(files.sort().map(f => `${path.relative(root, f).split(path.sep).join("/")}\n${fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n")}`).join("\n\0\n"));
}

function gitHead(): string | null {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; }
}

export function startRun(label: string, dir = DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  file = path.join(dir, `${id}.jsonl`);
  step = 0;
  prev = "0".repeat(64);
  trace("run.start", { label, code_sha: codeSha(), git_head: gitHead(), mode: { sample: process.env.SAMPLE_MODE === "true", data: process.env.SAMPLE_MODE === "true" || process.env.DATA_SOURCE === "csv" ? "csv" : "zetaris", extraction: process.env.EXTRACTION ?? "vision", hmem: process.env.HMEM ?? "on" } });
  return file;
}

export function trace(event: string, data: Record<string, unknown> = {}): void {
  const body = { step: ++step, t: new Date().toISOString(), event, ...data };
  const hash = sha(prev + JSON.stringify(body));
  const line = { ...body, prev, hash };
  prev = hash;
  if (process.env.AFTERSHOCK_QUIET !== "true") console.log(fmt(body));
  if (file) fs.appendFileSync(file, JSON.stringify(line) + "\n");
}

/** Last hash written, so a result file can be bound to the exact trace that produced it. */
export const traceHead = () => prev;

/** Re-computes the chain. Returns the first broken step, or ok with the final hash. */
export function verifyTrace(text: string): { ok: boolean; lines: number; head: string; brokenAt?: number; why?: string } {
  let p = "0".repeat(64), n = 0;
  for (const raw of text.split("\n").filter(Boolean)) {
    n++;
    let o: any;
    try { o = JSON.parse(raw); } catch { return { ok: false, lines: n, head: p, brokenAt: n, why: "not JSON" }; }
    const { prev: pv, hash, ...body } = o;
    if (pv !== p) return { ok: false, lines: n, head: p, brokenAt: n, why: "prev does not match the previous line's hash (line removed, inserted or reordered)" };
    if (sha(p + JSON.stringify(body)) !== hash) return { ok: false, lines: n, head: p, brokenAt: n, why: "content does not match its hash (line edited)" };
    p = hash;
  }
  return { ok: true, lines: n, head: p };
}

function fmt(l: Record<string, unknown>): string {
  const { step, t, event, ...rest } = l;
  const body = Object.entries(rest).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ");
  return `  [${String(step).padStart(2, "0")}] ${String(event).padEnd(18)} ${body}`;
}
