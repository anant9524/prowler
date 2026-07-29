"use client";

import { JiraIcon } from "@/components/icons/services/IconServices";
import { ActionDropdownItem } from "@/components/shadcn/dropdown";
import {
  isGroupedJiraDispatchEnabled,
  PROWLER_CLOUD_ONLY_TOOLTIP,
} from "@/lib/deployment";
import { getJiraDispatchActionState } from "@/lib/jira-dispatch-action";
import { useJiraDispatchStore } from "@/store";
import type { JiraDispatchModalPayload } from "@/types/jira-dispatch";

interface JiraDispatchActionItemProps {
  label: string;
  payload: JiraDispatchModalPayload | null | undefined;
}

export const JiraDispatchActionItem = ({
  label,
  payload,
}: JiraDispatchActionItemProps) => {
  const openJiraDispatch = useJiraDispatchStore(
    (state) => state.openJiraDispatch,
  );

  if (!payload) return null;

  const { requiresUpgrade } = getJiraDispatchActionState(
    payload,
    isGroupedJiraDispatchEnabled(),
  );

  return (
    <ActionDropdownItem
      icon={<JiraIcon size={20} />}
      label={label}
      aria-label={label}
      disabled={requiresUpgrade}
      disabledTooltip={PROWLER_CLOUD_ONLY_TOOLTIP}
      onSelect={() => openJiraDispatch(payload)}
    />
  );
};
