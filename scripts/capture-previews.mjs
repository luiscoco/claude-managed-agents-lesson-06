import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(process.env.PREVIEW_URL ?? "http://127.0.0.1:4326");
    await page
      .getByRole("button", { name: "Reset demo fixtures", exact: true })
      .click();
    await page.getByRole("button", { name: "Run guided walkthrough" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Selected thread paused: end_turn" })
      .waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `docs/${name}.png`, fullPage: true });
    if (name === "desktop") {
      await page
        .locator(".version-comparison")
        .screenshot({ path: "docs/history-comparison.png" });
      await page.getByRole("tab", { name: "02 · API & configuration" }).click();
      for (const summary of await page.locator(".namespace-grid summary").all())
        await summary.click();
      await page.screenshot({
        path: "docs/api-and-configuration.png",
        fullPage: true,
      });
      await page.getByRole("tab", { name: "03 · How it works" }).click();
      await page.screenshot({ path: "docs/how-it-works.png", fullPage: true });
      await page
        .locator(".workflow-guide > .uml-scroll")
        .screenshot({ path: "docs/uml-architecture.png" });
      await page
        .getByText("Explore the full UML thread inspection workflow", {
          exact: true,
        })
        .click();
      await page
        .locator(".uml-activity .uml-scroll")
        .screenshot({ path: "docs/uml-workflow.png" });
      await page.getByRole("tab", { name: "04 · Check understanding" }).click();
      await page.screenshot({ path: "docs/quiz.png", fullPage: true });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
