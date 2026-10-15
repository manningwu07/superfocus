import type { Calendar, FocusEvent } from "./types";

const CALENDAR_API_ROOT: string = "https://www.googleapis.com/calendar/v3";

export class CalendarHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CalendarHttpError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Google Calendar returned an invalid ${field}.`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Google Calendar returned an invalid ${field}.`);
  }
  return value;
}

function readItems(value: unknown): unknown[] {
  if (!isRecord(value)) {
    throw new Error("Google Calendar returned an invalid response.");
  }
  if (value.items === undefined) {
    return [];
  }
  if (!Array.isArray(value.items)) {
    throw new Error("Google Calendar returned an invalid response.");
  }
  return value.items;
}

function nextPageToken(value: unknown): string | undefined {
  if (!isRecord(value)) {
    throw new Error("Google Calendar returned an invalid response.");
  }
  return optionalString(value.nextPageToken, "next page token");
}

function parseCalendar(value: unknown): Calendar {
  if (!isRecord(value)) {
    throw new Error("Google Calendar returned an invalid calendar.");
  }
  const id: string = requiredString(value.id, "calendar ID");
  const summary: string = requiredString(value.summary, "calendar name");
  const backgroundColor: string = optionalString(value.backgroundColor, "calendar color") ?? "#5f6368";
  return { id, summary, backgroundColor };
}

function selfDeclined(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index: number = 0; index < value.length; index += 1) {
    const attendee: unknown = value[index];
    if (
      isRecord(attendee) &&
      attendee.self === true &&
      attendee.responseStatus === "declined"
    ) {
      return true;
    }
  }
  return false;
}

export function parseFocusEvent(
  value: unknown,
  calendarId: string,
  selectedColorIds: ReadonlySet<string>,
): FocusEvent | null {
  if (!isRecord(value)) {
    throw new Error("Google Calendar returned an invalid event.");
  }
  if (value.status === "cancelled" || selfDeclined(value.attendees)) {
    return null;
  }
  const colorId: string | undefined = optionalString(value.colorId, "event color ID");
  if (colorId === undefined || !selectedColorIds.has(colorId)) {
    return null;
  }
  if (!isRecord(value.start) || !isRecord(value.end)) {
    throw new Error("Google Calendar returned an event without a time range.");
  }
  const start: string | undefined = optionalString(value.start.dateTime, "event start");
  const end: string | undefined = optionalString(value.end.dateTime, "event end");
  if (start === undefined || end === undefined) {
    return null;
  }
  const startMillis: number = Date.parse(start);
  const endMillis: number = Date.parse(end);
  if (!Number.isFinite(startMillis) || !Number.isFinite(endMillis) || endMillis <= startMillis) {
    throw new Error("Google Calendar returned an invalid event time range.");
  }
  const id: string = requiredString(value.id, "event ID");
  const title: string = optionalString(value.summary, "event title") ?? "Busy";
  return {
    id,
    title,
    start: new Date(startMillis).toISOString(),
    end: new Date(endMillis).toISOString(),
    colorId,
    calendarId,
  };
}

async function fetchJson(url: URL, token: string): Promise<unknown> {
  const signal: AbortSignal = AbortSignal.timeout(15_000);
  const response: Response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    const details: string = await response.text();
    throw new CalendarHttpError(
      response.status,
      `Google Calendar request failed (${response.status}): ${details.slice(0, 240)}`,
    );
  }
  return response.json();
}

export async function fetchCalendars(token: string): Promise<Calendar[]> {
  const calendars: Calendar[] = [];
  let pageToken: string | undefined;
  do {
    const url: URL = new URL(`${CALENDAR_API_ROOT}/users/me/calendarList`);
    url.searchParams.set("minAccessRole", "reader");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "250");
    if (pageToken !== undefined) {
      url.searchParams.set("pageToken", pageToken);
    }
    const body: unknown = await fetchJson(url, token);
    const items: unknown[] = readItems(body);
    for (let index: number = 0; index < items.length; index += 1) {
      const item: unknown = items[index];
      calendars.push(parseCalendar(item));
    }
    pageToken = nextPageToken(body);
  } while (pageToken !== undefined);
  return calendars;
}

export async function fetchFocusEvents(
  token: string,
  calendarIds: readonly string[],
  selectedColorIds: ReadonlySet<string>,
  timeMin: Date,
  timeMax: Date,
): Promise<FocusEvent[]> {
  const events: FocusEvent[] = [];
  for (let calendarIndex: number = 0; calendarIndex < calendarIds.length; calendarIndex += 1) {
    const calendarId: string | undefined = calendarIds[calendarIndex];
    if (calendarId === undefined) {
      throw new Error("Calendar ID is missing.");
    }
    let pageToken: string | undefined;
    do {
      const encodedCalendarId: string = encodeURIComponent(calendarId);
      const url: URL = new URL(`${CALENDAR_API_ROOT}/calendars/${encodedCalendarId}/events`);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "false");
      url.searchParams.set("maxResults", "2500");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("timeMin", timeMin.toISOString());
      url.searchParams.set("timeMax", timeMax.toISOString());
      if (pageToken !== undefined) {
        url.searchParams.set("pageToken", pageToken);
      }
      const body: unknown = await fetchJson(url, token);
      const items: unknown[] = readItems(body);
      for (let itemIndex: number = 0; itemIndex < items.length; itemIndex += 1) {
        const item: unknown = items[itemIndex];
        const event: FocusEvent | null = parseFocusEvent(item, calendarId, selectedColorIds);
        if (event !== null) {
          events.push(event);
        }
      }
      pageToken = nextPageToken(body);
    } while (pageToken !== undefined);
  }
  return events.sort((left: FocusEvent, right: FocusEvent): number =>
    left.start.localeCompare(right.start),
  );
}
