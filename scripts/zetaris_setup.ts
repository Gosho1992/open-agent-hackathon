// One-shot Zetaris setup for Aftershock. Run inside the Codespace that hosts Zetaris:
//
//   npx tsx --env-file-if-exists=.env scripts/zetaris_setup.ts
//
// 1. copies data/*.csv into the Zetaris file store (inside the driver container)
// 2. registers them as Lightning FILESTORE tables (raw sources)
// 3. compiles and deploys the "evidence" Unified Semantic Layer with keys
// 4. activates every USL table from its raw source (typed, cleaned)
// 5. registers data-quality rules and runs them
// Every statement and its result is written to evidence/zetaris_setup_log.md.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { zquery } from "../src/zetaris.ts";

const REST = process.env.ZETARIS_URL ?? "http://localhost:3000";

const CONTAINER = process.env.ZETARIS_DRIVER ?? "zetaris-driver-1";
const STORE = "/home/zetaris/customer-data/shared/aftershock";
const RAW = "AFTERSHOCK_RAW";
const NS = "lightning.metastore.aftershock";
const USL = `${NS}.evidence`;
const log: string[] = ["# Zetaris setup log", "", `Run ${new Date().toISOString()} against ${REST}`, ""];

async function sql(stmt: string, { allowFail = false, strict = false } = {}): Promise<any> {
  const r = await zquery(stmt, 20);
  const text = r.raw;
  const ok = r.ok || (!strict && /already exist/i.test(text));   // re-runs are idempotent
  log.push("```sql", stmt.trim(), "```", `→ ${ok ? "OK" : "FAILED (HTTP " + r.status + ")"} ${text.slice(0, 400).replace(/\n/g, " ")}`, "");
  console.log(`${ok ? "OK  " : "FAIL"} ${stmt.trim().split("\n")[0].slice(0, 90)}${ok ? "" : "\n     " + text.slice(0, 1500)}`);
  if (!ok && !allowFail) { flush(); throw new Error(`Zetaris: HTTP ${r.status} ${text.slice(0, 300)}`); }
  return r.rows;
}
const flush = () => { fs.mkdirSync("evidence", { recursive: true }); fs.writeFileSync("evidence/zetaris_setup_log.md", log.join("\n")); };

// ---- 1. copy files into the Zetaris file store ----
const files: Record<string, string> = {
  rw_raw: "data/retraction_watch_health.csv",
  reviews_raw: "data/reviews.csv",
  studies_raw: "data/studies/liyanage2016_med_diet.csv",
  pooled_raw: "data/studies/published_pooled.csv",
  vitality_raw: "data/vitality_answer_key.csv",
};
execFileSync("docker", ["exec", CONTAINER, "mkdir", "-p", STORE]);
for (const [, f] of Object.entries(files)) {
  execFileSync("docker", ["exec", "-i", CONTAINER, "sh", "-c", `cat > ${STORE}/${path.basename(f)}`], { input: fs.readFileSync(f) });
}
log.push(`Copied ${Object.keys(files).length} CSV files into ${CONTAINER}:${STORE}`, "");
console.log("copied CSVs into the Zetaris file store");

// ---- 2. raw sources ----
await sql(`CREATE LIGHTNING DATABASE ${RAW} DESCRIBE BY "Aftershock raw evidence sources"`, { allowFail: true });
for (const [t, f] of Object.entries(files)) {
  await sql(`DROP VIEW IF EXISTS ${RAW}.${t}`, { allowFail: true });
  await sql(`CREATE LIGHTNING FILESTORE TABLE ${t} FROM ${RAW} FORMAT CSV OPTIONS (PATH "${STORE}/${path.basename(f)}", header "true", inferSchema "false", multiLine "true", escape '"')`);
}
const [cnt] = await sql(`SELECT count(*) AS n FROM ${RAW}.rw_raw`);
console.log(`     Retraction Watch rows in Zetaris: ${cnt?.n ?? JSON.stringify(cnt)}`);

// ---- 3. Unified Semantic Layer ----
await sql(`CREATE NAMESPACE lightning.metastore`, { allowFail: true });
await sql(`CREATE NAMESPACE ${NS}`, { allowFail: true });
for (const d of [`DROP USL ${USL}`, `DROP USL evidence FROM NAMESPACE ${NS}`, `DROP USL evidence IN NAMESPACE ${NS}`]) await sql(d, { allowFail: true });
await sql(`COMPILE USL evidence DEPLOY NAMESPACE ${NS} DDL
CREATE TABLE review (
  review_doi varchar(100) NOT NULL PRIMARY KEY,
  short_name varchar(100),
  title varchar(500),
  journal varchar(200),
  year int,
  role varchar(100)
);
CREATE TABLE retraction (
  record_id int NOT NULL PRIMARY KEY,
  original_doi varchar(200),
  original_pmid varchar(20),
  notice_doi varchar(200),
  title varchar(1000),
  journal varchar(300),
  notice varchar(60),
  notice_date varchar(30),
  reason varchar(2000)
);
CREATE TABLE study_outcome (
  row_id varchar(400) NOT NULL PRIMARY KEY,
  review_doi varchar(100) FOREIGN KEY REFERENCES review(review_doi),
  outcome varchar(100),
  study varchar(200),
  study_doi varchar(200),
  study_pmid varchar(20),
  treat_events int,
  treat_n int,
  ctrl_events int,
  ctrl_n int
);
CREATE TABLE published_estimate (
  row_id varchar(400) NOT NULL PRIMARY KEY,
  review_doi varchar(100) FOREIGN KEY REFERENCES review(review_doi),
  outcome varchar(100),
  scenario varchar(100),
  method varchar(30),
  measure varchar(10),
  es double,
  lci double,
  uci double,
  printed_treat_events int,
  printed_treat_n int,
  printed_ctrl_events int,
  printed_ctrl_n int,
  vitality_key varchar(40)
);
CREATE TABLE vitality_reanalysis (
  row_id varchar(400) NOT NULL PRIMARY KEY,
  doi varchar(200),
  srfile varchar(20),
  meta_id varchar(10),
  replication varchar(30),
  method varchar(30),
  measure varchar(10),
  analysis_type varchar(20),
  n_studies int,
  n_retracted int,
  all_es double,
  all_lci double,
  all_uci double,
  exclude_es double,
  exclude_lci double,
  exclude_uci double
)`, { strict: true });

const T = (t: string) => `${USL}.${t}`;
await sql(`ACTIVATE USL TABLE ${T("review")} AS
SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM ${RAW}.reviews_raw`);
await sql(`ACTIVATE USL TABLE ${T("retraction")} AS
SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, trim(OriginalPaperPubMedID) AS original_pmid, lower(RetractionDOI) AS notice_doi, Title AS title, Journal AS journal,
  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace' ELSE RetractionNature END AS notice,
  RetractionDate AS notice_date, Reason AS reason
FROM ${RAW}.rw_raw`);
await sql(`ACTIVATE USL TABLE ${T("study_outcome")} AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi, trim(study_pmid) AS study_pmid,
  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n
FROM ${RAW}.studies_raw`);
await sql(`ACTIVATE USL TABLE ${T("published_estimate")} AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', scenario), '') AS row_id, review_doi, outcome, scenario, method, measure,
  CAST(es AS DOUBLE) AS es, CAST(lci AS DOUBLE) AS lci, CAST(uci AS DOUBLE) AS uci,
  CAST(printed_treat_events AS INT) AS printed_treat_events, CAST(printed_treat_n AS INT) AS printed_treat_n,
  CAST(printed_ctrl_events AS INT) AS printed_ctrl_events, CAST(printed_ctrl_n AS INT) AS printed_ctrl_n, vitality_key
FROM ${RAW}.pooled_raw`);
await sql(`ACTIVATE USL TABLE ${T("vitality_reanalysis")} AS
SELECT COALESCE(concat_ws('|', status, srfile, meta_id, subid, rank), '') AS row_id, lower(doi) AS doi, srfile, meta_id, status AS replication, methods AS method,
  effectsize AS measure, type AS analysis_type, CAST(noofstudies AS INT) AS n_studies, CAST(noofretraction AS INT) AS n_retracted,
  CAST(all_es AS DOUBLE) AS all_es, CAST(all_lci AS DOUBLE) AS all_lci, CAST(all_uci AS DOUBLE) AS all_uci,
  CAST(exclude_es AS DOUBLE) AS exclude_es, CAST(exclude_lci AS DOUBLE) AS exclude_lci, CAST(exclude_uci AS DOUBLE) AS exclude_uci
FROM ${RAW}.vitality_raw`);

// ---- 4. data-quality rules ----
const rules: [string, string, string][] = [
  ["valid_counts", "study_outcome", "treat_events >= 0 AND ctrl_events >= 0 AND treat_events <= treat_n AND ctrl_events <= ctrl_n"],
  ["ci_contains_estimate", "published_estimate", "lci <= es AND es <= uci"],
  ["has_doi", "retraction", "original_doi IS NOT NULL AND original_doi <> ''"],
  ["study_identified", "study_outcome", "(study_doi IS NOT NULL AND study_doi <> '') OR (study_pmid IS NOT NULL AND study_pmid <> '')"],
  ["printed_totals_present", "published_estimate", "printed_treat_n > 0 AND printed_ctrl_n > 0"],
];
for (const [name, table, expr] of rules) {
  await sql(`REMOVE DQ ${name} TABLE ${T(table)}`, { allowFail: true });
  await sql(`REGISTER DQ ${name} TABLE ${T(table)} AS ${expr}`);
  await sql(`RUN DQ ${name} TABLE ${T(table)}`);
}
await sql(`LIST DQ USL ${USL}`);

// ---- 5. the exact query the agent's Scout runs ----
await sql(`SELECT s.study, s.outcome, r.notice, r.notice_date, r.notice_doi FROM ${T("study_outcome")} s JOIN ${T("retraction")} r ON s.study_doi = r.original_doi OR s.study_pmid = r.original_pmid WHERE s.outcome = 'MACE'`);

flush();
console.log("\nDone. Log: evidence/zetaris_setup_log.md");
