# Aftershock

**When a clinical trial is retracted, which medical conclusions fall with it?**

Aftershock is an evidence-integrity agent. Given a published meta-analysis, it finds the included trials that have since been retracted or flagged, **proves it can reproduce the published pooled result from the review's own numbers**, recalculates without the excluded trials, and reports exactly what changed, what still holds, and which later documents may be affected. It refuses to claim anything it cannot reproduce.

> Open Agent Hackathon 2026 · Track 2: *The Agent That Can Explain Why* · solo entry (Zain Zia)

---

## The problem

Retracted trials do not disappear from the evidence base. The VITALITY study (Xu et al., *BMJ* 2025) traced 1,330 retracted trials into 847 systematic reviews. Removing them changed statistical significance in 16% of affected meta-analyses and reversed the direction of the effect in 8.4%, and evidence from those reviews reached 157 clinical-guideline documents. Tools exist that *flag* a citation to a retracted paper; the recalculation itself has so far been done by hand, one study at a time.

Aftershock automates that recalculation as an auditable agent, with a gate that blocks any number it cannot verify.

## What it does (one real case)

Liyanage et al., *PLoS One* 2016 — a meta-analysis of the Mediterranean diet and cardiovascular outcomes. It pooled **PREDIMED** (NEJM 2013, *retracted and replaced* in 2018) and **Singh 2002** (Lancet, *expression of concern* 2005).

| Outcome | Published | Without PREDIMED | Verdict | Independent check (BMJ VITALITY) |
|---|---|---|---|---|
| Major cardiovascular events | RR 0.63 (0.53–0.75) | RR 0.43 (0.32–0.58) | ESTIMATE_SHIFTED | agrees |
| Coronary events | RR 0.65 (0.50–0.85) | RR 0.50 (0.34–0.72) | HOLDS | agrees |
| **Stroke** | RR 0.65 (0.48–0.88) | **RR 0.49 (0.23–1.05)** | **SIGNIFICANCE_LOST** | agrees |
| Cardiovascular mortality | RR 0.90 (0.72–1.11) | RR 0.88 (0.69–1.13) | HOLDS | agrees |
| All-cause mortality | RR 1.00 (0.86–1.15) | RR 0.99 (0.81–1.21) | HOLDS | agrees |

All five comparable recalculations match the VITALITY team's independent results to two decimals. A reviewer who also excludes the expression-of-concern trial (a policy remembered in H-MEM) sees major events move to RR 0.22 and heart failure lose significance.

## How the agent works

```
            Zetaris USL (evidence)                         Meterless Nightshift ─► Nemotron 3 Ultra
                    │                                                 │
 ┌──────────┐   ┌───▼──────┐   ┌──────────────┐   ┌──────────────┐   ┌▼───────────┐   ┌──────────┐
 │ Extractor│──►│ Verifier │──►│ Scout+Policy │──►│  Re-analyst  │──►│  Reporter  │──►│  Impact  │
 │ (vision  │◄──│  GATE    │   │ Retraction   │   │ deterministic│   │ grounded:  │   │  Tracer  │
 │ or table)│ ✗ │ sums +   │   │ Watch + H-MEM│   │ stats +      │   │ no number  │   │ OpenAlex │
 └──────────┘   │ reproduce│   │ policy       │   │ cross-check  │   │ it didn't  │   └──────────┘
   retry ≤3     │ published│   └──────────────┘   │ vs VITALITY  │   │ compute    │
   then         └──────────┘                      └──────────────┘   └────────────┘
   NEEDS_HUMAN_REVIEW
```

1. **Extractor** reads the study-level counts and the printed pooled result (from the review's forest plot, or the curated table).
2. **Verifier — the gate.** Column sums must equal the printed totals, and recomputing with the review's *own* method (e.g. fixed-effect Mantel–Haenszel) must reproduce the published estimate and CI within ±0.01. On failure it feeds the exact discrepancy back to the Extractor and retries (max 3), then escalates to `NEEDS_HUMAN_REVIEW`. Nothing downstream runs on an unverified table.
3. **Scout + Policy** looks up every included trial in Retraction Watch through Zetaris and applies the reviewer's exclusion policy, which lives in **H-MEM** (e.g. "expression of concern → keep").
4. **Re-analyst** recalculates deterministically (the language model never computes a pooled estimate) and returns a two-part verdict: the *statistical change* (direction, significance, shift) and the *interpretation* (supported / needs qualification / cannot assess). It never calls a review or guideline invalid.
5. **Cross-check** compares the recalculation with the VITALITY team's independent re-analysis when the review is in their dataset.
6. **Reporter** (Nemotron 3 Ultra via Nightshift) writes a short note. A grounding check rejects any number in the note that the pipeline did not compute.
7. **Impact Tracer** lists works that cite the meta-analysis (OpenAlex) and flags guideline-type documents as *potentially affected*.

Every step is a line in an append-only trace (`.aftershock/traces/*.jsonl`) including which model served each call and its signed Nightshift receipt.

### Recovery, shown not claimed

`npm run audit -- --outcome Stroke --corrupt` deliberately corrupts one count after extraction:

```
[08] fault.injected  study=Estruch 2013 (PREDIMED) field=treat_events
[09] verifier        attempt=1 ok=false problems=["recomputed Fixed MH RR = 0.71 (0.53-0.96) but the published result is 0.65 (0.48-0.88)"]
[11] extractor       (re-read with the discrepancy as feedback)
[12] verifier        attempt=2 ok=true
```

## Sponsor technology

| Sponsor | How Aftershock uses it | Evidence |
|---|---|---|
| **Zetaris** (data layer) | Five sources registered as Lightning FILESTORE tables and unified in the **`evidence` Unified Semantic Layer** (`review`, `retraction`, `study_outcome`, `published_estimate`, `vitality_reanalysis`) with primary/foreign keys. Data-quality rules: `valid_counts`, `ci_contains_estimate`, `has_doi`. The Scout's join of study DOIs to retraction notices runs against the USL. | `scripts/zetaris_setup.ts`, `evidence/zetaris_setup_log.md`, `evidence/zetaris_codespace.md` |
| **Meterless H-MEM** (engine) | The reviewer's exclusion policy is a long-term preference memory with source and confidence. Changing a rule writes a new memory that *supersedes* the old one, so the trust ledger keeps the history. Rules are recalled through H-MEM's retrieval service in a fresh process. Control: `HMEM=off` reverts to defaults and the verdicts revert. | `src/hmem/policyMemory.ts`; `npm run conformance` → **13/13 checks passed** |
| **Meterless Nightshift** (primary AI provider) | Every model call goes to Nightshift's OpenAI-compatible runtime (`127.0.0.1:8088/v1`). We record each signed compute receipt (`meterless.compute_receipt.v1`) and its winning route. | `src/llm.ts`, traces |
| **NVIDIA Nemotron** | `nemotron-3-ultra-550b-a55b` writes the reviewer note, routed by Nightshift (via OpenRouter). Each receipt names *Nemotron 3 Ultra* as the winning route. | traces: `label=Nemotron 3 Ultra (Free) signed=true` |

## Run it

**Sample mode — no services, no keys (for judges):**

```bash
npm install
npm run setup            # vendors the H-MEM reference engine
npm test                 # 15 statistical tests: every published estimate reproduced
npm run conformance      # H-MEM conformance suite
SAMPLE_MODE=true EXTRACTION=curated npm run audit
```

**Live mode:** Zetaris + Nightshift.

```bash
cp .env.example .env     # add the Nightshift token and your Zetaris API key
npm run zetaris:setup    # loads data, builds the USL and DQ rules (run where Zetaris runs)
npm run audit -- --report
npm run policy set "Expression of concern" exclude    # session 1: reviewer sets a rule (H-MEM)
npm run audit                                          # session 2: the rule is recalled and applied
HMEM=off npm run audit                                 # control: defaults only
```

## Data

| File | Source |
|---|---|
| `data/retraction_watch_health.csv` | Retraction Watch database via Crossref (health-science subset, 19,248 records) |
| `data/vitality_answer_key.csv` | VITALITY Study I core dataset (Xu et al., BMJ 2025), osf.io/ukg3j — used only as independent ground truth |
| `data/studies/` | Study-level counts and published pooled estimates read from Liyanage 2016, Fig 2 (CC BY 4.0) |

No patient-level data. No synthetic data.

## Limits

- The headline case is one review. VITALITY covers 806 reviews; Aftershock can only audit those whose study-level data it can read and reproduce, and it says so.
- A change in a pooled estimate is a statistical fact, not a clinical judgement. Aftershock flags; qualified reviewers decide.
- Forest-plot reading by a vision model is optional; the Verifier is what makes it safe.

## Built during the hackathon

All code in `src/`, `test/`, `scripts/` was written during the build window (22–27 Oct 2026). Pre-existing components: the H-MEM reference engine (Meterless, vendored by `npm run setup`), the Retraction Watch and VITALITY datasets (public).
