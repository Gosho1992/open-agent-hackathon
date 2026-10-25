// Aftershock CLI.
//   audit  [--outcome "Coronary events"] [--corrupt] [--report]   run the audit (writes trace + result)
//   explain <result.json>                                          write the reports for an existing result
//                                                                  (e.g. a live-Zetaris result) with Nemotron;
//                                                                  the new trace records the result's hash
//   verify-trace <trace.jsonl>                                     re-check a trace's hash chain offline
//   policy set "Expression of concern" exclude|keep                stored in H-MEM
//   policy show

import fs from "node:fs";
import crypto from "node:crypto";
import { startRun, trace, traceHead, verifyTrace, codeSha } from "./trace.ts";
import { traceImpact } from "./impact.ts";
import { auditCase, writeReport, type CaseResult } from "./agent.ts";
import { loadPolicy, setRule } from "./hmem/policyMemory.ts";
import * as data from "./data.ts";
import type { Notice } from "./policy.ts";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const REVIEW = "10.1371/journal.pone.0159252";
const FIGURE = "data/raw/liyanage2016_fig2_forest.png";
const OUTCOMES = ["MACE", "Coronary events", "Stroke", "CVD mortality", "All-cause mortality", "Heart failure"];

function table(results: CaseResult[]) {
  const f = (p: any) => (p ? `${p.measure} ${p.es.toFixed(2)} (${p.lci.toFixed(2)}-${p.uci.toFixed(2)})` : "-");
  console.log("\n  outcome               published                        recalculated                     verdict              VITALITY");
  for (const r of results)
    console.log(`  ${r.outcome.padEnd(21)} ${f(r.published).padEnd(32)} ${f(r.recalculated).padEnd(32)} ${(r.verdict?.headline ?? r.status).padEnd(20)} ${r.crossCheck?.agrees === true ? "agrees" : r.crossCheck?.agrees === false ? "DIFFERS" : r.crossCheck ? "n/a" : "-"}`);
  for (const r of results) if (r.status !== "VERIFIED") console.log(`\n  ${r.outcome}: NEEDS HUMAN REVIEW - ${r.reason}`);
}

async function main() {
  const [cmd, sub, ...rest] = args;
  if (cmd === "policy") {
    if (sub === "set") {
      const [notice, action] = rest as [Notice, string];
      const id = await setRule(notice, action === "exclude", "reviewer via CLI");
      console.log(`stored in H-MEM as ${id}: ${notice} -> ${action}`);
    }
    console.log(JSON.stringify(await loadPolicy(), null, 2));
    return;
  }
  if (cmd === "verify-trace") {
    const v = verifyTrace(fs.readFileSync(sub, "utf8"));
    const first = JSON.parse(fs.readFileSync(sub, "utf8").split("\n")[0]);
    console.log(v.ok ? `OK: ${v.lines} lines, hash chain intact, head ${v.head}` : `BROKEN at line ${v.brokenAt}: ${v.why}`);
    console.log(`code_sha in trace: ${first.code_sha}\ncode_sha of this checkout: ${codeSha()}  ${first.code_sha === codeSha() ? "(same code)" : "(different code)"}`);
    process.exit(v.ok ? 0 : 1);
  }
  if (cmd === "explain") {
    // Reports for an existing result. The live-Zetaris audit runs where Zetaris runs; Nightshift runs on
    // the reviewer's machine. This step binds the two: its trace records the input result's sha256.
    const raw = fs.readFileSync(sub, "utf8");
    const input = JSON.parse(raw);
    const file = startRun("explain");
    trace("input.result", { file: sub, sha256: crypto.createHash("sha256").update(raw).digest("hex"), source_trace_head: input.trace_head ?? null, source_code_sha: input.code_sha ?? null, data_source: input.data_source ?? null });
    const rev = await data.review(input.review);
    for (const r of input.results as CaseResult[]) {
      r.report = await writeReport(rev, r);
      console.log(`\n${r.report}\n`);
    }
    const out = file.replace(/\.jsonl$/, ".result.json");
    fs.writeFileSync(out, JSON.stringify({ ...input, explained_from: sub, trace_head: traceHead() }, null, 2));
    console.log(`  trace:  ${file}\n  result: ${out}`);
    return;
  }
  if (cmd !== "audit") { console.log("usage: audit [--outcome X] [--corrupt] [--report] | explain <result.json> | verify-trace <trace.jsonl> | policy set <notice> exclude|keep | policy show"); return; }

  const outcomes = opt("outcome", "") ? [opt("outcome", "")] : OUTCOMES;
  const file = startRun(`audit-${outcomes.length === 1 ? outcomes[0] : "all"}`);
  const policy = await loadPolicy();
  trace("policy.loaded", { exclude: Object.entries(policy.exclude).filter(([, v]) => v).map(([k]) => k), provenance: policy.provenance });

  const results: CaseResult[] = [];
  for (const outcome of outcomes)
    results.push(await auditCase({ reviewDoi: REVIEW, outcome, figure: FIGURE, corrupt: flag("corrupt") }, policy, { withReport: flag("report") }));
  table(results);
  for (const r of results) if (r.report) console.log(`\n${r.report}\n`);

  // Impact Tracer runs only when at least one outcome changed. Results are candidates, not findings.
  let impact = null;
  if (results.some(r => r.verdict && r.verdict.headline !== "NO_CHANGE_DETECTED")) {
    try {
      impact = await traceImpact(REVIEW);
      console.log(`\n  Impact (candidates for human review): cited by ${impact.citedByCount} works, ${impact.sampled} scanned. Title-matched: ${impact.guidelines.length} guideline-type documents, ${impact.reviews.length} later reviews.`);
      for (const g of impact.guidelines.slice(0, 5)) console.log(`    - [guideline?] ${g.year} ${g.title.slice(0, 110)}`);
    } catch (e) { trace("impact.error", { error: String(e) }); }
  }

  trace("run.end", { verified: results.filter(r => r.status === "VERIFIED").length, needs_review: results.filter(r => r.status !== "VERIFIED").length });
  const runFile = file.replace(/\.jsonl$/, ".result.json");
  const dataSource = process.env.SAMPLE_MODE === "true" || process.env.DATA_SOURCE === "csv" ? "csv" : "zetaris";
  fs.writeFileSync(runFile, JSON.stringify({ review: REVIEW, data_source: dataSource, code_sha: codeSha(), trace_head: traceHead(), policy, results, impact }, null, 2));
  console.log(`\n  trace:  ${file}\n  result: ${runFile}`);
}
main().catch(e => { console.error(e); process.exit(1); });
