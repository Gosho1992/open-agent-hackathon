// Data layer. In live mode every lookup is a SQL query against Zetaris (the hackathon's
// required data layer), over its REST API. In SAMPLE_MODE the same queries are answered
// from the CSV files in data/, so the pipeline runs with no Zetaris instance.
//
// Zetaris tables (registered by scripts/zetaris_setup.sql):
//   AFTERSHOCK.retractions      Retraction Watch, health-science subset
//   AFTERSHOCK.reviews          the meta-analyses Aftershock audits
//   AFTERSHOCK.answer_key       VITALITY Study I recalculations (ground truth for evaluation)
//   AFTERSHOCK.published_pooled pooled estimates as printed in each review

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { trace } from "./trace.ts";

export interface RetractionRecord { doi: string; title: string; journal: string; nature: string; date: string; reason: string; recordId: string }
export interface Review { review_doi: string; short_name: string; title: string; journal: string; year: string; role: string; questioned_trials: string; notes: string }
export interface PublishedPooled { review_doi: string; outcome: string; scenario: string; method: string; measure: string; es: number; lci: number; uci: number; source: string }
export interface AnswerKeyRow { doi: string; methods: string; effectsize: string; noofstudies: number; noofretraction: number; all_es: number; all_lci: number; all_uci: number; exclude_es: number; exclude_lci: number; exclude_uci: number; status: string }

const SAMPLE = process.env.SAMPLE_MODE === "true";
const DATA = path.resolve("data");
const REST = (process.env.ZETARIS_REST_URL ?? "http://localhost:8888/api/v1.0").replace(/\/+$/, "");
const ORG = process.env.ZETARIS_ORG_ID ?? "1";
const KEY = process.env.ZETARIS_API_KEY ?? "";
const DB = process.env.ZETARIS_DB ?? "AFTERSHOCK";

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
  const res = await fetch(`${REST}/sql-editor/sqls/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "x-org-id": ORG, "x-request-id": crypto.randomUUID(), "content-type": "application/json" },
    body: JSON.stringify({ queryId: crypto.randomUUID(), sql, source: "SqlEditor", limit: 5000 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Zetaris HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out: any = await res.json();
  // The REST API returns { columns: [...], data: [[...]] } or { data: [{...}] } depending on build; accept both.
  const data = out?.data ?? [];
  const cols: string[] = (out?.columns ?? out?.schema ?? []).map((c: any) => (typeof c === "string" ? c : c.name ?? c.columnName));
  const rows = Array.isArray(data[0]) ? data.map((r: any[]) => Object.fromEntries(cols.map((c, i) => [c.toLowerCase(), String(r[i] ?? "")]))) : data.map((r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), String(v ?? "")])));
  trace("zetaris.query", { purpose, rows: rows.length, ms: Date.now() - t0, sql: sql.replace(/\s+/g, " ").slice(0, 160) });
  return rows;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

// ---------- Queries ----------
export async function retractionStatus(dois: string[]): Promise<RetractionRecord[]> {
  const wanted = dois.filter(Boolean).map(d => d.toLowerCase());
  if (!wanted.length) return [];
  if (SAMPLE) {
    const rows = csv("retraction_watch_health.csv").filter(r => wanted.includes(r.OriginalPaperDOI.toLowerCase()));
    trace("data.query", { source: "csv:retraction_watch_health", purpose: "retraction status", rows: rows.length });
    return rows.map(r => ({ doi: r.OriginalPaperDOI, title: r.Title, journal: r.Journal, nature: r.RetractionNature, date: r.RetractionDate, reason: r.Reason, recordId: r.Record_ID }));
  }
  const rows = await zsql(`SELECT originalpaperdoi, title, journal, retractionnature, retractiondate, reason, record_id FROM ${DB}.retractions WHERE lower(originalpaperdoi) IN (${wanted.map(lit).join(",")})`, "retraction status");
  return rows.map(r => ({ doi: r.originalpaperdoi, title: r.title, journal: r.journal, nature: r.retractionnature, date: r.retractiondate, reason: r.reason, recordId: r.record_id }));
}

export async function review(doi: string): Promise<Review> {
  if (SAMPLE) {
    const r = csv("reviews.csv").find(x => x.review_doi.toLowerCase() === doi.toLowerCase());
    if (!r) throw new Error(`unknown review ${doi}`);
    trace("data.query", { source: "csv:reviews", purpose: "review metadata", rows: 1 });
    return r as unknown as Review;
  }
  const [r] = await zsql(`SELECT * FROM ${DB}.reviews WHERE lower(review_doi) = ${lit(doi.toLowerCase())}`, "review metadata");
  if (!r) throw new Error(`unknown review ${doi}`);
  return r as unknown as Review;
}

export async function publishedPooled(doi: string, outcome: string): Promise<PublishedPooled[]> {
  const map = (r: Record<string, string>): PublishedPooled => ({ review_doi: r.review_doi, outcome: r.outcome, scenario: r.scenario, method: r.method, measure: r.measure, es: +r.es, lci: +r.lci, uci: +r.uci, source: r.source });
  if (SAMPLE) {
    const rows = csv("studies/published_pooled.csv").filter(r => r.review_doi.toLowerCase() === doi.toLowerCase() && r.outcome === outcome);
    trace("data.query", { source: "csv:published_pooled", purpose: "published pooled estimate", rows: rows.length });
    return rows.map(map);
  }
  return (await zsql(`SELECT * FROM ${DB}.published_pooled WHERE lower(review_doi) = ${lit(doi.toLowerCase())} AND outcome = ${lit(outcome)}`, "published pooled estimate")).map(map);
}

export async function answerKey(doi: string): Promise<AnswerKeyRow[]> {
  const map = (r: Record<string, string>): AnswerKeyRow => ({ doi: r.doi, methods: r.methods, effectsize: r.effectsize, noofstudies: +r.noofstudies, noofretraction: +r.noofretraction, all_es: +r.all_es, all_lci: +r.all_lci, all_uci: +r.all_uci, exclude_es: +r.exclude_es, exclude_lci: +r.exclude_lci, exclude_uci: +r.exclude_uci, status: r.status });
  if (SAMPLE) {
    const rows = csv("vitality_answer_key.csv").filter(r => r.doi.toLowerCase() === doi.toLowerCase() && r.type === "Total");
    trace("data.query", { source: "csv:vitality_answer_key", purpose: "independent ground truth", rows: rows.length });
    return rows.map(map);
  }
  return (await zsql(`SELECT * FROM ${DB}.answer_key WHERE lower(doi) = ${lit(doi.toLowerCase())} AND type = 'Total'`, "independent ground truth")).map(map);
}
