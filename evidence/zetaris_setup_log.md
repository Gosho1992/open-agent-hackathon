# Zetaris setup log

Run 2026-10-25T02:14:56.474Z against http://localhost:3000

Copied 5 CSV files into zetaris-driver-1:/home/zetaris/customer-data/shared/aftershock

```sql
CREATE LIGHTNING DATABASE AFTERSHOCK_RAW DESCRIBE BY "Aftershock raw evidence sources"
```
→ OK {"msg":"A database named \"AFTERSHOCK_RAW\" already exists."}

```sql
CREATE LIGHTNING FILESTORE TABLE rw_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/retraction_watch_health.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"rw_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
CREATE LIGHTNING FILESTORE TABLE reviews_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/reviews.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"reviews_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
CREATE LIGHTNING FILESTORE TABLE studies_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/liyanage2016_med_diet.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"studies_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
CREATE LIGHTNING FILESTORE TABLE pooled_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/published_pooled.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"pooled_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
CREATE LIGHTNING FILESTORE TABLE vitality_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/vitality_answer_key.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"vitality_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
SELECT count(*) AS n FROM AFTERSHOCK_RAW.rw_raw
```
→ OK {"headers":["n"],"data":[["19248"]],"total":1,"timeUsed":477}

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
  uci double
);
CREATE TABLE vitality_reanalysis (
  row_id varchar(400) NOT NULL PRIMARY KEY,
  doi varchar(200),
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
SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM AFTERSHOCK_RAW.reviews_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"review\",\"query\":\"SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM AFTERSHOCK_RAW.reviews_raw\"}"]],"total":1,"timeUsed":150}

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.retraction AS
SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, Title AS title, Journal AS journal,
  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace' ELSE RetractionNature END AS notice,
  RetractionDate AS notice_date, Reason AS reason
FROM AFTERSHOCK_RAW.rw_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"retraction\",\"query\":\"SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, Title AS title, Journal AS journal,\\n  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace' ELSE RetractionNature END AS notice,\\n  RetractionDate AS notice_date, Reason A

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.study_outcome AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi,
  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n
FROM AFTERSHOCK_RAW.studies_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"study_outcome\",\"query\":\"SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi,\\n  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n\\nFROM AFTERSHOCK_RAW.studies_raw\"}"

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.published_estimate AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', scenario), '') AS row_id, review_doi, outcome, scenario, method, measure,
  CAST(es AS DOUBLE) AS es, CAST(lci AS DOUBLE) AS lci, CAST(uci AS DOUBLE) AS uci
FROM AFTERSHOCK_RAW.pooled_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"published_estimate\",\"query\":\"SELECT COALESCE(concat(review_doi, '|', outcome, '|', scenario), '') AS row_id, review_doi, outcome, scenario, method, measure,\\n  CAST(es AS DOUBLE) AS es, CAST(lci AS DOUBLE) AS lci, CAST(uci AS DOUBLE) AS uci\\nFROM AFTERSHOCK_RAW.pooled_raw\"}"]],"total":1,"timeUsed":119}

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.vitality_reanalysis AS
SELECT COALESCE(concat_ws('|', status, srfile, meta_id, subid, rank), '') AS row_id, lower(doi) AS doi, status AS replication, methods AS method,
  effectsize AS measure, type AS analysis_type, CAST(noofstudies AS INT) AS n_studies, CAST(noofretraction AS INT) AS n_retracted,
  CAST(all_es AS DOUBLE) AS all_es, CAST(all_lci AS DOUBLE) AS all_lci, CAST(all_uci AS DOUBLE) AS all_uci,
  CAST(exclude_es AS DOUBLE) AS exclude_es, CAST(exclude_lci AS DOUBLE) AS exclude_lci, CAST(exclude_uci AS DOUBLE) AS exclude_uci
FROM AFTERSHOCK_RAW.vitality_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"vitality_reanalysis\",\"query\":\"SELECT COALESCE(concat_ws('|', status, srfile, meta_id, subid, rank), '') AS row_id, lower(doi) AS doi, status AS replication, methods AS method,\\n  effectsize AS measure, type AS analysis_type, CAST(noofstudies AS INT) AS n_studies, CAST(noofretraction AS INT) AS n_retracted,\\n  CAST(all_es AS DOUBLE) AS all_es, C

```sql
REMOVE DQ valid_counts TABLE lightning.metastore.aftershock.evidence.study_outcome
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":113}

```sql
REGISTER DQ valid_counts TABLE lightning.metastore.aftershock.evidence.study_outcome AS treat_events >= 0 AND ctrl_events >= 0 AND treat_events <= treat_n AND ctrl_events <= ctrl_n
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ valid_counts TABLE lightning.metastore.aftershock.evidence.study_outcome
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["valid_counts","study_outcome","Custom Data Quality","20","20","0"]],"total":1,"timeUsed":990}

```sql
REMOVE DQ ci_contains_estimate TABLE lightning.metastore.aftershock.evidence.published_estimate
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":67}

```sql
REGISTER DQ ci_contains_estimate TABLE lightning.metastore.aftershock.evidence.published_estimate AS lci <= es AND es <= uci
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ ci_contains_estimate TABLE lightning.metastore.aftershock.evidence.published_estimate
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["ci_contains_estimate","published_estimate","Custom Data Quality","12","12","0"]],"total":1,"timeUsed":756}

```sql
REMOVE DQ has_doi TABLE lightning.metastore.aftershock.evidence.retraction
```
→ OK {"headers":["remove"],"data":[["true"]],"total":1,"timeUsed":78}

```sql
REGISTER DQ has_doi TABLE lightning.metastore.aftershock.evidence.retraction AS original_doi IS NOT NULL AND original_doi <> ''
```
→ OK {"headers":["json"],"data":[["{\"namespace\":[\"metastore\",\"aftershock\"],\"name\":\"evidence\",\"tables\":[{\"name\":\"review\",\"columnSpecs\":[{\"name\":\"review_doi\",\"dataType\":\"\\\"varchar(100)\\\"\",\"primaryKey\":{\"columns\":[]},\"notNull\":{\"columns\":[]},\"dqAnnotations\":[],\"acAnnotations\":[]},{\"name\":\"short_name\",\"dataType\":\"\\\"varchar(100)\\\"\",\"dqAnnotations\":[],\

```sql
RUN DQ has_doi TABLE lightning.metastore.aftershock.evidence.retraction
```
→ OK {"headers":["name","table","type","total_record","valid_record","invalid_record"],"data":[["has_doi","retraction","Custom Data Quality","19248","19050","198"]],"total":1,"timeUsed":1031}

```sql
LIST DQ USL lightning.metastore.aftershock.evidence
```
→ OK {"headers":["name","table","type","expression"],"data":[["review_doi","review","Primary key constraints",""],["record_id","retraction","Primary key constraints",""],["has_doi","retraction","Custom Data Quality","original_doi IS NOT NULL AND original_doi <> ''"],["row_id","study_outcome","Primary key constraints",""],["review_doi","study_outcome","Foreign key constraints",""],["valid_counts","study

```sql
SELECT s.study, s.outcome, r.notice, r.notice_date FROM lightning.metastore.aftershock.evidence.study_outcome s JOIN lightning.metastore.aftershock.evidence.retraction r ON s.study_doi = r.original_doi WHERE s.outcome = 'MACE'
```
→ OK {"headers":["study","outcome","notice","notice_date"],"data":[["Estruch 2013 (PREDIMED)","MACE","Retract and replace","6/13/2018 0:00"],["Singh 2002","MACE","Expression of concern","7/30/2005 0:00"]],"total":2,"timeUsed":1197}
