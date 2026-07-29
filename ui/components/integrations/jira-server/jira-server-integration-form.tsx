"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createIntegration, updateIntegration } from "@/actions/integrations";
import { useToast } from "@/components/shadcn";
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

// Superset of the create/edit shapes so every field has a stable path for
// react-hook-form; zodResolver still validates against the correct schema.
type JiraServerFormValues = {
  integration_type: "jira_server";
  base_url?: string;
  personal_access_token?: string;
  enabled?: boolean;
  default_project_key?: string;
  default_issue_type?: string;
  extra_fields_json?: string;
};

interface JiraServerIntegrationFormProps {
  integration?: IntegrationProps | null;
  onSuccess: (integrationId?: string, shouldTestConnection?: boolean) => void;
  onCancel: () => void;
}

export const JiraServerIntegrationForm = ({
  integration,
  onSuccess,
  onCancel,
}: JiraServerIntegrationFormProps) => {
  const { toast } = useToast();
  const isEditing = !!integration;
  const isCreating = !isEditing;

  const configuration = integration?.attributes.configuration;
  const projects = (configuration?.projects ?? {}) as Record<string, string>;
  const issueTypesByProject = (configuration?.issue_types ?? {}) as Record<
    string,
    string[]
  >;
  const projectEntries = Object.entries(projects);
  // Defaults can only be chosen once a successful connection test has
  // populated the available projects.
  const showDefaults = isEditing && projectEntries.length > 0;

  const existingExtraFields = configuration?.extra_fields;
  const existingExtraFieldsJson =
    existingExtraFields && Object.keys(existingExtraFields).length > 0
      ? JSON.stringify(existingExtraFields, null, 2)
      : "";

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
      default_project_key: configuration?.default_project_key || "",
      default_issue_type: configuration?.default_issue_type || "",
      extra_fields_json: existingExtraFieldsJson,
    },
  });

  const isLoading = form.formState.isSubmitting;

  const selectedDefaultProject = form.watch("default_project_key") || "";
  const issueTypeOptions = (issueTypesByProject[selectedDefaultProject] ?? [])
    .map((type) => ({ value: type, label: type }));
  const projectOptions = projectEntries.map(([key, name]) => ({
    value: key,
    label: `${key} - ${name}`,
  }));

  const onSubmit = async (data: JiraServerFormValues) => {
    try {
      const formData = new FormData();

      formData.append("integration_type", "jira_server");

      const credentials: JiraServerCredentialsPayload = {};

      if (isEditing) {
        if (data.base_url) credentials.base_url = data.base_url;
        if (data.personal_access_token)
          credentials.personal_access_token = data.personal_access_token;
      } else {
        credentials.base_url = data.base_url;
        credentials.personal_access_token = data.personal_access_token;
      }

      if (Object.keys(credentials).length > 0) {
        formData.append("credentials", JSON.stringify(credentials));
      }

      if (isCreating) {
        formData.append("configuration", JSON.stringify({}));
        formData.append("providers", JSON.stringify([]));
        formData.append("enabled", JSON.stringify(data.enabled ?? true));
      } else if (showDefaults) {
        // Persist dispatch defaults so findings can be filed with one click.
        const extraFields = data.extra_fields_json?.trim()
          ? (JSON.parse(data.extra_fields_json) as Record<string, unknown>)
          : {};
        formData.append(
          "configuration",
          JSON.stringify({
            default_project_key: data.default_project_key || "",
            default_issue_type: data.default_issue_type || "",
            extra_fields: extraFields,
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
        // projects/issue types; a pure defaults edit doesn't need it.
        const credentialsChanged =
          isCreating || !!data.personal_access_token || !!data.base_url;
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
    if (isEditing) {
      return "Save";
    }
    return "Create Integration";
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-4">
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

          {showDefaults && (
            <div className="flex flex-col gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <div>
                <h4 className="text-sm font-semibold">Dispatch defaults</h4>
                <p className="text-xs text-gray-500 dark:text-gray-300">
                  Set once so findings are filed with a single click — no
                  per-finding project or issue-type selection.
                </p>
              </div>

              <FormField
                control={form.control}
                name="default_project_key"
                render={({ field }) => (
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="jira-server-default-project"
                      className="text-text-neutral-secondary text-xs font-light tracking-tight"
                    >
                      Default Project
                    </label>
                    <EnhancedMultiSelect
                      id="jira-server-default-project"
                      options={projectOptions}
                      onValueChange={(values) => {
                        field.onChange(values.at(-1) ?? "");
                        form.setValue("default_issue_type", "");
                      }}
                      defaultValue={field.value ? [field.value] : []}
                      placeholder="Select a default project"
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

              {selectedDefaultProject && (
                <FormField
                  control={form.control}
                  name="default_issue_type"
                  render={({ field }) => (
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="jira-server-default-issue-type"
                        className="text-text-neutral-secondary text-xs font-light tracking-tight"
                      >
                        Default Issue Type
                      </label>
                      <EnhancedMultiSelect
                        id="jira-server-default-issue-type"
                        options={issueTypeOptions}
                        onValueChange={(values) =>
                          field.onChange(values.at(-1) ?? "")
                        }
                        defaultValue={field.value ? [field.value] : []}
                        placeholder="Select a default issue type"
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
                name="extra_fields_json"
                label="Additional required fields (JSON)"
                labelPlacement="inside"
                placeholder={
                  '{\n  "customfield_10111": {"value": "InfoSec"},\n  "customfield_10136": {"value": "Task"}\n}'
                }
                isRequired={false}
                minRows={4}
                description={
                  "Merged into every created issue, in the exact shape Jira's create API expects. Use this to satisfy project-mandatory fields (assignee, Pod, Task Type, Request Type, etc.). Leave blank if the project has none."
                }
              />
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
