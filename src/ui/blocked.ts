import { getSnapshot } from "../api";
import type { FocusEvent, Snapshot } from "../core/types";
import { element, errorMessage, formatTime, openSettings, requireElement } from "./dom";

const app: HTMLElement = requireElement("#app", HTMLElement);
void load();
const refreshTimer: number = window.setInterval((): void => void load(), 5_000);
window.addEventListener("pagehide", (): void => window.clearInterval(refreshTimer), { once: true });

async function load(): Promise<void> {
  try {
    const snapshot: Snapshot = await getSnapshot();
    render(snapshot);
  } catch (cause: unknown) {
    renderFailure(errorMessage(cause));
  }
}

function render(value: Snapshot): void {
  const now: number = Date.now();
  const active: FocusEvent[] = value.focusEvents.filter((event: FocusEvent): boolean => {
    const start: number = new Date(event.start).getTime();
    const end: number = new Date(event.end).getTime();
    return start <= now && end > now;
  });
  const endCandidates: number[] = active.map((event: FocusEvent): number => Date.parse(event.end));
  const testEnd: number = value.testUntil === null ? Number.NaN : Date.parse(value.testUntil);
  if (Number.isFinite(testEnd)) {
    endCandidates.push(testEnd);
  }
  const endMillis: number = endCandidates.length === 0
    ? Number.NaN
    : Math.max(...endCandidates);
  const activeNow: boolean = value.settings.enabled && Number.isFinite(endMillis) && endMillis > now;
  const eyebrow: HTMLParagraphElement = element(
    "p",
    "eyebrow",
    activeNow ? "Superfocus is active" : "Superfocus",
  );
  const heading: HTMLHeadingElement = element(
    "h1",
    "blocked-title",
    activeNow ? "This can wait." : value.settings.enabled ? "Focus has ended." : "Blocking is paused.",
  );
  const focusCopy: string = active.length === 1
    ? `${active[0]?.title ?? "Your focus event"} is in progress.`
    : active.length > 1
      ? `${active.length} focus events are in progress.`
      : "Your focus test is blocking this site.";
  const copy: HTMLParagraphElement = element(
    "p",
    "blocked-copy",
    activeNow ? focusCopy : "Enter the site address again to return.",
  );
  const endTime: HTMLParagraphElement = element(
    "p",
    "blocked-time",
    activeNow ? `Focus ends ${formatTime(new Date(endMillis).toISOString())}.` : "This page will no longer block it.",
  );
  const settings: HTMLButtonElement = element("button", "button button-quiet", "Open settings");
  settings.type = "button";
  settings.addEventListener("click", (): void => void openSettings());
  app.replaceChildren(eyebrow, heading, copy, endTime, settings);
}

function renderFailure(message: string): void {
  const heading: HTMLHeadingElement = element("h1", "blocked-title", "Superfocus status unavailable");
  const copy: HTMLParagraphElement = element("p", "blocked-copy", message);
  const settings: HTMLButtonElement = element("button", "button button-quiet", "Open settings");
  settings.type = "button";
  settings.addEventListener("click", (): void => void openSettings());
  app.replaceChildren(heading, copy, settings);
}
