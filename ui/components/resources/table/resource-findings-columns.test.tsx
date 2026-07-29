import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/findings/table", () => ({
  DataTableRowActions: ({
    onMuteComplete,
  }: {
    onMuteComplete?: (findingIds: string[]) => void;
  }) => (
    <button onClick={() => onMuteComplete?.(["finding-1"])}>Actions</button>
  ),
}));

vi.mock("@/components/findings/table/notification-indicator", () => ({
  NotificationIndicator: () => null,
}));

vi.mock("@/components/shadcn", () => ({
  Checkbox: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
    <input type="checkbox" aria-label={ariaLabel} />
  ),
}));

vi.mock("@/components/shadcn/entities", () => ({
  DateWithTime: ({ dateTime }: { dateTime: string }) => <time>{dateTime}</time>,
}));

vi.mock("@/components/shadcn/table", () => ({
  DataTableColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
  SeverityBadge: ({ severity }: { severity: string }) => (
    <span>{severity}</span>
  ),
  StatusFindingBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

import {
  getResourceFindingsColumns,
  type ResourceFinding,
} from "./resource-findings-columns";

function makeFinding(overrides?: Partial<ResourceFinding>): ResourceFinding {
  return {
    type: "findings",
    id: "finding-1",
    attributes: {
      status: "FAIL",
      severity: "critical",
      muted: false,
      updated_at: "2026-03-30T10:05:00Z",
      check_metadata: {
        checktitle: "S3 public access",
      },
    },
    ...overrides,
  };
}

function getColumnIds(columns: ReturnType<typeof getResourceFindingsColumns>) {
  return columns.map(
    (column) =>
      (column as { id?: string; accessorKey?: string }).id ??
      (column as { id?: string; accessorKey?: string }).accessorKey,
  );
}

describe("resource-findings-columns", () => {
  it("should render actions as the last column without a Triage or Notes column", () => {
    // Given
    const columns = getResourceFindingsColumns({}, 1, vi.fn());

    // When
    const columnIds = getColumnIds(columns);

    // Then
    expect(columnIds.at(-1)).toEqual("actions");
    expect(columnIds).not.toContain("triage");
    expect(columnIds).not.toContain("notes");
  });

  it("should navigate to the finding when the finding cell is clicked", async () => {
    // Given
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const columns = getResourceFindingsColumns({}, 1, onNavigate);
    const findingColumn = columns.find(
      (col) => (col as { accessorKey?: string }).accessorKey === "finding",
    );
    if (!findingColumn?.cell) {
      throw new Error("finding column not found");
    }
    const FindingCell = findingColumn.cell as (props: {
      row: { original: ResourceFinding };
    }) => ReactNode;
    const finding = makeFinding();

    // When
    render(<div>{FindingCell({ row: { original: finding } })}</div>);
    await user.click(screen.getByRole("button", { name: "S3 public access" }));

    // Then
    expect(onNavigate).toHaveBeenCalledWith("finding-1");
  });

  it("should forward onMuteComplete to the actions column", async () => {
    // Given
    const user = userEvent.setup();
    const onMuteComplete = vi.fn();
    const columns = getResourceFindingsColumns({}, 1, vi.fn(), onMuteComplete);
    const actionsColumn = columns.find(
      (col) => (col as { id?: string }).id === "actions",
    );
    if (!actionsColumn?.cell) {
      throw new Error("actions column not found");
    }
    const ActionsCell = actionsColumn.cell as (props: {
      row: { original: ResourceFinding };
    }) => ReactNode;
    const finding = makeFinding();

    // When
    render(<div>{ActionsCell({ row: { original: finding } })}</div>);
    await user.click(screen.getByRole("button", { name: "Actions" }));

    // Then
    expect(onMuteComplete).toHaveBeenCalledWith(["finding-1"]);
  });
});
