// Data layer. In live mode every lookup is a SQL query against Zetaris (the hackathon's
// required data layer), over its REST API. In SAMPLE_MODE the same queries are answered
// from the CSV files in data/, so the pipeline runs with no Zetaris instance.
//
// Zetaris "evidence" USL tables (built by scripts/zetaris_setup.ts):
//   review, retraction, study_outcome, published_estimate, vitality_reanalysis

import fs from "node:fs";
import path from "node:path";
import { trace } from "./trace.ts";
import { zquery } from "./zetaris.ts";

export interface RetractionRecord { doi: string; title: string; journal: string; nature: string; date: string; reason: string; recordId: string }
export interface Review { review_doi: string; short_name: string; title: string; journal: string; year: string; role: string; questioned_trials: string; notes: string }
export interface Counts { treat_events: number; treat_n: number; ctrl_events: number; ctrl_n: number }
export interface PublishedPooled { review_doi: string; outcome: string; scenario: string; method: string; measure: string; es: number; lci: number; uci: number; source: string; printed: Counts; vitality_key: string }
export interface AnswerKeyRow { doi: string; key: string; methods: string; effectsize: string; noofstudies: number; noofretraction: number; all_es: number; all_lci: number; all_uci: number; exclude_es: number; exclude_lci: number; exclude_uci: number; status: string }

const SAMPLE = process.env.SAMPLE_MODE === "true" || process.env.DATA_SOURCE === "csv";
const DATA = path.resolve("data");
const DB = process.env.ZETARIS_DB ?? "lightning.metastore.aftershock.evidence";   // the Unified Semantic Layer

// ---------- CSV (sample mode) ----------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...body] = rows;
  const head = h.map(x => x.replace(/^﻿/, ""));
  return body.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ""])));
}
const cache = new Map<string, Record<string, string>[]>();
const csv = (f: string) => { if (!cache.has(f)) cache.set(f, parseCsv(fs.readFileSync(path.join(DATA, f), "utf8"))); return cache.get(f)!; };

// ---------- Zetaris (live mode) ----------
async function zsql(sql: string, purpose: string): Promise<Record<string, string>[]> {
  const t0 = Date.now();
  const r = await zquery(sql);
  if (!r.ok) throw new Error(`Zetaris HTTP ${r.status}: ${r.raw.slice(0, 300)}`);
  trace("zetaris.query", { purpose, rows: r.rows.length, ms: Date.now() - t0, sql: sql.replace(/\s+/g, " ").slice(0, 160) });
  return r.rows;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

// ---------- Queries ----------
const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
export interface StudyId { doi?: string; pmid?: string }

/** Retraction Watch records for the given studies, matched on DOI OR PubMed ID. */
export async function retractionStatus(ids: StudyId[]): Promise<(RetractionRecord & { pmid: string; noticeDoi: string })[]> {
  const dois = [...new Set(ids.map(i => norm(i.doi)).filter(Boolean))];
  const pmids = [...new Set(ids.map(i => norm(i.pmid)).filter(Boolean))];
  if (!dois.length && !pmids.length) return [];
  if (SAMPLE) {
    const rows = csv("retraction_watch_health.csv").filter(r => dois.includes(norm(r.OriginalPaperDOI)) || pmids.includes(norm(r.OriginalPaperPubMedID)));
    trace("data.query", { source: "csv:retraction_watch_health", purpose: "retraction status (DOI or PMID)", rows: rows.length });
    return rows.map(r => ({ doi: r.OriginalPaperDOI, pmid: r.OriginalPaperPubMedID, title: r.Title, journal: r.Journal, nature: r.RetractionNature, date: r.RetractionDate, reason: r.Reason, recordId: r.Record_ID, noticeDoi: r.RetractionDOI }));
  }
  const conds = [dois.length ? `original_doi IN (${dois.map(lit).join(",")})` : "", pmids.length ? `original_pmid IN (${pmids.map(lit).join(",")})` : ""].filter(Boolean).join(" OR ");
  const rows = await zsql(`SELECT record_id, original_doi, original_pmid, title, journal, notice, notice_date, notice_doi, reason FROM ${DB}.retraction WHERE ${conds}`, "retraction status (DOI or PMID)");
  // The USL normalises 'Retract and replace' into the notice column; keep nature/reason for noticeOf().
  return rows.map(r => ({ doi: r.original_doi, pmid: r.original_pmid, title: r.title, journal: r.journal, nature: r.notice === "Retract and replace" ? "Retraction" : r.notice, date: r.notice_date, reason: r.notice === "Retract and replace" ? `Retract and Replace;${r.reason}` : r.reason, recordId: r.record_id, noticeDoi: r.notice_doi }));
}

export async function review(doi: string): Promise<Review> {
  if (SAMPLE) {
    const r = csv("reviews.csv").find(x => norm(x.review_doi) === norm(doi));
    if (!r) throw new Error(`unknown review ${doi}`);
    trace("data.query", { source: "csv:reviews", purpose: "review metadata", rows: 1 });
    return r as unknown as Review;
  }
  const [r] = await zsql(`SELECT * FROM ${DB}.review WHERE lower(review_doi) = ${lit(norm(doi))}`, "review metadata");
  if (!r) throw new Error(`unknown review ${doi}`);
  return r as unknown as Review;
}

export async function publishedPooled(doi: string, outcome: string): Promise<PublishedPooled[]> {
  const map = (r: Record<string, string>): PublishedPooled => ({
    review_doi: r.review_doi, outcome: r.outcome, scenario: r.scenario, method: r.method, measure: r.measure, es: num(r.es), lci: num(r.lci), uci: num(r.uci), source: r.source,
    printed: { treat_events: num(r.printed_treat_events), treat_n: num(r.printed_treat_n), ctrl_events: num(r.printed_ctrl_events), ctrl_n: num(r.printed_ctrl_n) },
    vitality_key: r.vitality_key ?? "",
  });
  if (SAMPLE) {
    const rows = csv("studies/published_pooled.csv").filter(r => norm(r.review_doi) === norm(doi) && r.outcome === outcome);
    trace("data.query", { source: "csv:published_pooled", purpose: "authoritative published estimate", rows: rows.length });
    return rows.map(map);
  }
  return (await zsql(`SELECT review_doi, outcome, scenario, method, measure, es, lci, uci, printed_treat_events, printed_treat_n, printed_ctrl_events, printed_ctrl_n, vitality_key, 'Zetaris USL' AS source FROM ${DB}.published_estimate WHERE lower(review_doi) = ${lit(norm(doi))} AND outcome = ${lit(outcome)}`, "authoritative published estimate")).map(map);
}

export async function answerKey(doi: string): Promise<AnswerKeyRow[]> {
  const map = (r: Record<string, string>): AnswerKeyRow => ({ doi: r.doi, key: `${r.srfile}:${r.meta_id}`, methods: r.methods, effectsize: r.effectsize, noofstudies: num(r.noofstudies), noofretraction: num(r.noofretraction), all_es: num(r.all_es), all_lci: num(r.all_lci), all_uci: num(r.all_uci), exclude_es: num(r.exclude_es), exclude_lci: num(r.exclude_lci), exclude_uci: num(r.exclude_uci), status: r.status });
  if (SAMPLE) {
    const rows = csv("vitality_answer_key.csv").filter(r => norm(r.doi) === norm(doi) && r.type === "Total");
    trace("data.query", { source: "csv:vitality_answer_key", purpose: "independent ground truth", rows: rows.length });
    return rows.map(map);
  }
  return (await zsql(`SELECT doi, srfile, meta_id, method AS methods, measure AS effectsize, n_studies AS noofstudies, n_retracted AS noofretraction, all_es, all_lci, all_uci, exclude_es, exclude_lci, exclude_uci, replication AS status FROM ${DB}.vitality_reanalysis WHERE doi = ${lit(norm(doi))} AND analysis_type = 'Total'`, "independent ground truth")).map(map);
}

export interface StudyRow { study: string; doi: string; pmid: string; treat_events: number; treat_n: number; ctrl_events: number; ctrl_n: number }
/** Human-curated study registry for a review outcome: identities (DOI/PMID) and counts. */
export async function studies(doi: string, outcome: string): Promise<StudyRow[]> {
  const map = (r: Record<string, string>): StudyRow => ({ study: r.study, doi: r.study_doi ?? "", pmid: r.study_pmid ?? "", treat_events: num(r.treat_events), treat_n: num(r.treat_n), ctrl_events: num(r.ctrl_events), ctrl_n: num(r.ctrl_n) });
  if (SAMPLE) {
    const rows = csv("studies/liyanage2016_med_diet.csv").filter(r => norm(r.review_doi) === norm(doi) && r.outcome === outcome);
    trace("data.query", { source: "csv:studies", purpose: "study registry (identity + counts)", rows: rows.length });
    return rows.map(map);
  }
  return (await zsql(`SELECT study, study_doi, study_pmid, treat_events, treat_n, ctrl_events, ctrl_n FROM ${DB}.study_outcome WHERE lower(review_doi) = ${lit(norm(doi))} AND outcome = ${lit(outcome)}`, "study registry (identity + counts)")).map(map);
}

/** Known replacement publications for retract-and-replace notices. */
export function replacementFor(doi: string): { replacement_doi: string; note: string } | null {
  const r = csv("replacements.csv").find(x => norm(x.original_doi) === norm(doi));
  return r ? { replacement_doi: r.replacement_doi, note: r.note } : null;
}

/** Parse a number; empty or malformed values become NaN (never 0), so validation can reject them. */
function num(v: string | undefined): number { return v == null || String(v).trim() === "" ? NaN : Number(v); }
