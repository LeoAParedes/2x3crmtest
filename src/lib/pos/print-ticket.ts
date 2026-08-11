import { printerColumns, type TicketPrinterWidth } from '@/src/lib/pos/ticket-format'

const DEFAULT_PRINTER_WIDTH: TicketPrinterWidth = '80mm'

export const buildTicketPrintHtml = (
  ticketText: string,
  closeAfterPrint: boolean,
  printerWidth: TicketPrinterWidth = DEFAULT_PRINTER_WIDTH
) => {
  const escapedTicket = ticketText
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  const columns = printerColumns[printerWidth]
  const pageWidth = printerWidth

  // Do not close during print(): browsers return when the dialog opens, so an
  // immediate window.close() blanks Save as PDF / print preview.
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Ticket de venta</title>
    <style>
      @page {
        size: ${pageWidth} auto;
        margin: 2mm;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        width: 100%;
        min-height: 100%;
      }

      /* Center ticket when the browser ignores @page size and falls back to A4. */
      body {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        font-family: "Courier New", Courier, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 11px;
        line-height: 1.3;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .ticket {
        box-sizing: border-box;
        width: ${columns}ch;
        max-width: calc(${pageWidth} - 4mm);
        margin: 0 auto;
        padding: 2mm 0;
        white-space: pre;
        overflow: visible;
        word-break: normal;
        overflow-wrap: normal;
        font-variant-ligatures: none;
        letter-spacing: 0;
        text-align: left;
      }
    </style>
  </head>
  <body>
    <pre class="ticket">${escapedTicket}</pre>
    <script>
      (function () {
        var printed = false
        var closeWhenDone = ${closeAfterPrint ? 'true' : 'false'}

        var runPrint = function () {
          if (printed) return
          printed = true
          window.focus()
          window.print()
        }

        var cleanup = function () {
          if (!closeWhenDone) return
          try {
            window.close()
          } catch (error) {}
        }

        window.addEventListener('afterprint', cleanup)

        if (document.readyState === 'complete') {
          window.setTimeout(runPrint, 50)
        } else {
          window.addEventListener('load', function () {
            window.setTimeout(runPrint, 50)
          })
        }
      })()
    </script>
  </body>
</html>`
}

export const printTicketText = (
  ticketText: string,
  onBlocked?: () => void,
  printerWidth: TicketPrinterWidth = DEFAULT_PRINTER_WIDTH
) => {
  const popupHtml = buildTicketPrintHtml(ticketText, true, printerWidth)

  // Avoid noopener/noreferrer: Chrome often returns null and print never runs.
  const popup = window.open('', '_blank', 'width=420,height=900')
  if (popup) {
    popup.document.open()
    popup.document.write(popupHtml)
    popup.document.close()
    return
  }

  const iframeHtml = buildTicketPrintHtml(ticketText, false, printerWidth)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Impresión de ticket')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = printerWidth
  iframe.style.height = '100vh'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  iframe.style.border = '0'
  iframe.style.zIndex = '-1'
  document.body.appendChild(iframe)

  const iframeWindow = iframe.contentWindow
  const iframeDocument = iframe.contentDocument || iframeWindow?.document
  if (!iframeWindow || !iframeDocument) {
    iframe.remove()
    onBlocked?.()
    return
  }

  const handleAfterPrint = () => {
    iframeWindow.removeEventListener('afterprint', handleAfterPrint)
    iframe.remove()
  }
  iframeWindow.addEventListener('afterprint', handleAfterPrint)

  iframeDocument.open()
  iframeDocument.write(iframeHtml)
  iframeDocument.close()

  window.setTimeout(() => {
    if (document.body.contains(iframe)) {
      iframe.remove()
    }
  }, 60_000)
}
