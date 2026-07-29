"use client";

import { SettingsIcon } from "lucide-react";
import Link from "next/link";

import { JiraIcon } from "@/components/icons/services/IconServices";
import { Button, Card, CardContent, CardHeader } from "@/components/shadcn";

export const JiraServerIntegrationCard = () => {
  return (
    <Card variant="base" padding="lg">
      <CardHeader>
        <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <JiraIcon size={40} />
            <div className="flex flex-col gap-1">
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Jira Server
              </h4>
              <p className="text-xs text-nowrap text-gray-500 dark:text-gray-300">
                Create and manage security issues in a self-hosted Jira.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button asChild size="sm">
              <Link href="/integrations/jira-server">
                <SettingsIcon size={14} />
                Manage
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Configure and manage your self-hosted Jira Server / Data Center
          integrations to automatically create issues for security findings
          in your Jira projects.
        </p>
      </CardContent>
    </Card>
  );
};
