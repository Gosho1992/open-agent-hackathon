# Evidence: Zetaris + Aftershock run in GitHub Codespace

Run: Sat Oct 24 14:04:02 UTC 2026  host: Codespace 4-core/16GB

## Zetaris verify.sh
```
  PASS  postgres: running (healthy)
  PASS  driver: running (healthy)
  PASS  api: running (healthy)
  PASS  ui: running (healthy)
  PASS  init: completed (exit 0 -- this is correct for a one-shot job)
  FAIL  bootstrap: still running (it is a one-shot job and should have finished)
  PASS  ui responding (/api/config 200)
  PASS  login as admin@zetaris.com
  PASS  query through ui -> api -> driver -> spark
Quote the FAIL lines above when asking for help.
```

## Disk
```
overlay          32G   30G  610M  98% /
```
## Aftershock tests
```
```

## Aftershock audit (sample mode, curated extraction)
```
  outcome               original                         recalculated                     verdict              VITALITY
  MACE                  RR 0.63 (0.53-0.75)              RR 0.43 (0.32-0.58)              ESTIMATE_SHIFTED     agrees
  Coronary events       RR 0.65 (0.50-0.85)              RR 0.50 (0.34-0.72)              HOLDS                agrees
  Stroke                RR 0.65 (0.48-0.88)              RR 0.49 (0.23-1.05)              SIGNIFICANCE_LOST    agrees
  CVD mortality         RR 0.90 (0.72-1.11)              RR 0.88 (0.69-1.13)              HOLDS                agrees
  All-cause mortality   RR 1.00 (0.86-1.15)              RR 0.99 (0.81-1.21)              HOLDS                agrees
  Heart failure         RR 0.30 (0.16-0.56)              RR 0.30 (0.16-0.56)              HOLDS                -
```
