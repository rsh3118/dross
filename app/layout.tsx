import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const _geistSans = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'dross',
    template: '%s · dross',
  },
  description:
    'A personal life-management hub: tasks, wiki, and autonomous agents that research, tidy, brief, and remind.',
  generator: 'v0.app',
  applicationName: 'dross',
  appleWebApp: {
    capable: true,
    title: 'dross',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon-16-v2.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32-v2.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48-v2.png', sizes: '48x48', type: 'image/png' },
    ],
    shortcut: [{ url: '/favicon-32-v2.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon-v2.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#15171d' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
