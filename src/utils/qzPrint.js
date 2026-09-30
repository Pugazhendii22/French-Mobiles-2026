import qz from 'qz-tray'

/* The label stock is 50 x 25 mm - the same size printLabel.jsx builds the HTML
   at, and the size the print server renders it at.

   This used to ask for a 50 x 30 mm page with scaleContent on, so QZ scaled a
   25mm-tall label up to fill 30mm and the extra 20% ran off the right-hand
   edge. Printing onto a page the size of the label means the HTML goes on at
   1:1, exactly as the print server puts it out.

   If the roll in the printer is ever a different size, this is the one place
   to change - the HTML follows the constant. */
const LABEL_SIZE_MM = { width: 50, height: 25 }

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
      size: LABEL_SIZE_MM,
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
      data: htmlContent,
      // The page the HTML is laid out on, so it is rendered at the label's own
      // size instead of being fitted to whatever the printer's default is.
      options: {
        pageWidth: LABEL_SIZE_MM.width,
        pageHeight: LABEL_SIZE_MM.height
      }
    }]

    await qz.print(config, data)
    console.log('Print job sent successfully')
    return true
  } catch (error) {
    console.error('Print failed:', error)
    throw error
  }
}
