import type { Assessment, AssessmentStatus } from "./risk-engine";

export function amountPresentation(assessment: Assessment | undefined, proposedNotional: number | undefined): { label: string; message: string | null } {
  const unchanged = assessment?.saferAmount !== null && assessment?.saferAmount !== undefined && proposedNotional !== undefined && Math.abs(assessment.saferAmount - proposedNotional) <= 0.005;
  if (!unchanged) return { label: "Safer suggested amount", message: null };
  if (assessment.status === "PROCEED") return { label: "Assessed amount", message: null };
  if (assessment.status === "DO_NOT_PROCEED") return { label: "Size-based amount", message: "No size-based mitigation was identified. Current market conditions still trigger a do-not-proceed verdict." };
  return { label: "Size-based amount", message: "No further size reduction was calculated. The remaining warning is driven by current market conditions or the deterministic risk score." };
}

export function verdictPresentation(status: AssessmentStatus | null): string {
  return status ? status.replaceAll("_", " ") : "AWAITING ASSESSMENT";
}
