import { describe, expect, it } from "vitest";
import { EVENT_COLORS } from "../src/core/colors";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { parseSnapshot } from "../src/core/snapshot";
import type { Snapshot } from "../src/core/types";

function validSnapshot(): Snapshot {
  return {
    settings: DEFAULT_SETTINGS,
    configured: false,
    connected: false,
    calendars: [],
    colors: EVENT_COLORS,
    focusEvents: [],
    upcomingEvents: [],
    lastSync: null,
    error: null,
    testUntil: null,
  };
}

describe("parseSnapshot", (): void => {
  it("rejects malformed persisted dates", (): void => {
    const input: Record<string, unknown> = { ...validSnapshot(), testUntil: "soon" };
    expect((): Snapshot => parseSnapshot(input)).toThrow("Invalid test end");
  });

  it("rejects malformed cached event ranges", (): void => {
    const input: Record<string, unknown> = {
      ...validSnapshot(),
      focusEvents: [
        {
          id: "bad",
          title: "Bad",
          start: "2026-10-14T15:00:00Z",
          end: "2026-10-14T14:00:00Z",
          colorId: "9",
          calendarId: "primary",
        },
      ],
    };
    expect((): Snapshot => parseSnapshot(input)).toThrow("Invalid stored event time range");
  });
});
