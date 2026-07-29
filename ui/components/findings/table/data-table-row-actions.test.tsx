import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useJiraDispatchStore } from "@/store/jira-dispatch/store";

import { DataTableRowActions } from "./data-table-row-actions";
import { FindingsSelectionContext } from "./findings-selection-context";

const { MuteFindingsModalMock } = vi.hoisted(() => ({
  MuteFindingsModalMock: vi.fn((_props: unknown) => null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/findings/mute-findings-modal", () => ({
  MuteFindingsModal: MuteFindingsModalMock,
}));

vi.mock("@/components/icons/services/IconServices", () => ({
  JiraIcon: () => null,
}));

vi.mock("@/lib/deployment", () => ({
  isGroupedJiraDispatchEnabled: () => true,
  PROWLER_CLOUD_ONLY_TOOLTIP: "Available only in Prowler Cloud",
}));

vi.mock("@/components/shadcn/dropdown", () => ({
  ActionDropdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ActionDropdownItem: ({
    label,
    onSelect,
    disabled,
  }: {
    label: string;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onSelect} disabled={disabled}>
      {label}
    </button>
  ),
}));

vi.mock("@/components/shadcn/spinner/spinner", () => ({
  Spinner: () => <span>Loading</span>,
}));

function deferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("DataTableRowActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useJiraDispatchStore.getState().closeJiraDispatch();
  });

  it("opens the mute modal immediately in preparing state for finding groups", async () => {
    // Given
    const deferred = deferredPromise<string[]>();
    const resolveMuteIds = vi.fn().mockReturnValue(deferred.promise);
    const user = userEvent.setup();

    render(
      <FindingsSelectionContext.Provider
        value={{
          selectedFindingIds: [],
          selectedFindings: [],
          clearSelection: vi.fn(),
          isSelected: vi.fn(),
          resolveMuteIds,
        }}
      >
        <DataTableRowActions
          row={
            {
              original: {
                id: "group-row-1",
                rowType: "group",
                checkId: "ecs_task_definitions_no_environment_secrets",
                checkTitle: "ECS task definitions no environment secrets",
                mutedCount: 0,
                resourcesFail: 475,
                resourcesTotal: 475,
              },
            } as never
          }
        />
      </FindingsSelectionContext.Provider>,
    );

    // When
    await user.click(
      screen.getByRole("button", { name: "Mute Finding Group" }),
    );

    // Then
    expect(MuteFindingsModalMock.mock.calls.at(-1)?.[0]).toMatchObject({
      isOpen: true,
      isPreparing: true,
      findingIds: [],
    });

    // When
    deferred.resolve(["finding-1", "finding-2"]);

    // Then
    await waitFor(() => {
      expect(MuteFindingsModalMock.mock.calls.at(-1)?.[0]).toMatchObject({
        isOpen: true,
        isPreparing: false,
        findingIds: ["finding-1", "finding-2"],
      });
    });
  });

  it("disables the mute action for groups without impacted resources", () => {
    // Given / When
    render(
      <FindingsSelectionContext.Provider
        value={{
          selectedFindingIds: [],
          selectedFindings: [],
          clearSelection: vi.fn(),
          isSelected: vi.fn(),
          resolveMuteIds: vi.fn(),
        }}
      >
        <DataTableRowActions
          row={
            {
              original: {
                id: "group-row-2",
                rowType: "group",
                checkId: "check-with-zero-failures",
                checkTitle: "Check with zero failures",
                mutedCount: 0,
                resourcesFail: 0,
                resourcesTotal: 42,
              },
            } as never
          }
        />
      </FindingsSelectionContext.Provider>,
    );

    // Then
    expect(
      screen.getByRole("button", { name: "Mute Finding Group" }),
    ).toBeDisabled();
  });

  it("opens Jira from the row action for a finding group", async () => {
    // Given
    const user = userEvent.setup();
    render(
      <FindingsSelectionContext.Provider
        value={{
          selectedFindingIds: [],
          selectedFindings: [],
          clearSelection: vi.fn(),
          isSelected: vi.fn(),
          resolveMuteIds: vi.fn(),
        }}
      >
        <DataTableRowActions
          row={
            {
              original: {
                id: "group-row-1",
                rowType: "group",
                checkId: "s3_bucket_public_access",
                checkTitle: "S3 bucket public access",
                mutedCount: 0,
                resourcesFail: 2,
                resourcesTotal: 2,
              },
            } as never
          }
        />
      </FindingsSelectionContext.Provider>,
    );

    // When
    await user.click(
      screen.getByRole("button", { name: "Send 1 Finding Group to Jira" }),
    );

    // Then
    expect(useJiraDispatchStore.getState().activePayload).toEqual({
      selection: {
        kind: "single",
        targetId: "s3_bucket_public_access",
        targetType: "check_id",
      },
      findingTitle: "S3 bucket public access",
      selectedResourceCount: 2,
    });
  });
});
