import { describe, expect, it } from "vitest";

import { COMPLIANCE_TAB } from "@/types/compliance";

import { getComplianceTab } from "./compliance-page-tabs.shared";

describe("getComplianceTab", () => {
  it("falls back to cross-provider for missing or invalid values", () => {
    expect(getComplianceTab(undefined)).toBe(COMPLIANCE_TAB.CROSS_PROVIDER);
    expect(getComplianceTab(["per-scan"])).toBe(COMPLIANCE_TAB.CROSS_PROVIDER);
    expect(getComplianceTab("bogus")).toBe(COMPLIANCE_TAB.CROSS_PROVIDER);
    expect(getComplianceTab("per-scan")).toBe(COMPLIANCE_TAB.PER_SCAN);
    expect(getComplianceTab("cross-provider")).toBe(
      COMPLIANCE_TAB.CROSS_PROVIDER,
    );
  });

  it("keeps pre-split links alive: a bare scanId still opens Single Scan", () => {
    expect(getComplianceTab(undefined, "scan-1")).toBe(COMPLIANCE_TAB.PER_SCAN);
    expect(getComplianceTab("bogus", "scan-1")).toBe(COMPLIANCE_TAB.PER_SCAN);
    // An explicit tab always wins over the inferred one.
    expect(getComplianceTab("cross-provider", "scan-1")).toBe(
      COMPLIANCE_TAB.CROSS_PROVIDER,
    );
    // Empty or repeated scanId carries no selection to honour.
    expect(getComplianceTab(undefined, "")).toBe(COMPLIANCE_TAB.CROSS_PROVIDER);
    expect(getComplianceTab(undefined, ["scan-1"])).toBe(
      COMPLIANCE_TAB.CROSS_PROVIDER,
    );
  });
});
