import { afterEach, describe, expect, it } from "vitest";
import {
  CalendarHttpError,
  fetchCalendars,
  fetchFocusEvents,
  parseFocusEvent,
} from "../src/core/calendar";
import type { Calendar, FocusEvent } from "../src/core/types";

const selectedColors: ReadonlySet<string> = new Set<string>(["9"]);
const originalFetch: typeof fetch = globalThis.fetch;

afterEach((): void => {
  globalThis.fetch = originalFetch;
});

function timedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "event-1",
    summary: "Focus",
    colorId: "9",
    status: "confirmed",
    start: { dateTime: "2026-10-14T14:00:00Z" },
    end: { dateTime: "2026-10-14T15:00:00Z" },
    ...overrides,
  };
}

describe("parseFocusEvent", (): void => {
  it("accepts selected timed events", (): void => {
    const event: FocusEvent | null = parseFocusEvent(timedEvent(), "primary", selectedColors);
    expect(event).toEqual({
      id: "event-1",
      title: "Focus",
      start: "2026-10-14T14:00:00.000Z",
      end: "2026-10-14T15:00:00.000Z",
      colorId: "9",
      calendarId: "primary",
    });
  });

  it.each([
    timedEvent({ colorId: undefined }),
    timedEvent({ colorId: "8" }),
    timedEvent({ status: "cancelled" }),
    timedEvent({ attendees: [{ self: true, responseStatus: "declined" }] }),
    timedEvent({ start: { date: "2026-10-14" }, end: { date: "2026-10-15" } }),
  ])("ignores events that cannot start focus", (input: Record<string, unknown>): void => {
    expect(parseFocusEvent(input, "primary", selectedColors)).toBeNull();
  });

  it("fails loudly for a reversed range", (): void => {
    const input: Record<string, unknown> = timedEvent({
      start: { dateTime: "2026-10-14T16:00:00Z" },
      end: { dateTime: "2026-10-14T15:00:00Z" },
    });
    expect((): FocusEvent | null => parseFocusEvent(input, "primary", selectedColors)).toThrow(
      "invalid event time range",
    );
  });
});

describe("fetchCalendars", (): void => {
  it("supports a documented omitted items field and continues pagination", async (): Promise<void> => {
    const bodies: unknown[] = [
      { nextPageToken: "next" },
      { items: [{ id: "primary", summary: "Work", backgroundColor: "#123456" }] },
    ];
    const urls: string[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      urls.push(String(input));
      const body: unknown = bodies.shift();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const calendars: Calendar[] = await fetchCalendars("token");
    expect(calendars).toEqual([
      { id: "primary", summary: "Work", backgroundColor: "#123456" },
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("pageToken=next");
  });

  it("rejects a non-array items field", async (): Promise<void> => {
    globalThis.fetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ items: {} }), { status: 200 });
    await expect(fetchCalendars("token")).rejects.toThrow("invalid response");
  });
});

describe("fetchFocusEvents", (): void => {
  it("requests expanded recurring pages and returns only selected timed events", async (): Promise<void> => {
    const bodies: unknown[] = [
      {
        items: [
          timedEvent({ id: "first" }),
          timedEvent({
            id: "all-day",
            start: { date: "2026-10-14" },
            end: { date: "2026-10-15" },
          }),
        ],
        nextPageToken: "next-events",
      },
      {
        items: [
          timedEvent({ id: "cancelled", status: "cancelled" }),
          timedEvent({
            id: "second",
            start: { dateTime: "2026-10-15T14:00:00Z" },
            end: { dateTime: "2026-10-15T15:00:00Z" },
          }),
        ],
      },
    ];
    const urls: URL[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      urls.push(new URL(String(input)));
      const body: unknown = bodies.shift();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const events: FocusEvent[] = await fetchFocusEvents(
      "token",
      ["team/calendar@example.com"],
      selectedColors,
      new Date("2026-10-14T00:00:00Z"),
      new Date("2026-10-22T00:00:00Z"),
    );
    expect(events.map((item: FocusEvent): string => item.id)).toEqual(["first", "second"]);
    expect(
      urls.map(
        (url: URL): Record<string, string | null> => ({
          path: url.pathname,
          singleEvents: url.searchParams.get("singleEvents"),
          timeMin: url.searchParams.get("timeMin"),
          timeMax: url.searchParams.get("timeMax"),
          pageToken: url.searchParams.get("pageToken"),
        }),
      ),
    ).toEqual([
      {
        path: "/calendar/v3/calendars/team%2Fcalendar%40example.com/events",
        singleEvents: "true",
        timeMin: "2026-10-14T00:00:00.000Z",
        timeMax: "2026-10-22T00:00:00.000Z",
        pageToken: null,
      },
      {
        path: "/calendar/v3/calendars/team%2Fcalendar%40example.com/events",
        singleEvents: "true",
        timeMin: "2026-10-14T00:00:00.000Z",
        timeMax: "2026-10-22T00:00:00.000Z",
        pageToken: "next-events",
      },
    ]);
  });

  it("exposes a typed 401 for token-cache recovery", async (): Promise<void> => {
    globalThis.fetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    let caught: unknown;
    try {
      await fetchFocusEvents(
        "expired-token",
        ["primary"],
        selectedColors,
        new Date("2026-10-14T00:00:00Z"),
        new Date("2026-10-22T00:00:00Z"),
      );
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalendarHttpError);
    if (!(caught instanceof CalendarHttpError)) {
      throw new Error("Expected a CalendarHttpError.");
    }
    expect(caught.status).toBe(401);
    expect(caught.message).toContain("Invalid Credentials");
  });
});
