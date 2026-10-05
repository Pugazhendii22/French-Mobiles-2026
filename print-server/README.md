# TVSE print server

Runs on the shop PC. Phones post a label's HTML to it; it renders the label in
Chrome, converts it to a 1-bit bitmap and sends it to the TVSE LP46 over TCP
9100. The app reaches it through `VITE_PRINT_SERVER_URL` (see `.env.example`).

It lives in this repository so there is a copy of it somewhere other than that
one PC, and so changes to it can be reviewed like any other change. **The PC
runs its own copy** - putting a new version here does nothing until it is
installed, below.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Is this PC answering? Touches nothing else, so it is quick. |
| `GET /status` | Is the printer answering? `printer.state` is `online`, `offline` or `busy`. |
| `POST /print` | `{ mode: "html", html }` - what the app sends. Also `mode:"raw"` (off by default) and a text mode. |
| `POST /test-print` | A test label, carrying this PC's real address. |

`/status` does **not** probe the printer while a job is running or queued: the
probe opens the same port the job uses and the printer takes one connection at
a time. It reports the last state it saw, marked `cached: true`, and `state:
"busy"`. The app treats that as "unknown" and still lets you print - the job
simply queues.

A successful reply means **sent**, not printed. The printer does not
acknowledge a label, so nothing here can promise one came out.

## Install an update on the shop PC

The current install is at `C:\tvse-print-server`. From that folder:

```
copy server.js server.js.bak
```

Then replace `server.js` with this one (download it from GitHub, or paste it),
and restart the server however it is started today - close the window and
re-run `node server.js`, or restart the service/scheduled task.

Check it before walking away:

```
curl http://localhost:3000/health
curl http://localhost:3000/status
curl -X POST http://localhost:3000/test-print
```

The test label prints this PC's own address, so if it disagrees with
`VITE_PRINT_SERVER_URL` in the app, that is the problem.

To go back: restore `server.js.bak` and restart.

## Settings

**Put this shop's real addresses in `config.json`, next to `server.js`.** Copy
`config.example.json` to `config.json` and edit it:

```json
{
  "printerHost": "192.168.1.251",
  "printerPort": 9100,
  "serverPort": 3000
}
```

That file is deliberately **not** part of an update and is not in git, so
replacing `server.js` leaves your addresses alone - the defaults written into
the code stop mattering once it exists. The startup line in `logs/server.log`
says `"config":"config.json"` when it is being used, and names the printer
address in use. A `config.json` that cannot be parsed is logged as an error and
the server still starts on defaults, so a typo there does not look like a
printer fault.

Every setting can also come from an environment variable, which wins over the
file:

| Variable | `config.json` key | Default |
|---|---|---|
| `PRINTER_HOST` | `printerHost` | `192.168.1.251` |
| `PRINTER_PORT` | `printerPort` | `9100` |
| `SERVER_PORT` | `serverPort` | `3000` |
| `CHROME_PATH` | `chromePath` | the bundled Chrome under `C:\tvse-print-server\chrome\...` |
| `ALLOW_RAW` | `allowRaw` | off (raw printer commands refused) |

`ALLOW_RAW=1` re-enables `mode:"raw"`, which sends submitted bytes straight to
the printer. The app never uses it; it is off because anything able to reach
this port could otherwise drive the printer directly.

## Dependencies

`express`, `cors`, `puppeteer`, `jimp`. They are already installed on the PC.

**Keep Jimp on 0.x** (`jimp@^0.22`). Version 1.x changed the API this file uses
(`Jimp.read`, `image.bitmap.data`, `image.resize`) and will break printing. If
you ever reinstall, `npm install` in this folder uses `package.json`, and
`PUPPETEER_SKIP_DOWNLOAD=1` avoids pulling another ~150 MB of Chromium when
`CHROME_PATH` already points at one.

## Things not to "fix"

- **`if (gray > 128)` marks light pixels, and that is correct.** TSPL `BITMAP`
  prints the 0 bits, so the light pixels are the ones that get a 1. The
  condition reads backwards; inverting it would invert every label.
- **The geometry is fixed to the stock**: 50 x 25 mm, rendered at 189 x 95 CSS
  pixels and scaled to 400 x 200 (203 dpi). The app builds its HTML at the same
  size. Change one and you must change the other.
- **The 400 ms grace after the flush** is there because the printer wants a
  moment with the data before the socket goes away.

## Known limits

- HTTP on a private address, called from an HTTPS app. It works on the shop's
  phones today; it is not guaranteed on every browser, and it is not fixable
  from this file.
- No authentication. Anything on the shop network that can reach port 3000 can
  print. That is acceptable on an isolated LAN - **do not port-forward it or put
  it behind a public tunnel** without adding authentication first.
- Submitted HTML is rendered in Chrome. Scripts are disabled and http(s)
  requests from the page are blocked, and the sandbox is used when Chrome will
  start with it (the log says which), but rendering someone else's markup is
  still the riskiest thing here.
