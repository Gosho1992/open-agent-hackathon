// Zetaris Demo Challenge: "the day the retraction landed" (13 June 2018, PREDIMED).
// Run inside the Codespace that hosts Zetaris, after scripts/zetaris_setup.ts has run once.
//
//   npx tsx --env-file-if-exists=.env scripts/zetaris_replay.ts setup    # Retraction Watch feed as of 12 June 2018
//   npx tsx --env-file-if-exists=.env scripts/zetaris_replay.ts check    # does the USL see the PREDIMED notice?
//   npx tsx --env-file-if-exists=.env scripts/zetaris_replay.ts arrive   # the real 13 June 2018 notice lands in the feed
//   npx tsx --env-file-if-exists=.env scripts/zetaris_replay.ts reset    # take it out again (to re-record)
//
// The agent code is unchanged. It is pointed at the second semantic layer with
//   ZETARIS_DB=lightning.metastore.aftershock_live.evidence EXTRACTION=curated npm run audit
//
// How it works: a second Unified Semantic Layer (aftershock_live) is identical to the
// hackathon one, except that its `retraction` table reads a Zetaris filestore table over a
// *folder* (rw_feed/). The folder starts with Retraction Watch as it stood before 13 June 2018.
// "arrive" drops the one real notice file into that folder; Zetaris queries files in place,
// so the next query (and the next agent run) sees it. No data is changed, only its date.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { zquery } from "../src/zetaris.ts";

const CONTAINER = process.env.ZETARIS_DRIVER ?? "zetaris-driver-1";
const FEED = "/home/zetaris/customer-data/shared/aftershock/rw_feed";
const BEFORE = "data/replay/retraction_watch_until_2018-06-12.csv";
const NOTICE = "data/replay/notice_2018-06-13_predimed.csv";
const RAW = "AFTERSHOCK_LIVE";          // raw sources for the replay
const SRC = "AFTERSHOCK_SRC";           // the hackathon raw sources (unchanged tables are read from here)
const NS = "lightning.metastore.aftershock_live";
const USL = `${NS}.evidence`;
const T = (t: string) => `${USL}.${t}`;

async function sql(stmt: string, { allowFail = false, strict = false } = {}) {
  const r = await zquery(stmt, 20);
  const ok = r.ok || (!strict && /already exist/i.test(r.raw));
  console.log(`${ok ? "OK  " : "FAIL"} ${stmt.trim().split("\n")[0].slice(0, 100)}${ok ? "" : "\n     " + r.raw.slice(0, 800)}`);
  if (!ok && !allowFail) throw new Error(`Zetaris: HTTP ${r.status}`);
  return r.rows;
}
const dock = (...a: string[]) => execFileSync("docker", ["exec", CONTAINER, ...a], { encoding: "utf8" });
const put = (local: string, remote: string) =>
  execFileSync("docker", ["exec", "-i", CONTAINER, "sh", "-c", `cat > ${remote}`], { input: fs.readFileSync(local) });

async function check() {
  await sql(`REFRESH TABLE ${RAW}.rw_feed`, { allowFail: true });
  const [feed] = await sql(`SELECT count(*) AS n FROM ${RAW}.rw_feed`);
  const rows = await sql(`SELECT record_id, notice, notice_date, notice_doi FROM ${T("retraction")} WHERE original_doi = '10.1056/nejmoa1200303'`);
  console.log(`\n  feed rows in Zetaris: ${feed?.n}`);
  console.log(`  PREDIMED notices visible in the semantic layer: ${rows.length}${rows.length ? "  " + JSON.stringify(rows[0]) : ""}`);
}

const cmd = process.argv[2];
if (cmd === "setup") {
  dock("sh", "-c", `rm -rf ${FEED} && mkdir -p ${FEED}`);
  put(BEFORE, `${FEED}/retraction_watch_until_2018-06-12.csv`);
  console.log("feed folder holds Retraction Watch up to 12 June 2018");
  await sql(`CREATE LIGHTNING DATABASE ${RAW} DESCRIBE BY "Aftershock replay: Retraction Watch feed folder"`, { allowFail: true });
  await sql(`CREATE LIGHTNING FILESTORE TABLE rw_feed FROM ${RAW} FORMAT CSV OPTIONS (PATH "${FEED}", header "true", inferSchema "false", multiLine "true", escape '"')`);
  await sql(`CREATE NAMESPACE ${NS}`, { allowFail: true });
  const ddl = fs.readFileSync("scripts/zetaris_setup.ts", "utf8").match(/DDL\n([\s\S]*?)`, \{ strict: true \}/)![1];
  await sql(`COMPILE USL evidence DEPLOY NAMESPACE ${NS} DDL\n${ddl}`, { strict: true });
  await sql(`ACTIVATE USL TABLE ${T("review")} AS
SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM ${SRC}.reviews_raw`);
  await sql(`ACTIVATE USL TABLE ${T("retraction")} AS
SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, trim(OriginalPaperPubMedID) AS original_pmid, lower(RetractionDOI) AS notice_doi, Title AS title, Journal AS journal,
  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace' ELSE RetractionNature END AS notice,
  RetractionDate AS notice_date, Reason AS reason
FROM ${RAW}.rw_feed`);
  await sql(`ACTIVATE USL TABLE ${T("study_outcome")} AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi, trim(study_pmid) AS study_pmid,
  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n
FROM ${SRC}.studies_raw`);
  await sql(`ACTIVATE USL TABLE ${T("published_estimate")} AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', scenario), '') AS row_id, review_doi, outcome, scenario, method, measure,
  CAST(es AS DOUBLE) AS es, CAST(lci AS DOUBLE) AS lci, CAST(uci AS DOUBLE) AS uci,
  CAST(printed_treat_events AS INT) AS printed_treat_events, CAST(printed_treat_n AS INT) AS printed_treat_n,
  CAST(printed_ctrl_events AS INT) AS printed_ctrl_events, CAST(printed_ctrl_n AS INT) AS printed_ctrl_n, vitality_key
FROM ${SRC}.pooled_raw`);
  await sql(`ACTIVATE USL TABLE ${T("vitality_reanalysis")} AS
SELECT COALESCE(concat_ws('|', status, srfile, meta_id, subid, rank), '') AS row_id, lower(doi) AS doi, srfile, meta_id, status AS replication, methods AS method,
  effectsize AS measure, type AS analysis_type, CAST(noofstudies AS INT) AS n_studies, CAST(noofretraction AS INT) AS n_retracted,
  CAST(all_es AS DOUBLE) AS all_es, CAST(all_lci AS DOUBLE) AS all_lci, CAST(all_uci AS DOUBLE) AS all_uci,
  CAST(exclude_es AS DOUBLE) AS exclude_es, CAST(exclude_lci AS DOUBLE) AS exclude_lci, CAST(exclude_uci AS DOUBLE) AS exclude_uci
FROM ${SRC}.vitality_raw`);
  for (const [name, table, expr] of [
    ["valid_counts", "study_outcome", "treat_events >= 0 AND ctrl_events >= 0 AND treat_events <= treat_n AND ctrl_events <= ctrl_n"],
    ["has_doi", "retraction", "original_doi IS NOT NULL AND original_doi <> ''"],
  ]) { await sql(`REMOVE DQ ${name} TABLE ${T(table)}`, { allowFail: true }); await sql(`REGISTER DQ ${name} TABLE ${T(table)} AS ${expr}`); }
  await check();
} else if (cmd === "arrive") {
  put(NOTICE, `${FEED}/notice_2018-06-13_predimed.csv`);
  console.log("13 June 2018: NEJM retracts and replaces PREDIMED (notice 10.1056/NEJMc1806491). File dropped into the Zetaris feed folder:");
  console.log(dock("ls", "-l", FEED));
  await check();
} else if (cmd === "reset") {
  dock("rm", "-f", `${FEED}/notice_2018-06-13_predimed.csv`);
  console.log("notice removed; feed is back to 12 June 2018");
  await check();
} else if (cmd === "check") {
  await check();
} else {
  console.log("usage: zetaris_replay.ts setup | check | arrive | reset");
}
