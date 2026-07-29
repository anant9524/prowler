"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createIntegration, updateIntegration } from "@/actions/integrations";
import { useToast } from "@/components/shadcn";
import { CustomInput } from "@/components/shadcn/custom";
import { Form } from "@/components/shadcn/form";
import { FormButtons } from "@/components/shadcn/form/form-buttons";
import {
  editJiraServerIntegrationFormSchema,
  IntegrationProps,
  type JiraServerCredentialsPayload,
  jiraServerIntegrationFormSchema,
} from "@/types/integrations";

type CreateValues = z.infer<typeof jiraServerIntegrationFormSchema>;
type EditValues = z.infer<typeof editJiraServerIntegrationFormSchema>;
type FormValues = CreateValues | EditValues;

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

  const form = useForm<FormValues>({
    resolver: zodResolver(
      isCreating
        ? jiraServerIntegrationFormSchema
        : editJiraServerIntegrationFormSchema,
    ),
    defaultValues: {
      integration_type: "jira_server" as const,
      base_url: integration?.attributes.configuration.base_url || "",
      enabled: integration?.attributes.enabled ?? true,
      personal_access_token: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (data: FormValues) => {
    try {
      const formData = new FormData();

      formData.append("integration_type", "jira_server");

      const credentials: JiraServerCredentialsPayload = {};

      if (isEditing) {
        if (data.base_url) credentials.base_url = data.base_url;
        if (data.personal_access_token)
          credentials.personal_access_token = data.personal_access_token;
      } else {
        const createData = data as CreateValues;
        credentials.base_url = createData.base_url;
        credentials.personal_access_token = createData.personal_access_token;
      }

      if (Object.keys(credentials).length > 0) {
        formData.append("credentials", JSON.stringify(credentials));
      }

      if (isCreating) {
        formData.append("configuration", JSON.stringify({}));
        formData.append("providers", JSON.stringify([]));
        formData.append(
          "enabled",
          JSON.stringify((data as CreateValues).enabled),
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

        const shouldTestConnection = true;
        const integrationId =
          "integrationId" in result ? result.integrationId : integration?.id;

        onSuccess(integrationId, shouldTestConnection);
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

  const renderForm = () => {
    return (
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
          label="Personal Access Token"
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
    );
  };

  const getButtonLabel = () => {
    if (isEditing) {
      return "Update Credentials";
    }
    return "Create Integration";
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-4">{renderForm()}</div>
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
