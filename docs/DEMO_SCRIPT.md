# Demo video script (about 3 minutes)

Record the screen at 1080p. Before recording: terminal font large (Ctrl + several times), dark terminal, the slide deck open in one browser tab, the results page in another, and Nightshift running.

Windows PowerShell, in `C:\aftershock` (after `git pull` and `npm install`). Sample mode needs no services:

```powershell
$env:SAMPLE_MODE="true"; $env:EXTRACTION="curated"; $env:AFTERSHOCK_QUIET="true"
```

| Time | Show | Say (read it slowly) |
|---|---|---|
| 0:00 | Slide 1 (cover) | "When a clinical trial is retracted, the meta-analyses that pooled it are not. This is Aftershock, an agent that measures what changes." |
| 0:12 | Slide 2 (problem) | "The BMJ VITALITY study found that removing retracted trials changed significance in sixteen percent of affected meta-analyses. That was done by hand. Aftershock makes it a repeatable agent." |
| 0:30 | Terminal: `npm run audit` | "Here is a real review: the Mediterranean diet and cardiovascular outcomes. It pooled PREDIMED, which was retracted and replaced. First the agent reproduces every published result from the study table. Only then does it remove the retracted record." |
| 0:55 | Point at the Stroke row | "Stroke goes from a significant reduction, 0.65, to 0.49 with an interval that crosses one: significance is lost. All five comparable results match the BMJ team's independent recalculation." |
| 1:10 | Results page, open the Stroke row | "The reviewer sees the evidence behind every number: the retraction notice, the replacement paper, and the honest scenario. We exclude the retracted record; we do not claim the trial is invalid." |
| 1:30 | Terminal: `npm run audit -- --outcome Stroke --corrupt` | "Now I break it on purpose. One count is changed after extraction. The gate rejects it because the columns no longer add up to the printed totals, feeds the error back, and the re-read passes. The model never supplies the number it is checked against." |
| 1:55 | Terminal: `npm run policy set "Expression of concern" exclude` then `npm run audit` | "A reviewer can make a stricter decision. The rule is stored in Meterless H-MEM with its source, and recalled in a new session. The results change." |
| 2:15 | Terminal: `$env:HMEM="off"; npm run audit; $env:HMEM=$null` | "With memory turned off, the defaults come back. That is how we show H-MEM is doing the work." |
| 2:30 | Slide 8 (sponsors), then `evidence/traces` in GitHub | "Live, every lookup is a SQL query on our Zetaris semantic layer, and the explanation is written by NVIDIA Nemotron through Meterless Nightshift, with a signed receipt for every call. Every trace is hash-chained and can be verified offline." |
| 2:50 | Slide 12 (limits) | "We state the limits: one review is fully demonstrated, and impact tracing lists candidates for a human. Aftershock does not just tell you a review is contaminated. It shows you what moves, after proving it can reproduce the number." |
| 3:05 | End | "Thank you." |

Before the H-MEM part, reset memory so the run starts clean: `Remove-Item -Recurse -Force .aftershock\hmem` (only the local demo memory). After recording: `npm run policy set "Expression of concern" keep`.
