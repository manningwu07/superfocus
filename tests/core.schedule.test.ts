import { describe, expect, it } from "vitest";
import {
  focusState,
  liveEvents,
  selectedLiveEvents,
  type FocusState,
} from "../src/core/schedule";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { FocusEvent, Settings } from "../src/core/types";

function event(id: string, start: number, end: number): FocusEvent {
  return {
    id,
    title: id,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    colorId: "9",
    calendarId: "primary",
  };
}

describe("focusState", (): void => {
  it("uses start-inclusive and end-exclusive boundaries", (): void => {
    const first: FocusEvent = event("first", 1_000, 2_000);
    expect(focusState([first], 999, null, true).active).toBe(false);
    expect(focusState([first], 1_000, null, true).active).toBe(true);
    expect(focusState([first], 2_000, null, true).active).toBe(false);
  });

  it("unions overlapping focus events through the latest active end", (): void => {
    const events: FocusEvent[] = [event("first", 1_000, 3_000), event("second", 2_000, 4_000)];
    const state: FocusState = focusState(events, 2_500, null, true);
    expect(state.active).toBe(true);
    expect(state.until).toBe(4_000);
    expect(state.boundaries).toEqual([3_000, 4_000]);
  });

  it("keeps only events whose end remains in the future", (): void => {
    const events: FocusEvent[] = [event("ended", 0, 1_000), event("live", 500, 1_001)];
    expect(liveEvents(events, 1_000).map((item: FocusEvent): string => item.id)).toEqual(["live"]);
  });

  it("drops cached events after their calendar or color is deselected", (): void => {
    const events: FocusEvent[] = [
      event("selected", 0, 2_000),
      { ...event("wrong-calendar", 0, 2_000), calendarId: "personal" },
      { ...event("wrong-color", 0, 2_000), colorId: "10" },
    ];
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      calendarIds: ["primary"],
      eventColorIds: ["9"],
    };
    expect(
      selectedLiveEvents(events, settings, 1_000).map((item: FocusEvent): string => item.id),
    ).toEqual(["selected"]);
  });

  it("disables calendar and test focus together", (): void => {
    const state: FocusState = focusState([event("active", 0, 2_000)], 1_000, 3_000, false);
    expect(state).toEqual({ active: false, until: 0, boundaries: [] });
  });
});
