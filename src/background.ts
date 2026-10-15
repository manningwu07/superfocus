import { CalendarHttpError, fetchCalendars, fetchFocusEvents } from "./core/calendar";
import { EVENT_COLORS } from "./core/colors";
import { parseRequest, type Request, type Response } from "./core/messages";
import { focusState, selectedLiveEvents, type FocusState } from "./core/schedule";
import { DEFAULT_SETTINGS, parseSettings } from "./core/settings";
import { parseSnapshot } from "./core/snapshot";
import type { Calendar, FocusEvent, Settings, Snapshot } from "./core/types";

const SNAPSHOT_KEY: string = "snapshot";
const SYNC_ALARM: string = "superfocus:sync";
const BOUNDARY_ALARM_PREFIX: string = "superfocus:boundary:";
const BLOCK_RULE_ID: number = 1;
const HORIZON_MILLIS: number = 8 * 24 * 60 * 60 * 1_000;
const TEST_DURATION_MILLIS: number = 60 * 1_000;

let reconcileTail: Promise<void> = Promise.resolve();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptySnapshot(error: string | null = null): Snapshot {
  return {
    settings: parseSettings(DEFAULT_SETTINGS),
    configured: __GOOGLE_CLIENT_ID_CONFIGURED__,
    connected: false,
    calendars: [],
    colors: EVENT_COLORS,
    focusEvents: [],
    upcomingEvents: [],
    lastSync: null,
    error,
    testUntil: null,
  };
}

async function loadSnapshot(): Promise<Snapshot> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(SNAPSHOT_KEY);
  const value: unknown = stored[SNAPSHOT_KEY];
  if (value === undefined) {
    return emptySnapshot();
  }
  try {
    const snapshot: Snapshot = parseSnapshot(value);
    return { ...snapshot, configured: __GOOGLE_CLIENT_ID_CONFIGURED__, colors: EVENT_COLORS };
  } catch (error: unknown) {
    return emptySnapshot(`Stored Superfocus data is invalid: ${errorMessage(error)}`);
  }
}

async function storeSnapshot(snapshot: Snapshot): Promise<void> {
  await chrome.storage.local.set({ [SNAPSHOT_KEY]: snapshot });
}

function currentSnapshot(snapshot: Snapshot, now: number): Snapshot {
  const focusEvents: FocusEvent[] = selectedLiveEvents(snapshot.focusEvents, snapshot.settings, now);
  const testMillis: number | null = snapshot.testUntil === null ? null : Date.parse(snapshot.testUntil);
  const testUntil: string | null =
    testMillis !== null && Number.isFinite(testMillis) && testMillis > now
      ? new Date(testMillis).toISOString()
      : null;
  const upcomingEvents: FocusEvent[] = focusEvents.filter(
    (event: FocusEvent): boolean => Date.parse(event.start) > now,
  );
  return { ...snapshot, focusEvents, upcomingEvents, testUntil };
}

async function getToken(interactive: boolean): Promise<string> {
  if (!__GOOGLE_CLIENT_ID_CONFIGURED__) {
    throw new Error("Set GOOGLE_CLIENT_ID when building the extension.");
  }
  const result: chrome.identity.GetAuthTokenResult = await chrome.identity.getAuthToken({ interactive });
  if (result.token === undefined || result.token.length === 0) {
    throw new Error("Google did not return an access token.");
  }
  return result.token;
}

async function fetchSchedule(
  token: string,
  settings: Settings,
  now: number,
): Promise<[Calendar[], FocusEvent[]]> {
  const selectedColors: ReadonlySet<string> = new Set<string>(settings.eventColorIds);
  const timeMin: Date = new Date(now);
  const timeMax: Date = new Date(now + HORIZON_MILLIS);
  const requests: [Promise<Calendar[]>, Promise<FocusEvent[]>] = [
    fetchCalendars(token),
    fetchFocusEvents(token, settings.calendarIds, selectedColors, timeMin, timeMax),
  ];
  return Promise.all(requests);
}

async function syncFromGoogle(snapshot: Snapshot, now: number): Promise<Snapshot> {
  if (!snapshot.connected) {
    return snapshot;
  }
  try {
    let token: string = await getToken(false);
    let schedule: [Calendar[], FocusEvent[]];
    try {
      schedule = await fetchSchedule(token, snapshot.settings, now);
    } catch (error: unknown) {
      if (!(error instanceof CalendarHttpError) || error.status !== 401) {
        throw error;
      }
      await chrome.identity.removeCachedAuthToken({ token });
      token = await getToken(false);
      schedule = await fetchSchedule(token, snapshot.settings, now);
    }
    const [calendars, focusEvents]: [Calendar[], FocusEvent[]] = schedule;
    return {
      ...snapshot,
      calendars,
      focusEvents,
      upcomingEvents: focusEvents.filter(
        (event: FocusEvent): boolean => Date.parse(event.start) > now,
      ),
      lastSync: new Date(now).toISOString(),
      error: null,
    };
  } catch (error: unknown) {
    return { ...snapshot, error: errorMessage(error) };
  }
}

async function replaceBoundaryAlarms(boundaries: readonly number[]): Promise<void> {
  const alarms: chrome.alarms.Alarm[] = await chrome.alarms.getAll();
  for (let index: number = 0; index < alarms.length; index += 1) {
    const alarm: chrome.alarms.Alarm | undefined = alarms[index];
    if (alarm === undefined) {
      throw new Error("Chrome returned an invalid alarm list.");
    }
    if (alarm.name.startsWith(BOUNDARY_ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }
  const nextBoundary: number | undefined = boundaries[0];
  if (nextBoundary !== undefined) {
    await chrome.alarms.create(`${BOUNDARY_ALARM_PREFIX}${nextBoundary}`, { when: nextBoundary });
  }
  const syncAlarm: chrome.alarms.Alarm | undefined = await chrome.alarms.get(SYNC_ALARM);
  if (syncAlarm === undefined) {
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
  }
}

async function replaceBlockingRule(active: boolean, domains: readonly string[]): Promise<void> {
  const addRules: chrome.declarativeNetRequest.Rule[] = [];
  if (active && domains.length > 0) {
    addRules.push({
      id: BLOCK_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { extensionPath: "/blocked.html" },
      },
      condition: {
        requestDomains: [...domains],
        resourceTypes: ["main_frame"],
      },
    });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE_ID],
    addRules,
  });
}

function matchesDomain(urlString: string, domains: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const hostname: string = url.hostname.toLowerCase();
  return domains.some(
    (domain: string): boolean => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

async function redirectMatchingTabs(domains: readonly string[]): Promise<void> {
  const tabs: chrome.tabs.Tab[] = await chrome.tabs.query({});
  const blockedUrl: string = chrome.runtime.getURL("blocked.html");
  const redirects: Promise<void>[] = [];
  for (let index: number = 0; index < tabs.length; index += 1) {
    const tab: chrome.tabs.Tab | undefined = tabs[index];
    if (tab === undefined) {
      throw new Error("Chrome returned an invalid tab list.");
    }
    if (tab.id !== undefined && tab.url !== undefined && matchesDomain(tab.url, domains)) {
      const tabId: number = tab.id;
      redirects.push(updateTabToBlocked(tabId, blockedUrl));
    }
  }
  await Promise.all(redirects);
}

async function updateTabToBlocked(tabId: number, blockedUrl: string): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { url: blockedUrl });
  } catch (error: unknown) {
    const message: string = errorMessage(error);
    const missingWithPeriod: string = `No tab with id: ${tabId}.`;
    const missingWithoutPeriod: string = `No tab with id: ${tabId}`;
    if (message !== missingWithPeriod && message !== missingWithoutPeriod) {
      throw error;
    }
  }
}

async function reconcile(shouldSync: boolean): Promise<Snapshot> {
  let now: number = Date.now();
  const loaded: Snapshot = await loadSnapshot();
  let snapshot: Snapshot = currentSnapshot(loaded, now);
  if (shouldSync) {
    snapshot = currentSnapshot(await syncFromGoogle(snapshot, now), now);
    now = Date.now();
    snapshot = currentSnapshot(snapshot, now);
  }
  const testUntil: number | null =
    snapshot.testUntil === null ? null : Date.parse(snapshot.testUntil);
  const state: FocusState = focusState(
    snapshot.focusEvents,
    now,
    testUntil,
    snapshot.settings.enabled,
  );
  await replaceBoundaryAlarms(state.boundaries);
  await replaceBlockingRule(state.active, snapshot.settings.domains);
  if (state.active) {
    await redirectMatchingTabs(snapshot.settings.domains);
  }
  await storeSnapshot(snapshot);
  return snapshot;
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result: Promise<T> = reconcileTail.then(operation, operation);
  reconcileTail = result.then(
    (): void => undefined,
    (): void => undefined,
  );
  return result;
}

async function handleRequest(request: Request): Promise<Snapshot> {
  if (request.type === "getSnapshot") {
    return reconcile(false);
  }
  if (request.type === "saveSettings") {
    const snapshot: Snapshot = await loadSnapshot();
    const settings: Settings = parseSettings(request.settings);
    await storeSnapshot({ ...snapshot, settings, error: null });
    return reconcile(snapshot.connected);
  }
  if (request.type === "connect") {
    const snapshot: Snapshot = await loadSnapshot();
    try {
      await getToken(true);
      await storeSnapshot({ ...snapshot, connected: true, error: null });
      return reconcile(true);
    } catch (error: unknown) {
      const failed: Snapshot = { ...snapshot, connected: false, error: errorMessage(error) };
      await storeSnapshot(failed);
      return reconcile(false);
    }
  }
  if (request.type === "disconnect") {
    const snapshot: Snapshot = await loadSnapshot();
    await chrome.identity.clearAllCachedAuthTokens();
    await storeSnapshot({
      ...snapshot,
      connected: false,
      calendars: [],
      focusEvents: [],
      upcomingEvents: [],
      lastSync: null,
      error: null,
    });
    return reconcile(false);
  }
  if (request.type === "syncNow") {
    return reconcile(true);
  }
  const snapshot: Snapshot = await loadSnapshot();
  if (!snapshot.settings.enabled) {
    throw new Error("Enable Superfocus before starting a test focus.");
  }
  const testUntil: string = new Date(Date.now() + TEST_DURATION_MILLIS).toISOString();
  await storeSnapshot({ ...snapshot, testUntil, error: null });
  return reconcile(false);
}

function sendFailure(sendResponse: (response: Response) => void, error: unknown): void {
  sendResponse({ ok: false, error: errorMessage(error) });
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: Response) => void): true => {
    let request: Request;
    try {
      request = parseRequest(message);
    } catch (error: unknown) {
      sendFailure(sendResponse, error);
      return true;
    }
    void serialized((): Promise<Snapshot> => handleRequest(request)).then(
      (snapshot: Snapshot): void => sendResponse({ ok: true, snapshot }),
      (error: unknown): void => sendFailure(sendResponse, error),
    );
    return true;
  },
);

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm): void => {
  const shouldSync: boolean = alarm.name === SYNC_ALARM;
  if (shouldSync || alarm.name.startsWith(BOUNDARY_ALARM_PREFIX)) {
    runInBackground((): Promise<Snapshot> => reconcile(shouldSync));
  }
});

chrome.runtime.onInstalled.addListener((): void => {
  runInBackground((): Promise<Snapshot> => reconcile(false));
});

chrome.runtime.onStartup.addListener((): void => {
  runInBackground((): Promise<Snapshot> => reconcile(true));
});

async function recordBackgroundError(error: unknown): Promise<void> {
  const snapshot: Snapshot = await loadSnapshot();
  const message: string = `Background update failed: ${errorMessage(error)}`;
  console.error(message);
  await storeSnapshot({ ...snapshot, error: message });
}

function runInBackground(operation: () => Promise<Snapshot>): void {
  void serialized(operation).catch((error: unknown): void => {
    void serialized((): Promise<void> => recordBackgroundError(error)).catch(
      (storageError: unknown): void => console.error("Could not store background error.", storageError),
    );
  });
}

runInBackground((): Promise<Snapshot> => reconcile(false));
