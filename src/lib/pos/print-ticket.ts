export const buildTicketPrintHtml = (ticketText: string, closeAfterPrint: boolean) => {
  const escapedTicket = ticketText
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  // Do not close during print(): browsers return when the dialog opens, so an
  // immediate window.close() blanks Save as PDF / print preview.
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Ticket de venta</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 4mm;
      }

      html, body {
        width: 80mm;
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 11px;
        line-height: 1.35;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .ticket {
        box-sizing: border-box;
        width: 80mm;
        max-width: 80mm;
        padding: 2mm;
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
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

export const printTicketText = (ticketText: string, onBlocked?: () => void) => {
  const popupHtml = buildTicketPrintHtml(ticketText, true)

  // Avoid noopener/noreferrer: Chrome often returns null and print never runs.
  const popup = window.open('', '_blank', 'width=420,height=900')
  if (popup) {
    popup.document.open()
    popup.document.write(popupHtml)
    popup.document.close()
    return
  }

  const iframeHtml = buildTicketPrintHtml(ticketText, false)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Impresión de ticket')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '80mm'
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
