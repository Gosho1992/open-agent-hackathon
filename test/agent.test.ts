// Safety tests for the agent loop: the gate must fail closed.
// Each test names the loophole it closes (from the external code reviews).
process.env.SAMPLE_MODE = "true";
process.env.AFTERSHOCK_QUIET = "true";

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, noticeOf, UNRECOGNISED } from "../src/policy.ts";
import { verifyTrace, startRun, trace } from "../src/trace.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { auditCase, verify, validateReference, resolveIdentity } = await import("../src/agent.ts");
const data = await import("../src/data.ts");

const REVIEW = "10.1371/journal.pone.0159252";
const registry = await data.studies(REVIEW, "Stroke");
const ref = { es: 0.65, lci: 0.48, uci: 0.88, method: "Fixed MH" as const, measure: "RR" as const, printed: { treat_events: 90, treat_n: 5798, ctrl_events: 77, ctrl_n: 3254 }, vitalityKey: "711_5:4", source: "test" };
const rows = () => registry.map(r => ({ study: r.study, doi: r.doi, pmid: r.pmid, treat_events: r.treat_events, treat_n: r.treat_n, ctrl_events: r.ctrl_events, ctrl_n: r.ctrl_n }));

test("vision circularity: a misread table cannot pass, because the reference comes from Zetaris, not the model", async () => {
  // A 'model' that consistently misreads PREDIMED and can no longer supply its own published value.
  const misreader = async () => ({ studies: rows().map(s => s.study.startsWith("Estruch") ? { ...s, treat_events: 61, ctrl_events: 78 } : s), totals: { treat_events: 70, treat_n: 5798, ctrl_events: 97, ctrl_n: 3254 } });
  const r = await auditCase({ reviewDoi: REVIEW, outcome: "Stroke" }, DEFAULT_POLICY, { extractor: misreader });
  assert.equal(r.status, "NEEDS_HUMAN_REVIEW");
  assert.match(r.reason!, /printed total/);
});

test("recovery: a corrupted first reading is rejected, the re-read passes", async () => {
  let calls = 0;
  const flaky = async () => (++calls === 1 ? { studies: rows().map((s, i) => (i === 0 ? { ...s, treat_events: s.treat_events + 10 } : s)) } : { studies: rows() });
  const r = await auditCase({ reviewDoi: REVIEW, outcome: "Stroke" }, DEFAULT_POLICY, { extractor: flaky });
  assert.equal(r.status, "VERIFIED");
  assert.equal(r.attempts, 2);
  assert.equal(r.verdict!.headline, "SIGNIFICANCE_LOST");
});

test("crash safety: an extractor that throws (bad JSON, model down) escalates instead of crashing", async () => {
  const broken = async () => { throw new Error("no JSON in model reply"); };
  const r = await auditCase({ reviewDoi: REVIEW, outcome: "Stroke" }, DEFAULT_POLICY, { extractor: broken });
  assert.equal(r.status, "NEEDS_HUMAN_REVIEW");
  assert.match(r.reason!, /extraction failed: no JSON/);
});

test("crash safety: an unknown review escalates instead of crashing", async () => {
  const r = await auditCase({ reviewDoi: "10.0000/does-not-exist", outcome: "Stroke" }, DEFAULT_POLICY);
  assert.equal(r.status, "NEEDS_HUMAN_REVIEW");
});

test("NaN safety: a missing published number fails validation (NaN > tol is false in JS)", () => {
  const bad = { ...ref, lci: NaN };
  assert.ok(validateReference(bad).length > 0);
  assert.equal(verify(rows(), bad).ok, false);
});

test("method/measure guard: Peto cannot produce an RR", () => {
  assert.ok(validateReference({ ...ref, method: "Peto" as any }).some(p => /cannot produce/.test(p)));
});

test("counts guard: zero participants or events > n are rejected before any statistics", () => {
  assert.equal(verify(rows().map((s, i) => (i === 1 ? { ...s, treat_n: 0 } : s)), ref).ok, false);
  assert.equal(verify(rows().map((s, i) => (i === 1 ? { ...s, treat_events: 9999 } : s)), ref).ok, false);
});

test("vision totals: totals read by the model must equal the printed totals on file", () => {
  assert.equal(verify(rows(), ref, { ...ref.printed, ctrl_n: 3245 }).ok, false);
  assert.equal(verify(rows(), ref, ref.printed).ok, true);
});

test("identity fails closed: a study without DOI or PMID cannot be checked, so the audit stops", () => {
  const reg = registry.map(r => (r.study.startsWith("de Lorgeril") ? { ...r, doi: "", pmid: "" } : r));
  const id = resolveIdentity({ studies: rows() }, reg);
  assert.ok(id.problems.some(p => /no DOI or PubMed ID/.test(p)));
});

test("identity: an unknown or missing study is never silently dropped", () => {
  const extra = resolveIdentity({ studies: [...rows(), { study: "Smith 2010", treat_events: 1, treat_n: 10, ctrl_events: 1, ctrl_n: 10 }] }, registry);
  assert.ok(extra.problems.some(p => /does not match any study/.test(p)));
  const missing = resolveIdentity({ studies: rows().slice(1) }, registry);
  assert.ok(missing.problems.some(p => /missing from the extraction/.test(p)));
});

test("identity: names as printed in the figure resolve (\"Sing et al (2002)\" -> Singh 2002, \"Estruch et at (2013)\")", () => {
  const printed = rows().map(s => ({ ...s, study: s.study.startsWith("Singh") ? "Sing et al (2002)" : s.study.startsWith("Estruch") ? "Estruch et at (2013)" : "de Lorgeril et al (1994)" }));
  const id = resolveIdentity({ studies: printed }, registry);
  assert.deepEqual(id.problems, []);
  assert.ok(id.studies.find(s => s.study === "Singh 2002")?.pmid === "12433513");
});

test("notices: an unrecognised notice type is never mapped to 'no notice'", () => {
  assert.equal(noticeOf("Something new", ""), UNRECOGNISED);
  assert.equal(noticeOf("Reinstatement", ""), "Reinstatement");
  assert.equal(noticeOf("Retraction", "Retract and Replace;"), "Retract and replace");
});

test("retraction lookup works by PMID when the DOI is absent", async () => {
  const hits = await data.retractionStatus([{ pmid: "23432189" }]);
  assert.ok(hits.some(h => h.nature === "Retraction"));
});

test("cross-check uses a stable VITALITY key, and reports retract-and-replace honestly", async () => {
  const r = await auditCase({ reviewDoi: REVIEW, outcome: "Stroke" }, DEFAULT_POLICY, { extractor: async () => ({ studies: rows() }) });
  assert.equal(r.crossCheck!.key, "711_5:4");
  assert.equal(r.crossCheck!.agrees, true);
  assert.equal(r.excluded[0].replacement, "10.1056/NEJMoa1800389");
  assert.match(r.excluded[0].scenario, /does not imply the trial's evidence is invalid/);
});

test("trace is tamper-evident: editing any line breaks the hash chain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "as-"));
  const f = startRun("tamper-test", dir);
  trace("a", { x: 1 }); trace("b", { y: 2 }); trace("c", { z: 3 });
  const text = fs.readFileSync(f, "utf8");
  assert.equal(verifyTrace(text).ok, true);
  assert.equal(verifyTrace(text.replace('"y":2', '"y":3')).ok, false);
  const lines = text.trim().split("\n");
  assert.equal(verifyTrace([lines[0], lines[2], lines[3]].join("\n")).ok, false);   // a line removed
});
