import React, { useState, useEffect } from 'react'
import { getPrinters, printLabelQZ } from '../utils/qzPrint'
import qz from 'qz-tray'
import { checkPrintServer, printLabelMobile } from '../utils/mobilePrint'

const PrinterSelector = ({ isOpen, onClose, htmlContent, labelEntry, title = 'Print Label' }) => {
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const [qzConnected, setQzConnected] = useState(false)
  const [isMobileMode, setIsMobileMode] = useState(false)
  const [mobilePrinterReady, setMobilePrinterReady] = useState('server_offline')
  const [mobileChecking, setMobileChecking] = useState(false)
  const [mobilePrinting, setMobilePrinting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (!isMobileMode) loadPrinters()
      else {
        // when in mobile mode, check server status when opening
        ;(async () => {
          setMobileChecking(true)
          const ok = await checkPrintServer()
          setMobilePrinterReady(ok)
          setMobileChecking(false)
        })()
      }
    }
  }, [isOpen])

  useEffect(() => {
    // Detect mobile mode when component mounts
    ;(async () => {
      try {
        const qzActive = qz && qz.websocket && typeof qz.websocket.isActive === 'function' ? qz.websocket.isActive() : false
        if (!qzActive && navigator?.maxTouchPoints > 0) {
          setIsMobileMode(true)
          setMobileChecking(true)
          const ok = await checkPrintServer()
          setMobilePrinterReady(ok)
          setMobileChecking(false)
        }
      } catch (e) {
        // ignore
      }
    })()
  }, [])

  const loadPrinters = async () => {
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
    } catch (err) {
      setError('QZ Tray not connected. Make sure QZ Tray is running on this computer.')
      setQzConnected(false)
    } finally {
      setLoading(false)
    }
  }

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
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
    onClose()
  }

  const handleMobilePrint = async () => {
    setError('')
    setMobilePrinting(true)
    try {
      if (!labelEntry) {
        throw new Error('Label entry is missing')
      }
      await printLabelMobile(labelEntry)
      alert('Print request sent to shop PC')
      onClose()
    } catch (err) {
      setError('Mobile print failed: ' + (err.message || err))
    } finally {
      setMobilePrinting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
      <div className="bg-white w-full md:max-w-sm md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col">
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">{title}</h2>
            <button onClick={onClose} className="text-gray-400 p-1">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>
        <div className="px-4 py-4 space-y-4">

          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
            (isMobileMode ? mobilePrinterReady === 'online' : qzConnected) ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              (isMobileMode ? mobilePrinterReady === 'online' : qzConnected) ? 'bg-green-500' : 'bg-[#ED2939]'
            }`}></div>
            <p className={`text-xs font-medium ${
              (isMobileMode ? mobilePrinterReady === 'online' : qzConnected) ? 'text-green-700' : 'text-[#ED2939]'
            }`}>
              {isMobileMode ? (
                mobilePrinterReady === 'online' ? 'Printer Ready ✓' :
                mobilePrinterReady === 'printer_offline' ? 'Printer Offline — check printer power' :
                'Print Server Offline — check shop PC'
              ) : (qzConnected ? 'QZ Tray Connected' : 'QZ Tray Not Connected')}
            </p>
            {isMobileMode ? (
              <button
                onClick={async () => {
                  setMobileChecking(true)
                  const ok = await checkPrintServer()
                  setMobilePrinterReady(ok)
                  setMobileChecking(false)
                }}
                className="ml-auto text-xs text-[#002395] font-semibold"
              >
                {mobileChecking ? 'Checking...' : 'Retry'}
              </button>
            ) : (
              !qzConnected && (
                <button
                  onClick={loadPrinters}
                  className="ml-auto text-xs text-[#002395] font-semibold"
                >
                  Retry
                </button>
              )
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-[#ED2939] px-3 py-2 rounded-xl text-xs">
              {error}
            </div>
          )}

          {!isMobileMode ? (
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
                <div className="space-y-2 max-h-48 overflow-y-auto">
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
                          selectedPrinter === printer
                            ? 'text-[#002395]'
                            : 'text-gray-400'
                        }`}></i>
                        <span className={`text-sm font-medium text-left flex-1 ${
                          selectedPrinter === printer
                            ? 'text-[#002395]'
                            : 'text-[#0f172a]'
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
            <div className="text-center py-4">
              <p className="text-sm text-gray-600">Mobile print mode: requests will be sent to shop PC</p>
            </div>
          )}

          {!isMobileMode && selectedPrinter && (
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
          {isMobileMode ? (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleMobilePrint}
                disabled={mobileChecking || mobilePrinterReady !== 'online' || mobilePrinting}
                className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {mobilePrinting ? (
                  <><i className="fas fa-spinner fa-spin"></i> Printing...</>
                ) : (
                  <><i className="fas fa-print"></i> Print Label</>
                )}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
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
            </div>
          )}
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
