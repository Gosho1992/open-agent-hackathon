# Zetaris setup log

Run 2026-10-25T13:27:53.839Z against http://localhost:3000

Copied 5 CSV files into zetaris-driver-1:/home/zetaris/customer-data/shared/aftershock

```sql
CREATE LIGHTNING DATABASE AFTERSHOCK_SRC DESCRIBE BY "Aftershock raw evidence sources"
```
→ OK {"headers":["Result"],"data":[],"total":0,"timeUsed":67}

```sql
CREATE LIGHTNING FILESTORE TABLE rw_raw FROM AFTERSHOCK_SRC FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/retraction_watch_health.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"headers":["Result"],"data":[],"total":0,"timeUsed":438}

```sql
CREATE LIGHTNING FILESTORE TABLE reviews_raw FROM AFTERSHOCK_SRC FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/reviews.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"headers":["Result"],"data":[],"total":0,"timeUsed":90}

```sql
CREATE LIGHTNING FILESTORE TABLE studies_raw FROM AFTERSHOCK_SRC FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/liyanage2016_med_diet.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"headers":["Result"],"data":[],"total":0,"timeUsed":125}

```sql
CREATE LIGHTNING FILESTORE TABLE pooled_raw FROM AFTERSHOCK_SRC FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/published_pooled.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"headers":["Result"],"data":[],"total":0,"timeUsed":153}

```sql
CREATE LIGHTNING FILESTORE TABLE vitality_raw FROM AFTERSHOCK_SRC FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/vitality_answer_key.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"headers":["Result"],"data":[],"total":0,"timeUsed":99}

```sql
SELECT count(*) AS n FROM AFTERSHOCK_SRC.rw_raw
```
→ OK {"headers":["n"],"data":[["19248"]],"total":1,"timeUsed":333}

```sql
CREATE NAMESPACE lightning.metastore
```
→ OK {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: [SCHEMA_ALREADY_EXISTS] org.apache.spark.sql.catalyst.analysis.NamespaceAlreadyExistsException: [SCHEMA_ALREADY_EXISTS] Cannot create schema `metastore` because it already exists.\nChoose a different name, drop the existing schema, or add the IF NOT EXISTS clause to tolerate pre-existing schema.\n\tat org.apache.spark.sql.h

```sql
CREATE NAMESPACE lightning.metastore.aftershock
```
→ OK {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: [SCHEMA_ALREADY_EXISTS] org.apache.spark.sql.catalyst.analysis.NamespaceAlreadyExistsException: [SCHEMA_ALREADY_EXISTS] Cannot create schema `metastore`.`aftershock` because it already exists.\nChoose a different name, drop the existing schema, or add the IF NOT EXISTS clause to tolerate pre-existing schema.\n\tat org.apach

```sql
COMPILE USL evidence DEPLOY NAMESPACE lightning.metastore.aftershock DDL
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
)
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.review AS
SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM AFTERSHOCK_SRC.reviews_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"review\",\"query\":\"SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM AFTERSHOCK_SRC.reviews_raw\"}"]],"total":1,"timeUsed":85}

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.retraction AS
SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, trim(OriginalPaperPubMedID) AS original_pmid, lower(RetractionDOI) AS notice_doi, Title AS title, Journal AS journal,
  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace' ELSE RetractionNature END AS notice,
  RetractionDate AS notice_date, Reason AS reason
FROM AFTERSHOCK_SRC.rw_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"retraction\",\"query\":\"SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, trim(OriginalPaperPubMedID) AS original_pmid, lower(RetractionDOI) AS notice_doi, Title AS title, Journal AS journal,\\n  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.study_outcome AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi, trim(study_pmid) AS study_pmid,
  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n
FROM AFTERSHOCK_SRC.studies_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"study_outcome\",\"query\":\"SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi, trim(study_pmid) AS study_pmid,\\n  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n\\nFRO

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.published_estimate AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', scenario), '') AS row_id, review_doi, outcome, scenario, method, measure,
  CAST(es AS DOUBLE) AS es, CAST(lci AS DOUBLE) AS lci, CAST(uci AS DOUBLE) AS uci,
  CAST(printed_treat_events AS INT) AS printed_treat_events, CAST(printed_treat_n AS INT) AS printed_treat_n,
  CAST(printed_ctrl_events AS INT) AS printed_ctrl_events, CAST(printed_ctrl_n AS INT) AS printed_ctrl_n, vitality_key
FROM AFTERSHOCK_SRC.pooled_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"published_estimate\",\"query\":\"SELECT COALESCE(concat(review_doi, '|', outcome, '|', scenario), '') AS row_id, review_doi, outcome, scenario, method, measure,\\n  CAST(es AS DOUBLE) AS es, CAST(lci AS DOUBLE) AS lci, CAST(uci AS DOUBLE) AS uci,\\n  CAST(printed_treat_events AS INT) AS printed_treat_events, CAST(printed_treat_n AS INT) AS printed_tr

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.vitality_reanalysis AS
SELECT COALESCE(concat_ws('|', status, srfile, meta_id, subid, rank), '') AS row_id, lower(doi) AS doi, srfile, meta_id, status AS replication, methods AS method,
  effectsize AS measure, type AS analysis_type, CAST(noofstudies AS INT) AS n_studies, CAST(noofretraction AS INT) AS n_retracted,
  CAST(all_es AS DOUBLE) AS all_es, CAST(all_lci AS DOUBLE) AS all_lci, CAST(all_uci AS DOUBLE) AS all_uci,
  CAST(exclude_es AS DOUBLE) AS exclude_es, CAST(exclude_lci AS DOUBLE) AS exclude_lci, CAST(exclude_uci AS DOUBLE) AS exclude_uci
FROM AFTERSHOCK_SRC.vitality_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"vitality_reanalysis\",\"query\":\"SELECT COALESCE(concat_ws('|', status, srfile, meta_id, subid, rank), '') AS row_id, lower(doi) AS doi, srfile, meta_id, status AS replication, methods AS method,\\n  effectsize AS measure, type AS analysis_type, CAST(noofstudies AS INT) AS n_studies, CAST(noofretraction AS INT) AS n_retracted,\\n  CAST(all_es AS DOU

```sql
REMOVE DQ valid_counts TABLE lightning.metastore.aftershock.evidence.study_outcome
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":67}

```sql
REGISTER DQ valid_counts TABLE lightning.metastore.aftershock.evidence.study_outcome AS treat_events >= 0 AND ctrl_events >= 0 AND treat_events <= treat_n AND ctrl_events <= ctrl_n
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ valid_counts TABLE lightning.metastore.aftershock.evidence.study_outcome
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["valid_counts","study_outcome","Custom Data Quality","20","20","0"]],"total":1,"timeUsed":647}

```sql
REMOVE DQ ci_contains_estimate TABLE lightning.metastore.aftershock.evidence.published_estimate
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":84}

```sql
REGISTER DQ ci_contains_estimate TABLE lightning.metastore.aftershock.evidence.published_estimate AS lci <= es AND es <= uci
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ ci_contains_estimate TABLE lightning.metastore.aftershock.evidence.published_estimate
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["ci_contains_estimate","published_estimate","Custom Data Quality","12","12","0"]],"total":1,"timeUsed":631}

```sql
REMOVE DQ has_doi TABLE lightning.metastore.aftershock.evidence.retraction
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":57}

```sql
REGISTER DQ has_doi TABLE lightning.metastore.aftershock.evidence.retraction AS original_doi IS NOT NULL AND original_doi <> ''
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ has_doi TABLE lightning.metastore.aftershock.evidence.retraction
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["has_doi","retraction","Custom Data Quality","19248","19050","198"]],"total":1,"timeUsed":872}

```sql
REMOVE DQ study_identified TABLE lightning.metastore.aftershock.evidence.study_outcome
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":58}

```sql
REGISTER DQ study_identified TABLE lightning.metastore.aftershock.evidence.study_outcome AS (study_doi IS NOT NULL AND study_doi <> '') OR (study_pmid IS NOT NULL AND study_pmid <> '')
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ study_identified TABLE lightning.metastore.aftershock.evidence.study_outcome
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["study_identified","study_outcome","Custom Data Quality","20","20","0"]],"total":1,"timeUsed":516}

```sql
REMOVE DQ printed_totals_present TABLE lightning.metastore.aftershock.evidence.published_estimate
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":58}

```sql
REGISTER DQ printed_totals_present TABLE lightning.metastore.aftershock.evidence.published_estimate AS printed_treat_n > 0 AND printed_ctrl_n > 0
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ printed_totals_present TABLE lightning.metastore.aftershock.evidence.published_estimate
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["printed_totals_present","published_estimate","Custom Data Quality","12","12","0"]],"total":1,"timeUsed":502}

```sql
LIST DQ USL lightning.metastore.aftershock.evidence
```
→ OK {"headers":["name","table","type","expression"],"data":[["review_doi","review","Primary key constraints",""],["record_id","retraction","Primary key constraints",""],["has_doi","retraction","Custom Data Quality","original_doi IS NOT NULL AND original_doi <> ''"],["row_id","study_outcome","Primary key constraints",""],["review_doi","study_outcome","Foreign key constraints",""],["valid_counts","study

```sql
SELECT s.study, s.outcome, r.notice, r.notice_date, r.notice_doi FROM lightning.metastore.aftershock.evidence.study_outcome s JOIN lightning.metastore.aftershock.evidence.retraction r ON s.study_doi = r.original_doi OR s.study_pmid = r.original_pmid WHERE s.outcome = 'MACE'
```
→ OK {"headers":["study","outcome","notice","notice_date","notice_doi"],"data":[["Estruch 2013 (PREDIMED)","MACE","Retract and replace","6/13/2018 0:00","10.1056/nejmc1806491"],["Singh 2002","MACE","Expression of concern","7/30/2005 0:00","10.1016/s0140-6736(05)67006-7"]],"total":2,"timeUsed":699}
