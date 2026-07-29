export const PROWLER_CLOUD_ONLY_TOOLTIP = "Available only in Prowler Cloud";

// The Jira dispatch backend (IntegrationJiraViewSet.dispatches ->
// send_findings_to_jira) always creates one ticket per finding by looping
// over finding_ids — it has no server-side "grouped ticket" mode and never
// reads the `dispatch_mode` the frontend sends. Dispatching a finding group
// (or multiple selected findings) is the identical code path as a single
// finding, just with more IDs, so there's nothing Cloud-specific to gate.
export const isGroupedJiraDispatchEnabled = (): boolean => true;
