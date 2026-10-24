// Exclusion policy: which kinds of editorial notice remove a trial from the re-analysis.
// This is a reviewer decision, not a fact in the data, so Aftershock remembers it in H-MEM
// (see src/hmem/policyMemory.ts) with its source and trust, and applies it in later sessions.

export type Notice = "Retraction" | "Retract and replace" | "Expression of concern" | "Correction" | "None";

export interface ExclusionPolicy {
  exclude: Record<Notice, boolean>;
  /** Where each rule came from (default, or the H-MEM memory id that set it). */
  provenance: Partial<Record<Notice, string>>;
}

export const DEFAULT_POLICY: ExclusionPolicy = {
  exclude: { "Retraction": true, "Retract and replace": true, "Expression of concern": false, "Correction": false, "None": false },
  provenance: {},
};

/** Map a Retraction Watch record to the notice type the policy speaks about. */
export function noticeOf(nature: string, reason: string): Notice {
  const n = nature.toLowerCase();
  if (n.includes("expression of concern")) return "Expression of concern";
  if (n.includes("correction")) return "Correction";
  if (n.includes("retraction")) return /retract and replace/i.test(reason) ? "Retract and replace" : "Retraction";
  return "None";
}
