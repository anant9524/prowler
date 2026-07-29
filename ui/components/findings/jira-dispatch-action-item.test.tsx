import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/shadcn/dropdown";
import { createJiraTargetSelection } from "@/lib/jira-dispatch-selection";
import { useJiraDispatchStore } from "@/store";
import {
  JIRA_DISPATCH_TARGET,
  type JiraDispatchTarget,
} from "@/types/integrations";

import { JiraDispatchActionItem } from "./jira-dispatch-action-item";

const renderAction = (targetIds: string[], targetType: JiraDispatchTarget) => {
  const selection = createJiraTargetSelection(targetIds, targetType)!;

  render(
    <ActionDropdown trigger={<button type="button">Actions</button>}>
      <ActionDropdownItem label="Other action" />
      <JiraDispatchActionItem label="Send to Jira" payload={{ selection }} />
    </ActionDropdown>,
  );
};

describe("JiraDispatchActionItem", () => {
  beforeEach(() => {
    useJiraDispatchStore.getState().closeJiraDispatch();
  });

  it("opens Jira modal payload for one Finding", async () => {
    // Given
    const user = userEvent.setup();
    renderAction(["finding-1"], JIRA_DISPATCH_TARGET.FINDING_ID);

    // When
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Send to Jira" }));

    // Then
    expect(useJiraDispatchStore.getState().activePayload).toMatchObject({
      selection: { targetId: "finding-1" },
    });
  });

  it("opens Jira modal payload for a Finding Group (the backend dispatches it identically to a single finding)", async () => {
    // Given
    const user = userEvent.setup();
    renderAction(["check-1"], JIRA_DISPATCH_TARGET.CHECK_ID);

    // When
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const jiraAction = screen.getByRole("menuitem", { name: "Send to Jira" });
    expect(jiraAction).not.toHaveAttribute("aria-disabled", "true");
    await user.click(jiraAction);

    // Then
    expect(useJiraDispatchStore.getState().activePayload).toMatchObject({
      selection: { targetId: "check-1" },
    });
  });
});
