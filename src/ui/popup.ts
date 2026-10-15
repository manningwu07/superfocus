import { getSnapshot, startTestFocus, syncNow } from "../api";
import type { FocusEvent, Snapshot } from "../core/types";
import { element, errorMessage, formatTime, isExtensionPage, openSettings, requireElement } from "./dom";

let busy: boolean = false;
const app: HTMLElement = requireElement("#app", HTMLElement);

void load();

async function load(): Promise<void> {
  renderLoading();
  try {
    const snapshot: Snapshot = await getSnapshot();
    render(snapshot);
  } catch (cause: unknown) {
    renderError(errorMessage(cause));
  }
}

function renderLoading(): void {
  const label: HTMLParagraphElement = element("p", "eyebrow", "Superfocus");
  const message: HTMLParagraphElement = element("p", "popup-loading", "Checking focus status...");
  app.replaceChildren(label, message);
}

function render(value: Snapshot): void {
  if (value.error !== null) {
    renderError(value.error);
    return;
  }
  const now: number = Date.now();
  const active: FocusEvent | undefined = value.focusEvents.find((event: FocusEvent): boolean => {
    const start: number = new Date(event.start).getTime();
    const end: number = new Date(event.end).getTime();
    return start <= now && end > now;
  });
  const testActive: boolean = value.testUntil !== null && new Date(value.testUntil).getTime() > now;
  const headingText: string = !value.settings.enabled
    ? "Blocking paused"
    : active !== undefined || testActive
      ? "Focus is active"
      : "No active focus";
  const heading: HTMLHeadingElement = element(
    "h1",
    "popup-title",
    headingText,
  );
  const status: HTMLParagraphElement = element(
    "p",
    "popup-status",
    statusCopy(value, active, testActive),
  );
  const connection: HTMLDivElement = element("div", "popup-connection");
  const dot: HTMLSpanElement = element(
    "span",
    value.connected ? "status-dot" : "status-dot status-dot-off",
  );
  const connectionText: HTMLSpanElement = element(
    "span",
    undefined,
    value.connected ? "Calendar connected" : "Calendar not connected",
  );
  connection.append(dot, connectionText);

  const actions: HTMLDivElement = element("div", "popup-actions");
  const sync: HTMLButtonElement = control("Sync", (): Promise<Snapshot> => syncNow(), value.connected);
  const test: HTMLButtonElement = control("Test 1 min", (): Promise<Snapshot> => startTestFocus(), true);
  actions.append(sync, test);
  const settings: HTMLButtonElement = element("button", "button button-quiet popup-settings", "Open settings");
  settings.type = "button";
  settings.addEventListener("click", (): void => void openSettings());
  const preview: HTMLParagraphElement = element(
    "p",
    "preview-note",
    "Browser preview. Blocking requires the installed extension.",
  );
  preview.hidden = isExtensionPage();
  app.replaceChildren(heading, status, connection, actions, settings, preview);
}

function statusCopy(value: Snapshot, active: FocusEvent | undefined, testActive: boolean): string {
  if (!value.settings.enabled) {
    return "Blocking is paused in settings.";
  }
  if (active !== undefined) {
    return `${active.title} ends ${formatTime(active.end)}`;
  }
  if (testActive && value.testUntil !== null) {
    return `Test ends ${formatTime(value.testUntil)}`;
  }
  if (value.upcomingEvents.length > 0) {
    const next: FocusEvent | undefined = value.upcomingEvents.at(0);
    if (next === undefined) {
      throw new Error("Upcoming focus event is missing.");
    }
    return `Next: ${next.title}, ${formatTime(next.start)}`;
  }
  return value.connected ? "No matching timed event right now." : "Connect Google Calendar in settings.";
}

function control(
  label: string,
  action: () => Promise<Snapshot>,
  available: boolean,
): HTMLButtonElement {
  const button: HTMLButtonElement = element("button", "button button-secondary", label);
  button.type = "button";
  button.disabled = !available;
  button.addEventListener("click", (): void => void run(button, action));
  return button;
}

async function run(button: HTMLButtonElement, action: () => Promise<Snapshot>): Promise<void> {
  if (busy) {
    return;
  }
  busy = true;
  button.disabled = true;
  try {
    const next: Snapshot = await action();
    render(next);
  } catch (cause: unknown) {
    renderError(errorMessage(cause));
  } finally {
    busy = false;
  }
}

function renderError(message: string): void {
  const heading: HTMLHeadingElement = element("h1", "popup-title", "Superfocus unavailable");
  const detail: HTMLParagraphElement = element("p", "notice notice-error", message);
  const settings: HTMLButtonElement = element("button", "button button-quiet popup-settings", "Open settings");
  settings.type = "button";
  settings.addEventListener("click", (): void => void openSettings());
  app.replaceChildren(heading, detail, settings);
}
