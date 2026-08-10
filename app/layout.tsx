import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '2x3crmtest ERP',
  description: 'ERP de supermercado con POS, inventarios, finanzas y agente AI'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='es'>
      <body>{children}</body>
    </html>
  )
}
