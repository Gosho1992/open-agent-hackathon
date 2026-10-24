// Aftershock CLI.
//   npx tsx src/cli.ts audit  [--outcome "Coronary events"] [--corrupt] [--report]
//   npx tsx src/cli.ts policy set "Expression of concern" exclude   (stored in H-MEM)
//   npx tsx src/cli.ts policy show

import { startRun, trace } from "./trace.ts";
import { auditCase } from "./agent.ts";
import { loadPolicy, setRule } from "./hmem/policyMemory.ts";
import type { Notice } from "./policy.ts";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const REVIEW = "10.1371/journal.pone.0159252";
const FIGURE = "data/raw/liyanage2016_fig2_forest.png";
const OUTCOMES = ["MACE", "Coronary events", "Stroke", "CVD mortality", "All-cause mortality", "Heart failure"];

async function main() {
  const [cmd, sub, ...rest] = args;
  if (cmd === "policy") {
    if (sub === "set") {
      const [notice, action] = rest as [Notice, string];
      const id = await setRule(notice, action === "exclude", "reviewer via CLI");
      console.log(`stored in H-MEM as ${id}: ${notice} -> ${action}`);
    }
    const p = await loadPolicy();
    console.log(JSON.stringify(p, null, 2));
    return;
  }
  if (cmd !== "audit") { console.log("usage: audit [--outcome X] [--corrupt] [--report] | policy set <notice> exclude|keep | policy show"); return; }

  const outcomes = opt("outcome", "") ? [opt("outcome", "")] : OUTCOMES;
  const file = startRun(`audit-${outcomes.length === 1 ? outcomes[0] : "all"}`);
  const policy = await loadPolicy();
  trace("policy.loaded", { exclude: Object.entries(policy.exclude).filter(([, v]) => v).map(([k]) => k), provenance: policy.provenance });

  const results = [];
  for (const outcome of outcomes) {
    results.push(await auditCase({ reviewDoi: REVIEW, outcome, figure: FIGURE, corrupt: flag("corrupt") }, policy, { withReport: flag("report") }));
  }
  console.log("\n  outcome               original                         recalculated                     verdict              VITALITY");
  for (const r of results) {
    const f = (p: any) => (p ? `${p.measure} ${p.es.toFixed(2)} (${p.lci.toFixed(2)}-${p.uci.toFixed(2)})` : "-");
    console.log(`  ${r.outcome.padEnd(21)} ${f(r.original).padEnd(32)} ${f(r.recalculated).padEnd(32)} ${(r.verdict?.headline ?? r.status).padEnd(20)} ${r.crossCheck?.agrees === true ? "agrees" : r.crossCheck?.agrees === false ? "DIFFERS" : "-"}`);
    if (r.report) console.log(`\n${r.report}\n`);
  }
  console.log(`\n  trace: ${file}`);
}
main().catch(e => { console.error(e); process.exit(1); });
