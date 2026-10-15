import type { FocusEvent, Settings } from "./types";

export interface FocusState {
  active: boolean;
  until: number;
  boundaries: number[];
}

export function liveEvents(events: readonly FocusEvent[], now: number): FocusEvent[] {
  return events.filter((event: FocusEvent): boolean => Date.parse(event.end) > now);
}

export function selectedLiveEvents(
  events: readonly FocusEvent[],
  settings: Settings,
  now: number,
): FocusEvent[] {
  const calendarIds: ReadonlySet<string> = new Set<string>(settings.calendarIds);
  const colorIds: ReadonlySet<string> = new Set<string>(settings.eventColorIds);
  const selectedEvents: FocusEvent[] = events.filter(
    (event: FocusEvent): boolean =>
      calendarIds.has(event.calendarId) && colorIds.has(event.colorId),
  );
  return liveEvents(selectedEvents, now);
}

export function focusState(
  events: readonly FocusEvent[],
  now: number,
  testUntil: number | null,
  enabled: boolean,
): FocusState {
  const boundarySet: Set<number> = new Set<number>();
  let until: number = enabled && testUntil !== null && testUntil > now ? testUntil : 0;
  if (enabled && testUntil !== null && testUntil > now) {
    boundarySet.add(testUntil);
  }
  if (enabled) {
    for (let index: number = 0; index < events.length; index += 1) {
      const event: FocusEvent | undefined = events[index];
      if (event === undefined) {
        throw new Error("Focus event is missing.");
      }
      const start: number = Date.parse(event.start);
      const end: number = Date.parse(event.end);
      if (start > now) {
        boundarySet.add(start);
      }
      if (end > now) {
        boundarySet.add(end);
      }
      if (start <= now && now < end) {
        until = Math.max(until, end);
      }
    }
  }
  return {
    active: until > now,
    until,
    boundaries: [...boundarySet].sort((left: number, right: number): number => left - right),
  };
}
