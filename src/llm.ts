// Model access. Every call goes to Meterless Nightshift's OpenAI-compatible hotspot
// (the hackathon's required primary AI provider). Nightshift routes the request to the
// provider configured in its Providers tab (Nemotron in our setup) and we record which
// model actually answered, for the trace and for the Nemotron award evidence.
//
// SAMPLE_MODE=true replays recorded responses from fixtures/llm/ so judges can run the
// whole pipeline without Nightshift, Zetaris or any key.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { trace } from "./trace.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}
export interface ChatResult { text: string; model: string; provider: string; ms: number; replayed: boolean; label?: string | null; receipt?: string | null; receipt_envelope?: unknown }

const BASE = normalise(process.env.NIGHTSHIFT_BASE_URL ?? "http://127.0.0.1:8088/v1");
const TOKEN = process.env.NIGHTSHIFT_TOKEN ?? "";
const SAMPLE = process.env.SAMPLE_MODE === "true";
const FIXTURES = path.resolve("fixtures/llm");
const RECORD = process.env.RECORD_FIXTURES === "true";

function normalise(u: string): string {
  let s = u.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(s)) s = "http://" + s;
  s = s.replace(/\/(v1\/)?(chat\/completions|models|healthz)$/, "");
  return s.endsWith("/v1") ? s : s + "/v1";
}

const key = (role: string, model: string, messages: ChatMessage[]) =>
  crypto.createHash("sha256").update(JSON.stringify({ role, model, messages })).digest("hex").slice(0, 16);

/**
 * @param role   agent role name, used for the trace and the fixture file name
 * @param model  a Nightshift routing mode (e.g. "meterless/text.deep", "meterless/vision")
 *               or, when NIGHTSHIFT_BASE_URL points at another OpenAI-compatible server, a model id
 */
export async function chat(role: string, model: string, messages: ChatMessage[], opts: { json?: boolean; temperature?: number } = {}): Promise<ChatResult> {
  const id = key(role, model, messages);
  const file = path.join(FIXTURES, `${role}-${id}.json`);
  if (SAMPLE) {
    if (!fs.existsSync(file)) throw new Error(`SAMPLE_MODE: no recorded response for ${role} (${id}). Record one with RECORD_FIXTURES=true.`);
    const rec = JSON.parse(fs.readFileSync(file, "utf8"));
    trace("llm", { role, model: rec.model, label: rec.label ?? null, provider: rec.provider, receipt: rec.receipt ?? null, signed: Boolean((rec.receipt_envelope as any)?.sig_b64), replayed: true, fixture: path.basename(file) });
    return { ...rec, replayed: true };
  }
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      "meterless-app": "aftershock",
      "meterless-scope": "user",
    },
    body: JSON.stringify({
      model, messages, temperature: opts.temperature ?? 0, stream: false,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const ms = Date.now() - t0;
  if (res.status === 401 || res.status === 403) throw new Error("Nightshift rejected the token: paste the runtime's proxy-token into NIGHTSHIFT_TOKEN");
  if (!res.ok) throw new Error(`model call failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const body: any = await res.json();
  const msg = body.choices?.[0]?.message;
  const text = typeof msg?.content === "string" ? msg.content : (msg?.content ?? []).map((p: any) => p.text ?? "").join("");
  // Nightshift may report the serving model in a meterless block; fall back to the OpenAI field.
  // Nightshift returns a signed compute receipt (meterless.compute_receipt.v1) naming the winning route.
  const win = body.meterless?.winning_route;
  const served = win?.model ?? body.meterless?.routed_model ?? body.model ?? model;
  const provider = win ? `nightshift->${win.provider}` : (body.provider ?? new URL(BASE).host);
  const receipt = body.meterless?.receipt_id ?? null;
  const signed = Boolean(body.meterless?.receipt_envelope?.sig_b64);
  if (!text.trim()) throw new Error(`empty response from ${served}`);
  // The signed receipt envelope is public, verifiable metadata (no credentials): keep it whole.
  const receipt_envelope = body.meterless?.receipt_envelope ?? null;
  trace("llm", { role, requested: model, model: served, label: win?.label ?? null, provider, receipt, signed, ms, receipt_envelope });
  const out: ChatResult = { text, model: served, provider, ms, replayed: false, label: win?.label ?? null, receipt, receipt_envelope };
  if (RECORD) { fs.mkdirSync(FIXTURES, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out, null, 2)); }
  return out;
}

/** Pull the first JSON object or array out of a model reply (models sometimes wrap it in prose or fences). */
export function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in model reply");
  const open = raw[start], close = open === "{" ? "}" : "]";
  const end = raw.lastIndexOf(close);
  return JSON.parse(raw.slice(start, end + 1));
}
