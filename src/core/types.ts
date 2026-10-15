export interface Settings {
  version: 1;
  enabled: boolean;
  calendarIds: string[];
  eventColorIds: string[];
  domains: string[];
}

export interface FocusEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  colorId: string;
  calendarId: string;
}

export interface Calendar {
  id: string;
  summary: string;
  backgroundColor: string;
}

export interface EventColor {
  id: string;
  name: string;
  background: string;
}

export interface Snapshot {
  settings: Settings;
  configured: boolean;
  connected: boolean;
  calendars: Calendar[];
  colors: EventColor[];
  focusEvents: FocusEvent[];
  upcomingEvents: FocusEvent[];
  lastSync: string | null;
  error: string | null;
  testUntil: string | null;
}
