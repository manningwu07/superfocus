import {
  connect,
  disconnect,
  getSnapshot,
  parseSettings,
  saveSettings,
  startTestFocus,
  syncNow,
} from "../api";
import { EVENT_COLORS } from "../core/colors";
import type { Calendar, EventColor, FocusEvent, Settings, Snapshot } from "../core/types";
import { element, errorMessage, formatTime, isExtensionPage, requireElement } from "./dom";

const OAUTH_GUIDE_URL: string =
  "https://developer.chrome.com/docs/extensions/how-to/integrate/oauth";

let snapshot: Snapshot | null = null;
let draft: Settings | null = null;
let dirty: boolean = false;
let busy: boolean = false;

const app: HTMLElement = requireElement("#app", HTMLElement);

app.append(
  buildHeader(),
  buildPreviewBanner(),
  buildMessage(),
  buildDashboard(),
);

wireControls();
void loadInitialState();
const refreshTimer: number = window.setInterval((): void => void refreshStatus(), 30_000);
window.addEventListener("pagehide", (): void => window.clearInterval(refreshTimer), { once: true });

function buildHeader(): HTMLElement {
  const header: HTMLElement = element("header", "masthead");
  const identity: HTMLElement = element("div", "identity");
  const eyebrow: HTMLParagraphElement = element("p", "eyebrow", "Calendar-led focus");
  const title: HTMLHeadingElement = element("h1", "wordmark", "Superfocus");
  const intro: HTMLParagraphElement = element(
    "p",
    "intro",
    "Block chosen distractions during timed Google Calendar events in selected colors.",
  );
  identity.append(eyebrow, title, intro);

  const toggleLabel: HTMLLabelElement = element("label", "master-toggle");
  const toggleCopy: HTMLSpanElement = element("span", "toggle-copy");
  const toggleTitle: HTMLSpanElement = element("span", "toggle-title", "Blocking enabled");
  const toggleStatus: HTMLSpanElement = element("span", "toggle-status", "Loading settings");
  toggleStatus.id = "enabled-status";
  toggleCopy.append(toggleTitle, toggleStatus);
  const toggle: HTMLInputElement = element("input");
  toggle.id = "enabled";
  toggle.type = "checkbox";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-describedby", "enabled-status");
  const track: HTMLSpanElement = element("span", "switch-track");
  track.setAttribute("aria-hidden", "true");
  toggleLabel.append(toggleCopy, toggle, track);
  header.append(identity, toggleLabel);
  return header;
}

function buildPreviewBanner(): HTMLElement {
  const banner: HTMLElement = element("aside", "preview-banner");
  banner.id = "preview-banner";
  banner.hidden = isExtensionPage();
  const label: HTMLSpanElement = element("span", "preview-label", "Browser preview");
  const text: HTMLSpanElement = element(
    "span",
    undefined,
    "Website blocking only works in the installed extension. Test focus is simulated here.",
  );
  banner.append(label, text);
  return banner;
}

function buildMessage(): HTMLElement {
  const message: HTMLDivElement = element("div", "notice");
  message.id = "message";
  message.hidden = true;
  message.setAttribute("role", "status");
  return message;
}

function buildDashboard(): HTMLElement {
  const grid: HTMLElement = element("div", "dashboard-grid");
  const primary: HTMLElement = element("div", "dashboard-column");
  const secondary: HTMLElement = element("div", "dashboard-column");
  primary.append(buildConnectionCard(), buildWebsitesCard());
  secondary.append(buildScheduleCard(), buildDataCard());
  grid.append(primary, secondary);

  const footer: HTMLElement = element("footer", "save-bar");
  const saveState: HTMLParagraphElement = element("p", "save-state", "Loading settings");
  saveState.id = "save-state";
  const saveButton: HTMLButtonElement = button("Save settings", "button button-primary");
  saveButton.id = "save";
  saveButton.type = "button";
  footer.append(saveState, saveButton);

  const content: HTMLElement = element("section", "dashboard");
  content.append(grid, footer);
  return content;
}

function buildConnectionCard(): HTMLElement {
  const card: HTMLElement = cardShell("Calendar connection", "connection-body");
  const body: HTMLDivElement = element("div", "connection-body");
  body.id = "connection-body";
  card.append(body);
  return card;
}

function buildWebsitesCard(): HTMLElement {
  const card: HTMLElement = cardShell("Blocked websites", "websites-help");
  const help: HTMLParagraphElement = element(
    "p",
    "card-copy",
    "One domain or URL per line. Paths are reduced to their domain.",
  );
  help.id = "websites-help";
  const label: HTMLLabelElement = element("label", "field-label", "Domains and URLs");
  label.htmlFor = "domains";
  const textarea: HTMLTextAreaElement = element("textarea", "code-input");
  textarea.id = "domains";
  textarea.rows = 8;
  textarea.placeholder = "reddit.com\nhttps://news.ycombinator.com";
  textarea.setAttribute("aria-describedby", "websites-help");
  const importRow: HTMLDivElement = element("div", "inline-row");
  const importLabel: HTMLLabelElement = element("label", "button button-quiet file-button", "Import text list");
  const input: HTMLInputElement = element("input");
  input.id = "domain-file";
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.className = "visually-hidden";
  importLabel.append(input);
  const hint: HTMLSpanElement = element("span", "microcopy", "Replaces the website draft");
  importRow.append(importLabel, hint);
  card.append(help, label, textarea, importRow);
  return card;
}

function buildScheduleCard(): HTMLElement {
  const card: HTMLElement = cardShell("Focus schedule", "schedule-meta");
  const meta: HTMLParagraphElement = element("p", "card-copy");
  meta.id = "schedule-meta";
  const currentTitle: HTMLHeadingElement = element("h3", "section-label", "Active now");
  const activeList: HTMLDivElement = element("div", "event-list");
  activeList.id = "active-events";
  const upcomingTitle: HTMLHeadingElement = element("h3", "section-label", "Upcoming");
  const upcomingList: HTMLDivElement = element("div", "event-list");
  upcomingList.id = "upcoming-events";
  const actions: HTMLDivElement = element("div", "button-row");
  const syncButton: HTMLButtonElement = button("Sync now", "button button-quiet");
  syncButton.id = "sync";
  const testButton: HTMLButtonElement = button("Test for 1 minute", "button button-secondary");
  testButton.id = "test";
  actions.append(syncButton, testButton);
  card.append(meta, currentTitle, activeList, upcomingTitle, upcomingList, actions);
  return card;
}

function buildDataCard(): HTMLElement {
  const card: HTMLElement = cardShell("Settings file", "data-help");
  const help: HTMLParagraphElement = element(
    "p",
    "card-copy",
    "Export a JSON backup or load one into this unsaved draft.",
  );
  help.id = "data-help";
  const row: HTMLDivElement = element("div", "button-row");
  const exportButton: HTMLButtonElement = button("Export JSON", "button button-quiet");
  exportButton.id = "export";
  const importLabel: HTMLLabelElement = element("label", "button button-quiet file-button", "Import JSON");
  const input: HTMLInputElement = element("input");
  input.id = "settings-file";
  input.type = "file";
  input.accept = ".json,application/json";
  input.className = "visually-hidden";
  importLabel.append(input);
  row.append(exportButton, importLabel);
  card.append(help, row);
  return card;
}

function cardShell(titleText: string, describedBy: string): HTMLElement {
  const card: HTMLElement = element("section", "card");
  card.setAttribute("aria-describedby", describedBy);
  const title: HTMLHeadingElement = element("h2", "card-title", titleText);
  card.append(title);
  return card;
}

function button(text: string, className: string): HTMLButtonElement {
  const node: HTMLButtonElement = element("button", className, text);
  node.type = "button";
  return node;
}

function wireControls(): void {
  const enabled: HTMLInputElement = requireElement("#enabled", HTMLInputElement);
  const domains: HTMLTextAreaElement = requireElement("#domains", HTMLTextAreaElement);
  const save: HTMLButtonElement = requireElement("#save", HTMLButtonElement);
  const sync: HTMLButtonElement = requireElement("#sync", HTMLButtonElement);
  const test: HTMLButtonElement = requireElement("#test", HTMLButtonElement);
  const exportButton: HTMLButtonElement = requireElement("#export", HTMLButtonElement);
  const domainFile: HTMLInputElement = requireElement("#domain-file", HTMLInputElement);
  const settingsFile: HTMLInputElement = requireElement("#settings-file", HTMLInputElement);

  enabled.addEventListener("change", (): void => updateDraftFromInputs());
  domains.addEventListener("input", (): void => updateDraftFromInputs());
  save.addEventListener("click", (): void => void saveDraft());
  sync.addEventListener("click", (): void => void runSnapshotAction("Syncing calendar", syncNow));
  test.addEventListener("click", (): void => void runSnapshotAction("Starting test", startTestFocus));
  exportButton.addEventListener("click", (): void => exportSettings());
  domainFile.addEventListener("change", (): void => void importDomainFile(domainFile));
  settingsFile.addEventListener("change", (): void => void importSettingsFile(settingsFile));
}

async function loadInitialState(): Promise<void> {
  setBusy(true, "Loading settings");
  try {
    const next: Snapshot = await getSnapshot();
    applySnapshot(next, true);
  } catch (cause: unknown) {
    showMessage(errorMessage(cause), "error");
  } finally {
    setBusy(false);
  }
}

function applySnapshot(next: Snapshot, overwriteDraft: boolean): void {
  const previousSnapshotError: string | null = snapshot?.error ?? null;
  snapshot = next;
  if (overwriteDraft || draft === null) {
    draft = copySettings(next.settings);
    dirty = false;
    renderDraft();
  }
  renderSnapshot();
  renderSaveState();
  if (next.error !== null) {
    showMessage(next.error, "error");
  } else {
    hideProgressMessage();
    hidePreviousSnapshotError(previousSnapshotError);
  }
}

async function refreshStatus(): Promise<void> {
  if (busy) {
    return;
  }
  try {
    const next: Snapshot = await getSnapshot();
    applySnapshot(next, false);
  } catch (cause: unknown) {
    showMessage(errorMessage(cause), "error");
  }
}

function renderSnapshot(): void {
  if (snapshot === null) {
    return;
  }
  renderConnection(snapshot);
  renderSchedule(snapshot);
}

function renderDraft(): void {
  if (draft === null) {
    return;
  }
  const enabled: HTMLInputElement = requireElement("#enabled", HTMLInputElement);
  const enabledStatus: HTMLSpanElement = requireElement("#enabled-status", HTMLSpanElement);
  const domains: HTMLTextAreaElement = requireElement("#domains", HTMLTextAreaElement);
  enabled.checked = draft.enabled;
  enabledStatus.textContent = draft.enabled ? "On when focus is active" : "All blocking is paused";
  domains.value = draft.domains.join("\n");
}

function renderConnection(value: Snapshot): void {
  const body: HTMLDivElement = requireElement("#connection-body", HTMLDivElement);
  body.replaceChildren();
  if (!value.connected) {
    const state: HTMLDivElement = element("div", "empty-state");
    const marker: HTMLSpanElement = element("span", "status-dot status-dot-off");
    const text: HTMLDivElement = element("div");
    const title: HTMLParagraphElement = element("p", "empty-title", "Google Calendar is not connected");
    const copy: HTMLParagraphElement = element(
      "p",
      "card-copy",
      value.configured
        ? "Connect to read your calendars and timed event colors."
        : "Add your Google OAuth credentials, then connect your calendar.",
    );
    text.append(title, copy);
    state.append(marker, text);
    const actions: HTMLDivElement = element("div", "button-row");
    const connectButton: HTMLButtonElement = button("Connect Google", "button button-primary");
    connectButton.disabled = !value.configured || busy;
    connectButton.addEventListener("click", (): void =>
      void runSnapshotAction("Connecting Google", connect),
    );
    const setup: HTMLAnchorElement = element("a", "text-link", "Open OAuth setup guide");
    setup.href = OAUTH_GUIDE_URL;
    setup.target = "_blank";
    setup.rel = "noreferrer";
    actions.append(connectButton, setup);
    const localHelp: HTMLParagraphElement = element(
      "p",
      "microcopy setup-note",
      "Local docs/setup.md has the exact project setup steps.",
    );
    body.append(state, actions, localHelp, buildColorGroup(value.colors));
    return;
  }

  const connected: HTMLDivElement = element("div", "connection-line");
  const connectedLabel: HTMLSpanElement = element("span", "status-chip", "Connected");
  const disconnectButton: HTMLButtonElement = button("Disconnect", "button-link");
  disconnectButton.disabled = busy;
  disconnectButton.addEventListener("click", (): void =>
    void runSnapshotAction("Disconnecting Google", disconnect),
  );
  connected.append(connectedLabel, disconnectButton);

  const calendarGroup: HTMLFieldSetElement = element("fieldset", "choice-group");
  const calendarLegend: HTMLLegendElement = element("legend", "field-label", "Calendars");
  const calendarHelp: HTMLParagraphElement = element(
    "p",
    "microcopy",
    value.calendars.length === 0
      ? "No calendars returned. The primary calendar will be used."
      : "Leave all unchecked to use your primary calendar.",
  );
  calendarGroup.append(calendarLegend, calendarHelp);
  value.calendars.forEach((calendar: Calendar): void => {
    calendarGroup.append(buildCalendarChoice(calendar));
  });

  body.append(connected, calendarGroup, buildColorGroup(value.colors));
}

function buildColorGroup(snapshotColors: EventColor[]): HTMLFieldSetElement {
  const colorGroup: HTMLFieldSetElement = element("fieldset", "choice-group");
  const colorLegend: HTMLLegendElement = element("legend", "field-label", "Focus event colors");
  const colorHelp: HTMLParagraphElement = element(
    "p",
    "microcopy",
    "Only timed events using selected colors start focus. Uncolored and all-day events are ignored.",
  );
  const colors: EventColor[] = snapshotColors.length === 0 ? EVENT_COLORS : snapshotColors;
  const colorGrid: HTMLDivElement = element("div", "color-grid");
  colors.forEach((color: EventColor): void => {
    colorGrid.append(buildColorChoice(color));
  });
  colorGroup.append(colorLegend, colorHelp, colorGrid);
  return colorGroup;
}

function buildCalendarChoice(calendar: Calendar): HTMLLabelElement {
  const label: HTMLLabelElement = element("label", "check-row");
  const checkbox: HTMLInputElement = element("input");
  checkbox.type = "checkbox";
  checkbox.value = calendar.id;
  checkbox.disabled = busy;
  checkbox.dataset.calendarId = calendar.id;
  checkbox.checked = draft?.calendarIds.includes(calendar.id) ?? false;
  checkbox.addEventListener("change", (): void => {
    if (draft === null) {
      return;
    }
    const choices: NodeListOf<HTMLInputElement> = document.querySelectorAll(
      "#connection-body input[data-calendar-id]",
    );
    const selectedIds: string[] = Array.from(choices)
      .filter((choice: HTMLInputElement): boolean => choice.checked)
      .map((choice: HTMLInputElement): string => choice.value);
    draft = { ...draft, calendarIds: selectedIds.length === 0 ? ["primary"] : selectedIds };
    markDirty();
  });
  const swatch: HTMLSpanElement = element("span", "calendar-swatch");
  swatch.style.backgroundColor = calendar.backgroundColor;
  const name: HTMLSpanElement = element("span", undefined, calendar.summary);
  label.append(checkbox, swatch, name);
  return label;
}

function buildColorChoice(color: EventColor): HTMLLabelElement {
  const label: HTMLLabelElement = element("label", "color-choice");
  const checkbox: HTMLInputElement = element("input");
  checkbox.type = "checkbox";
  checkbox.value = color.id;
  checkbox.disabled = busy;
  checkbox.checked = draft?.eventColorIds.includes(color.id) ?? false;
  checkbox.addEventListener("change", (): void => {
    if (draft === null) {
      return;
    }
    const nextIds: string[] = checkbox.checked
      ? [...draft.eventColorIds, color.id]
      : draft.eventColorIds.filter((id: string): boolean => id !== color.id);
    draft = { ...draft, eventColorIds: unique(nextIds) };
    markDirty();
  });
  const swatch: HTMLSpanElement = element("span", "color-swatch");
  swatch.style.backgroundColor = color.background;
  const name: HTMLSpanElement = element("span", undefined, color.name);
  label.append(checkbox, swatch, name);
  return label;
}

function renderSchedule(value: Snapshot): void {
  const meta: HTMLParagraphElement = requireElement("#schedule-meta", HTMLParagraphElement);
  const activeList: HTMLDivElement = requireElement("#active-events", HTMLDivElement);
  const upcomingList: HTMLDivElement = requireElement("#upcoming-events", HTMLDivElement);
  const syncButton: HTMLButtonElement = requireElement("#sync", HTMLButtonElement);
  const now: number = Date.now();
  const active: FocusEvent[] = value.focusEvents.filter((event: FocusEvent): boolean => {
    const start: number = new Date(event.start).getTime();
    const end: number = new Date(event.end).getTime();
    return start <= now && end > now;
  });
  meta.textContent = value.lastSync === null
    ? "Not synced yet"
    : `Last synced ${formatTime(value.lastSync)}`;
  syncButton.disabled = !value.connected || busy;
  renderEventList(activeList, active, "No focus event is active.");
  renderEventList(upcomingList, value.upcomingEvents, "No upcoming focus events.");
  if (value.testUntil !== null && new Date(value.testUntil).getTime() > now) {
    const test: HTMLDivElement = eventRow("1 minute focus test", `Ends ${formatTime(value.testUntil)}`);
    activeList.prepend(test);
  }
}

function renderEventList(container: HTMLElement, events: FocusEvent[], emptyText: string): void {
  container.replaceChildren();
  if (events.length === 0) {
    container.append(element("p", "empty-copy", emptyText));
    return;
  }
  events.forEach((event: FocusEvent): void => {
    container.append(eventRow(event.title, `${formatTime(event.start)} to ${formatTime(event.end)}`));
  });
}

function eventRow(titleText: string, timeText: string): HTMLDivElement {
  const row: HTMLDivElement = element("div", "event-row");
  const marker: HTMLSpanElement = element("span", "event-marker");
  const copy: HTMLDivElement = element("div");
  const title: HTMLParagraphElement = element("p", "event-title", titleText);
  const time: HTMLParagraphElement = element("p", "event-time", timeText);
  copy.append(title, time);
  row.append(marker, copy);
  return row;
}

function updateDraftFromInputs(): void {
  if (draft === null) {
    return;
  }
  const enabled: HTMLInputElement = requireElement("#enabled", HTMLInputElement);
  const domains: HTMLTextAreaElement = requireElement("#domains", HTMLTextAreaElement);
  draft = {
    ...draft,
    enabled: enabled.checked,
    domains: lines(domains.value),
  };
  const enabledStatus: HTMLSpanElement = requireElement("#enabled-status", HTMLSpanElement);
  enabledStatus.textContent = enabled.checked ? "On when focus is active" : "All blocking is paused";
  markDirty();
}

function markDirty(): void {
  dirty = true;
  renderSaveState();
}

function renderSaveState(): void {
  const state: HTMLParagraphElement = requireElement("#save-state", HTMLParagraphElement);
  const save: HTMLButtonElement = requireElement("#save", HTMLButtonElement);
  state.textContent = dirty ? "Unsaved changes" : "Settings saved";
  save.disabled = busy || draft === null || !dirty;
}

async function saveDraft(): Promise<void> {
  if (draft === null) {
    return;
  }
  updateDraftFromInputs();
  try {
    const valid: Settings = validateSettings(draft);
    setBusy(true, "Saving settings");
    const next: Snapshot = await saveSettings(valid);
    applySnapshot(next, true);
    if (next.error === null) {
      showMessage("Settings saved.", "success");
    }
  } catch (cause: unknown) {
    showMessage(errorMessage(cause), "error");
  } finally {
    setBusy(false);
  }
}

async function runSnapshotAction(
  label: string,
  action: () => Promise<Snapshot>,
): Promise<void> {
  setBusy(true, label);
  try {
    const next: Snapshot = await action();
    applySnapshot(next, false);
    if (next.error === null) {
      showMessage(`${label} complete.`, "success");
    }
  } catch (cause: unknown) {
    showMessage(errorMessage(cause), "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(nextBusy: boolean, label?: string): void {
  busy = nextBusy;
  const controls: NodeListOf<
    HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  > = document.querySelectorAll("button, input, select, textarea");
  controls.forEach((control: HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void => {
    control.disabled = nextBusy;
  });
  if (nextBusy && label !== undefined) {
    showMessage(`${label}...`, "progress");
  }
  renderSaveState();
  if (snapshot !== null) {
    renderConnection(snapshot);
    renderSchedule(snapshot);
  }
}

function showMessage(text: string, kind: "error" | "success" | "progress"): void {
  const message: HTMLDivElement = requireElement("#message", HTMLDivElement);
  message.hidden = false;
  message.className = `notice notice-${kind}`;
  message.textContent = text;
}

function hideProgressMessage(): void {
  const message: HTMLDivElement = requireElement("#message", HTMLDivElement);
  if (message.classList.contains("notice-progress")) {
    message.hidden = true;
  }
}

function hidePreviousSnapshotError(previousError: string | null): void {
  if (previousError === null) {
    return;
  }
  const message: HTMLDivElement = requireElement("#message", HTMLDivElement);
  if (message.classList.contains("notice-error") && message.textContent === previousError) {
    message.hidden = true;
  }
}

async function importDomainFile(input: HTMLInputElement): Promise<void> {
  const file: File | undefined = input.files?.[0];
  input.value = "";
  if (file === undefined) {
    return;
  }
  try {
    const text: string = await file.text();
    const domains: string[] = validateDomains(lines(text));
    const textarea: HTMLTextAreaElement = requireElement("#domains", HTMLTextAreaElement);
    textarea.value = domains.join("\n");
    updateDraftFromInputs();
    showMessage(`Loaded ${domains.length} website${domains.length === 1 ? "" : "s"} into the draft.`, "success");
  } catch (cause: unknown) {
    showMessage(errorMessage(cause), "error");
  }
}

async function importSettingsFile(input: HTMLInputElement): Promise<void> {
  const file: File | undefined = input.files?.[0];
  input.value = "";
  if (file === undefined) {
    return;
  }
  try {
    const text: string = await file.text();
    const parsed: unknown = JSON.parse(text);
    draft = validateSettings(parsed);
    dirty = true;
    renderDraft();
    if (snapshot !== null) {
      renderConnection(snapshot);
    }
    renderSaveState();
    showMessage("JSON loaded into the draft. Review it, then save.", "success");
  } catch (cause: unknown) {
    showMessage(`Could not import settings. ${errorMessage(cause)}`, "error");
  }
}

function exportSettings(): void {
  if (draft === null) {
    return;
  }
  updateDraftFromInputs();
  try {
    const valid: Settings = validateSettings(draft);
    const contents: string = `${JSON.stringify(valid, null, 2)}\n`;
    const blob: Blob = new Blob([contents], { type: "application/json" });
    const url: string = URL.createObjectURL(blob);
    const link: HTMLAnchorElement = element("a");
    link.href = url;
    link.download = "superfocus-settings.json";
    link.click();
    URL.revokeObjectURL(url);
    showMessage("Settings JSON exported.", "success");
  } catch (cause: unknown) {
    showMessage(errorMessage(cause), "error");
  }
}

function validateSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    return parseSettings(value);
  }
  const calendarIds: string[] = stringArray(value.calendarIds, "calendarIds");
  const normalized: Record<string, unknown> = {
    ...value,
    calendarIds: calendarIds.length === 0 ? ["primary"] : calendarIds,
    domains: validateDomains(stringArray(value.domains, "domains")),
  };
  return parseSettings(normalized);
}

function validateDomains(values: string[]): string[] {
  const normalized: string[] = values.map((value: string): string => normalizeDomain(value));
  return unique(normalized);
}

function normalizeDomain(value: string): string {
  const trimmed: string = value.trim();
  if (/[*^\[\]{}|]/.test(trimmed)) {
    throw new Error(
      `Unsupported wildcard rule: ${trimmed}. Use one plain domain or URL per line.`,
    );
  }
  const candidate: string = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (cause: unknown) {
    throw new Error(`Invalid website: ${trimmed}`, { cause });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  const hostname: string = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const validHostname: boolean =
    /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(
      hostname,
    );
  if (!validHostname) {
    throw new Error(`Invalid website domain: ${hostname || trimmed}`);
  }
  return hostname;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item: unknown): item is string => typeof item === "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }
  return value.map((item: string): string => item.trim()).filter((item: string): boolean => item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.length > 0);
}

function unique(values: string[]): string[] {
  return [...new Set<string>(values)];
}

function copySettings(value: Settings): Settings {
  return {
    version: 1,
    enabled: value.enabled,
    calendarIds: [...value.calendarIds],
    eventColorIds: [...value.eventColorIds],
    domains: [...value.domains],
  };
}
