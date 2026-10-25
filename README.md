# Aftershock

**When a clinical trial is retracted, which published medical conclusions move with it?**

Aftershock is an evidence-integrity agent. Given a published meta-analysis, it finds the included trials that have since been retracted or flagged, **proves it can reproduce the published pooled result from the study table before it claims anything**, recalculates under the reviewer's exclusion policy, checks its answer against an independent re-analysis, and lists later documents that cite the review as candidates for human follow-up. When it cannot verify a step, it stops and says so.

> Open Agent Hackathon 2026 · Track 2: *The Agent That Can Explain Why* · solo entry (Zain Zia)
>
> **Demo video:** _link added at submission_ · **Slides:** _link added at submission_ · **Results page:** _link added at submission_

Tools that flag a citation to a retracted paper already exist. VITALITY (Xu et al., *BMJ* 2025) showed by hand what happens when those trials are removed from meta-analyses. Aftershock turns that recalculation into a repeatable, auditable agent: **it does not just say a review is contaminated, it shows whether the result moves, after proving it can reproduce the published number.**

---

## The problem

Retracted trials do not leave the evidence base. VITALITY traced 1,330 retracted trials into 847 systematic reviews: removing them changed statistical significance in 16% of affected meta-analyses and reversed the direction of the effect in 8.4%, and evidence from those reviews reached 157 guideline documents. That work was done by a research team, one analysis at a time.

## One real case

Liyanage et al., *PLoS One* 2016: a meta-analysis of the Mediterranean diet and cardiovascular outcomes. It pooled **PREDIMED** (NEJM 2013, *retracted and replaced* in 2018) and **Singh 2002** (Lancet, *expression of concern* 2005).

Default policy: exclude retractions, keep expressions of concern. For PREDIMED this is the scenario **"exclude the retracted source record"**: the trial was republished with corrected data (10.1056/NEJMoa1800389); this sensitivity analysis does not substitute the replacement and does not claim the trial's evidence is invalid.

| Outcome | Published | Without the retracted record | Verdict | Independent check (BMJ VITALITY) |
|---|---|---|---|---|
| Major cardiovascular events | RR 0.63 (0.53–0.75) | RR 0.43 (0.32–0.58) | ESTIMATE_SHIFTED | agrees (analysis 711_5:1) |
| Coronary events | RR 0.65 (0.50–0.85) | RR 0.50 (0.34–0.72) | NO_CHANGE_DETECTED | agrees (711_5:3) |
| **Stroke** | RR 0.65 (0.48–0.88) | **RR 0.49 (0.23–1.05)** | **SIGNIFICANCE_LOST** | agrees (711_5:4) |
| Cardiovascular mortality | RR 0.90 (0.72–1.11) | RR 0.88 (0.69–1.13) | NO_CHANGE_DETECTED | agrees (711_5:2) |
| All-cause mortality | RR 1.00 (0.86–1.15) | RR 0.99 (0.81–1.21) | NO_CHANGE_DETECTED | agrees (711_5:5) |
| Heart failure | RR 0.30 (0.17–0.56) | RR 0.30 (0.16–0.56) | NO_CHANGE_DETECTED | n/a (no retracted trial in it) |

All five comparable recalculations match VITALITY's independent results to two decimals, matched on VITALITY's own analysis key, not on nearest numbers. A verdict is a **statistical observation**: `NO_CHANGE_DETECTED` means direction and significance did not change and the new estimate is inside the old CI; clinical implications stay with the reviewer. A reviewer who also excludes the expression-of-concern trial (a rule remembered in H-MEM) sees major events move to RR 0.22 and heart failure lose significance ([evidence/hmem_policy_demo.txt](evidence/hmem_policy_demo.txt)).

The Impact Tracer then lists works citing the review (OpenAlex: 209 citing works, 200 scanned) and title-matches 4 guideline-type documents and 30 later reviews. These are **candidates for a human to check**, not proof that any of them relied on the changed outcome.

## Why you can trust the number (the trust boundary)

The model never supplies the number it is checked against, and every unverifiable step fails closed. Each rule below has a test in [`test/agent.test.ts`](test/agent.test.ts).

| Rule | What it prevents |
|---|---|
| The **published estimate, CI, method, measure and printed column totals come from Zetaris**, in every mode. The extractor only proposes study rows. | A model that misreads both the counts and the pooled result consistently cannot verify itself. |
| **Column sums must equal the printed totals**, and the extractor's own reading of the totals must match them too. | A misread digit inside a row. |
| Recomputing with the review's own method must **reproduce the published result within ±0.01**. The comparison is NaN-safe. | A wrong table that happens to sum correctly, or a missing number slipping through (`NaN > tol` is false in JavaScript). |
| Strict validation first: integer counts, non-zero arms, events ≤ n, allowed method/measure pairs (no Peto RR). | Garbage reaching the statistics. |
| **Identity fails closed.** Every row must resolve to exactly one study in the registry, and every study needs a DOI or PubMed ID. Retraction lookup matches on **DOI or PMID**. | "Could not identify the study" being treated as "the study is clean". |
| An **unrecognised notice type escalates**; it is never mapped to "no notice". | Silent false negatives as the notice vocabulary changes. |
| Any exception (model down, bad JSON, data source error, statistics error) is a failed attempt; after 3 attempts → `NEEDS_HUMAN_REVIEW`. | A crash or partial result being presented as an audit. |
| **Every number in a report is written by code** from the result object. Nemotron adds a plain-language explanation that may contain **no digits at all**, or it is withheld. | A model inventing or altering a number. |
| The VITALITY cross-check matches on the **stable analysis key** and checks study count, retracted count and the original estimate; otherwise it reports "unresolved". | Two different analyses with similar numbers being confused. |
| Traces are **hash-chained** and record a `code_sha` of the source that ran. `npm run verify-trace -- <file>` re-checks them offline. | Edited, deleted or reordered trace lines; evidence from different code. |

### Recovery, shown not claimed

`npm run audit -- --outcome Stroke --corrupt` changes one count after extraction:

```
[..] fault.injected  study=Estruch 2013 (PREDIMED) field=treat_events
[..] verifier        attempt=1 ok=false problems=["column treat_events sums to 100 but the printed total is 90"]
[..] verifier        attempt=2 ok=true
```

## How the agent works

```
                 Zetaris USL "evidence" (authoritative reference, registry, notices, VITALITY)
                     │                │                    │                     │
 ┌───────────┐   ┌───▼─────┐   ┌──────▼───────┐   ┌────────▼──────┐   ┌──────────▼──┐   ┌───────────┐   ┌─────────┐
 │ Extractor │──►│Identity │──►│ Verifier GATE│──►│ Scout+Policy  │──►│ Re-analyst  │──►│ Reporter  │──►│ Impact  │
 │ rows only │   │DOI/PMID │   │ totals +     │   │ RW by DOI/PMID│   │ deterministic│  │ numbers by│   │ Tracer  │
 │ (vision or│◄──│fail     │◄──│ reproduce    │   │ + H-MEM rules │   │ + VITALITY  │   │ code; Nemo│   │ OpenAlex│
 │  curated) │ ✗ │closed   │ ✗ │ published    │   └───────────────┘   │ by stable key│  │ explains  │   │candidates│
 └───────────┘   └─────────┘   └──────────────┘                       └─────────────┘   └─────┬─────┘   └─────────┘
   retry ≤3 with the exact discrepancy, then NEEDS_HUMAN_REVIEW                                │
                                                                     Meterless Nightshift ─► Nemotron 3 Ultra
```

It is a deliberately simple sequential pipeline: one language model for reading (optional) and one for explaining; everything that decides a number is deterministic code.

## Sponsor technology

| Sponsor | How Aftershock uses it | Evidence |
|---|---|---|
| **Zetaris** (data layer) | Five sources registered as Lightning FILESTORE tables and unified in the **`evidence` Unified Semantic Layer** (`review`, `retraction`, `study_outcome`, `published_estimate`, `vitality_reanalysis`) with primary/foreign keys. Data-quality rules: `valid_counts`, `ci_contains_estimate`, `has_doi`, `study_identified`, `printed_totals_present`. In live mode every lookup the agent makes is a SQL query against the USL, recorded in the trace. | [`scripts/zetaris_setup.ts`](scripts/zetaris_setup.ts), [`evidence/zetaris_setup_log.md`](evidence/zetaris_setup_log.md), [`evidence/traces/`](evidence/traces) (`live-zetaris_*`) |
| **Meterless H-MEM** (engine) | The reviewer's exclusion policy is long-term preference memory with source and trust. Changing a rule writes a new memory that *supersedes* the old one (trust-ledger history). Rules are recalled in a fresh process. Control: `HMEM=off` reverts to defaults and the verdicts revert. | [`src/hmem/policyMemory.ts`](src/hmem/policyMemory.ts), [`evidence/hmem_policy_demo.txt`](evidence/hmem_policy_demo.txt), [`evidence/hmem_conformance.txt`](evidence/hmem_conformance.txt) (**13/13**) |
| **Meterless Nightshift** (primary AI provider) | Every model call goes to Nightshift's OpenAI-compatible runtime (`127.0.0.1:8088/v1`). The trace keeps the winning route and the full signed compute receipt (`meterless.compute_receipt.v1`) of each call. | [`src/llm.ts`](src/llm.ts), [`evidence/traces/`](evidence/traces) (`explain_*`) |
| **NVIDIA Nemotron** | `nemotron-3-ultra-550b-a55b` writes the reviewer explanation, routed by Nightshift via OpenRouter; the receipt's winning route names *Nemotron 3 Ultra*. | `llm` lines in the explain trace: `label`, `provider=nightshift->openrouter`, `signed=true` |

## Evidence and how to check it

| File | What it shows |
|---|---|
| `evidence/traces/live-zetaris_*audit-all.jsonl` | Full audit served from the Zetaris USL: every query, the gate, notices, verdicts, cross-checks. Hash-chained. |
| `evidence/traces/live-zetaris_*audit-stroke.jsonl` | The recovery run against live Zetaris (fault injected → rejected → re-read → verified). |
| `evidence/traces/explain_*.jsonl` | Nemotron-via-Nightshift explanations for that live result, with full signed receipts. Its first lines record the sha256 of the live result it explained. |
| `evidence/zetaris_setup_log.md` | Every Zetaris statement and its response. |
| `evidence/tests.txt`, `evidence/hmem_conformance.txt`, `evidence/hmem_policy_demo.txt` | Test, conformance and H-MEM control output. |

```bash
npm run verify-trace -- evidence/traces/<file>.jsonl   # hash chain intact? same code_sha as this checkout?
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the tests, the H-MEM conformance suite, the sample audit, the recovery demo and verifies every committed trace on each push.

## Run it

**Sample mode: no services, no keys (for judges)**

```bash
npm install
npm run setup            # vendors the Meterless H-MEM reference engine
npm test                 # 30 tests: statistics + agent-loop safety
npm run conformance      # H-MEM conformance suite
SAMPLE_MODE=true EXTRACTION=curated npm run audit
SAMPLE_MODE=true EXTRACTION=curated npm run audit -- --outcome Stroke --corrupt   # the gate catching a misread
```

**Live mode: Zetaris + Nightshift**

```bash
cp .env.example .env     # Nightshift token; Zetaris admin login is read from zetaris-platform/.env
npm run zetaris:setup    # loads the data, builds the USL and DQ rules (run where Zetaris runs)
EXTRACTION=curated npm run audit -- --report
npm run explain -- <result.json>                       # Nemotron explanations for an existing result
npm run policy set "Expression of concern" exclude     # session 1: reviewer sets a rule (H-MEM)
npm run audit                                          # session 2: the rule is recalled and applied
HMEM=off npm run audit                                 # control: defaults only
```

## Data

| File | Source |
|---|---|
| `data/retraction_watch_health.csv` | Retraction Watch database via Crossref (health-science subset, 19,248 records) |
| `data/vitality_answer_key.csv` | VITALITY Study I row-level sheet (Xu et al., *BMJ* 2025), osf.io/ukg3j, used only as an independent cross-check. Row definitions differ from the paper's counts: see [data/README.md](data/README.md) |
| `data/studies/` | Study registry (counts, DOI, PMID) and the published reference (estimates and printed totals) from Liyanage 2016, Fig 2 (CC BY 4.0) |

No patient-level data. No synthetic data.

## Limits (stated plainly)

- **One review, six outcomes, is fully demonstrated.** Aftershock can only audit reviews whose study table and printed reference it can obtain and reproduce, and it says so when it cannot.
- **The demonstrated path is curated extraction.** Vision extraction is implemented and sits behind the same gate (a misread cannot verify against itself), but it is experimental and not part of the headline evidence.
- **Retract-and-replace is handled as "exclude the retracted record"**, not as a re-analysis with the corrected replacement data.
- **Impact tracing is candidate discovery:** 200 of 209 citing works scanned; guideline detection is by title; a human must confirm reliance on the changed outcome.
- A verdict is a statistical fact, not a clinical judgement. Aftershock never calls a review, trial or guideline invalid.

## Built during the hackathon

All code in `src/`, `test/`, `scripts/` was written during the build window (22–27 Oct 2026). Pre-existing components: the H-MEM reference engine and conformance vectors (Meterless, vendored by `npm run setup`), the Retraction Watch and VITALITY datasets (public). Licence: Apache-2.0.
