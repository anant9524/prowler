import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AwsMethodSelector } from "./aws-method-selector";

describe("AwsMethodSelector", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables AWS Organizations with a Cloud badge in Local Server", async () => {
    // Given
    vi.stubEnv("UI_CLOUD_ENABLED", "false");
    const user = userEvent.setup();
    const onSelectOrganizations = vi.fn();

    // When
    render(
      <AwsMethodSelector
        onSelectSingle={vi.fn()}
        onSelectOrganizations={onSelectOrganizations}
      />,
    );
    const option = screen.getByRole("radio", {
      name: /add multiple accounts with aws organizations/i,
    });

    // Then
    expect(option).toBeDisabled();
    expect(screen.getByText("Cloud")).toBeVisible();

    await user.click(option);
    expect(onSelectOrganizations).not.toHaveBeenCalled();
  });
});
