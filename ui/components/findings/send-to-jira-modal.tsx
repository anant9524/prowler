"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  getJiraIntegrations,
  getJiraIssueTypes,
} from "@/actions/integrations/jira-dispatch";
import { CustomBanner } from "@/components/shadcn/custom/custom-banner";
import { CustomRadio } from "@/components/shadcn/custom/custom-radio";
import { Form, FormField, FormMessage } from "@/components/shadcn/form";
import { FormButtons } from "@/components/shadcn/form/form-buttons";
import { Modal } from "@/components/shadcn/modal";
import { RadioGroup } from "@/components/shadcn/radio-group/radio-group";
import { EnhancedMultiSelect } from "@/components/shadcn/select/enhanced-multi-select";
import { Skeleton } from "@/components/shadcn/skeleton/skeleton";
import { toast, ToastAction } from "@/components/shadcn/toast";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
  executeJiraDispatchBatches,
  type JiraDispatchSettings,
} from "@/lib/jira-dispatch-execution";
import { getJiraSelectionBatches } from "@/lib/jira-dispatch-selection";
import {
  type IntegrationProps,
  JIRA_DISPATCH_MODE,
  JIRA_DISPATCH_TARGET,
  type JiraDispatchMode,
  type JiraDispatchTargetBatch,
  type JiraSelection,
} from "@/types/integrations";

import {
  buildJiraDispatchChoiceCopy,
  JIRA_SELECTION_KIND,
} from "./send-to-jira-modal-copy";

export interface SendToJiraModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selection: JiraSelection;
  findingTitle?: string;
  defaultDispatchMode?: JiraDispatchMode;
  canChooseGroupedDispatch?: boolean;
  isFindingGroupSelection?: boolean;
  selectedResourceCount?: number;
  description?: string;
}

const sendToJiraSchema = z.object({
  integration: z.string().min(1, "Please select a Jira integration"),
  project: z.string().min(1, "Please select a project"),
  issueType: z.string().min(1, "Please select an issue type"),
  dispatchMode: z.enum([
    JIRA_DISPATCH_MODE.GROUPED,
    JIRA_DISPATCH_MODE.INDIVIDUAL,
  ]),
});

type SendToJiraFormData = z.infer<typeof sendToJiraSchema>;

const getConfiguredIssueTypes = (
  integration: IntegrationProps | undefined,
  projectKey: string,
) => {
  const configuredIssueTypes = integration?.attributes.configuration
    .issue_types as Record<string, string[]> | undefined;

  return configuredIssueTypes &&
    typeof configuredIssueTypes === "object" &&
    !Array.isArray(configuredIssueTypes)
    ? (configuredIssueTypes[projectKey] ?? [])
    : [];
};

const SendToJiraModalContent = ({
  onOpenChange,
  selection,
  findingTitle,
  defaultDispatchMode = JIRA_DISPATCH_MODE.INDIVIDUAL,
  canChooseGroupedDispatch = false,
  isFindingGroupSelection = false,
  selectedResourceCount,
  description,
}: Omit<SendToJiraModalProps, "isOpen">) => {
  const [integrations, setIntegrations] = useState<IntegrationProps[]>([]);
  const [isFetchingIntegrations, setIsFetchingIntegrations] = useState(true);
  const [fetchedIssueTypes, setFetchedIssueTypes] = useState<
    Record<string, string[]>
  >({});
  const [isFetchingIssueTypes, setIsFetchingIssueTypes] = useState(false);
  // Jira Server: index (into serverProjectConfigs) of the chosen target, and
  // that target's required-fields JSON to send with the dispatch.
  const [serverConfigIndex, setServerConfigIndex] = useState<string>("");
  const [serverExtraFields, setServerExtraFields] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const serverAutoSelectedForRef = useRef<string | null>(null);

  const form = useForm<SendToJiraFormData>({
    resolver: zodResolver(sendToJiraSchema),
    defaultValues: {
      integration: "",
      project: "",
      issueType: "",
      dispatchMode: defaultDispatchMode,
    },
  });

  const jiraTargetBatches = getJiraSelectionBatches(selection);
  const findingTargetCount = jiraTargetBatches
    .filter((batch) => batch.targetType === JIRA_DISPATCH_TARGET.FINDING_ID)
    .reduce((count, batch) => count + batch.targetIds.length, 0);
  const jiraSelectedResourceCount = selectedResourceCount ?? findingTargetCount;
  const shouldShowDispatchChoice =
    (canChooseGroupedDispatch || findingTargetCount > 1) &&
    (findingTargetCount > 1 || jiraSelectedResourceCount > 1);
  const checkIdBatches = jiraTargetBatches.filter(
    (batch) => batch.targetType === JIRA_DISPATCH_TARGET.CHECK_ID,
  );
  const hasOnlySingleFindingGroupBatch =
    jiraTargetBatches.length === 1 &&
    checkIdBatches.length === 1 &&
    checkIdBatches[0].targetIds.length === 1;
  const isSelectedFindingGroupFlow =
    shouldShowDispatchChoice &&
    (isFindingGroupSelection || hasOnlySingleFindingGroupBatch);
  const jiraDispatchChoiceCopy = buildJiraDispatchChoiceCopy({
    selectedCount:
      findingTargetCount > 1 ? findingTargetCount : jiraSelectedResourceCount,
    isSelectedFindingGroupFlow,
    selectionKind:
      findingTargetCount > 1
        ? JIRA_SELECTION_KIND.FINDINGS
        : JIRA_SELECTION_KIND.RESOURCES,
  });

  const selectedIntegration = form.watch("integration");
  const selectedProject = form.watch("project");
  const selectedIntegrationData = integrations.find(
    (integration) => integration.id === selectedIntegration,
  );
  const projects =
    selectedIntegrationData?.attributes.configuration.projects ?? {};
  const projectEntries = Object.entries(projects);
  const configuredIssueTypes = getConfiguredIssueTypes(
    selectedIntegrationData,
    selectedProject,
  );
  const issueTypesForProject =
    configuredIssueTypes.length > 0
      ? configuredIssueTypes
      : (fetchedIssueTypes[`${selectedIntegration}:${selectedProject}`] ?? []);
  const hasConnectedIntegration = integrations.some(
    (integration) => integration.attributes.connected === true,
  );

  // Jira Server integrations carry one or more configured dispatch targets
  // (alias + project + issue type + required fields). The user picks a target
  // here instead of raw project/issue-type dropdowns; the default is
  // pre-selected. Targets are addressed by index so several targets for the
  // same project (e.g. different assignees) stay distinct.
  const serverProjectConfigs: Array<{
    label?: string;
    project_key: string;
    issue_type: string;
    extra_fields?: Record<string, unknown>;
  }> = (() => {
    if (
      selectedIntegrationData?.attributes.integration_type !== "jira_server"
    ) {
      return [];
    }
    const config = selectedIntegrationData.attributes.configuration;
    if (config.project_configs && config.project_configs.length > 0) {
      return config.project_configs;
    }
    // Backward compatibility with the pre-multi-project single-default shape.
    if (config.default_project_key) {
      return [
        {
          project_key: config.default_project_key,
          issue_type: config.default_issue_type || "",
          extra_fields: config.extra_fields,
        },
      ];
    }
    return [];
  })();
  const useServerProjectPicker = serverProjectConfigs.length > 0;
  const serverDefaultProjectKey =
    (selectedIntegrationData?.attributes.integration_type === "jira_server"
      ? selectedIntegrationData.attributes.configuration.default_project_key
      : "") || "";

  const serverConfigLabel = (
    config: (typeof serverProjectConfigs)[number],
  ): string => {
    if (config.label?.trim()) return config.label;
    const name = projects[config.project_key];
    return name
      ? `${config.project_key} - ${name} (${config.issue_type})`
      : `${config.project_key} (${config.issue_type})`;
  };

  const selectServerConfig = (indexValue: string) => {
    setServerConfigIndex(indexValue);
    const config =
      indexValue === "" ? undefined : serverProjectConfigs[Number(indexValue)];
    setServerExtraFields(config?.extra_fields);
    form.setValue("project", config?.project_key ?? "", {
      shouldValidate: true,
    });
    form.setValue("issueType", config?.issue_type ?? "", {
      shouldValidate: true,
    });
  };

  // Pre-select the default target once per chosen integration. Keyed on the
  // integration id so a later manual clear is respected (not re-filled).
  useEffect(() => {
    if (!useServerProjectPicker) {
      serverAutoSelectedForRef.current = null;
      return;
    }
    if (serverAutoSelectedForRef.current === selectedIntegration) return;
    serverAutoSelectedForRef.current = selectedIntegration;
    const defaultIndex = serverProjectConfigs.findIndex(
      (pc) => pc.project_key === serverDefaultProjectKey,
    );
    selectServerConfig(String(defaultIndex >= 0 ? defaultIndex : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServerProjectPicker, selectedIntegration, serverDefaultProjectKey]);

  useMountEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await getJiraIntegrations();
        if (!active) return;
        if (!result.success) {
          throw new Error(result.error || "Unable to fetch Jira integrations");
        }

        setIntegrations(result.data);
        if (result.data.length === 1) {
          form.setValue("integration", result.data[0].id);
        }
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Failed to load Jira integrations";
        toast({
          variant: "destructive",
          title: "Failed to load integrations",
          description: message,
        });
      } finally {
        if (active) setIsFetchingIntegrations(false);
      }
    })();

    return () => {
      active = false;
    };
  });

  const setOpenForFormButtons: Dispatch<SetStateAction<boolean>> = (value) => {
    const nextOpen = typeof value === "function" ? value(true) : value;
    onOpenChange(nextOpen);
  };

  const loadIssueTypes = async (integrationId: string, projectKey: string) => {
    const integration = integrations.find((item) => item.id === integrationId);
    if (
      !integrationId ||
      !projectKey ||
      getConfiguredIssueTypes(integration, projectKey).length > 0 ||
      fetchedIssueTypes[`${integrationId}:${projectKey}`]
    ) {
      return;
    }

    setIsFetchingIssueTypes(true);
    try {
      const result = await getJiraIssueTypes(integrationId, projectKey);
      if (result.success) {
        setFetchedIssueTypes((current) => ({
          ...current,
          [`${integrationId}:${projectKey}`]: result.issueTypes,
        }));
        return;
      }

      toast({
        variant: "destructive",
        title: "Failed to load issue types",
        description:
          result.error || "Unable to fetch issue types for this project",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to load issue types",
        description: "Unable to fetch issue types for this project",
      });
    } finally {
      setIsFetchingIssueTypes(false);
    }
  };

  async function processBatches(
    batches: JiraDispatchTargetBatch[],
    settings: JiraDispatchSettings,
  ) {
    const result = await executeJiraDispatchBatches(batches, settings);
    const retryBatches = result.retryBatch ? [result.retryBatch] : [];
    const retryAction =
      retryBatches.length > 0 ? (
        <ToastAction
          altText="Retry failed Jira dispatches"
          onClick={async () => {
            toast({
              title: "Retry started",
              description: "Retrying only the Jira dispatches that failed.",
            });
            await processBatches(retryBatches, settings);
          }}
        >
          Retry failed
        </ToastAction>
      ) : undefined;

    if (result.errors.length > 0 || result.warnings.length > 0) {
      if (result.successfulTaskCount > 0) {
        toast({
          title: "Partial success",
          description: `${result.successMessage || "Some Jira issues were created successfully."} Some Jira dispatches failed: ${[
            ...result.warnings,
            ...result.errors,
          ].join(" ")}`,
          ...(retryAction ? { action: retryAction } : {}),
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Error",
        description: [...result.warnings, ...result.errors].join(" "),
        ...(retryAction ? { action: retryAction } : {}),
      });
      return;
    }

    toast({
      title: "Success!",
      description: result.successMessage || "Finding sent to Jira successfully",
    });
  }

  const handleSubmit = async (data: SendToJiraFormData) => {
    onOpenChange(false);

    void processBatches(jiraTargetBatches, {
      integrationId: data.integration,
      projectKey: data.project,
      issueType: data.issueType,
      dispatchMode: data.dispatchMode,
      extraFields: useServerProjectPicker ? serverExtraFields : undefined,
    }).catch(() => {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "The Jira dispatch could not be processed. Check Jira before retrying.",
      });
    });
  };

  const issueTypeOptions = issueTypesForProject.map((type) => ({
    value: type,
    label: type,
  }));
  const integrationOptions = integrations.map((integration) => {
    const { integration_type, configuration } = integration.attributes;
    const target =
      integration_type === "jira_server"
        ? configuration.base_url
        : configuration.domain;
    const typeLabel =
      integration_type === "jira_server" ? "Jira Server" : "Jira Cloud";

    return {
      value: integration.id,
      label: target ? `${target} (${typeLabel})` : `${typeLabel} - ${integration.id}`,
    };
  });
  const projectOptions = projectEntries.map(([key, name]) => ({
    value: key,
    label: `${key} - ${name}`,
  }));

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title="Send Finding to Jira"
      description={
        description
          ? description
          : shouldShowDispatchChoice
            ? jiraDispatchChoiceCopy.description
            : findingTitle
              ? `Create a Jira issue for: "${findingTitle}"`
              : "Select integration, project and issue type to create a Jira issue"
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-4"
        >
          {isFetchingIntegrations && (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          )}

          {!isFetchingIntegrations && integrations.length > 1 && (
            <FormField
              control={form.control}
              name="integration"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="jira-integration-select"
                    className="text-text-neutral-secondary text-xs font-light tracking-tight"
                  >
                    Jira Integration
                  </label>
                  <EnhancedMultiSelect
                    id="jira-integration-select"
                    options={integrationOptions}
                    onValueChange={(values) => {
                      field.onChange(values.at(-1) ?? "");
                      form.setValue("project", "");
                      form.setValue("issueType", "");
                      setFetchedIssueTypes({});
                    }}
                    defaultValue={field.value ? [field.value] : []}
                    placeholder="Select a Jira integration"
                    searchable
                    emptyIndicator="No integrations found."
                    disabled={isFetchingIntegrations}
                    hideSelectAll
                    maxCount={1}
                    closeOnSelect
                    resetOnDefaultValueChange
                  />
                  <FormMessage className="text-text-error text-xs" />
                </div>
              )}
            />
          )}

          {!isFetchingIntegrations &&
            selectedIntegration &&
            useServerProjectPicker && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="jira-server-project-select"
                  className="text-text-neutral-secondary text-xs font-light tracking-tight"
                >
                  Jira Project
                </label>
                <EnhancedMultiSelect
                  id="jira-server-project-select"
                  options={serverProjectConfigs.map((pc, index) => ({
                    value: String(index),
                    label: serverConfigLabel(pc),
                  }))}
                  onValueChange={(values) =>
                    selectServerConfig(values.at(-1) ?? "")
                  }
                  defaultValue={serverConfigIndex ? [serverConfigIndex] : []}
                  placeholder="Select a project"
                  searchable
                  emptyIndicator="No projects configured."
                  hideSelectAll
                  maxCount={1}
                  closeOnSelect
                  resetOnDefaultValueChange
                />
              </div>
            )}

          {!isFetchingIntegrations &&
            selectedIntegration &&
            !useServerProjectPicker &&
            projectEntries.length > 0 && (
              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="jira-project-select"
                      className="text-text-neutral-secondary text-xs font-light tracking-tight"
                    >
                      Project
                    </label>
                    <EnhancedMultiSelect
                      id="jira-project-select"
                      options={projectOptions}
                      onValueChange={(values) => {
                        const projectKey = values.at(-1) ?? "";
                        field.onChange(projectKey);
                        form.setValue("issueType", "");
                        void loadIssueTypes(selectedIntegration, projectKey);
                      }}
                      defaultValue={field.value ? [field.value] : []}
                      placeholder="Select a Jira project"
                      searchable
                      emptyIndicator="No projects found."
                      hideSelectAll
                      maxCount={1}
                      closeOnSelect
                      resetOnDefaultValueChange
                    />
                    <FormMessage className="text-text-error text-xs" />
                  </div>
                )}
              />
            )}

          {selectedProject && !useServerProjectPicker && (
            <FormField
              control={form.control}
              name="issueType"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="jira-issue-type-select"
                    className="text-text-neutral-secondary text-xs font-light tracking-tight"
                  >
                    Issue Type
                  </label>
                  <EnhancedMultiSelect
                    id="jira-issue-type-select"
                    options={issueTypeOptions}
                    onValueChange={(values) =>
                      field.onChange(values.at(-1) ?? "")
                    }
                    defaultValue={field.value ? [field.value] : []}
                    placeholder={
                      isFetchingIssueTypes
                        ? "Loading issue types..."
                        : "Select an issue type"
                    }
                    searchable
                    emptyIndicator="No issue types found."
                    disabled={isFetchingIssueTypes}
                    hideSelectAll
                    maxCount={1}
                    closeOnSelect
                    resetOnDefaultValueChange
                  />
                  <FormMessage className="text-text-error text-xs" />
                </div>
              )}
            />
          )}

          {shouldShowDispatchChoice && (
            <FormField
              control={form.control}
              name="dispatchMode"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <span className="text-text-neutral-secondary text-xs font-light tracking-tight">
                    Jira issue creation mode
                  </span>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <CustomRadio
                      value={JIRA_DISPATCH_MODE.GROUPED}
                      ariaLabel="Create one Jira issue"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="text-text-neutral-primary text-sm font-medium">
                          {jiraDispatchChoiceCopy.groupedTitle}
                        </span>
                        <span className="text-text-neutral-secondary text-xs">
                          {jiraDispatchChoiceCopy.groupedHelp}
                        </span>
                      </span>
                    </CustomRadio>
                    <CustomRadio
                      value={JIRA_DISPATCH_MODE.INDIVIDUAL}
                      ariaLabel="Create separate Jira issues"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="text-text-neutral-primary text-sm font-medium">
                          Create separate Jira issues
                        </span>
                        <span className="text-text-neutral-secondary text-xs">
                          {jiraDispatchChoiceCopy.individualHelp}
                        </span>
                      </span>
                    </CustomRadio>
                  </RadioGroup>
                  <FormMessage className="text-text-error text-xs" />
                </div>
              )}
            />
          )}

          {!isFetchingIntegrations &&
          (integrations.length === 0 || !hasConnectedIntegration) ? (
            <CustomBanner
              title="Jira integration is not available"
              message="Please add or connect an integration first"
              buttonLabel="Configure"
              buttonLink="/integrations/jira"
              onButtonClick={() => onOpenChange(false)}
            />
          ) : (
            <FormButtons
              setIsOpen={setOpenForFormButtons}
              onCancel={() => onOpenChange(false)}
              submitText="Send to Jira"
              cancelText="Cancel"
              loadingText="Sending..."
              isDisabled={
                !form.formState.isValid ||
                form.formState.isSubmitting ||
                isFetchingIntegrations ||
                isFetchingIssueTypes ||
                integrations.length === 0 ||
                !hasConnectedIntegration
              }
              rightIcon={<Send size={20} />}
            />
          )}
        </form>
      </Form>
    </Modal>
  );
};

export const SendToJiraModal = ({ isOpen, ...props }: SendToJiraModalProps) => {
  if (!isOpen) return null;

  return <SendToJiraModalContent {...props} />;
};
