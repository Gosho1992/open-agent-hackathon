// Append-only run trace. Every agent step, model call and gate decision is one JSON line,
// so a judge can read exactly how a verdict was reached and which model handled each request.

import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(".aftershock/traces");
let file: string | null = null;
let step = 0;

export function startRun(label: string): string {
  fs.mkdirSync(DIR, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  file = path.join(DIR, `${id}.jsonl`);
  step = 0;
  trace("run.start", { label });
  return file;
}

export function trace(event: string, data: Record<string, unknown> = {}): void {
  const line = { step: ++step, t: new Date().toISOString(), event, ...data };
  if (process.env.AFTERSHOCK_QUIET !== "true") console.log(fmt(line));
  if (file) fs.appendFileSync(file, JSON.stringify(line) + "\n");
}

function fmt(l: Record<string, unknown>): string {
  const { step, t, event, ...rest } = l;
  const body = Object.entries(rest).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ");
  return `  [${String(step).padStart(2, "0")}] ${String(event).padEnd(18)} ${body}`;
}
