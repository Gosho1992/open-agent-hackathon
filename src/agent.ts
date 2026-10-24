// Aftershock agent loop.
//
//   Scout       -> which included trials have an editorial notice (Zetaris: Retraction Watch)
//   Policy      -> which notices exclude a trial (H-MEM policy memory)
//   Extractor   -> study-level counts and the published pooled result (Nemotron vision via Nightshift,
//                  or the curated table when EXTRACTION=curated)
//   Verifier    -> GATE: sums must match the printed totals AND the published pooled result must be
//                  reproduced with the review's own method. Fail -> re-extract with feedback (max 3),
//                  then NEEDS_HUMAN_REVIEW. Nothing downstream runs on an unverified table.
//   Re-analyst  -> deterministic recalculation without the excluded trials + two-part verdict
//   Cross-check -> compare with the independent VITALITY recalculation when the review is in it
//   Reporter    -> plain-language summary; every number it writes must be one we computed

import fs from "node:fs";
import path from "node:path";
import { chat, parseJson } from "./llm.ts";
import { trace } from "./trace.ts";
import * as data from "./data.ts";
import { poolBinary, type BinaryStudy, type Method, type Measure, type Pooled } from "./stats/meta.ts";
import { compare, type Verdict } from "./stats/verdict.ts";
import { noticeOf, type ExclusionPolicy, type Notice } from "./policy.ts";

export interface ExtractedStudy { study: string; doi?: string; treat_events: number; treat_n: number; ctrl_events: number; ctrl_n: number }
export interface Extraction {
  outcome: string;
  studies: ExtractedStudy[];
  totals?: { treat_events: number; treat_n: number; ctrl_events: number; ctrl_n: number };
  published: { es: number; lci: number; uci: number };
  method: Method;
  measure: Measure;
}
export interface CaseInput { reviewDoi: string; outcome: string; figure?: string; corrupt?: boolean }
export interface CaseResult {
  status: "VERIFIED" | "NEEDS_HUMAN_REVIEW";
  outcome: string;
  attempts: number;
  original?: Pooled;
  recalculated?: Pooled | null;
  excluded: { study: string; notice: Notice; rule: string }[];
  kept: { study: string; notice: Notice }[];
  verdict?: Verdict;
  crossCheck?: { vitality: string; agrees: boolean | null };
  report?: string;
  models: string[];
  reason?: string;
}

const EXTRACT_MODEL = process.env.EXTRACT_MODEL ?? "openrouter/inclusionai/ling-3.0-flash-vl:free";
const REPORT_MODEL = process.env.REPORT_MODEL ?? "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free";
const MODE = process.env.EXTRACTION ?? "vision";   // "vision" | "curated"
const TOL = 0.011;                                  // published numbers are printed to 2 decimals

// ---------------- Extractor ----------------
async function extract(input: CaseInput, feedback: string | null, models: string[]): Promise<Extraction> {
  const pub = (await data.publishedPooled(input.reviewDoi, input.outcome)).find(p => p.scenario === "all");
  if (MODE === "curated") {
    // Human-curated table (data/studies). Used for development and as the extraction ground truth.
    const file = path.resolve("data/studies/liyanage2016_med_diet.csv");
    const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1).map(l => l.split(","))
      .filter(c => c[0].toLowerCase() === input.reviewDoi.toLowerCase() && c[1] === input.outcome);
    trace("extractor", { mode: "curated", rows: rows.length });
    if (!pub) throw new Error("no published pooled estimate on file");
    return {
      outcome: input.outcome, method: pub.method as Method, measure: pub.measure as Measure,
      studies: rows.map(c => ({ study: c[2], doi: c[3], treat_events: +c[4], treat_n: +c[5], ctrl_events: +c[6], ctrl_n: +c[7] })),
      published: { es: pub.es, lci: pub.lci, uci: pub.uci },
    };
  }
  if (!input.figure) throw new Error("vision extraction needs a forest plot image");
  const img = fs.readFileSync(input.figure).toString("base64");
  const prompt = [
    `This is a forest plot from a published meta-analysis. Read ONLY the block for the outcome "${input.outcome}".`,
    `Return JSON: {"studies":[{"study":"<first author year>","treat_events":n,"treat_n":n,"ctrl_events":n,"ctrl_n":n}],`,
    `"totals":{"treat_events":n,"treat_n":n,"ctrl_events":n,"ctrl_n":n} (the "All trials" row),`,
    `"published":{"es":x,"lci":x,"uci":x} (the pooled estimate of the "All trials" row),`,
    `"method":"Fixed MH"|"Random MH"|"Fixed IV"|"Random IV"|"Peto","measure":"RR"|"OR"|"RD"}.`,
    `Copy numbers exactly as printed. Do not compute anything. Do not include summary rows in "studies".`,
    feedback ? `\nYour previous reading failed verification: ${feedback}\nRe-read the figure carefully and correct it.` : "",
  ].join("\n");
  const r = await chat("extractor", EXTRACT_MODEL, [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${img}` } }] }], { json: true });
  models.push(r.model);
  const x = parseJson<Omit<Extraction, "outcome">>(r.text);
  trace("extractor", { mode: "vision", model: r.model, studies: x.studies?.length ?? 0, published: x.published });
  return { ...x, outcome: input.outcome };
}

// ---------------- Verifier (the gate) ----------------
function verify(x: Extraction): { ok: boolean; problems: string[]; pooled?: Pooled } {
  const problems: string[] = [];
  if (!x.studies?.length) return { ok: false, problems: ["no studies extracted"] };
  for (const s of x.studies) {
    if ([s.treat_events, s.treat_n, s.ctrl_events, s.ctrl_n].some(v => !Number.isInteger(v) || v < 0)) problems.push(`${s.study}: counts must be non-negative integers`);
    if (s.treat_events > s.treat_n || s.ctrl_events > s.ctrl_n) problems.push(`${s.study}: more events than participants`);
  }
  if (x.totals) {
    const sum = (k: keyof ExtractedStudy) => x.studies.reduce((a, s) => a + (s[k] as number), 0);
    for (const k of ["treat_events", "treat_n", "ctrl_events", "ctrl_n"] as const)
      if (sum(k) !== x.totals[k]) problems.push(`column ${k} sums to ${sum(k)} but the printed total is ${x.totals[k]}`);
  }
  if (problems.length) return { ok: false, problems };
  const pooled = poolBinary(x.studies.map(toBinary), x.method, x.measure);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const diffs = (["es", "lci", "uci"] as const).filter(k => Math.abs(r2(pooled[k]) - x.published[k]) > TOL);
  if (diffs.length) problems.push(`recomputed ${x.method} ${x.measure} = ${r2(pooled.es)} (${r2(pooled.lci)}-${r2(pooled.uci)}) but the published result is ${x.published.es} (${x.published.lci}-${x.published.uci})`);
  return { ok: problems.length === 0, problems, pooled };
}
const toBinary = (s: ExtractedStudy): BinaryStudy => ({ id: s.study, treatEvents: s.treat_events, treatN: s.treat_n, ctrlEvents: s.ctrl_events, ctrlN: s.ctrl_n });

/** Deliberate fault injection for the recovery demo: change one digit of one count. */
function corrupt(x: Extraction): Extraction {
  const y = structuredClone(x);
  const s = y.studies[0];
  s.treat_events = s.treat_events + 10;
  trace("fault.injected", { study: s.study, field: "treat_events", note: "demo: simulates a misread digit" });
  return y;
}

// ---------------- Reporter ----------------
async function report(rev: data.Review, res: CaseResult, models: string[]): Promise<string> {
  const facts = {
    review: `${rev.short_name}, ${rev.journal} ${rev.year}`, outcome: res.outcome,
    original: res.original && fmtP(res.original), recalculated: res.recalculated ? fmtP(res.recalculated) : "no studies left",
    excluded: res.excluded, kept: res.kept, verdict: res.verdict?.headline, interpretation: res.verdict?.interpretation, cross_check: res.crossCheck,
  };
  const r = await chat("reporter", REPORT_MODEL, [
    { role: "system", content: "You write evidence-integrity notes for systematic reviewers. Use ONLY the numbers in the facts. Never give clinical advice. Never call a review or guideline invalid. 4-6 sentences." },
    { role: "user", content: JSON.stringify(facts) },
  ]);
  models.push(r.model);
  // Grounding gate: every number in the report must appear in the facts.
  const allowed = new Set((JSON.stringify(facts).match(/\d+(\.\d+)?/g) ?? []).map(Number));
  const stray = (r.text.match(/\d+(\.\d+)?/g) ?? []).map(Number).filter(n => !allowed.has(n) && n > 31);
  trace("reporter.grounding", { model: r.model, stray_numbers: stray });
  if (stray.length) return `${r.text}\n\n[grounding check: ${stray.join(", ")} not found in computed results - treat with care]`;
  return r.text;
}
const fmtP = (p: Pooled) => `${p.measure} ${p.es.toFixed(2)} (95% CI ${p.lci.toFixed(2)} to ${p.uci.toFixed(2)})`;

// ---------------- Orchestrator ----------------
export async function auditCase(input: CaseInput, policy: ExclusionPolicy, opts: { withReport?: boolean } = {}): Promise<CaseResult> {
  const models: string[] = [];
  const rev = await data.review(input.reviewDoi);
  trace("case", { review: rev.short_name, outcome: input.outcome });

  // Extract -> verify, with bounded retries.
  let x: Extraction | null = null, v: ReturnType<typeof verify> | null = null, feedback: string | null = null, attempt = 0;
  for (attempt = 1; attempt <= 3; attempt++) {
    x = await extract(input, feedback, models);
    if (input.corrupt && attempt === 1) x = corrupt(x);
    v = verify(x);
    trace("verifier", { attempt, ok: v.ok, problems: v.problems });
    if (v.ok) break;
    feedback = v.problems.join("; ");
  }
  if (!v?.ok || !x || !v.pooled) {
    trace("escalate", { reason: "could not reproduce the published result" });
    return { status: "NEEDS_HUMAN_REVIEW", outcome: input.outcome, attempts: attempt - 1, excluded: [], kept: [], models, reason: v?.problems.join("; ") };
  }

  // Scout: notices on the included trials.
  const notices = await data.retractionStatus(x.studies.map(s => s.doi ?? ""));
  const noticeFor = (s: ExtractedStudy): Notice => {
    const r = notices.find(n => n.doi.toLowerCase() === (s.doi ?? "").toLowerCase());
    return r ? noticeOf(r.nature, r.reason) : "None";
  };
  const excluded: CaseResult["excluded"] = [], kept: CaseResult["kept"] = [];
  for (const s of x.studies) {
    const n = noticeFor(s);
    if (policy.exclude[n]) excluded.push({ study: s.study, notice: n, rule: policy.provenance[n] ?? "default policy" });
    else kept.push({ study: s.study, notice: n });
  }
  trace("scout+policy", { excluded, flagged_but_kept: kept.filter(k => k.notice !== "None") });

  // Re-analyst.
  const remaining = x.studies.filter(s => !excluded.some(e => e.study === s.study));
  const recalculated = remaining.length ? poolBinary(remaining.map(toBinary), x.method, x.measure) : null;
  const verdict = compare(v.pooled, recalculated);
  trace("reanalyst", { original: fmtP(v.pooled), recalculated: recalculated ? fmtP(recalculated) : null, headline: verdict.headline, change: verdict.change });

  // Independent cross-check against VITALITY when the review is in it.
  let crossCheck: CaseResult["crossCheck"];
  const key = await data.answerKey(input.reviewDoi);
  // Identify the same analysis in VITALITY by the closest original estimate AND CI (several outcomes can share a point estimate).
  const dist = (k: data.AnswerKeyRow) => Math.abs(k.all_es - v!.pooled!.es) + Math.abs(k.all_lci - v!.pooled!.lci) + Math.abs(k.all_uci - v!.pooled!.uci);
  const match = key.filter(k => k.noofstudies === x!.studies.length && dist(k) < 0.03).sort((a, b) => dist(a) - dist(b))[0];
  const vitalityPolicy = !policy.exclude["Expression of concern"] && !policy.exclude["Correction"];
  if (!vitalityPolicy) crossCheck = { vitality: "not comparable: VITALITY excludes formal retractions only, this run uses a stricter reviewer policy", agrees: null };
  else if (match && recalculated) {
    const agrees = Math.abs(match.exclude_es - recalculated.es) < 0.011 && Math.abs(match.exclude_lci - recalculated.lci) < 0.011 && Math.abs(match.exclude_uci - recalculated.uci) < 0.011;
    crossCheck = { vitality: `${match.effectsize} ${match.exclude_es} (${match.exclude_lci}-${match.exclude_uci})`, agrees };
  } else if (!crossCheck) crossCheck = { vitality: "no matching analysis in VITALITY (different exclusion set or outcome)", agrees: null };
  trace("crosscheck", crossCheck);

  const res: CaseResult = { status: "VERIFIED", outcome: input.outcome, attempts: attempt, original: v.pooled, recalculated, excluded, kept, verdict, crossCheck, models };
  if (opts.withReport) res.report = await report(rev, res, models);
  return res;
}
