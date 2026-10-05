import { useState, useEffect, useRef, useCallback } from 'react'
import { getPrinters, printLabelQZ } from './qzPrint'
import qz from 'qz-tray'
import { checkPrintServer, printLabelMobile, PRINT_SERVER_URL } from './mobilePrint'
import { withPageRule } from './printLabel'
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';

/* ─────────────────────────────────────────────
   PRINT DIALOG

   Two routes: QZ Tray on the counter PC, and the print server the phones post
   to. The phone route used to get stuck saying the shop PC was offline after a
   single slow check, with nothing to unstick it but closing the dialog, so the
   status handling here follows three rules:

   - which route we are on is decided once, before any check runs. The old code
     read that decision from a different effect than the one that set it, so an
     already-open dialog could run the PC branch on a phone;
   - only the newest check may write to the screen. Each run takes a number and
     aborts the one before it, so a slow failure cannot land on top of a fresh
     success;
   - coming back to the app re-checks. Returning from the background, regaining
     focus or reconnecting refreshes the status, rate-limited, never while the
     tab is hidden, and never while a label is being sent - the printer probe
     uses the same port as the job.
────────────────────────────────────────────── */

const RECHECK_MIN_GAP_MS = 10000

const PrinterSelector = ({ isOpen, onClose, htmlContent, labelEntry, title = 'Print Label' }) => {
  const [route, setRoute] = useState('deciding')      // deciding | server | local
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const [qzConnected, setQzConnected] = useState(false)

  const [status, setStatus] = useState({ pc: 'unknown', printer: 'unknown', detail: '' })
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [uncertain, setUncertain] = useState('')

  /* The grab handle promises this sheet can be pulled down; make it true. */
  const { sheetProps, handleProps, scrollRef } = useSheetDismiss({ onDismiss: onClose });

  /* Only the newest check may write to state; the rest are stale by definition. */
  const checkIdRef = useRef(0)
  const checkCtlRef = useRef(null)
  const lastCheckAtRef = useRef(0)
  const sendingRef = useRef(false)

  const loadPrinters = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const printerList = await getPrinters()
      setPrinters(printerList)
      setQzConnected(true)
      const tvsPrinter = printerList.find(p =>
        p.toLowerCase().includes('tvs') ||
        p.toLowerCase().includes('lp46') ||
        p.toLowerCase().includes('thermal')
      )
      if (tvsPrinter) setSelectedPrinter(tvsPrinter)
      else if (printerList.length > 0) setSelectedPrinter(printerList[0])
    } catch {
      setError('QZ Tray not connected. Make sure QZ Tray is running on this computer.')
      setQzConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const runCheck = useCallback(async ({ force = false } = {}) => {
    // The printer probe opens the port the job is using - leave it alone.
    if (sendingRef.current) return
    if (!force && Date.now() - lastCheckAtRef.current < RECHECK_MIN_GAP_MS) return

    const id = ++checkIdRef.current
    lastCheckAtRef.current = Date.now()

    checkCtlRef.current?.abort()
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    checkCtlRef.current = controller

    setChecking(true)
    const result = await checkPrintServer({ controller })

    if (id !== checkIdRef.current) return      // a newer check has started
    if (result.cancelled) return               // we aborted this one ourselves
    setStatus(result)
    setChecking(false)
  }, [])

  /* One place decides the route, so nothing can check the wrong one. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let qzActive = false
      try {
        qzActive = Boolean(qz?.websocket?.isActive?.())
      } catch {
        /* no QZ Tray on this device - treat it as a phone below */
      }
      const onPhone = !qzActive && (navigator?.maxTouchPoints || 0) > 0
      if (cancelled) return
      setRoute(onPhone ? 'server' : 'local')
    })()
    return () => { cancelled = true }
  }, [])

  /* Check when the dialog opens, and when the route is settled. */
  useEffect(() => {
    if (!isOpen || route === 'deciding') return
    if (route === 'local') loadPrinters()
    else runCheck({ force: true })
  }, [isOpen, route, loadPrinters, runCheck])

  /* Recover by itself: back from the background, refocused, or back online. */
  useEffect(() => {
    if (!isOpen || route !== 'server') return

    const onWake = () => {
      if (document.visibilityState === 'hidden') return
      runCheck()
    }
    const onReconnect = () => runCheck({ force: true })

    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onReconnect)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onReconnect)
    }
  }, [isOpen, route, runCheck])

  /* Nothing in flight should outlive a closed dialog. */
  useEffect(() => {
    if (isOpen) return
    checkIdRef.current += 1
    checkCtlRef.current?.abort()
    checkCtlRef.current = null
    setChecking(false)
    setError('')
    setUncertain('')
  }, [isOpen])

  useEffect(() => () => {
    checkIdRef.current += 1
    checkCtlRef.current?.abort()
  }, [])

  const handlePrint = async () => {
    if (!selectedPrinter) {
      setError('Please select a printer')
      return
    }
    setPrinting(true)
    setError('')
    try {
      await printLabelQZ(selectedPrinter, htmlContent)
      onClose()
    } catch (err) {
      setError('Print failed: ' + err.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleBrowserPrint = () => {
    const printWindow = window.open('', '_blank')
    // A browser has to be told the paper is 50x25mm; QZ Tray and the print
    // server are told separately, so the page rule is added only here.
    printWindow.document.write(withPageRule(htmlContent))
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
    onClose()
  }

  const handleServerPrint = async () => {
    setError('')
    setUncertain('')
    setSending(true)
    sendingRef.current = true
    try {
      if (!labelEntry) throw new Error('Label entry is missing')
      await printLabelMobile(labelEntry)
      sendingRef.current = false
      setSending(false)
      // "Sent", not "printed": the server reports the job left for the printer.
      alert('Label sent to the shop PC printer')
      onClose()
    } catch (err) {
      sendingRef.current = false
      setSending(false)

      /* An outcome we cannot establish must not look like a failure, or the
         next tap prints the label twice. */
      if (err?.outcome === 'unknown') {
        setUncertain(
          `No reply from the shop PC after ${Math.round((err.ms || 0) / 1000)}s, so it is not known whether the label printed. ` +
          'Check the printer before sending again - sending now may print it twice.'
        )
      } else {
        setError('Print failed: ' + (err.message || err))
      }

      // The probe was held off during the job; get a current reading now.
      runCheck({ force: true })
    }
  }

  if (!isOpen) return null

  const onServerRoute = route === 'server'
  const pcOk = status.pc === 'ok'
  const printerOffline = status.printer === 'offline'
  // Printing is blocked only when something is known to be wrong. An unknown
  // printer state used to disable the button, which is how a working counter
  // ended up unable to print.
  const canServerPrint = pcOk && !printerOffline && !sending

  const headline = !onServerRoute
    ? (qzConnected ? 'QZ Tray Connected' : 'QZ Tray Not Connected')
    : checking ? 'Checking the shop PC...'
      : !pcOk ? 'Cannot reach the shop PC'
        : printerOffline ? 'Printer not answering'
          : status.printer === 'online' ? 'Printer Ready ✓'
            : 'Shop PC reachable, printer status unknown'

  const good = onServerRoute ? (pcOk && !printerOffline) : qzConnected

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
      <div {...sheetProps} className="bg-white w-full md:max-w-sm md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col">
        <div {...handleProps} aria-label="Drag down to close" className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">{title}</h2>
            <button onClick={onClose} className="text-gray-400 p-1" aria-label="Close">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>
        <div className="px-4 py-4 space-y-4">

          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${good ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`w-2 h-2 rounded-full ${good ? 'bg-green-500' : 'bg-[#ED2939]'}`}></div>
            <p className={`text-xs font-medium ${good ? 'text-green-700' : 'text-[#ED2939]'}`}>
              {headline}
            </p>
            {onServerRoute ? (
              <button
                onClick={() => runCheck({ force: true })}
                disabled={checking || sending}
                className="ml-auto text-xs text-[#002395] font-semibold disabled:opacity-50"
              >
                {checking ? 'Checking...' : 'Retry'}
              </button>
            ) : (
              !qzConnected && (
                <button onClick={loadPrinters} className="ml-auto text-xs text-[#002395] font-semibold">
                  Retry
                </button>
              )
            )}
          </div>

          {/* What the check actually found, so a failure can be acted on or reported */}
          {onServerRoute && status.detail && (
            <p className="text-[11px] text-gray-500 leading-snug">
              {status.detail}
              <span className="block text-gray-400">{PRINT_SERVER_URL}</span>
            </p>
          )}

          {uncertain && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-xs">
              <i className="fas fa-triangle-exclamation mr-1"></i>{uncertain}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-[#ED2939] px-3 py-2 rounded-xl text-xs">
              {error}
            </div>
          )}

          {!onServerRoute ? (
            loading ? (
              <div className="text-center py-4">
                <i className="fas fa-spinner fa-spin text-[#002395] text-2xl mb-2 block"></i>
                <p className="text-sm text-gray-400">Loading printers...</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Printer
                </label>
                <div ref={scrollRef} className="space-y-2 max-h-48 overflow-y-auto">
                  {printers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No printers found
                    </p>
                  ) : (
                    printers.map((printer, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedPrinter(printer)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
                          selectedPrinter === printer
                            ? 'border-[#002395] bg-[#002395]/5'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <i className={`fas fa-print text-sm ${
                          selectedPrinter === printer ? 'text-[#002395]' : 'text-gray-400'
                        }`}></i>
                        <span className={`text-sm font-medium text-left flex-1 ${
                          selectedPrinter === printer ? 'text-[#002395]' : 'text-[#0f172a]'
                        }`}>
                          {printer}
                        </span>
                        {selectedPrinter === printer && (
                          <i className="fas fa-check text-[#002395] text-xs"></i>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-gray-600 text-center py-2">
              This phone prints through the shop PC.
            </p>
          )}

          {!onServerRoute && selectedPrinter && (
            <button
              onClick={() => {
                localStorage.setItem('defaultLabelPrinter', selectedPrinter)
                alert('Default printer saved!')
              }}
              className="text-xs text-[#002395] font-medium"
            >
              <i className="fas fa-bookmark mr-1"></i>
              Save as default printer
            </button>
          )}

        </div>

        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            {onServerRoute ? (
              <button
                onClick={handleServerPrint}
                disabled={!canServerPrint}
                className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <><i className="fas fa-spinner fa-spin"></i> Printing...</>
                ) : (
                  <><i className="fas fa-print"></i> Print Label</>
                )}
              </button>
            ) : (
              <button
                onClick={handlePrint}
                disabled={!selectedPrinter || printing || !qzConnected}
                className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {printing ? (
                  <><i className="fas fa-spinner fa-spin"></i> Printing...</>
                ) : (
                  <><i className="fas fa-print"></i> Print</>
                )}
              </button>
            )}
          </div>
          <button
            onClick={handleBrowserPrint}
            className="w-full text-center text-xs text-gray-400 underline"
          >
            Print in browser instead
          </button>
        </div>
      </div>
    </div>
  )
}

export default PrinterSelector
