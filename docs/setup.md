# Set up Superfocus

Superfocus uses Chrome's Identity API and the Google Calendar API. The checked-in manifest key keeps the extension ID stable across local builds. The key is public identity material. It is not a client secret.

## Build once and get the extension ID

Run an initial build:

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the repository's `dist` directory. Copy the ID shown on the Superfocus card.

## Create the Google OAuth client

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
3. Configure the OAuth consent screen. For a personal test project, add your Google account as a test user if Google asks for one.
4. Open **APIs & Services > Credentials**, create an OAuth client, and select **Chrome Extension** as the application type.
5. Paste the extension ID into the **Item ID** field.
6. Copy the generated client ID. It ends in `.apps.googleusercontent.com`.

The manifest requests `https://www.googleapis.com/auth/calendar.readonly`. This scope lets Superfocus read calendars and events. See Google's [Calendar scope reference](https://developers.google.com/workspace/calendar/api/auth) and Chrome's [extension OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth).

## Build with the client ID

```sh
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" npm run build
```

Return to `chrome://extensions` and reload Superfocus. Open the extension, connect Google Calendar, then choose the calendars and explicit event colors that should start a focus period.

OAuth client IDs identify public applications, so the built extension contains this value. Do not add a client secret. Chrome extensions cannot keep one secret.

## Run a one-minute test without OAuth

1. Load the unpacked extension.
2. Pin Superfocus in Chrome's extensions menu. Click its icon, then **Open settings**.
3. Add `example.com` to the website list, leave blocking enabled, and choose **Save settings**.
4. Close the settings page. Click the extension icon and choose **Test 1 min**, then close the popup.
5. Open `https://example.com` in a new tab and confirm Superfocus blocks it.
6. Wait for the test to end, then enter the domain in the address bar again and confirm access returns.

This checks browser blocking without reading Google Calendar or keeping the settings page open. Chrome must stay running with the extension enabled. You do not need a website, dev server, terminal, or Google Calendar tab open.

## Configure focus events

Superfocus only matches timed events with an explicit Google event color. In Google Calendar, edit an event, set a color on that event, and save it. Pick the same color in Superfocus.

These do not trigger focus periods:

- all-day events
- events with no explicit event color
- a calendar's inherited/default color
- color IDs outside Google's event color IDs 1 through 11

If matching events overlap, blocking continues until the last matching event ends.

## Back up settings

Paste website domains or URLs as plain text, one per line. Superfocus reduces URLs to their domains and rejects wildcard rules. Text and JSON imports load an unsaved draft, so review the result and choose **Save settings**. Use JSON export and import to move settings between Chrome profiles. The export can contain calendar IDs, selected color IDs, and domains. Review it before sharing it.

Superfocus does not import `.ics` or iCal files.
