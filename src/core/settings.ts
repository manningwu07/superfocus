import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  enabled: true,
  calendarIds: ["primary"],
  eventColorIds: ["9"],
  domains: [
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "tiktok.com",
    "x.com",
    "youtube.com",
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  const result: string[] = [];
  for (let index: number = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    if (typeof item !== "string") {
      throw new Error(`${field} must contain only strings.`);
    }
    result.push(item);
  }
  return result;
}

function unique(values: readonly string[]): string[] {
  return [...new Set<string>(values)];
}

export function normalizeDomain(value: string): string {
  const domain: string = value.trim().toLowerCase().replace(/^www\./, "");
  if (
    domain.length === 0 ||
    domain.length > 253 ||
    domain.includes("://") ||
    domain.includes("/") ||
    domain.includes("*") ||
    domain.includes(":") ||
    domain.startsWith(".") ||
    domain.endsWith(".")
  ) {
    throw new Error(`Invalid domain: ${value}`);
  }
  const labels: string[] = domain.split(".");
  if (labels.length < 2) {
    throw new Error(`Domain must include a public suffix: ${value}`);
  }
  for (let index: number = 0; index < labels.length; index += 1) {
    const label: string | undefined = labels[index];
    if (label === undefined) {
      throw new Error(`Invalid domain: ${value}`);
    }
    const validLabel: boolean = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    if (!validLabel) {
      throw new Error(`Invalid domain: ${value}`);
    }
  }
  return domain;
}

function normalizeCalendarId(value: string): string {
  const calendarId: string = value.trim();
  if (calendarId.length === 0) {
    throw new Error("Calendar IDs cannot be empty.");
  }
  return calendarId;
}

function normalizeColorId(value: string): string {
  const colorId: string = value.trim();
  if (!/^(?:[1-9]|1[01])$/.test(colorId)) {
    throw new Error(`Unsupported event color ID: ${value}`);
  }
  return colorId;
}

export function parseSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    throw new Error("Settings must be an object.");
  }
  if (value.version !== 1) {
    throw new Error("Unsupported settings version.");
  }
  if (typeof value.enabled !== "boolean") {
    throw new Error("enabled must be a boolean.");
  }
  const calendarIds: string[] = unique(
    readStringArray(value.calendarIds, "calendarIds").map((item: string): string =>
      normalizeCalendarId(item),
    ),
  );
  const eventColorIds: string[] = unique(
    readStringArray(value.eventColorIds, "eventColorIds").map((item: string): string =>
      normalizeColorId(item),
    ),
  );
  const domains: string[] = unique(
    readStringArray(value.domains, "domains").map((item: string): string => normalizeDomain(item)),
  );
  if (calendarIds.length === 0) {
    throw new Error("Choose at least one calendar.");
  }
  if (eventColorIds.length === 0) {
    throw new Error("Choose at least one event color.");
  }
  return {
    version: 1,
    enabled: value.enabled,
    calendarIds,
    eventColorIds,
    domains,
  };
}
