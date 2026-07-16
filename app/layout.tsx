import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { project } from "@/lib/system/seed/project"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: project.name,
  description: project.tagline,
}

/**
 * Root shell — the bare providers shared by both app UIs in this repo:
 * the **product app** (`/`) and the **Synclair hub** (`/synclair`). Each mounts its
 * own chrome in its own nested layout; this file owns only <html>/<body>, fonts,
 * and theming so nothing here assumes one app or the other.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
