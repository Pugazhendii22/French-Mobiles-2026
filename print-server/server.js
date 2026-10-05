"use strict";

/* ─────────────────────────────────────────────
   TVSE PRINT SERVER

   Runs on the shop PC. Phones post a label's HTML here; this renders it in
   Chrome, turns it into a 1-bit bitmap and sends it to the label printer over
   TCP 9100.

   What changed from the previous version, and why:

   - A job had no overall deadline. The 5-second timer covered connecting and
     was then cleared, so if a socket write never completed the request never
     answered and the phone sat on "Printing..." forever. Every stage is now
     bounded.
   - The socket was destroyed 400ms after the last write, which can cut a job
     off mid-flush and print half a label. It now waits for the flush to
     complete, then keeps the same 400ms grace.
   - A connection closing early after connect was not treated as a failure. It
     is now.
   - Every request launched its own Chrome. Two phones printing at once meant
     two Chrome processes on the counter PC. One browser is launched, reused,
     and closed when idle.
   - Jobs were not serialised. The printer takes one connection at a time, so
     jobs now run one at a time with a bounded queue; past that the server says
     it is busy rather than piling up.
   - /status opened a connection to the printer's own port on every check,
     which can collide with a job in flight. It is no longer probed while a job
     is running or queued; the last known state is reported instead, marked as
     such.
   - Submitted HTML was rendered in Chrome with --no-sandbox. The sandbox is
     now used when Chrome will start with it, and in the page JavaScript is
     disabled and http(s) requests are blocked - a label needs neither.
   - Logging was synchronous on every line and the file grew forever. It is
     now a stream with size-based rotation, and each request carries an id and
     a duration. Label contents are never logged.
   - Addresses and paths come from the environment, with the shop's current
     values as defaults.

   NOT changed, deliberately: the label geometry (50 x 25 mm, 189 x 95 CSS px
   rendered to 400 x 200 at 203dpi), the TSPL header, and the bitmap polarity.
   Those produce labels that come out correctly today.

   NOTE on polarity: `gray > 128` sets the bit, and gray > 128 means a LIGHT
   pixel. That is correct - TSPL BITMAP prints the 0 bits - so the condition
   reads backwards but is right. Do not "fix" it; it would invert every label.
────────────────────────────────────────────── */

const express = require("express");
const cors = require("cors");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// ── Config ────────────────────────────────────────────────────────────────────

/* config.json sits next to this file and is NOT part of an update: put this
   shop's real addresses there once and replacing server.js leaves them alone.
   Without it the defaults below apply, and an environment variable beats both.
   See config.example.json. */
const CONFIG_FILE = path.join(__dirname, "config.json");

let fileConfig = {};
let configError = null;
try {
  if (fs.existsSync(CONFIG_FILE)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  }
} catch (err) {
  // Never refuse to start over a config file: fall back and say so loudly.
  configError = err.message;
}

const setting = (envName, fileName, fallback) =>
  process.env[envName] ?? fileConfig[fileName] ?? fallback;

const PRINTER_HOST = String(setting("PRINTER_HOST", "printerHost", "192.168.1.251"));
const PRINTER_PORT = Number(setting("PRINTER_PORT", "printerPort", 9100));
const SERVER_PORT = Number(setting("SERVER_PORT", "serverPort", 3000));
const CHROME_PATH = String(setting(
  "CHROME_PATH",
  "chromePath",
  "C:\\tvse-print-server\\chrome\\chrome\\win64-121.0.6167.85\\chrome-win64\\chrome.exe"
));

/* Raw printer commands are an injection path - anything that can reach this
   port could drive the printer directly. The app never uses it, so it is off
   unless switched on deliberately. */
const ALLOW_RAW = String(setting("ALLOW_RAW", "allowRaw", "")) === "1" || fileConfig.allowRaw === true;

// Deadlines, all in ms
const PROBE_TIMEOUT_MS = 3000;        // printer reachability check
const CONNECT_TIMEOUT_MS = 5000;      // TCP connect for a job
const SEND_TIMEOUT_MS = 20000;        // connect + write + flush, end to end
const FLUSH_GRACE_MS = 400;           // after the flush completes, as before
const RENDER_TIMEOUT_MS = 20000;      // Chrome rendering one label
const JOB_TIMEOUT_MS = 45000;         // render + send for one job
const BROWSER_IDLE_MS = 5 * 60 * 1000;
const PROBE_CACHE_MS = 15000;
const QUEUE_MAX = 4;                  // jobs allowed to wait

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "server.log");
const LOG_MAX_BYTES = 5 * 1024 * 1024;
const LOG_KEEP = 3;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

let logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
let logBytes = (() => {
  try { return fs.statSync(LOG_FILE).size; } catch { return 0; }
})();

function rotateLogs() {
  try {
    logStream.end();
    for (let i = LOG_KEEP - 1; i >= 1; i -= 1) {
      const from = `${LOG_FILE}.${i}`;
      const to = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    console.error("Log rotation failed:", err.message);
  }
  logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  logBytes = 0;
}

function log(level, msg, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  console.log(line);
  try {
    logBytes += Buffer.byteLength(line) + 1;
    if (logBytes > LOG_MAX_BYTES) rotateLogs();
    logStream.write(line + "\n");
  } catch {
    /* never let logging break a print */
  }
}

// ── Printer reachability, cached and never probed during a job ────────────────
function isPrinterOnline() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => done(false), PROBE_TIMEOUT_MS);
    socket.connect(PRINTER_PORT, PRINTER_HOST, () => done(true));
    socket.on("error", () => done(false));
  });
}

let lastProbe = { online: null, at: 0, latencyMs: null };

async function printerState() {
  /* The probe opens the same port a job uses, and the printer takes one
     connection at a time, so while anything is printing or waiting to print we
     report what we last saw rather than interfering. */
  if (jobActive || pendingJobs > 0) {
    return { ...lastProbe, state: "busy", cached: true };
  }
  if (lastProbe.at && Date.now() - lastProbe.at < PROBE_CACHE_MS) {
    return { ...lastProbe, state: lastProbe.online ? "online" : "offline", cached: true };
  }

  const started = Date.now();
  const online = await isPrinterOnline();
  lastProbe = { online, at: Date.now(), latencyMs: online ? Date.now() - started : null };
  return { ...lastProbe, state: online ? "online" : "offline", cached: false };
}

// ── One job at a time ─────────────────────────────────────────────────────────
let chain = Promise.resolve();
let pendingJobs = 0;
let jobActive = false;

function enqueuePrinterJob(fn) {
  if (pendingJobs >= QUEUE_MAX) {
    const err = new Error(`printer is busy - ${pendingJobs} jobs already waiting`);
    err.httpStatus = 503;
    return Promise.reject(err);
  }
  pendingJobs += 1;

  // .catch on the tail so one failed job never blocks the queue behind it.
  const run = chain.catch(() => {}).then(async () => {
    jobActive = true;
    try {
      return await withTimeout(fn(), JOB_TIMEOUT_MS, `job did not finish within ${JOB_TIMEOUT_MS}ms`);
    } finally {
      jobActive = false;
      pendingJobs -= 1;
    }
  });

  chain = run.catch(() => {});
  return run;
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

// ── TCP send ──────────────────────────────────────────────────────────────────
function sendToPrinter(chunks, jobId) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    let flushed = false;
    let writesDone = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(connTimer);
      clearTimeout(jobTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    // Bounds the whole thing - connect, writes and flush - which the previous
    // version did not, so a stalled write hung the request for good.
    const jobTimer = setTimeout(
      () => finish(new Error(`printer did not take the job within ${SEND_TIMEOUT_MS}ms`)),
      SEND_TIMEOUT_MS
    );
    const connTimer = setTimeout(
      () => finish(new Error("connection timeout - is the printer on?")),
      CONNECT_TIMEOUT_MS
    );

    socket.on("error", (err) => finish(err));

    socket.on("close", (hadError) => {
      if (settled) return;
      /* A printer that has taken the whole job commonly closes the connection
         itself, and that close can arrive before the flush callback - so a
         clean close after every chunk was written is success. A close carrying
         a transmission error, or one arriving while chunks were still going
         out, is not: that is a job the printer did not get, which the previous
         version did not notice at all. */
      if (hadError) finish(new Error("printer reset the connection during the job"));
      else if (writesDone) finish(null);
      else finish(new Error("printer closed the connection before the job was sent"));
    });

    socket.connect(PRINTER_PORT, PRINTER_HOST, async () => {
      clearTimeout(connTimer);
      log("info", "Printer connected", { jobId });
      try {
        for (const chunk of chunks) {
          await new Promise((res, rej) => {
            socket.write(chunk, (err) => (err ? rej(err) : res()));
          });
        }
        writesDone = true;
        /* end() waits for everything queued to flush and then sends FIN; the
           previous version called destroy() 400ms after the last write
           callback, which can cut a job off part-sent. The same grace is kept
           after the flush, since the printer needs a moment with the data. */
        socket.end(() => {
          flushed = true;
          setTimeout(() => finish(null), FLUSH_GRACE_MS);
        });
      } catch (err) {
        finish(err);
      }
    });
  });
}

// ── TSPL text label (test print / fallback) ───────────────────────────────────
function buildTSPL({ line1 = "", line2 = "", line3 = "", barcode = null, copies = 1 }) {
  const esc = (s) => String(s).replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  const cmds = [
    "SIZE 50 mm,25 mm",
    "GAP 3 mm,0",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "OFFSET 0",
    "SET PEEL OFF",
    "SET CUTTER OFF",
    "CLS",
  ];
  let y = 8;
  if (line1) { cmds.push(`TEXT 8,${y},"4",0,1,1,"${esc(line1)}"`); y += 48; }
  if (line2) { cmds.push(`TEXT 8,${y},"3",0,1,1,"${esc(line2)}"`); y += 36; }
  if (line3) { cmds.push(`TEXT 8,${y},"2",0,1,1,"${esc(line3)}"`); y += 28; }
  if (barcode) {
    const bY = Math.max(y + 4, 130);
    cmds.push(`BARCODE 8,${bY},"128",40,1,0,2,2,"${esc(barcode)}"`);
  }
  cmds.push(`PRINT ${Math.max(1, parseInt(copies) || 1)},1`);
  return [Buffer.from(cmds.join("\r\n") + "\r\n", "ascii")];
}

/** This machine's LAN address, so the test label prints where to reach it. */
function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net4 of nets[name] || []) {
      if (net4.family === "IPv4" && !net4.internal) return net4.address;
    }
  }
  return "this-pc";
}

// ── Chrome, launched once and reused ──────────────────────────────────────────
let browserPromise = null;
let browserIdleTimer = null;

async function launchBrowser() {
  const puppeteer = require("puppeteer");
  const base = {
    headless: "new",
    args: ["--disable-gpu", "--disable-dev-shm-usage"],
  };
  if (CHROME_PATH && fs.existsSync(CHROME_PATH)) base.executablePath = CHROME_PATH;

  try {
    const browser = await puppeteer.launch(base);
    log("info", "Chrome started with the sandbox");
    return browser;
  } catch (err) {
    /* The sandbox is the protection against rendering submitted HTML; fall
       back only if Chrome will not start with it, and say so. */
    log("warn", "Chrome would not start with the sandbox; continuing without it", { error: err.message });
    return puppeteer.launch({
      ...base,
      args: [...base.args, "--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      const alive = typeof existing.connected === "boolean"
        ? existing.connected
        : existing.isConnected?.() !== false;
      if (alive) return existing;
    } catch {
      /* the previous launch failed - start a new one below */
    }
    browserPromise = null;
  }
  browserPromise = launchBrowser();
  return browserPromise;
}

function touchBrowserIdleTimer() {
  clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(async () => {
    const pending = browserPromise;
    browserPromise = null;
    try {
      const browser = await pending;
      await browser.close();
      log("info", "Chrome closed while idle");
    } catch {
      /* already gone */
    }
  }, BROWSER_IDLE_MS);
}

// ── HTML → bitmap (the mobile print path) ─────────────────────────────────────
async function buildBitmapFromHTML(html, jobId) {
  const Jimp = require("jimp");

  // Viewport: 50mm x 25mm at 96dpi = 189 x 95 CSS pixels.
  // deviceScaleFactor 2.1164 scales the output to 400 x 200 pixels (203dpi).
  const CSS_W = 189;
  const CSS_H = 95;
  const OUT_W = 400;
  const OUT_H = 200;
  const SCALE = OUT_W / CSS_W;

  const browser = await getBrowser();
  const page = await browser.newPage();
  let screenshot;

  try {
    /* A label is static markup with a data: URI barcode. It needs no scripts
       and no network, and denying both means submitted HTML cannot run code or
       reach anything on the shop network. */
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (/^https?:/i.test(url) || /^wss?:/i.test(url)) {
        request.abort().catch(() => {});
      } else {
        request.continue().catch(() => {});
      }
    });

    await page.setViewport({ width: CSS_W, height: CSS_H, deviceScaleFactor: SCALE });

    // Older app builds sized the label in mm; pin it to the exact pixel box.
    const fittedHTML = html.includes("</style>")
      ? html.replace(
        "</style>",
        `
  html, body {
    width: 189px !important;
    height: 95px !important;
    overflow: hidden !important;
  }
  .label {
    width: 189px !important;
    height: 95px !important;
  }
  </style>`
      )
      : html;

    await page.setContent(fittedHTML, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });

    screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: CSS_W, height: CSS_H },
    });
  } finally {
    await page.close().catch(() => {});
    touchBrowserIdleTimer();
  }

  log("info", "Label rendered", { jobId, bytes: screenshot.length });

  // Convert to a 1-bit bitmap for TSPL
  const image = await Jimp.read(screenshot);
  image.resize(OUT_W, OUT_H);
  image.grayscale();

  const W_BYTES = Math.ceil(OUT_W / 8); // 50 bytes per row
  const bitmapData = Buffer.alloc(W_BYTES * OUT_H, 0);

  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const idx = (y * OUT_W + x) * 4;
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      if (gray > 128) { // TSPL prints the 0 bits, so mark the light pixels - see the note at the top
        const byteIdx = y * W_BYTES + Math.floor(x / 8);
        const bitPos = 7 - (x % 8);
        bitmapData[byteIdx] |= (1 << bitPos);
      }
    }
  }

  const header = Buffer.from(
    [
      "SIZE 50 mm,25 mm",
      "GAP 3 mm,0",
      "DIRECTION 1",
      "CLS",
      `BITMAP 0,0,${W_BYTES},${OUT_H},0,`,
    ].join("\r\n"),
    "ascii"
  );

  const footer = Buffer.from("\r\nPRINT 1,1\r\n", "ascii");

  return [header, bitmapData, footer];
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* Every request, with an id and a duration, so a failure can be followed
   through the stages. Label contents are never written to the log. */
app.use((req, res, next) => {
  req.id = crypto.randomBytes(4).toString("hex");
  const started = Date.now();
  res.setHeader("X-Request-Id", req.id);
  res.on("finish", () => {
    log("info", "Request", {
      id: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - started,
      origin: req.headers.origin || null,
    });
  });
  next();
});

// GET /health - is this PC answering? Touches nothing else.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "tvse-print-server",
    jobs: { active: jobActive, waiting: pendingJobs },
    ts: new Date().toISOString(),
  });
});

// GET /status - is the printer answering?
app.get("/status", async (req, res) => {
  const printer = await printerState();
  res.json({
    server: "ok",
    printer: {
      host: PRINTER_HOST,
      port: PRINTER_PORT,
      online: printer.online,
      state: printer.state,          // online | offline | busy
      cached: printer.cached,
      probedAt: printer.at ? new Date(printer.at).toISOString() : null,
      latency: printer.latencyMs != null ? `${printer.latencyMs}ms` : null,
      model: "TVSE LP46 DLite Plus",
      label: "50x25mm",
    },
    jobs: { active: jobActive, waiting: pendingJobs },
    ts: new Date().toISOString(),
  });
});

// POST /test-print
app.post("/test-print", async (req, res) => {
  const jobId = req.id;
  try {
    const chunks = buildTSPL({
      line1: "VEGRIX TEST",
      line2: "Print Server OK",
      line3: `${lanAddress()}:${SERVER_PORT}`,   // the real address, not a stale one
      barcode: "1234567890",
    });
    await enqueuePrinterJob(() => sendToPrinter(chunks, jobId));
    res.json({ success: true, jobId, message: "Test label sent to the printer" });
  } catch (err) {
    log("error", "Test print failed", { jobId, error: err.message });
    res.status(err.httpStatus || 502).json({ success: false, jobId, error: err.message });
  }
});

// POST /print
app.post("/print", async (req, res) => {
  const jobId = req.id;
  const { mode, html, line1, line2, line3, barcode, copies = 1 } = req.body || {};

  // HTML mode - render and bitmap
  if (mode === "html") {
    if (!html) return res.status(400).json({ success: false, jobId, error: "'html' is required" });
    log("info", "Print requested", { jobId, mode, htmlBytes: Buffer.byteLength(html) });

    try {
      /* Render and send inside one queued job: the printer takes one
         connection at a time, and one Chrome page at a time keeps the counter
         PC usable when two phones print together. */
      await enqueuePrinterJob(async () => {
        const chunks = await buildBitmapFromHTML(html, jobId);
        await sendToPrinter(chunks, jobId);
      });
      log("info", "Print sent", { jobId });
      // "sent", not "printed" - the printer does not acknowledge the label.
      return res.json({ success: true, jobId, message: "Label sent to the printer" });
    } catch (err) {
      log("error", "Print failed", { jobId, error: err.message });
      return res.status(err.httpStatus || 500).json({ success: false, jobId, error: err.message });
    }
  }

  // Raw mode - off unless ALLOW_RAW=1
  if (mode === "raw") {
    if (!ALLOW_RAW) {
      log("warn", "Raw print refused", { jobId });
      return res.status(403).json({
        success: false,
        jobId,
        error: "raw mode is disabled on this server (set ALLOW_RAW=1 to enable)",
      });
    }
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ success: false, jobId, error: "'data' required" });
    try {
      await enqueuePrinterJob(() => sendToPrinter([Buffer.from(data, "base64")], jobId));
      return res.json({ success: true, jobId, message: "Raw job sent" });
    } catch (err) {
      log("error", "Raw print failed", { jobId, error: err.message });
      return res.status(err.httpStatus || 502).json({ success: false, jobId, error: err.message });
    }
  }

  // Text mode (default)
  if (!line1) return res.status(400).json({ success: false, jobId, error: "'line1' is required" });
  try {
    const chunks = buildTSPL({ line1, line2, line3, barcode, copies });
    await enqueuePrinterJob(() => sendToPrinter(chunks, jobId));
    res.json({ success: true, jobId, message: "Label sent to the printer", ts: new Date().toISOString() });
  } catch (err) {
    log("error", "Text print failed", { jobId, error: err.message });
    res.status(err.httpStatus || 502).json({
      success: false,
      jobId,
      error: err.message,
      hint: "Check the printer is on",
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    endpoints: ["GET /health", "GET /status", "POST /print", "POST /test-print"],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(SERVER_PORT, "0.0.0.0", () => {
  log("info", "Server started", {
    port: SERVER_PORT,
    printer: `${PRINTER_HOST}:${PRINTER_PORT}`,
    address: lanAddress(),
    rawMode: ALLOW_RAW,
    config: Object.keys(fileConfig).length ? "config.json" : "defaults",
  });
  // A mistyped config file would otherwise look like a printer fault.
  if (configError) log("error", "config.json could not be read - using defaults", { error: configError });
  console.log(`\n✅  TVSE Print Server on http://${lanAddress()}:${SERVER_PORT}`);
  console.log(`🖨️   Printer → ${PRINTER_HOST}:${PRINTER_PORT}`);
  console.log(`📋  GET /health  GET /status  POST /print  POST /test-print\n`);
});

// A request that somehow outlives its own deadlines should not be held forever.
server.requestTimeout = 120000;
server.headersTimeout = 65000;

const shutdown = async (signal) => {
  log("info", "Shutting down", { signal });
  server.close();
  clearTimeout(browserIdleTimer);
  try {
    if (browserPromise) (await browserPromise).close();
  } catch {
    /* nothing to close */
  }
  logStream.end(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => log("error", "Unhandled rejection", { error: String(err) }));
