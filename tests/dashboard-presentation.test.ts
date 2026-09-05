import { describe, expect, it } from "vitest";
import { amountPresentation, verdictPresentation } from "../lib/dashboard-presentation";
import type { Assessment } from "../lib/risk-engine";

function assessment(status: Assessment["status"], saferAmount: number): Assessment {
  return {
    status,
    reason: "Verified deterministic result.",
    score: status === "PROCEED" ? 0 : 25,
    saferAmount,
    observableDepthSufficient: true,
    overrides: { minimumStatus: null, reasons: [] },
    coverage: { applicableComponents: [], assessedComponents: [], notAssessedComponents: [], ratio: 0.8 },
  };
}

describe("dashboard assessment presentation", () => {
  it("does not call an unchanged REDUCE_SIZE amount safer", () => {
    expect(amountPresentation(assessment("REDUCE_SIZE", 1_000), 1_000)).toEqual({
      label: "Size-based amount",
      message: "No further size reduction was calculated. The remaining warning is driven by current market conditions or the deterministic risk score.",
    });
  });

  it("explains an unchanged decimal REDUCE_SIZE amount", () => {
    expect(amountPresentation(assessment("REDUCE_SIZE", 331.96), 331.96)).toMatchObject({
      label: "Size-based amount",
      message: expect.stringContaining("No further size reduction was calculated"),
    });
  });

  it("does not imply an unchanged DO_NOT_PROCEED amount is safe", () => {
    expect(amountPresentation(assessment("DO_NOT_PROCEED", 331.96), 331.96)).toEqual({
      label: "Size-based amount",
      message: "No size-based mitigation was identified. Current market conditions still trigger a do-not-proceed verdict.",
    });
  });

  it("does not show ASSESSMENT_UNAVAILABLE in the untouched initial state", () => {
    expect(verdictPresentation(null)).toBe("AWAITING ASSESSMENT");
    expect(verdictPresentation(null)).not.toBe("ASSESSMENT UNAVAILABLE");
  });
});
