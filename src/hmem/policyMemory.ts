// Reviewer exclusion policy, remembered across sessions with H-MEM (Meterless engine).
//
// A rule is a preference memory such as
//   "aftershock policy: Expression of concern -> exclude"
// with source = who set it and provenance = user_correction. Changing a rule writes a new
// memory that `supersedes` the old one, so the trust ledger keeps the full history and the
// old rule is never silently overwritten. Retrieval goes through H-MEM's query path
// (MemoryRetrievalService), not a lookup table: switch H-MEM off (HMEM=off) and the agent
// falls back to DEFAULT_POLICY, which is how the control test proves the memory is load-bearing.

import path from "node:path";
import { loadHMEM } from "./engine.ts";
import { DEFAULT_POLICY, type ExclusionPolicy, type Notice } from "../policy.ts";
import { trace } from "../trace.ts";

const NOTICES: Notice[] = ["Retraction", "Retract and replace", "Expression of concern", "Correction"];
const PREFIX = "aftershock policy:";
const dir = () => process.env.HMEM_DIR ?? path.resolve(".aftershock/hmem");

let instance: any = null;
async function hmem() {
  if (!instance) {
    const { HMEM, source } = await loadHMEM();
    instance = new HMEM({ persistDir: dir(), actor: "aftershock" });
    trace("hmem.loaded", { engine: source, dir: dir() });
  }
  return instance;
}

const text = (n: Notice, exclude: boolean) => `${PREFIX} ${n} -> ${exclude ? "exclude" : "keep"} when re-analysing a meta-analysis`;

export async function setRule(notice: Notice, exclude: boolean, who: string): Promise<string> {
  const h = await hmem();
  const prev = current(h, notice);
  const rec = h.add({
    content: text(notice, exclude),
    type: "preference",
    layer: "long_term",
    tags: ["aftershock", "exclusion-policy", notice.toLowerCase().replace(/ /g, "-")],
    confidence: 0.95,
    source: who,
    provenance: { origin: "user_correction" },
    ...(prev ? { supersedes: prev.id } : {}),
  });
  if (prev) h.store.update(prev.id, { supersededBy: rec.id });
  trace("hmem.write", { id: rec.id, rule: rec.content, supersedes: prev?.id ?? null, source: who });
  return rec.id;
}

function current(h: any, notice: Notice) {
  return h.store.all()
    .filter((m: any) => m.content.startsWith(`${PREFIX} ${notice} ->`) && !m.supersededBy)
    .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
}

/** Build the active policy: defaults, overridden by any rule H-MEM recalls. */
export async function loadPolicy(): Promise<ExclusionPolicy> {
  const policy: ExclusionPolicy = structuredClone(DEFAULT_POLICY);
  if (process.env.HMEM === "off") { trace("hmem.disabled", { note: "control run: defaults only" }); return policy; }
  const h = await hmem();
  for (const n of NOTICES) {
    // Recall through H-MEM's retrieval service so the ledger records the read.
    const q = h.query(`${PREFIX} ${n}`, { threshold: 0.05, topN: 5 });
    const hit = q.memories
      .map((r: any) => r.memory ?? r)
      .filter((m: any) => m.content?.startsWith(`${PREFIX} ${n} ->`) && !m.supersededBy)
      .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
    if (hit) {
      policy.exclude[n] = hit.content.includes("-> exclude");
      policy.provenance[n] = `H-MEM ${hit.id} (set by ${hit.source})`;
      trace("hmem.recall", { notice: n, id: hit.id, rule: policy.exclude[n] ? "exclude" : "keep", reason: q.trace?.retrievalReason });
    }
  }
  return policy;
}

/** Full ledger history of a rule, for the audit view. */
export async function ruleHistory(id: string) {
  return (await hmem()).ledger.history(id);
}
