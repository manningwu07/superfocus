import type { Settings, Snapshot } from "./types";
import { parseSettings } from "./settings";

export type Request =
  | { type: "getSnapshot" }
  | { type: "saveSettings"; settings: Settings }
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "syncNow" }
  | { type: "startTestFocus" };

export type Response = { ok: true; snapshot: Snapshot } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRequest(value: unknown): Request {
  if (!isRecord(value)) {
    throw new Error("Invalid request.");
  }
  const type: unknown = value.type;
  if (type === "saveSettings") {
    const settings: Settings = parseSettings(value.settings);
    return { type, settings };
  }
  if (
    type === "getSnapshot" ||
    type === "connect" ||
    type === "disconnect" ||
    type === "syncNow" ||
    type === "startTestFocus"
  ) {
    return { type };
  }
  throw new Error("Unknown request.");
}
