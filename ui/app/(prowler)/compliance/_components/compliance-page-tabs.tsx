"use client";

import { ReactNode } from "react";

import { type ComplianceTab } from "@/types/compliance";

interface CompliancePageTabsProps {
  activeTab: ComplianceTab;
  crossProviderEnabled: boolean;
  perScanContent: ReactNode;
  crossProviderContent: ReactNode;
}

// Multiple Scans tab removed (requires cloud backend).
// Always render the single-scan compliance view.
export const CompliancePageTabs = ({
  perScanContent,
}: CompliancePageTabsProps) => {
  return <>{perScanContent}</>;
};
