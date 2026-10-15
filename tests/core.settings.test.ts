import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeDomain, parseSettings } from "../src/core/settings";
import type { Settings } from "../src/core/types";

describe("parseSettings", (): void => {
  it("normalizes and de-duplicates user-entered values", (): void => {
    const settings: Settings = parseSettings({
      version: 1,
      enabled: true,
      calendarIds: [" primary ", "primary"],
      eventColorIds: ["9", "9", " 10 "],
      domains: [" WWW.Example.COM ", "example.com"],
    });
    expect(settings).toEqual({
      version: 1,
      enabled: true,
      calendarIds: ["primary"],
      eventColorIds: ["9", "10"],
      domains: ["example.com"],
    });
  });

  it.each(["https://example.com", "example.com/path", "*.example.com", "localhost", "bad..com"])(
    "rejects unsupported domain input %s",
    (domain: string): void => {
      expect((): string => normalizeDomain(domain)).toThrow();
    },
  );

  it("rejects default calendar color semantics", (): void => {
    expect(
      (): Settings =>
        parseSettings({
          ...DEFAULT_SETTINGS,
          eventColorIds: ["0"],
        }),
    ).toThrow("Unsupported event color ID");
  });

  it("rejects empty selectors instead of hiding a broken import", (): void => {
    expect(
      (): Settings =>
        parseSettings({
          ...DEFAULT_SETTINGS,
          calendarIds: [],
        }),
    ).toThrow("Choose at least one calendar");
  });
});
