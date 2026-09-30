import { generateLabelHTML } from './printLabel'

export const PRINT_SERVER_URL = "http://192.168.1.36:3000"

export const checkPrintServer = async () => {
  try {
    const resp = await fetch(`${PRINT_SERVER_URL}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000)
    })

    if (!resp.ok) return 'server_offline'

    const json = await resp.json()
    return json?.printer?.online === true ? 'online' : 'printer_offline'
  } catch (err) {
    return 'server_offline'
  }
}

/* The label itself is built in printLabel.jsx, which every print path shares,
   so what the shop PC prints and what QZ Tray prints on the counter machine
   are the same HTML down to the stylesheet. */
export const generateMobileLabelHTML = (labelEntry) => generateLabelHTML(labelEntry)

export const printLabelMobile = async (labelEntry) => {
  if (!labelEntry) {
    throw new Error('labelEntry is required')
  }

  const html = generateLabelHTML(labelEntry)
  const labelType = labelEntry.labelType || 'product'

  const body = {
    mode: 'html',
    html,
    labelType
  }

  const resp = await fetch(`${PRINT_SERVER_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!resp.ok) {
    let msg = `Print server responded ${resp.status}`

    try {
      const j = await resp.json()
      if (j && j.error) msg = j.error
    } catch (e) {}

    throw new Error(msg)
  }

  const json = await resp.json()

  if (json && json.success) {
    return { success: true }
  }

  throw new Error((json && json.error) || 'Unknown print server error')
}

export default {
  PRINT_SERVER_URL,
  checkPrintServer,
  printLabelMobile
}
