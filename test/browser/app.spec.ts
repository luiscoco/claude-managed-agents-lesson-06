import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Reset demo fixtures", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Demo fixtures reset");
});
test("guided branch review compares histories, reconciles preview and keeps parent scope", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Run guided walkthrough" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Selected thread paused: end_turn",
  );
  await expect(page.locator("#thread-count")).toHaveText("4 threads");
  await expect(page.locator("#conversation .case-message")).toHaveCount(3);
  await expect(page.locator("#comparison")).toContainText("Research findings");
  await expect(page.locator("#comparison")).toContainText(
    "Troubleshooting findings",
  );
  await expect(
    page.locator("#conversation pre code .hljs-keyword").first(),
  ).toBeVisible();
  await expect(page.locator("#identity")).toContainText(
    "demo_session_launch_research",
  );
  await page
    .getByRole("button", { name: "Read branch history", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Persisted history loaded",
  );
  await expect(page.locator("#conversation .case-message")).toHaveCount(3);
});
test("page size one and parent switching preserve isolated views and primary protection", async ({
  page,
}) => {
  await page.locator("#page-size").fill("1");
  await page
    .getByRole("button", { name: "List threads across all pages", exact: true })
    .click();
  await expect(page.locator("#thread-count")).toHaveText("4 threads");
  await page
    .locator("#thread-select")
    .selectOption("demo_session_launch_primary");
  await expect(page.getByRole("status")).toContainText("Scoped details");
  await page.locator(".archive-panel summary").click();
  await expect(page.locator("#archive-note")).toContainText(
    "Primary thread protected",
  );
  await expect(
    page.getByRole("button", { name: "Archive selected child", exact: true }),
  ).toBeDisabled();
  await page.locator("#parent-session").selectOption("demo_session_api");
  await expect(page.locator("#conversation")).not.toContainText(
    "Coordinator overview",
  );
  await page
    .getByRole("button", { name: "List threads across all pages", exact: true })
    .click();
  await page
    .locator("#thread-select")
    .selectOption("demo_session_api_research");
  await expect(page.getByRole("status")).toContainText("Scoped details");
  await expect(page.locator("#identity")).toContainText(
    "demo_session_api_research",
  );
  await page.locator("#status-filter").selectOption("running");
  await page
    .getByRole("button", { name: "List threads across all pages", exact: true })
    .click();
  await expect(page.locator("#thread-count")).toHaveText("0 threads");
});
test("close observation without archival, then deliberately archive an idle child and inspect history", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "List threads across all pages", exact: true })
    .click();
  await page
    .locator("#thread-select")
    .selectOption("demo_session_launch_drafting");
  await expect(page.getByRole("status")).toContainText("Scoped details");
  await page
    .getByRole("button", { name: "Watch selected thread", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop observation only", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Stop observation only", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Managed work was not interrupted",
  );
  await page.locator(".archive-panel summary").click();
  await expect(
    page.getByRole("button", { name: "Archive selected child", exact: true }),
  ).toBeDisabled();
  await page
    .locator("#archive-name")
    .fill("ARCHIVE demo_session_launch_drafting");
  await page
    .getByRole("button", { name: "Archive selected child", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Child thread archived");
  await expect(page.locator("#thread-status")).toContainText("terminated");
  await page
    .getByRole("button", { name: "Read branch history", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Persisted history loaded",
  );
  await expect(page.locator("#conversation")).toContainText(
    "Drafting findings",
  );
});
test("every API and parameter card includes colored code", async ({ page }) => {
  await page.getByRole("tab", { name: /02/ }).click();
  const cards = page.locator(".namespace-grid article");
  await expect(cards).toHaveCount(12);
  for (const card of await cards.all()) {
    await card.locator("summary").click();
    await expect(card.locator("pre code[data-highlighted=true]")).toBeVisible();
    expect(await card.locator("pre code span").count()).toBeGreaterThan(0);
  }
});
test("UML step inspection, keyboard tabs, quiz and Larger layout", async ({
  page,
}) => {
  await page.getByRole("tab", { name: /03/ }).click();
  await expect(
    page.getByRole("img", { name: "UML component architecture" }),
  ).toBeVisible();
  await page
    .getByText("Explore the full UML thread inspection workflow", {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("img", { name: "UML thread inspection workflow" }),
  ).toBeVisible();
  await page.locator(".workflow-step-buttons button").nth(5).click();
  await expect(page.locator(".workflow-step-detail")).toContainText(
    "Compare focused histories",
  );
  await expect(
    page.locator(".workflow-step-detail pre code .hljs-keyword").first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: /03/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /04/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .locator("fieldset")
    .first()
    .getByText("Session ID and thread ID", { exact: true })
    .click();
  await expect(page.locator("#score")).toContainText("1 / 6");
  await page.getByRole("button", { name: "Larger", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});
