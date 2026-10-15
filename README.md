# Superfocus

Superfocus is a Chrome extension that blocks chosen websites during selected Google Calendar events. Pick calendars, explicit Google event colors, and domains. The extension keeps the block active until the matching timed event ends.

Chrome runs the extension in the background. You can close its popup, settings page, and Google Calendar tab. No website, local server, or terminal needs to stay open. Chrome must remain running with the extension enabled.

## Install from source

You need Node.js 22.12 or newer, npm, and Google Chrome. Node.js 24 LTS also works.

```sh
npm ci
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`.

Pin Superfocus in Chrome's extensions menu. Click its icon, then **Open settings** to choose websites and event colors. Save your settings and close the page.

This source build does not include a Google OAuth client. The initial build supports the one-minute blocking test, but Google Calendar needs your own OAuth client. See [setup](docs/setup.md).

## Behavior and limits

- Blocking applies in the Chrome profile where you installed the extension.
- Superfocus matches timed events with an explicit Google Calendar color ID from 1 through 11.
- All-day events and events that only inherit their calendar color do not trigger blocking.
- Superfocus does not block desktop apps, other browsers, or Chrome profiles without the extension.
- You can disable or remove the extension through Chrome.
- Calendar access is read-only. The extension does not create or edit events.
- Paste website domains or URLs as plain text, one per line. URLs reduce to domains, and wildcard rules fail with an error. Text and JSON imports create an unsaved draft that you must save.
- Calendar data must come from Google Calendar. Superfocus does not import `.ics` or iCal files.

## Development

`npm run dev` opens a browser preview for editing the extension UI. That preview cannot block websites and is not needed to use the installed extension.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Reload the unpacked extension after each build. See [setup](docs/setup.md) for a one-minute manual test.

## License

[MIT](LICENSE)
