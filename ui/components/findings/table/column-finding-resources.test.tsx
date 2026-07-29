import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isGroupedJiraDispatchEnabledMock } = vi.hoisted(() => ({
  isGroupedJiraDispatchEnabledMock: vi.fn(() => true),
}));

// CustomLink pulls the "@/lib" barrel (and next-auth with it) into the unit env.
vi.mock("@/components/shadcn/custom/custom-link", () => ({
  CustomLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/shadcn", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: ({
    "aria-label": ariaLabel,
    onCheckedChange,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & {
    "aria-label"?: string;
    size?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}));

vi.mock("@/components/findings/mute-findings-modal", () => ({
  MuteFindingsModal: () => null,
}));

vi.mock("@/components/icons/services/IconServices", () => ({
  JiraIcon: () => null,
}));

vi.mock("@/components/shadcn/dropdown", () => ({
  ActionDropdown: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ActionDropdownItem: ({
    label,
    onSelect,
    disabled,
    disabledTooltip,
  }: {
    label: string;
    onSelect?: () => void;
    disabled?: boolean;
    disabledTooltip?: string;
  }) => (
    <button disabled={disabled} onClick={onSelect} title={disabledTooltip}>
      {label}
    </button>
  ),
}));

vi.mock("@/components/shadcn/info-field/info-field", () => ({
  InfoField: ({
    children,
    label,
  }: {
    children: ReactNode;
    label: string;
    variant?: string;
  }) => (
    <div>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("@/components/shadcn/spinner/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("@/components/shadcn/select/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({
    children,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled}>
      {children}
    </button>
  ),
  SelectValue: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/shadcn/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/shadcn/entities", () => ({
  DateWithTime: ({
    dateTime,
    inline,
  }: {
    dateTime: string | null;
    inline?: boolean;
  }) => <time data-inline={inline ? "true" : "false"}>{dateTime ?? "-"}</time>,
}));

vi.mock("@/components/shadcn/entities/entity-info", () => ({
  EntityInfo: ({
    entityAlias,
    entityId,
  }: {
    entityAlias?: string;
    entityId?: string;
  }) => (
    <div>
      <span>{entityAlias}</span>
      <span>{entityId}</span>
    </div>
  ),
}));

vi.mock("@/components/shadcn/table", () => ({
  SeverityBadge: ({ severity }: { severity: string }) => (
    <span>{severity}</span>
  ),
}));

vi.mock("@/components/shadcn/table/data-table-column-header", () => ({
  DataTableColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
}));

vi.mock("@/components/shadcn/table/status-finding-badge", () => ({
  StatusFindingBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("@/lib/date-utils", () => ({
  getFailingForLabel: () => "2d",
}));

vi.mock("@/lib/deployment", () => ({
  isGroupedJiraDispatchEnabled: isGroupedJiraDispatchEnabledMock,
  PROWLER_CLOUD_ONLY_TOOLTIP: "Available only in Prowler Cloud",
}));

const notificationIndicatorMock = vi.fn((_props: unknown) => null);

vi.mock("./notification-indicator", () => ({
  NotificationIndicator: (props: unknown) => {
    notificationIndicatorMock(props);
    return null;
  },
}));

import { useJiraDispatchStore } from "@/store/jira-dispatch/store";
import type { FindingResourceRow } from "@/types";

import { getColumnFindingResources } from "./column-finding-resources";

function makeResource(
  overrides?: Partial<FindingResourceRow>,
): FindingResourceRow {
  return {
    id: "resource-row-1",
    rowType: "resource",
    findingId: "finding-1",
    checkId: "s3_check",
    providerType: "aws",
    providerAlias: "production",
    providerUid: "123456789",
    resourceName: "my-bucket",
    resourceType: "bucket",
    resourceGroup: "default",
    resourceUid: "arn:aws:s3:::my-bucket",
    service: "s3",
    region: "us-east-1",
    severity: "critical",
    status: "FAIL",
    delta: "new",
    isMuted: false,
    firstSeenAt: null,
    lastSeenAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function getColumnIds(columns: ReturnType<typeof getColumnFindingResources>) {
  return columns.map(
    (column) =>
      (column as { id?: string; accessorKey?: string }).id ??
      (column as { id?: string; accessorKey?: string }).accessorKey,
  );
}

describe("column-finding-resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGroupedJiraDispatchEnabledMock.mockReturnValue(true);
    useJiraDispatchStore.getState().closeJiraDispatch();
  });

  it("should render actions as the last visible column without a Triage or Notes column", () => {
    // Given
    const columns = getColumnFindingResources({
      rowSelection: {},
      selectableRowCount: 1,
    });

    // When
    const columnIds = getColumnIds(columns);

    // Then
    expect(columnIds.at(-1)).toEqual("actions");
    expect(columnIds).not.toContain("status");
    expect(columnIds).not.toContain("triage");
    expect(columnIds).not.toContain("notes");
    expect(
      (columns.at(-1) as { id?: string; size?: number } | undefined)?.size,
    ).toBe(56);
  });

  it("should open Jira dispatch with the finding UUID directly", async () => {
    // Given
    const user = userEvent.setup();

    const columns = getColumnFindingResources({
      rowSelection: {},
      selectableRowCount: 1,
    });

    const actionColumn = columns.find(
      (col) => (col as { id?: string }).id === "actions",
    );
    if (!actionColumn?.cell) {
      throw new Error("actions column not found");
    }

    const CellComponent = actionColumn.cell as (props: {
      row: { original: FindingResourceRow };
    }) => ReactNode;

    render(
      <div>
        {CellComponent({
          row: {
            original: makeResource({
              findingId: "real-finding-uuid",
            }),
          },
        })}
      </div>,
    );

    // When
    await user.click(
      screen.getByRole("button", { name: "Send 1 Finding to Jira" }),
    );

    // Then
    expect(useJiraDispatchStore.getState().activePayload?.selection).toEqual({
      kind: "single",
      targetId: "real-finding-uuid",
      targetType: "finding_id",
    });
  });
});
