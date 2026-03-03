import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DocuChat v2 — PageIndex Tree Search',
  description: 'Chat with documents using PageIndex hierarchical tree search. No RAG, no vectors.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
