import {
  LighthouseSettings,
  LLMProvidersTable,
} from "@/components/lighthouse-v1";
import { ContentLayout } from "@/components/shadcn/content-layout";

export const dynamic = "force-dynamic";

export default async function LighthouseSettingsPage() {
  return (
    <ContentLayout title="Settings">
      <LLMProvidersTable />
      <div className="h-8" aria-hidden="true" />
      <LighthouseSettings />
    </ContentLayout>
  );
}
