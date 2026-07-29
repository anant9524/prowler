import { afterEach, describe, expect, it, vi } from "vitest";

const importFresh = async () => {
  vi.resetModules();
  return import("./deployment");
};

describe("enterprise feature flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps grouped Jira dispatch enabled everywhere: the backend dispatches findings identically regardless of count", async () => {
    // Given
    vi.stubEnv("UI_CLOUD_ENABLED", "false");

    // When
    const { isGroupedJiraDispatchEnabled } = await importFresh();

    // Then
    expect(isGroupedJiraDispatchEnabled()).toBe(true);
  });

  it("stays enabled in cloud too", async () => {
    // Given
    vi.stubEnv("UI_CLOUD_ENABLED", "true");

    // When
    const { isGroupedJiraDispatchEnabled } = await importFresh();

    // Then
    expect(isGroupedJiraDispatchEnabled()).toBe(true);
  });
});
