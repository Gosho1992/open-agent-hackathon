# Zetaris setup log

Run 2026-10-25T13:25:50.960Z against http://localhost:3000

Copied 5 CSV files into zetaris-driver-1:/home/zetaris/customer-data/shared/aftershock

```sql
CREATE LIGHTNING DATABASE AFTERSHOCK_RAW DESCRIBE BY "Aftershock raw evidence sources"
```
→ OK {"msg":"A database named \"AFTERSHOCK_RAW\" already exists."}

```sql
DROP VIEW IF EXISTS AFTERSHOCK_RAW.rw_raw
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: java.util.NoSuchElementException: key not found: aftershock_raw\n\tat org.apache.spark.sql.hive.thriftserver.HiveThriftServerErrors$.runningQueryError(HiveThriftServerErrors.scala:46)\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation.org$apache$spark$sql$hive$thriftserver$LightningSparkExe

```sql
CREATE LIGHTNING FILESTORE TABLE rw_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/retraction_watch_health.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"rw_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
DROP VIEW IF EXISTS AFTERSHOCK_RAW.reviews_raw
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: java.util.NoSuchElementException: key not found: aftershock_raw\n\tat org.apache.spark.sql.hive.thriftserver.HiveThriftServerErrors$.runningQueryError(HiveThriftServerErrors.scala:46)\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation.org$apache$spark$sql$hive$thriftserver$LightningSparkExe

```sql
CREATE LIGHTNING FILESTORE TABLE reviews_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/reviews.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"reviews_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
DROP VIEW IF EXISTS AFTERSHOCK_RAW.studies_raw
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: java.util.NoSuchElementException: key not found: aftershock_raw\n\tat org.apache.spark.sql.hive.thriftserver.HiveThriftServerErrors$.runningQueryError(HiveThriftServerErrors.scala:46)\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation.org$apache$spark$sql$hive$thriftserver$LightningSparkExe

```sql
CREATE LIGHTNING FILESTORE TABLE studies_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/liyanage2016_med_diet.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"studies_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
DROP VIEW IF EXISTS AFTERSHOCK_RAW.pooled_raw
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: java.util.NoSuchElementException: key not found: aftershock_raw\n\tat org.apache.spark.sql.hive.thriftserver.HiveThriftServerErrors$.runningQueryError(HiveThriftServerErrors.scala:46)\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation.org$apache$spark$sql$hive$thriftserver$LightningSparkExe

```sql
CREATE LIGHTNING FILESTORE TABLE pooled_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/published_pooled.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"pooled_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
DROP VIEW IF EXISTS AFTERSHOCK_RAW.vitality_raw
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: java.util.NoSuchElementException: key not found: aftershock_raw\n\tat org.apache.spark.sql.hive.thriftserver.HiveThriftServerErrors$.runningQueryError(HiveThriftServerErrors.scala:46)\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation.org$apache$spark$sql$hive$thriftserver$LightningSparkExe

```sql
CREATE LIGHTNING FILESTORE TABLE vitality_raw FROM AFTERSHOCK_RAW FORMAT CSV OPTIONS (PATH "/home/zetaris/customer-data/shared/aftershock/vitality_answer_key.csv", header "true", inferSchema "false", multiLine "true", escape '"')
```
→ OK {"msg":"A table named \"vitality_raw\" already exists in database \"AFTERSHOCK_RAW\"."}

```sql
SELECT count(*) AS n FROM AFTERSHOCK_RAW.rw_raw
```
→ OK {"headers":["n"],"data":[["19248"]],"total":1,"timeUsed":918}

```sql
CREATE NAMESPACE lightning.metastore
```
→ OK {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: [SCHEMA_ALREADY_EXISTS] org.apache.spark.sql.catalyst.analysis.NamespaceAlreadyExistsException: [SCHEMA_ALREADY_EXISTS] Cannot create schema `metastore` because it already exists.\nChoose a different name, drop the existing schema, or add the IF NOT EXISTS clause to tolerate pre-existing schema.\n\tat org.apache.spark.sql.h

```sql
CREATE NAMESPACE lightning.metastore.aftershock
```
→ OK {"msg":"org.apache.hive.service.cli.HiveSQLException: Error running query: [SCHEMA_ALREADY_EXISTS] org.apache.spark.sql.catalyst.analysis.NamespaceAlreadyExistsException: [SCHEMA_ALREADY_EXISTS] Cannot create schema `metastore`.`aftershock` because it already exists.\nChoose a different name, drop the existing schema, or add the IF NOT EXISTS clause to tolerate pre-existing schema.\n\tat org.apach

```sql
DROP USL lightning.metastore.aftershock.evidence
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: com.zetaris.lightning.sql.parser.ddl.LightningDdlParseException: \nno viable alternative at input 'drop usl'(line 1, pos 5)\n\n== SQL ==\nDROP USL lightning.metastore.aftershock.evidence\n-----^^^\n\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation$$anon$2.run(LightningSparkExecuteStatementOperation.scala:247)

```sql
DROP USL evidence FROM NAMESPACE lightning.metastore.aftershock
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: com.zetaris.lightning.sql.parser.ddl.LightningDdlParseException: \nno viable alternative at input 'drop usl'(line 1, pos 5)\n\n== SQL ==\nDROP USL evidence FROM NAMESPACE lightning.metastore.aftershock\n-----^^^\n\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation$$anon$2.run(LightningSparkExecuteStatementOpera

```sql
DROP USL evidence IN NAMESPACE lightning.metastore.aftershock
```
→ FAILED (HTTP 400) {"msg":"org.apache.hive.service.cli.HiveSQLException: com.zetaris.lightning.sql.parser.ddl.LightningDdlParseException: \nno viable alternative at input 'drop usl'(line 1, pos 5)\n\n== SQL ==\nDROP USL evidence IN NAMESPACE lightning.metastore.aftershock\n-----^^^\n\n\tat org.apache.spark.sql.hive.thriftserver.LightningSparkExecuteStatementOperation$$anon$2.run(LightningSparkExecuteStatementOperati

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
SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM AFTERSHOCK_RAW.reviews_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"review\",\"query\":\"SELECT COALESCE(CAST(review_doi AS STRING), '') AS review_doi, short_name, title, journal, CAST(year AS INT) AS year, role FROM AFTERSHOCK_RAW.reviews_raw\"}"]],"total":1,"timeUsed":288}

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.retraction AS
SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, trim(OriginalPaperPubMedID) AS original_pmid, lower(RetractionDOI) AS notice_doi, Title AS title, Journal AS journal,
  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace' ELSE RetractionNature END AS notice,
  RetractionDate AS notice_date, Reason AS reason
FROM AFTERSHOCK_RAW.rw_raw
```
→ OK {"headers":["registered"],"data":[["{\"name\":\"retraction\",\"query\":\"SELECT COALESCE(CAST(Record_ID AS INT), 0) AS record_id, lower(OriginalPaperDOI) AS original_doi, trim(OriginalPaperPubMedID) AS original_pmid, lower(RetractionDOI) AS notice_doi, Title AS title, Journal AS journal,\\n  CASE WHEN RetractionNature = 'Retraction' AND Reason LIKE '%Retract and Replace%' THEN 'Retract and replace

```sql
ACTIVATE USL TABLE lightning.metastore.aftershock.evidence.study_outcome AS
SELECT COALESCE(concat(review_doi, '|', outcome, '|', study), '') AS row_id, review_doi, outcome, study, lower(study_doi) AS study_doi, trim(study_pmid) AS study_pmid,
  CAST(treat_events AS INT) AS treat_events, CAST(treat_n AS INT) AS treat_n, CAST(ctrl_events AS INT) AS ctrl_events, CAST(ctrl_n AS INT) AS ctrl_n
FROM AFTERSHOCK_RAW.studies_raw
```
→ FAILED (HTTP 400) {"msg":"SQL execution error: [UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name `study_pmid` cannot be resolved. Did you mean one of the following? [`study_doi`, `study`, `outcome`, `ctrl_n`, `treat_n`].; line 1 pos 141;\n'Project [coalesce(concat(review_doi#615, |, outcome#616, |, study#617), ) AS row_id#608, review_doi#615, outcome#616, study#617, lower(study_doi#618) A
