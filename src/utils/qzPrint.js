import qz from 'qz-tray'

export const connectQZ = async () => {
  try {
    if (qz.websocket.isActive()) return true
    await qz.websocket.connect()
    console.log('QZ Tray connected')
    return true
  } catch (error) {
    console.error('QZ Tray connection failed:', error)
    return false
  }
}

export const disconnectQZ = () => {
  if (qz.websocket.isActive()) {
    qz.websocket.disconnect()
  }
}

export const getPrinters = async () => {
  try {
    await connectQZ()
    const printers = await qz.printers.find()
    return printers
  } catch (error) {
    console.error('Failed to get printers:', error)
    return []
  }
}

export const printLabelQZ = async (printerName, htmlContent) => {
  try {
    await connectQZ()

    const config = qz.configs.create(printerName, {
      size: { width: 50, height: 30 },
      units: 'mm',
      colorType: 'blackwhite',
      copies: 1,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      scaleContent: true
    })

    const data = [{
      type: 'pixel',
      format: 'html',
      flavor: 'plain',
      data: htmlContent
    }]

    await qz.print(config, data)
    console.log('Print job sent successfully')
    return true
  } catch (error) {
    console.error('Print failed:', error)
    throw error
  }
}
