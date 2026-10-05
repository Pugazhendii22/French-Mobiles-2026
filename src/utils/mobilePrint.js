import { generateLabelHTML } from './printLabel'

/* ─────────────────────────────────────────────
   PRINT SERVER (phones → shop PC)

   The phones post a label to a small Express server on the counter PC, which
   renders it in Chrome and sends the bitmap to the printer over TCP 9100.

   Everything here is about telling failures apart. The previous version ran
   one 4-second check against /status and turned every possible failure -
   timeout, browser refusal, HTTP error, bad JSON, an AbortSignal API the phone
   does not have - into "Print Server Offline", which sent staff to look at a PC
   that was working. Three rules follow from that:

   1. /health answers "is the PC reachable", /status answers "is the printer
      answering". They are asked separately, because /status opens a TCP
      connection to the printer and can take 3 seconds on its own.
   2. A failed fetch cannot tell a network problem from the browser refusing the
      request (this app is HTTPS and the server is HTTP on a private address).
      So the failure is reported as "could not reach", never as "the PC is off".
   3. A print whose reply never arrives is an UNKNOWN outcome, not a failure.
      The label may well have printed, so nothing here retries by itself.
────────────────────────────────────────────── */

const DEFAULT_URL = 'http://192.168.1.36:3000'

/** Set VITE_PRINT_SERVER_URL to move the server without a code change. */
export const PRINT_SERVER_URL =
  String(import.meta.env?.VITE_PRINT_SERVER_URL || DEFAULT_URL).replace(/\/+$/, '')

/* /health touches nothing, so it can be quick. /status waits on the printer
   probe, which the server gives 3 seconds, so it needs real headroom - the old
   4-second limit could abort a perfectly good "printer offline" answer. The
   print call has to cover Chrome rendering plus the send. */
const HEALTH_TIMEOUT_MS = 4000
const STATUS_TIMEOUT_MS = 9000
const PRINT_TIMEOUT_MS = 45000

/**
 * One request, with every failure kept apart from the others.
 * Returns { ok, json, ms } or { ok: false, kind, message, status, ms } where
 * kind is timeout | cancelled | unreachable | http | protocol.
 */
const callServer = async (path, { method = 'GET', body, timeoutMs, controller } = {}) => {
  const started = Date.now()
  const canAbort = typeof AbortController !== 'undefined'
  const ctl = controller || (canAbort ? new AbortController() : null)
  let timedOut = false
  const timer = ctl ? setTimeout(() => { timedOut = true; ctl.abort() }, timeoutMs) : null

  try {
    const resp = await fetch(`${PRINT_SERVER_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined,
    })
    const ms = Date.now() - started

    if (!resp.ok) {
      let detail = ''
      try {
        const json = await resp.json()
        detail = json?.error || ''
      } catch {
        /* an error page rather than JSON */
      }
      return { ok: false, kind: 'http', status: resp.status, ms, message: detail || `server replied ${resp.status}` }
    }

    try {
      return { ok: true, json: await resp.json(), ms }
    } catch {
      return { ok: false, kind: 'protocol', ms, message: 'reply was not valid JSON' }
    }
  } catch (err) {
    const ms = Date.now() - started
    if (timedOut) return { ok: false, kind: 'timeout', ms, message: `no reply within ${timeoutMs}ms` }
    if (err?.name === 'AbortError') return { ok: false, kind: 'cancelled', ms, message: 'cancelled' }
    /* fetch gives one opaque failure for a dropped network, a sleeping PC, a
       firewall, and a browser that refused to call HTTP from an HTTPS page.
       Do not pretend to know which. */
    return { ok: false, kind: 'unreachable', ms, message: err?.message || 'could not reach the server' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const PC_MESSAGE = {
  timeout: 'The shop PC did not reply in time',
  unreachable: 'Could not reach the shop PC - check it is awake, on the shop Wi-Fi, and that the print server is running',
  http: 'The print server returned an error',
  protocol: 'The print server gave an unexpected reply',
}

/**
 * Where printing stands, as three separate facts:
 *   pc      - ok | unreachable | timeout | error | unknown
 *   printer - online | offline | unknown
 *   detail  - one line a person can act on
 *
 * `skipPrinter` asks only /health. Worth using when a job is in flight: the
 * printer probe opens the same TCP port 9100 the job uses, and label printers
 * generally take one connection at a time.
 */
export const checkPrintServer = async ({ controller, skipPrinter = false } = {}) => {
  const health = await callServer('/health', { timeoutMs: HEALTH_TIMEOUT_MS, controller })

  if (!health.ok) {
    if (health.kind === 'cancelled') return { pc: 'unknown', printer: 'unknown', detail: '', cancelled: true }
    return {
      pc: health.kind === 'timeout' ? 'timeout' : health.kind === 'unreachable' ? 'unreachable' : 'error',
      printer: 'unknown',
      detail: `${PC_MESSAGE[health.kind] || health.message} (${health.ms}ms)`,
      ms: health.ms,
    }
  }

  if (skipPrinter) {
    return { pc: 'ok', printer: 'unknown', detail: 'Shop PC reachable; printer not checked while a job is running' }
  }

  const status = await callServer('/status', { timeoutMs: STATUS_TIMEOUT_MS, controller })

  if (!status.ok) {
    if (status.kind === 'cancelled') return { pc: 'ok', printer: 'unknown', detail: '', cancelled: true }
    return {
      pc: 'ok',
      printer: 'unknown',
      detail: `Shop PC is reachable, but the printer check failed: ${status.message} (${status.ms}ms)`,
      ms: status.ms,
    }
  }

  const online = status.json?.printer?.online === true
  return {
    pc: 'ok',
    printer: online ? 'online' : 'offline',
    detail: online
      ? `Printer answering on ${status.json?.printer?.host || 'the printer address'} (${status.ms}ms)`
      : 'The PC is fine but the printer is not answering - check its power and cable',
    ms: status.ms,
  }
}

/* Kept because it is exported; the label itself is built in printLabel.jsx, so
   every print path - QZ Tray, this server, the browser - prints the same HTML. */
export const generateMobileLabelHTML = (labelEntry) => generateLabelHTML(labelEntry)

/**
 * Send a label to the shop PC.
 *
 * Resolves with { sent: true } once the server says it printed. On failure the
 * thrown error carries `outcome`: 'failed' when the job certainly did not
 * print, 'unknown' when the reply was lost after the request went out - the
 * label may be on the printer, so the caller must warn rather than resend.
 */
export const printLabelMobile = async (labelEntry, { controller } = {}) => {
  if (!labelEntry) {
    throw new Error('labelEntry is required')
  }

  const result = await callServer('/print', {
    method: 'POST',
    timeoutMs: PRINT_TIMEOUT_MS,
    controller,
    body: {
      mode: 'html',
      html: generateLabelHTML(labelEntry),
      labelType: labelEntry.labelType || 'product',
    },
  })

  if (result.ok) {
    if (result.json?.success) return { sent: true, ms: result.ms }
    throw Object.assign(new Error(result.json?.error || 'the print server reported a failure'), {
      outcome: 'failed',
      kind: 'server',
      ms: result.ms,
    })
  }

  // An HTTP error means the server answered and refused, so nothing printed.
  // A timeout or a dropped connection means we simply do not know.
  const certain = result.kind === 'http' || result.kind === 'protocol' || result.kind === 'cancelled'
  throw Object.assign(new Error(result.message), {
    outcome: certain ? 'failed' : 'unknown',
    kind: result.kind,
    ms: result.ms,
  })
}

export default {
  PRINT_SERVER_URL,
  checkPrintServer,
  printLabelMobile,
}
