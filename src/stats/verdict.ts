// Two-dimensional verdict, kept separate on purpose:
//   1. statistical change  - what the numbers did (computed, never judged by the model)
//   2. interpretation      - whether a reviewer should look at it. This is a statistical flag,
//                            NOT a clinical judgement: clinical implications are for the reviewer.
// Aftershock never says a guideline or a review is "invalid", and never says a conclusion is
// "supported": the strongest thing it says is that no change was detected.

import type { Pooled } from "./meta.ts";

export interface StatisticalChange {
  directionFlipped: boolean;
  significanceChanged: "lost" | "gained" | "none";
  estimateShiftPct: number;         // relative change of the point estimate (ratio scale for RR/OR)
  newEstimateInsideOldCI: boolean;
}

export type Interpretation =
  | "NO_CHANGE_DETECTED"
  | "REVIEWER_ASSESSMENT_NEEDED"
  | "CANNOT_ASSESS";

export interface Verdict {
  change: StatisticalChange;
  interpretation: Interpretation;
  headline: "NO_CHANGE_DETECTED" | "ESTIMATE_SHIFTED" | "SIGNIFICANCE_LOST" | "SIGNIFICANCE_GAINED" | "DIRECTION_FLIPPED" | "NO_REMAINING_EVIDENCE";
  reason: string;
}

const nullValue = (p: Pooled) => (p.measure === "RR" || p.measure === "OR" ? 1 : 0);
const significant = (p: Pooled) => { const n = nullValue(p); return p.lci > n || p.uci < n; };
const side = (p: Pooled) => Math.sign(p.es - nullValue(p));

export function compare(original: Pooled, recalculated: Pooled | null): Verdict {
  if (!recalculated) {
    return {
      change: { directionFlipped: false, significanceChanged: significant(original) ? "lost" : "none", estimateShiftPct: NaN, newEstimateInsideOldCI: false },
      interpretation: "CANNOT_ASSESS",
      headline: "NO_REMAINING_EVIDENCE",
      reason: "Every study in this analysis was excluded; no evidence remains to pool.",
    };
  }
  const ratio = nullValue(original) === 1;
  const shift = ratio ? recalculated.es / original.es - 1 : (recalculated.es - original.es) / Math.abs(original.es || 1e-9);
  const sigBefore = significant(original), sigAfter = significant(recalculated);
  const change: StatisticalChange = {
    directionFlipped: side(original) !== 0 && side(recalculated) !== 0 && side(original) !== side(recalculated),
    significanceChanged: sigBefore && !sigAfter ? "lost" : !sigBefore && sigAfter ? "gained" : "none",
    estimateShiftPct: Math.round(shift * 1000) / 10,
    newEstimateInsideOldCI: recalculated.es >= original.lci && recalculated.es <= original.uci,
  };

  if (change.directionFlipped && (sigBefore || sigAfter)) {
    return { change, interpretation: "REVIEWER_ASSESSMENT_NEEDED", headline: "DIRECTION_FLIPPED", reason: "The pooled effect points the other way once the excluded studies are removed, and at least one result is statistically significant." };
  }
  if (change.significanceChanged === "lost") {
    return { change, interpretation: "REVIEWER_ASSESSMENT_NEEDED", headline: "SIGNIFICANCE_LOST", reason: "The original result was statistically significant; without the excluded studies the confidence interval includes no effect." };
  }
  if (change.significanceChanged === "gained") {
    return { change, interpretation: "REVIEWER_ASSESSMENT_NEEDED", headline: "SIGNIFICANCE_GAINED", reason: "The original result was not significant; without the excluded studies it is." };
  }
  if (!change.newEstimateInsideOldCI) {
    const towardNull = Math.abs(Math.log(ratio ? recalculated.es : 1) ) < Math.abs(Math.log(ratio ? original.es : 1)) || (!ratio && Math.abs(recalculated.es) < Math.abs(original.es));
    return { change, interpretation: "REVIEWER_ASSESSMENT_NEEDED", headline: "ESTIMATE_SHIFTED", reason: `Direction and significance are unchanged, but the new estimate lies outside the original confidence interval (${towardNull ? "smaller" : "larger"} effect).` };
  }
  return { change, interpretation: "NO_CHANGE_DETECTED", headline: "NO_CHANGE_DETECTED", reason: "No change detected in direction or statistical significance, and the new estimate lies inside the original confidence interval. This is a statistical observation; clinical implications remain the reviewer's call." };
}
