# Aftershock data

| File | What it is | Source / licence |
|---|---|---|
| `retraction_watch_health.csv` | 19,248 health-science retractions (clinical studies and research articles) from the Retraction Watch database | Crossref Labs Retraction Watch dataset, https://api.labs.crossref.org/data/retractionwatch (open) |
| `vitality_answer_key.csv` | 4,483 meta-analyses (806 reviews) that included retracted trials, with the published pooled result and the result recalculated without the retracted trials. Used as **ground truth** for evaluation. | Xu C et al. VITALITY Study I, BMJ 2025;389:e082068, core dataset https://osf.io/ukg3j |
| `reviews.csv` | The case reviews Aftershock is run on, with role and status of the questioned trials | Curated by us |
| `studies/liyanage2016_med_diet.csv` | Per-study event counts for 6 outcomes of Liyanage 2016 | Read from Fig 2 of the open-access article (CC BY) |
| `studies/published_pooled.csv` | Pooled estimates as published in the review (with and without Singh 2002) — what the Verifier must reproduce | Liyanage 2016, Fig 2 |
| `raw/liyanage2016_fig2_forest.png` | The original forest plot, input for the vision extractor | PLoS One, CC BY 4.0 |

Day-0 check: fixed-effect Mantel-Haenszel on `studies/liyanage2016_med_diet.csv` reproduces **12/12** published pooled estimates within 0.01; dropping PREDIMED gives MACE RR 0.43 (0.32-0.58), identical to the VITALITY answer key.

Synthetic data is not used. No patient-level data.
