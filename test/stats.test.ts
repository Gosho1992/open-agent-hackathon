// Reproduces every pooled estimate published in Liyanage 2016 (PLoS One, Fig 2)
// and checks the PREDIMED exclusion against the VITALITY answer key.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { poolBinary, type BinaryStudy } from "../src/stats/meta.ts";
import { compare } from "../src/stats/verdict.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const csv = (p: string) => {
  const [h, ...rows] = fs.readFileSync(path.join(root, p), "utf8").trim().split(/\r?\n/);
  const cols = h.split(",");
  return rows.map(r => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
};

const studies = csv("data/studies/liyanage2016_med_diet.csv");
const byOutcome = (o: string): (BinaryStudy & { name: string })[] =>
  studies.filter(s => s.outcome === o).map(s => ({
    id: s.study, name: s.study,
    treatEvents: +s.treat_events, treatN: +s.treat_n, ctrlEvents: +s.ctrl_events, ctrlN: +s.ctrl_n,
  }));

for (const p of csv("data/studies/published_pooled.csv")) {
  test(`reproduces ${p.outcome} (${p.scenario})`, () => {
    let rows = byOutcome(p.outcome);
    if (p.scenario !== "all") rows = rows.filter(r => !r.name.includes("Singh"));
    const got = poolBinary(rows, "Fixed MH", "RR");
    for (const [k, v] of [["es", got.es], ["lci", got.lci], ["uci", got.uci]] as const)
      assert.ok(Math.abs(Math.round(v * 100) / 100 - +p[k]) <= 0.011, `${k}: got ${v.toFixed(3)}, published ${p[k]}`);
  });
}

test("PREDIMED exclusion matches VITALITY answer key (MACE 0.43, 0.32-0.58)", () => {
  const rows = byOutcome("MACE");
  const r = poolBinary(rows.filter(s => !s.name.includes("PREDIMED")), "Fixed MH", "RR");
  assert.deepEqual([r.es, r.lci, r.uci].map(x => Math.round(x * 100) / 100), [0.43, 0.32, 0.58]);
});

test("verdicts: Singh exclusion on coronary events loses significance; MACE holds", () => {
  const coronary = byOutcome("Coronary events");
  const v1 = compare(poolBinary(coronary, "Fixed MH", "RR"), poolBinary(coronary.filter(s => !s.name.includes("Singh")), "Fixed MH", "RR"));
  assert.equal(v1.headline, "SIGNIFICANCE_LOST");
  const mace = byOutcome("MACE");
  const v2 = compare(poolBinary(mace, "Fixed MH", "RR"), poolBinary(mace.filter(s => !s.name.includes("Singh")), "Fixed MH", "RR"));
  assert.equal(v2.headline, "HOLDS");
});

test("Peto OR and DerSimonian-Laird run on simple data", () => {
  const s: BinaryStudy[] = [
    { id: "a", treatEvents: 5, treatN: 100, ctrlEvents: 15, ctrlN: 100 },
    { id: "b", treatEvents: 8, treatN: 120, ctrlEvents: 12, ctrlN: 118 },
    { id: "c", treatEvents: 2, treatN: 60, ctrlEvents: 9, ctrlN: 61 },
  ];
  const p = poolBinary(s, "Peto", "OR");
  assert.ok(p.es < 1 && p.uci < 1);
  const r = poolBinary(s, "Random IV", "RR");
  assert.ok(r.tau2! >= 0 && r.es < 1);
});
