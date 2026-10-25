// Aftershock agent loop.
//
//   Reference   -> the AUTHORITATIVE published result (estimate, CI, method, measure and the printed
//                  column totals) comes from Zetaris, never from a model. It is validated strictly.
//   Extractor   -> candidate study rows (Nemotron/VL vision via Nightshift, or the curated table
//                  when EXTRACTION=curated). The extractor never supplies the number it is checked against.
//   Identity    -> every extracted row must resolve to exactly one study in the registry, and every
//                  study must carry a DOI or PubMed ID. Unknown identity => NEEDS_HUMAN_REVIEW.
//   Verifier    -> GATE: rows must be valid counts, column sums must equal the PRINTED totals, and
//                  recomputing with the review's own method must reproduce the published result.
//                  Any failure (including a crash in extraction or statistics) is fed back to the
//                  extractor (max 3 attempts), then NEEDS_HUMAN_REVIEW. Nothing downstream runs on
//                  an unverified table.
//   Scout       -> editorial notices for every included study, matched on DOI OR PMID (Zetaris).
//                  An unrecognised notice type escalates; it is never treated as "no notice".
//   Policy      -> which notices exclude a study (H-MEM policy memory).
//   Re-analyst  -> deterministic recalculation + two-part verdict.
//   Cross-check -> the independent VITALITY recalculation, matched on a stable analysis key.
//   Reporter    -> every number is written by code from the result; Nemotron adds a plain-language
//                  explanation that may contain no numbers at all (otherwise it is withheld).

import fs from "node:fs";
import { chat, parseJson } from "./llm.ts";
import { trace } from "./trace.ts";
import * as data from "./data.ts";
import { poolBinary, type BinaryStudy, type Method, type Measure, type Pooled } from "./stats/meta.ts";
import { compare, type Verdict } from "./stats/verdict.ts";
import { noticeOf, UNRECOGNISED, type ExclusionPolicy, type Notice } from "./policy.ts";

export type Counts = data.Counts;
export interface ExtractedStudy extends Counts { study: string; doi?: string; pmid?: string }
export interface Candidate { studies: ExtractedStudy[]; totals?: Counts }
export interface Reference { es: number; lci: number; uci: number; method: Method; measure: Measure; printed: Counts; vitalityKey: string; source: string }
export interface CaseInput { reviewDoi: string; outcome: string; figure?: string; corrupt?: boolean }
export interface NoticeHit { study: string; notice: Notice; date: string; noticeDoi: string; recordId: string; matchedOn: "doi" | "pmid" }
export interface CaseResult {
  status: "VERIFIED" | "NEEDS_HUMAN_REVIEW";
  outcome: string;
  attempts: number;
  original?: Pooled;
  published?: { es: number; lci: number; uci: number; method: string; measure: string; source: string };
  recalculated?: Pooled | null;
  excluded: { study: string; notice: Notice; rule: string; scenario: string; replacement?: string }[];
  kept: { study: string; notice: Notice }[];
  notices?: NoticeHit[];
  verdict?: Verdict;
  crossCheck?: { vitality: string; key?: string; agrees: boolean | null };
  report?: string;
  models: string[];
  reason?: string;
}
export type Extractor = (input: CaseInput, feedback: string | null, models: string[], registry: data.StudyRow[]) => Promise<Candidate>;

const EXTRACT_MODEL = process.env.EXTRACT_MODEL ?? "openrouter/inclusionai/ling-3.0-flash-vl:free";
const REPORT_MODEL = process.env.REPORT_MODEL ?? "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free";
const MODE = process.env.EXTRACTION ?? "vision";   // "vision" | "curated"
const TOL = 0.011;                                  // published numbers are printed to 2 decimals
const MAX_ATTEMPTS = 3;
const ALLOWED: Record<Method, Measure[]> = { "Fixed MH": ["RR", "OR", "RD"], "Random MH": ["RR", "OR", "RD"], "Fixed IV": ["RR", "OR", "RD"], "Random IV": ["RR", "OR", "RD"], "Peto": ["OR"] };
const COUNT_KEYS = ["treat_events", "treat_n", "ctrl_events", "ctrl_n"] as const;

// ---------------- Reference (authoritative, from Zetaris) ----------------
export function validateReference(r: Reference): string[] {
  const p: string[] = [];
  if (!(r.method in ALLOWED)) p.push(`unknown pooling method "${r.method}"`);
  else if (!ALLOWED[r.method].includes(r.measure)) p.push(`method ${r.method} cannot produce measure "${r.measure}"`);
  if (![r.es, r.lci, r.uci].every(Number.isFinite)) p.push("published estimate or CI is missing / not a number");
  else {
    if (!(r.lci <= r.es && r.es <= r.uci)) p.push(`published CI ${r.lci}-${r.uci} does not contain the estimate ${r.es}`);
    if ((r.measure === "RR" || r.measure === "OR") && !(r.lci > 0)) p.push("ratio measure with a non-positive CI bound");
  }
  if (!COUNT_KEYS.every(k => Number.isInteger(r.printed[k]) && r.printed[k] >= 0)) p.push("printed column totals are missing (the gate needs them)");
  return p;
}

async function reference(input: CaseInput): Promise<Reference> {
  const pub = (await data.publishedPooled(input.reviewDoi, input.outcome)).filter(p => p.scenario === "all");
  if (pub.length !== 1) throw new Error(`expected exactly one published 'all studies' estimate for ${input.outcome}, found ${pub.length}`);
  const p = pub[0];
  return { es: p.es, lci: p.lci, uci: p.uci, method: p.method as Method, measure: p.measure as Measure, printed: p.printed, vitalityKey: p.vitality_key, source: p.source };
}

// ---------------- Extractor (candidate rows only) ----------------
const curatedExtractor: Extractor = async (_input, _feedback, _models, registry) => {
  trace("extractor", { mode: "curated", rows: registry.length });
  return { studies: registry.map(r => ({ study: r.study, doi: r.doi, pmid: r.pmid, treat_events: r.treat_events, treat_n: r.treat_n, ctrl_events: r.ctrl_events, ctrl_n: r.ctrl_n })) };
};

const visionExtractor: Extractor = async (input, feedback, models, registry) => {
  if (!input.figure) throw new Error("vision extraction needs a forest plot image");
  const img = fs.readFileSync(input.figure).toString("base64");
  const prompt = [
    `This is a forest plot from a published meta-analysis. Read ONLY the block for the outcome "${input.outcome}".`,
    `The included studies are: ${registry.map(r => r.study).join("; ")}.`,
    `Return JSON: {"studies":[{"study":"<first author year>","treat_events":n,"treat_n":n,"ctrl_events":n,"ctrl_n":n}],`,
    `"totals":{"treat_events":n,"treat_n":n,"ctrl_events":n,"ctrl_n":n}} where totals is the printed "All trials" row.`,
    `Copy numbers exactly as printed. Do not compute anything. Do not include summary rows in "studies".`,
    feedback ? `\nYour previous reading failed verification: ${feedback}\nRe-read the figure carefully and correct it.` : "",
  ].join("\n");
  const r = await chat("extractor", EXTRACT_MODEL, [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${img}` } }] }], { json: true });
  models.push(r.model);
  const x = parseJson<Candidate>(r.text);
  if (!Array.isArray(x?.studies)) throw new Error("model reply has no studies array");
  trace("extractor", { mode: "vision", model: r.model, studies: x.studies.length, totals: x.totals ?? null });
  return { studies: x.studies.map(s => ({ ...s, treat_events: Number(s.treat_events), treat_n: Number(s.treat_n), ctrl_events: Number(s.ctrl_events), ctrl_n: Number(s.ctrl_n) })), totals: x.totals };
};

// ---------------- Identity (fail closed) ----------------
/** First-author surname + year, e.g. "de Lorgeril et al (1994)" -> ["lorgeril", "1994"]. */
const nameKey = (s: string): [string, string] => {
  const m = s.toLowerCase().match(/([a-z][a-z'\- ]*?)\s*(?:et\s+a[lt]\.?)?\s*\(?((?:19|20)\d\d)/);
  return m ? [m[1].trim().split(/\s+/).pop()!, m[2]] : [s.toLowerCase().trim(), ""];
};
const lev1 = (a: string, b: string) => {   // edit distance <= 1 (tolerates "Sing" for "Singh" as printed in a figure)
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
const sameStudy = (a: string, b: string) => { const [na, ya] = nameKey(a), [nb, yb] = nameKey(b); return ya === yb && ya !== "" && (na === nb || (Math.min(na.length, nb.length) >= 4 && lev1(na, nb))); };

/** Attach registry identities to the extracted rows. Every row must resolve to exactly one registry study with a DOI or PMID. */
export function resolveIdentity(c: Candidate, registry: data.StudyRow[]): { problems: string[]; studies: ExtractedStudy[] } {
  const problems: string[] = [];
  if (!registry.length) return { problems: ["no study registry for this outcome: identities cannot be established"], studies: [] };
  for (const r of registry) if (!r.doi && !r.pmid) problems.push(`${r.study}: no DOI or PubMed ID on file, so its retraction status cannot be checked`);
  const used = new Set<string>();
  const studies = c.studies.map(s => {
    const hits = registry.filter(r => sameStudy(r.study, s.study));
    if (hits.length !== 1) { problems.push(`"${s.study}" ${hits.length ? "matches several registry studies" : "does not match any study in the registry"}`); return s; }
    if (used.has(hits[0].study)) problems.push(`"${s.study}" appears twice`);
    used.add(hits[0].study);
    return { ...s, study: hits[0].study, doi: hits[0].doi, pmid: hits[0].pmid };
  });
  for (const r of registry) if (!used.has(r.study)) problems.push(`registry study ${r.study} is missing from the extraction`);
  return { problems, studies };
}

// ---------------- Verifier (the gate) ----------------
export function verify(studies: ExtractedStudy[], ref: Reference, readTotals?: Counts): { ok: boolean; problems: string[]; pooled?: Pooled } {
  const problems = validateReference(ref);
  if (problems.length) return { ok: false, problems: problems.map(p => `reference: ${p}`) };
  if (!studies.length) return { ok: false, problems: ["no studies extracted"] };
  for (const s of studies) {
    if (COUNT_KEYS.some(k => !Number.isInteger(s[k]) || s[k] < 0)) problems.push(`${s.study}: counts must be non-negative integers`);
    else if (s.treat_n === 0 || s.ctrl_n === 0) problems.push(`${s.study}: an arm has zero participants`);
    else if (s.treat_events > s.treat_n || s.ctrl_events > s.ctrl_n) problems.push(`${s.study}: more events than participants`);
  }
  if (problems.length) return { ok: false, problems };
  for (const k of COUNT_KEYS) {
    const sum = studies.reduce((a, s) => a + s[k], 0);
    if (sum !== ref.printed[k]) problems.push(`column ${k} sums to ${sum} but the printed total is ${ref.printed[k]}`);
    if (readTotals && Number(readTotals[k]) !== ref.printed[k]) problems.push(`the extractor read total ${k} = ${readTotals[k]} but the printed total on file is ${ref.printed[k]}`);
  }
  if (problems.length) return { ok: false, problems };
  let pooled: Pooled;
  try { pooled = poolBinary(studies.map(toBinary), ref.method, ref.measure); }
  catch (e) { return { ok: false, problems: [`statistics failed: ${(e as Error).message}`] }; }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  // NaN-safe: anything that is not provably within tolerance fails.
  const off = (["es", "lci", "uci"] as const).filter(k => !(Math.abs(r2(pooled[k]) - ref[k]) <= TOL));
  if (off.length) problems.push(`recomputed ${ref.method} ${ref.measure} = ${r2(pooled.es)} (${r2(pooled.lci)}-${r2(pooled.uci)}) but the published result is ${ref.es} (${ref.lci}-${ref.uci})`);
  return { ok: problems.length === 0, problems, pooled };
}
const toBinary = (s: ExtractedStudy): BinaryStudy => ({ id: s.study, treatEvents: s.treat_events, treatN: s.treat_n, ctrlEvents: s.ctrl_events, ctrlN: s.ctrl_n });

/** Deliberate fault injection for the recovery demo: change one count of one study. */
function corrupt(c: Candidate): Candidate {
  const y = structuredClone(c);
  const s = y.studies[0];
  s.treat_events = s.treat_events + 10;
  trace("fault.injected", { study: s.study, field: "treat_events", note: "demo: simulates a misread digit" });
  return y;
}

// ---------------- Reporter ----------------
const fmtP = (p: { measure: string; es: number; lci: number; uci: number }) => `${p.measure} ${p.es.toFixed(2)} (95% CI ${p.lci.toFixed(2)} to ${p.uci.toFixed(2)})`;

/** The factual part of the report, written by code from the result object only. */
export function factualReport(rev: data.Review, r: CaseResult): string {
  const lines = [`${rev.short_name} (${rev.journal} ${rev.year}), outcome: ${r.outcome}.`];
  if (r.status !== "VERIFIED") return [...lines, `NEEDS HUMAN REVIEW: ${r.reason}`].join("\n");
  lines.push(`Published (${r.published!.method}): ${fmtP(r.published!)}; Aftershock reproduced it from the study table as ${fmtP(r.original!)}.`);
  if (!r.excluded.length) lines.push("No included study is excluded under the current policy.");
  for (const e of r.excluded) lines.push(`Excluded: ${e.study} (${e.notice}; ${e.rule}). ${e.scenario}${e.replacement ? ` Replacement publication: ${e.replacement}.` : ""}`);
  for (const k of r.kept.filter(k => k.notice !== "None")) lines.push(`Flagged but kept by policy: ${k.study} (${k.notice}).`);
  lines.push(`Recalculated: ${r.recalculated ? fmtP(r.recalculated) : "no studies remain"}.`);
  lines.push(`Verdict: ${r.verdict!.headline} (${r.verdict!.interpretation}). ${r.verdict!.reason}`);
  if (r.crossCheck) lines.push(`Independent check (BMJ VITALITY${r.crossCheck.key ? `, analysis ${r.crossCheck.key}` : ""}): ${r.crossCheck.agrees === true ? "agrees" : r.crossCheck.agrees === false ? "DIFFERS" : "not available"} - ${r.crossCheck.vitality}.`);
  return lines.join("\n");
}

async function report(rev: data.Review, res: CaseResult, models: string[]): Promise<string> {
  const facts = factualReport(rev, res);
  let explanation = "";
  try {
    const r = await chat("reporter", REPORT_MODEL, [
      { role: "system", content: "You explain evidence-integrity findings to systematic reviewers. The facts below were computed and verified by code. In 2-4 plain sentences, explain what they mean and what a reviewer should check next. Do NOT write any digits or numbers (the facts are shown separately). Never give clinical advice. Never call a review, trial or guideline invalid." },
      { role: "user", content: facts },
    ]);
    models.push(r.model);
    // Grounding gate: the model may not introduce, restate or alter any number.
    const digits = r.text.match(/\d+([.,]\d+)?/g) ?? [];
    trace("reporter.grounding", { model: r.model, numbers_in_explanation: digits, accepted: digits.length === 0 });
    explanation = digits.length === 0
      ? `\nExplanation (${r.model}, via Nightshift): ${r.text.trim()}`
      : `\n[Model explanation withheld: it contained numbers (${digits.join(", ")}). Only code-generated numbers are shown.]`;
  } catch (e) {
    trace("reporter.unavailable", { error: String(e).slice(0, 200) });
    explanation = "\n[Model explanation unavailable; the factual report above is complete.]";
  }
  return facts + "\n" + explanation;
}

/** Report for an existing result (used by `explain`). */
export const writeReport = (rev: data.Review, res: CaseResult) => report(rev, res, res.models ?? []);

// ---------------- Orchestrator ----------------
const escalate = (outcome: string, attempts: number, models: string[], reason: string, extra: Partial<CaseResult> = {}): CaseResult => {
  trace("escalate", { outcome, reason });
  return { status: "NEEDS_HUMAN_REVIEW", outcome, attempts, excluded: [], kept: [], models, reason, ...extra };
};

export async function auditCase(input: CaseInput, policy: ExclusionPolicy, opts: { withReport?: boolean; extractor?: Extractor } = {}): Promise<CaseResult> {
  const models: string[] = [];
  let rev: data.Review | null = null;
  let res: CaseResult;
  try {
    rev = await data.review(input.reviewDoi);
    trace("case", { review: rev.short_name, outcome: input.outcome });
    res = await auditInner(input, policy, opts.extractor ?? (MODE === "curated" ? curatedExtractor : visionExtractor), models);
  } catch (e) {
    // Data-access or unexpected failures never crash the audit and never pass as a result.
    res = escalate(input.outcome, 0, models, `audit could not run safely: ${(e as Error).message}`);
  }
  if (opts.withReport && rev) res.report = await report(rev, res, models);
  return res;
}

async function auditInner(input: CaseInput, policy: ExclusionPolicy, extractor: Extractor, models: string[]): Promise<CaseResult> {
  const ref = await reference(input);
  const refProblems = validateReference(ref);
  trace("reference", { source: ref.source, method: ref.method, measure: ref.measure, published: [ref.es, ref.lci, ref.uci], printed_totals: ref.printed, ok: refProblems.length === 0 });
  if (refProblems.length) return escalate(input.outcome, 0, models, `authoritative reference failed validation: ${refProblems.join("; ")}`);
  const registry = await data.studies(input.reviewDoi, input.outcome);

  // Extract -> resolve identity -> verify, with bounded retries. Any exception is a failed attempt.
  let studies: ExtractedStudy[] = [], v: ReturnType<typeof verify> | null = null, feedback: string | null = null, attempt = 0;
  for (attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let problems: string[];
    try {
      let c = await extractor(input, feedback, models, registry);
      if (input.corrupt && attempt === 1) c = corrupt(c);
      const id = resolveIdentity(c, registry);
      studies = id.studies;
      v = id.problems.length ? { ok: false, problems: id.problems.map(p => `identity: ${p}`) } : verify(studies, ref, c.totals);
      problems = v.problems;
    } catch (e) {
      v = null;
      problems = [`extraction failed: ${(e as Error).message}`];
    }
    trace("verifier", { attempt, ok: v?.ok ?? false, problems });
    if (v?.ok) break;
    feedback = problems.join("; ");
  }
  if (!v?.ok || !v.pooled) return escalate(input.outcome, MAX_ATTEMPTS, models, `could not verify the extraction after ${MAX_ATTEMPTS} attempts: ${feedback}`);
  const published = { es: ref.es, lci: ref.lci, uci: ref.uci, method: ref.method, measure: ref.measure, source: ref.source };

  // Scout: notices on the included studies, by DOI or PMID.
  const records = await data.retractionStatus(studies.map(s => ({ doi: s.doi, pmid: s.pmid })));
  const notices: NoticeHit[] = [];
  const unrecognised: string[] = [];
  const excluded: CaseResult["excluded"] = [], kept: CaseResult["kept"] = [];
  for (const s of studies) {
    const mine = records.filter(r => (s.doi && r.doi?.toLowerCase() === s.doi.toLowerCase()) || (s.pmid && String(r.pmid).trim() === s.pmid));
    const types = mine.map(r => {
      const n = noticeOf(r.nature, r.reason);
      if (n === UNRECOGNISED) { unrecognised.push(`${s.study}: "${r.nature}"`); return null; }
      notices.push({ study: s.study, notice: n, date: r.date, noticeDoi: r.noticeDoi, recordId: r.recordId, matchedOn: s.doi && r.doi?.toLowerCase() === s.doi.toLowerCase() ? "doi" : "pmid" });
      return n;
    }).filter((n): n is Notice => n !== null);
    const excl = types.find(n => policy.exclude[n]);
    if (excl) {
      const rep = excl === "Retract and replace" && s.doi ? data.replacementFor(s.doi) : null;
      excluded.push({
        study: s.study, notice: excl, rule: policy.provenance[excl] ?? "default policy",
        scenario: excl === "Retract and replace"
          ? "Scenario: exclude the retracted source record. The trial was republished with corrected data; this sensitivity analysis does not substitute the replacement and does not imply the trial's evidence is invalid."
          : "Scenario: exclude the retracted record.",
        ...(rep ? { replacement: rep.replacement_doi } : {}),
      });
    } else kept.push({ study: s.study, notice: types[0] ?? "None" });
  }
  trace("scout+policy", { matched: notices.map(n => `${n.study}: ${n.notice} via ${n.matchedOn}`), excluded: excluded.map(e => e.study), flagged_but_kept: kept.filter(k => k.notice !== "None") });
  if (unrecognised.length) return escalate(input.outcome, attempt, models, `unrecognised editorial notice type: ${unrecognised.join("; ")}`, { original: v.pooled, published, notices });

  // Re-analyst.
  const remaining = studies.filter(s => !excluded.some(e => e.study === s.study));
  let recalculated: Pooled | null;
  try { recalculated = remaining.length ? poolBinary(remaining.map(toBinary), ref.method, ref.measure) : null; }
  catch (e) { return escalate(input.outcome, attempt, models, `recalculation failed: ${(e as Error).message}`, { original: v.pooled, published }); }
  const verdict = compare(v.pooled, recalculated);
  trace("reanalyst", { original: fmtP(v.pooled), recalculated: recalculated ? fmtP(recalculated) : null, headline: verdict.headline, change: verdict.change });

  // Independent cross-check against VITALITY, matched on a stable analysis key (never on nearest numbers).
  const crossCheck = await crossCheckVitality(input.reviewDoi, ref, v.pooled, recalculated, studies.length, excluded.length, policy);
  trace("crosscheck", crossCheck);

  return { status: "VERIFIED", outcome: input.outcome, attempts: attempt, original: v.pooled, published, recalculated, excluded, kept, notices, verdict, crossCheck, models };
}

async function crossCheckVitality(reviewDoi: string, ref: Reference, original: Pooled, recalculated: Pooled | null, nStudies: number, nExcluded: number, policy: ExclusionPolicy): Promise<NonNullable<CaseResult["crossCheck"]>> {
  if (policy.exclude["Expression of concern"] || policy.exclude["Correction"])
    return { vitality: "not comparable: VITALITY excludes formal retractions only, this run uses a stricter reviewer policy", agrees: null };
  if (!ref.vitalityKey) return { vitality: "no VITALITY analysis is registered for this outcome", agrees: null };
  const rows = (await data.answerKey(reviewDoi)).filter(k => k.key === ref.vitalityKey);
  if (rows.length !== 1) return { vitality: `unresolved: analysis key ${ref.vitalityKey} found ${rows.length} times`, key: ref.vitalityKey, agrees: null };
  const k = rows[0];
  const same = k.noofstudies === nStudies && k.noofretraction === nExcluded && [["all_es", "es"], ["all_lci", "lci"], ["all_uci", "uci"]].every(([a, b]) => Math.abs((k as any)[a] - (original as any)[b]) <= TOL);
  if (!same) return { vitality: `unresolved: analysis ${ref.vitalityKey} has ${k.noofstudies} studies / ${k.noofretraction} retracted and original ${k.all_es.toFixed(2)} (${k.all_lci.toFixed(2)}-${k.all_uci.toFixed(2)}), which does not match this analysis`, key: ref.vitalityKey, agrees: null };
  if (!recalculated) return { vitality: "no studies remain to compare", key: ref.vitalityKey, agrees: null };
  const agrees = [["exclude_es", "es"], ["exclude_lci", "lci"], ["exclude_uci", "uci"]].every(([a, b]) => Math.abs((k as any)[a] - (recalculated as any)[b]) <= TOL);
  return { vitality: `${k.effectsize} ${k.exclude_es.toFixed(2)} (${k.exclude_lci.toFixed(2)}-${k.exclude_uci.toFixed(2)})`, key: ref.vitalityKey, agrees };
}
