import { expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extensionPath: string = resolve(import.meta.dirname, "../../dist");

test("the unpacked extension blocks with settings closed and expires its DNR rule", async (): Promise<void> => {
  const userDataDir: string = await mkdtemp(join(tmpdir(), "superfocus-e2e-"));
  try {
    const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    try {
      let workers: Worker[] = context.serviceWorkers();
      if (workers.length === 0) {
        await context.waitForEvent("serviceworker");
        workers = context.serviceWorkers();
      }
      const worker: Worker | undefined = workers[0];
      if (worker === undefined) {
        throw new Error("Superfocus service worker did not start.");
      }
      const extensionId: string = new URL(worker.url()).host;
      const dashboard: Page = await context.newPage();
      await dashboard.goto(`chrome-extension://${extensionId}/index.html`);
      const invalidResponse: unknown = await dashboard.evaluate(
        async (): Promise<unknown> =>
          chrome.runtime.sendMessage({
            type: "saveSettings",
            settings: {
              version: 1,
              enabled: true,
              calendarIds: ["primary"],
              eventColorIds: ["9"],
              domains: ["https://example.com/path"],
            },
          }),
      );
      expect(invalidResponse).toEqual({
        ok: false,
        error: "Invalid domain: https://example.com/path",
      });
      const page: Page = await context.newPage();
      await page.goto("https://example.com/", { waitUntil: "domcontentloaded" });

      await dashboard.evaluate(async (): Promise<void> => {
        const settings: {
          version: 1;
          enabled: boolean;
          calendarIds: string[];
          eventColorIds: string[];
          domains: string[];
        } = {
          version: 1,
          enabled: true,
          calendarIds: ["primary"],
          eventColorIds: ["9"],
          domains: ["example.com"],
        };
        await chrome.runtime.sendMessage({ type: "saveSettings", settings });
        await chrome.runtime.sendMessage({ type: "startTestFocus" });
      });

      await expect(page).toHaveURL(`chrome-extension://${extensionId}/blocked.html`);
      const activeRuleCount: number = await worker.evaluate(
        async (): Promise<number> => (await chrome.declarativeNetRequest.getDynamicRules()).length,
      );
      expect(activeRuleCount).toBe(1);

      const scheduledBefore: number | undefined = await worker.evaluate(
        async (): Promise<number | undefined> => {
          const alarm: chrome.alarms.Alarm | undefined = await chrome.alarms.get("superfocus:sync");
          return alarm?.scheduledTime;
        },
      );
      await dashboard.evaluate(async (): Promise<void> => {
        await chrome.runtime.sendMessage({ type: "getSnapshot" });
        await chrome.runtime.sendMessage({ type: "getSnapshot" });
      });
      const scheduledAfter: number | undefined = await worker.evaluate(
        async (): Promise<number | undefined> => {
          const alarm: chrome.alarms.Alarm | undefined = await chrome.alarms.get("superfocus:sync");
          return alarm?.scheduledTime;
        },
      );
      expect(scheduledAfter).toBe(scheduledBefore);

      await dashboard.close();
      const blockedNavigation: Page = await context.newPage();
      await blockedNavigation.goto("https://www.example.com/", { waitUntil: "domcontentloaded" });
      await expect(blockedNavigation).toHaveURL(`chrome-extension://${extensionId}/blocked.html`);

      await expect
        .poll(
          async (): Promise<number> =>
            worker.evaluate(
              async (): Promise<number> => (await chrome.declarativeNetRequest.getDynamicRules()).length,
            ),
          { timeout: 70_000, intervals: [1_000] },
        )
        .toBe(0);
      await blockedNavigation.goto("https://example.com/", { waitUntil: "domcontentloaded" });
      await expect(blockedNavigation).toHaveURL("https://example.com/");
    } finally {
      await context.close();
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});
