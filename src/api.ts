import { EVENT_COLORS } from "./core/colors";
import type { Request } from "./core/messages";
import { DEFAULT_SETTINGS, parseSettings } from "./core/settings";
import { parseSnapshot } from "./core/snapshot";
import type { Settings, Snapshot } from "./core/types";

const PREVIEW_SETTINGS_KEY: string = "superfocus:preview:settings";
const PREVIEW_TEST_UNTIL_KEY: string = "superfocus:preview:testUntil";

function extensionRuntimeAvailable(): boolean {
  return typeof chrome !== "undefined" && chrome.runtime !== undefined && chrome.runtime.id !== undefined;
}

function previewSettings(): Settings {
  const stored: string | null = localStorage.getItem(PREVIEW_SETTINGS_KEY);
  if (stored === null) {
    return parseSettings(DEFAULT_SETTINGS);
  }
  const value: unknown = JSON.parse(stored);
  return parseSettings(value);
}

function previewSnapshot(error: string | null = null): Snapshot {
  const now: number = Date.now();
  const storedTestUntil: string | null = localStorage.getItem(PREVIEW_TEST_UNTIL_KEY);
  const testMillis: number = storedTestUntil === null ? Number.NaN : Date.parse(storedTestUntil);
  const testUntil: string | null =
    Number.isFinite(testMillis) && testMillis > now ? new Date(testMillis).toISOString() : null;
  if (testUntil === null) {
    localStorage.removeItem(PREVIEW_TEST_UNTIL_KEY);
  }
  return {
    settings: previewSettings(),
    configured: false,
    connected: false,
    calendars: [],
    colors: EVENT_COLORS,
    focusEvents: [],
    upcomingEvents: [],
    lastSync: null,
    error,
    testUntil,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResponse(value: unknown): Snapshot {
  if (!isRecord(value)) {
    throw new Error("Invalid response from Superfocus.");
  }
  if (value.ok === false && typeof value.error === "string") {
    throw new Error(value.error);
  }
  if (value.ok !== true) {
    throw new Error("Invalid response from Superfocus.");
  }
  return parseSnapshot(value.snapshot);
}

async function request(message: Request): Promise<Snapshot> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  return parseResponse(response);
}

export async function getSnapshot(): Promise<Snapshot> {
  return extensionRuntimeAvailable() ? request({ type: "getSnapshot" }) : previewSnapshot();
}

export async function saveSettings(settings: Settings): Promise<Snapshot> {
  const validated: Settings = parseSettings(settings);
  if (extensionRuntimeAvailable()) {
    return request({ type: "saveSettings", settings: validated });
  }
  localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(validated));
  return previewSnapshot();
}

export async function connect(): Promise<Snapshot> {
  return extensionRuntimeAvailable()
    ? request({ type: "connect" })
    : previewSnapshot("Google Calendar connection requires the installed Chrome extension.");
}

export async function disconnect(): Promise<Snapshot> {
  return extensionRuntimeAvailable() ? request({ type: "disconnect" }) : previewSnapshot();
}

export async function syncNow(): Promise<Snapshot> {
  return extensionRuntimeAvailable()
    ? request({ type: "syncNow" })
    : previewSnapshot("Calendar sync requires the installed Chrome extension.");
}

export async function startTestFocus(): Promise<Snapshot> {
  if (extensionRuntimeAvailable()) {
    return request({ type: "startTestFocus" });
  }
  const testUntil: string = new Date(Date.now() + 60_000).toISOString();
  localStorage.setItem(PREVIEW_TEST_UNTIL_KEY, testUntil);
  return previewSnapshot("Preview only. Install the extension to block websites.");
}

export { parseSettings } from "./core/settings";
export type { Calendar, EventColor, FocusEvent, Settings, Snapshot } from "./core/types";
