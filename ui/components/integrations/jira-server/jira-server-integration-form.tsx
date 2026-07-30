"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";

import { createIntegration, updateIntegration } from "@/actions/integrations";
import { Button, useToast } from "@/components/shadcn";
import { CustomInput } from "@/components/shadcn/custom";
import { CustomTextarea } from "@/components/shadcn/custom/custom-textarea";
import { Form, FormField, FormMessage } from "@/components/shadcn/form";
import { FormButtons } from "@/components/shadcn/form/form-buttons";
import { EnhancedMultiSelect } from "@/components/shadcn/select/enhanced-multi-select";
import {
  editJiraServerIntegrationFormSchema,
  IntegrationProps,
  type JiraServerCredentialsPayload,
  jiraServerIntegrationFormSchema,
} from "@/types/integrations";

interface ProjectConfigFormValue {
  label?: string;
  project_key: string;
  issue_type: string;
  extra_fields_json?: string;
}

// Superset of the create/edit shapes so every field has a stable path for
// react-hook-form; zodResolver still validates against the correct schema.
type JiraServerFormValues = {
  integration_type: "jira_server";
  base_url?: string;
  personal_access_token?: string;
  enabled?: boolean;
  project_configs?: ProjectConfigFormValue[];
  default_project_key?: string;
};

interface JiraServerIntegrationFormProps {
  integration?: IntegrationProps | null;
  // null means creating a new integration.
  editMode?: "configuration" | "credentials" | null;
  onSuccess: (integrationId?: string, shouldTestConnection?: boolean) => void;
  onCancel: () => void;
}

const stringifyExtraFields = (
  extraFields: Record<string, unknown> | undefined,
): string =>
  extraFields && Object.keys(extraFields).length > 0
    ? JSON.stringify(extraFields, null, 2)
    : "";

export const JiraServerIntegrationForm = ({
  integration,
  editMode = null,
  onSuccess,
  onCancel,
}: JiraServerIntegrationFormProps) => {
  const { toast } = useToast();
  const isEditing = !!integration;
  const isCreating = !isEditing;
  const isEditingConfig = editMode === "configuration";
  const isEditingCredentials = editMode === "credentials";
  // Credentials fields (URL + token) show on create and in the Credentials
  // modal; dispatch targets show only in the Config modal.
  const showCredentialsSection = isCreating || isEditingCredentials;

  const configuration = integration?.attributes.configuration;
  const projects = (configuration?.projects ?? {}) as Record<string, string>;
  const issueTypesByProject = (configuration?.issue_types ?? {}) as Record<
    string,
    string[]
  >;
  const projectEntries = Object.entries(projects);
  // Dispatch targets can only be chosen once a successful connection test has
  // populated the available projects.
  const showDefaults = isEditingConfig && projectEntries.length > 0;

  // Seed the editor from saved project_configs, falling back to the legacy
  // single-default fields so nothing configured before is lost.
  const initialProjectConfigs: ProjectConfigFormValue[] = (() => {
    const saved = configuration?.project_configs;
    if (saved && saved.length > 0) {
      return saved.map((pc) => ({
        label: pc.label || "",
        project_key: pc.project_key,
        issue_type: pc.issue_type,
        extra_fields_json: stringifyExtraFields(pc.extra_fields),
      }));
    }
    if (configuration?.default_project_key) {
      return [
        {
          label: "",
          project_key: configuration.default_project_key,
          issue_type: configuration.default_issue_type || "",
          extra_fields_json: stringifyExtraFields(configuration.extra_fields),
        },
      ];
    }
    return [];
  })();

  const form = useForm<JiraServerFormValues>({
    resolver: zodResolver(
      isCreating
        ? jiraServerIntegrationFormSchema
        : editJiraServerIntegrationFormSchema,
    ),
    defaultValues: {
      integration_type: "jira_server" as const,
      base_url: configuration?.base_url || "",
      enabled: integration?.attributes.enabled ?? true,
      personal_access_token: "",
      project_configs: initialProjectConfigs,
      default_project_key:
        configuration?.default_project_key ||
        initialProjectConfigs[0]?.project_key ||
        "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "project_configs",
  });

  const isLoading = form.formState.isSubmitting;
  const watchedConfigs = form.watch("project_configs") ?? [];
  const defaultProjectKey = form.watch("default_project_key") || "";

  const projectOptions = projectEntries.map(([key, name]) => ({
    value: key,
    label: `${key} - ${name}`,
  }));

  const onSubmit = async (data: JiraServerFormValues) => {
    try {
      const formData = new FormData();
      formData.append("integration_type", "jira_server");

      const credentials: JiraServerCredentialsPayload = {};

      if (isCreating) {
        credentials.base_url = data.base_url;
        credentials.personal_access_token = data.personal_access_token;
      } else if (isEditingCredentials && data.personal_access_token) {
        // Only send credentials when the PAT is actually re-entered; otherwise
        // omit them so the backend keeps the existing ones.
        credentials.personal_access_token = data.personal_access_token;
        if (data.base_url) credentials.base_url = data.base_url;
      }

      if (Object.keys(credentials).length > 0) {
        formData.append("credentials", JSON.stringify(credentials));
      }

      if (isCreating) {
        formData.append("configuration", JSON.stringify({}));
        formData.append("providers", JSON.stringify([]));
        formData.append("enabled", JSON.stringify(data.enabled ?? true));
      } else if (isEditingConfig) {
        const projectConfigs = (data.project_configs ?? [])
          .filter((pc) => pc.project_key && pc.issue_type)
          .map((pc) => ({
            label: pc.label?.trim() || "",
            project_key: pc.project_key,
            issue_type: pc.issue_type,
            extra_fields: pc.extra_fields_json?.trim()
              ? (JSON.parse(pc.extra_fields_json) as Record<string, unknown>)
              : {},
          }));

        const defaultKey =
          data.default_project_key &&
          projectConfigs.some((pc) => pc.project_key === data.default_project_key)
            ? data.default_project_key
            : projectConfigs[0]?.project_key || "";

        formData.append(
          "configuration",
          JSON.stringify({
            project_configs: projectConfigs,
            default_project_key: defaultKey,
          }),
        );
      }

      type IntegrationResult =
        | { success: string; integrationId?: string }
        | { error: string };
      let result: IntegrationResult;
      if (isEditing) {
        result = await updateIntegration(integration.id, formData);
      } else {
        result = await createIntegration(formData);
      }

      if (result && "success" in result && result.success) {
        toast({
          title: "Success!",
          description: `Jira Server integration ${isEditing ? "updated" : "created"} successfully.`,
        });

        // Re-test after a credentials change (or on create) to refresh
        // projects/issue types; a pure dispatch-targets edit doesn't need it.
        const credentialsChanged =
          isCreating || (isEditingCredentials && !!data.personal_access_token);
        const integrationId =
          "integrationId" in result ? result.integrationId : integration?.id;

        onSuccess(integrationId, credentialsChanged);
      } else if (result && "error" in result) {
        toast({
          variant: "destructive",
          title: "Operation Failed",
          description: result.error,
        });
      }
    } catch (_error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to ${isEditing ? "update" : "create"} Jira Server integration. Please try again.`,
      });
    }
  };

  const getButtonLabel = () => {
    if (isCreating) return "Create Integration";
    if (isEditingCredentials) return "Update Credentials";
    return "Save";
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        {/* Inner scroll container (not the dialog itself) so opening a project
            dropdown — whose popover portals into the dialog — doesn't scroll
            the whole modal to the top. */}
        <div className="-mr-1 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {showCredentialsSection && (
            <>
              <CustomInput
                control={form.control}
                name="base_url"
                type="text"
                label="Jira Server URL"
                labelPlacement="inside"
                placeholder="https://jira.yourcompany.com"
                isRequired={isCreating}
                isDisabled={isLoading}
              />

              <CustomInput
                control={form.control}
                name="personal_access_token"
                type="password"
                label={
                  isEditing
                    ? "Personal Access Token (leave blank to keep current)"
                    : "Personal Access Token"
                }
                labelPlacement="inside"
                placeholder="Enter your Jira Personal Access Token"
                isRequired={isCreating}
                isDisabled={isLoading}
              />

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Generate a Personal Access Token from your Jira Server account
                  settings (Profile &gt; Personal Access Tokens).
                </p>
              </div>
            </>
          )}

          {isEditingConfig && projectEntries.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              No projects loaded yet. Test the connection first (from the
              integration card) so the available projects and issue types are
              fetched, then configure your dispatch targets here.
            </div>
          )}

          {showDefaults && (
            <div className="flex flex-col gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <div>
                <h4 className="text-sm font-semibold">Dispatch targets</h4>
                <p className="text-xs text-gray-500 dark:text-gray-300">
                  Configure one or more projects (e.g. INS for Infosec, OPS for
                  DevOps). When sending findings you pick one; the default is
                  pre-selected.
                </p>
              </div>

              {fields.map((fieldItem, index) => {
                const rowProjectKey = watchedConfigs[index]?.project_key || "";
                const rowIssueTypeOptions = (
                  issueTypesByProject[rowProjectKey] ?? []
                ).map((type) => ({ value: type, label: type }));
                const isDefault =
                  !!rowProjectKey && rowProjectKey === defaultProjectKey;

                return (
                  <div
                    key={fieldItem.id}
                    className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {watchedConfigs[index]?.label?.trim() ||
                          `Target ${index + 1}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={isDefault ? "default" : "ghost"}
                          size="sm"
                          disabled={!rowProjectKey || isDefault}
                          onClick={() =>
                            form.setValue("default_project_key", rowProjectKey, {
                              shouldValidate: true,
                            })
                          }
                        >
                          {isDefault ? "Default" : "Set as default"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove project"
                          onClick={() => remove(index)}
                        >
                          <Trash2Icon size={16} />
                        </Button>
                      </div>
                    </div>

                    <CustomInput
                      control={form.control}
                      name={`project_configs.${index}.label`}
                      type="text"
                      label="Alias (optional)"
                      labelPlacement="inside"
                      placeholder="e.g. INS – Anant, OPS – Prince"
                      isRequired={false}
                      isDisabled={isLoading}
                    />

                    <FormField
                      control={form.control}
                      name={`project_configs.${index}.project_key`}
                      render={({ field }) => (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-text-neutral-secondary text-xs font-light tracking-tight">
                            Project
                          </label>
                          <EnhancedMultiSelect
                            options={projectOptions}
                            onValueChange={(values) => {
                              const nextKey = values.at(-1) ?? "";
                              const prevKey = field.value;
                              field.onChange(nextKey);
                              form.setValue(
                                `project_configs.${index}.issue_type`,
                                "",
                              );
                              // Keep the default pointer in sync if this row was
                              // the default.
                              if (prevKey && prevKey === defaultProjectKey) {
                                form.setValue("default_project_key", nextKey);
                              }
                            }}
                            defaultValue={field.value ? [field.value] : []}
                            placeholder="Select a project"
                            preventAutoFocus
                            searchable
                            emptyIndicator="No projects found."
                            disabled={isLoading}
                            hideSelectAll
                            maxCount={1}
                            closeOnSelect
                            resetOnDefaultValueChange
                          />
                          <FormMessage className="text-text-error text-xs" />
                        </div>
                      )}
                    />

                    {rowProjectKey && (
                      <FormField
                        control={form.control}
                        name={`project_configs.${index}.issue_type`}
                        render={({ field }) => (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-text-neutral-secondary text-xs font-light tracking-tight">
                              Issue Type
                            </label>
                            <EnhancedMultiSelect
                              options={rowIssueTypeOptions}
                              onValueChange={(values) =>
                                field.onChange(values.at(-1) ?? "")
                              }
                              defaultValue={field.value ? [field.value] : []}
                              placeholder="Select an issue type"
                              preventAutoFocus
                              searchable
                              emptyIndicator="No issue types found."
                              disabled={isLoading}
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

                    <CustomTextarea
                      control={form.control}
                      name={`project_configs.${index}.extra_fields_json`}
                      label="Additional required fields (JSON)"
                      labelPlacement="inside"
                      placeholder={
                        '{\n  "customfield_10111": {"value": "InfoSec"},\n  "customfield_10136": {"value": "Task"}\n}'
                      }
                      minRows={4}
                      description="Merged into issues filed into this project, in the exact shape Jira's create API expects. Leave blank if this project mandates no extra fields."
                    />
                  </div>
                );
              })}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      project_key: "",
                      issue_type: "",
                      extra_fields_json: "",
                    })
                  }
                >
                  <PlusIcon size={16} />
                  Add project
                </Button>
              </div>
            </div>
          )}
        </div>

        <FormButtons
          setIsOpen={() => {}}
          onCancel={onCancel}
          submitText={getButtonLabel()}
          cancelText="Cancel"
          loadingText="Processing..."
          isDisabled={isLoading}
        />
      </form>
    </Form>
  );
};
