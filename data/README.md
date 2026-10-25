# Aftershock data

| File | What it is | Source / licence |
|---|---|---|
| `retraction_watch_health.csv` | 19,248 health-science retractions (clinical studies and research articles) from the Retraction Watch database | Crossref Labs Retraction Watch dataset, https://api.labs.crossref.org/data/retractionwatch (open) |
| `vitality_answer_key.csv` | The VITALITY authors' row-level sheet: **4,483 rows** = 4,234 marked replicated + 249 not replicated; 3,325 `type=Total` rows and 1,158 subgroup rows; 806 review DOIs; 3,093 distinct analyses (`srfile`+`meta_id`). Each row has the original pooled result and the result recalculated without the retracted trials. Aftershock uses it **only as an independent cross-check**, and only `type=Total` rows matched on the stable key `srfile:meta_id`. Note: the BMJ paper reports 4,095 analyses eligible for replication and 3,902 fully replicated across 807 reviews; its counting unit differs from this sheet's rows, and we do not claim the two counts are the same thing. | Xu C et al. VITALITY Study I, BMJ 2025;389:e082068, core dataset https://osf.io/ukg3j |
| `reviews.csv` | The case reviews Aftershock is run on, with role and status of the questioned trials | Curated by us |
| `studies/liyanage2016_med_diet.csv` | Study registry for 6 outcomes of Liyanage 2016: per-study event counts plus identity (DOI where verified, PubMed ID for every trial, taken from the review's reference list) | Read from Fig 2 of the open-access article (CC BY) |
| `studies/published_pooled.csv` | The authoritative reference for the Verifier: pooled estimates and the **printed column totals** as published (with and without Singh 2002), plus the stable VITALITY analysis key (`711_5:1`…`711_5:5`; heart failure has none because it contains no retracted trial) | Liyanage 2016, Fig 2 |
| `replacements.csv` | Replacement publications for retract-and-replace notices (PREDIMED 2013 → NEJM 2018 republication) |
| `raw/liyanage2016_fig2_forest.png` | The original forest plot, input for the vision extractor | PLoS One, CC BY 4.0 |

Day-0 check: fixed-effect Mantel-Haenszel on `studies/liyanage2016_med_diet.csv` reproduces **12/12** published pooled estimates within 0.01; dropping PREDIMED gives MACE RR 0.43 (0.32-0.58), identical to the VITALITY answer key.

Synthetic data is not used. No patient-level data.
