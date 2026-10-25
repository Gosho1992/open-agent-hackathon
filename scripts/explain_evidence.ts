// Laptop step (where Nightshift runs): explain the committed live-Zetaris result with Nemotron,
// record replay fixtures for sample mode, and copy the hash-chained trace into evidence/.
//   npm run evidence:explain
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dir = "evidence/traces";
const input = fs.readdirSync(dir).filter(f => /^live-zetaris_.*audit-all\.result\.json$/.test(f)).sort().pop();
if (!input) { console.error("No live-Zetaris result in evidence/traces. Run git pull first."); process.exit(1); }
const before = new Set(fs.existsSync(".aftershock/traces") ? fs.readdirSync(".aftershock/traces") : []);
execFileSync("npx", ["tsx", "--env-file-if-exists=.env", "src/cli.ts", "explain", path.join(dir, input)], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, RECORD_FIXTURES: "true" } });
const made = fs.readdirSync(".aftershock/traces").filter(f => !before.has(f) && f.includes("_explain"));
for (const f of made) fs.copyFileSync(path.join(".aftershock/traces", f), path.join(dir, f.replace(/^/, "explain_")));
const trace = made.find(f => f.endsWith(".jsonl"));
const lines = fs.readFileSync(path.join(".aftershock/traces", trace!), "utf8").trim().split("\n").map(l => JSON.parse(l));
const llm = lines.filter(l => l.event === "llm");
const accepted = lines.filter(l => l.event === "reporter.grounding" && l.accepted).length;
console.log(`\n${llm.length} Nemotron calls via Nightshift; signed receipts: ${llm.filter(l => l.signed).length}; labels: ${[...new Set(llm.map(l => l.label))].join(", ")}; explanations accepted by the grounding gate: ${accepted}/${llm.length}`);
console.log(`Saved to ${dir}/explain_${trace}. Now run:  git add evidence fixtures && git commit -m "Evidence: Nemotron via Nightshift" && git push`);
