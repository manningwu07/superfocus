import { parseSettings } from "./settings";
import type { Calendar, EventColor, FocusEvent, Snapshot } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return requiredString(value, field);
}

function nullableIsoDate(value: unknown, field: string): string | null {
  const text: string | null = nullableString(value, field);
  if (text === null) {
    return null;
  }
  const millis: number = Date.parse(text);
  if (!Number.isFinite(millis)) {
    throw new Error(`Invalid ${field}.`);
  }
  return new Date(millis).toISOString();
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

function parseCalendar(value: unknown): Calendar {
  if (!isRecord(value)) {
    throw new Error("Invalid calendar.");
  }
  return {
    id: requiredString(value.id, "calendar ID"),
    summary: requiredString(value.summary, "calendar summary"),
    backgroundColor: requiredString(value.backgroundColor, "calendar color"),
  };
}

function parseColor(value: unknown): EventColor {
  if (!isRecord(value)) {
    throw new Error("Invalid event color.");
  }
  return {
    id: requiredString(value.id, "color ID"),
    name: requiredString(value.name, "color name"),
    background: requiredString(value.background, "color background"),
  };
}

export function parseStoredFocusEvent(value: unknown): FocusEvent {
  if (!isRecord(value)) {
    throw new Error("Invalid focus event.");
  }
  const event: FocusEvent = {
    id: requiredString(value.id, "event ID"),
    title: requiredString(value.title, "event title"),
    start: requiredString(value.start, "event start"),
    end: requiredString(value.end, "event end"),
    colorId: requiredString(value.colorId, "event color ID"),
    calendarId: requiredString(value.calendarId, "event calendar ID"),
  };
  const start: number = Date.parse(event.start);
  const end: number = Date.parse(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Invalid stored event time range.");
  }
  return event;
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T, field: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}.`);
  }
  return value.map((item: unknown): T => parser(item));
}

export function parseSnapshot(value: unknown): Snapshot {
  if (!isRecord(value)) {
    throw new Error("Invalid Superfocus response.");
  }
  return {
    settings: parseSettings(value.settings),
    configured: requiredBoolean(value.configured, "configured state"),
    connected: requiredBoolean(value.connected, "connection state"),
    calendars: parseArray(value.calendars, parseCalendar, "calendars"),
    colors: parseArray(value.colors, parseColor, "colors"),
    focusEvents: parseArray(value.focusEvents, parseStoredFocusEvent, "focus events"),
    upcomingEvents: parseArray(value.upcomingEvents, parseStoredFocusEvent, "upcoming events"),
    lastSync: nullableIsoDate(value.lastSync, "last sync"),
    error: nullableString(value.error, "error"),
    testUntil: nullableIsoDate(value.testUntil, "test end"),
  };
}
