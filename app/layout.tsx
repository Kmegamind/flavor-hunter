import type { Metadata, Viewport } from "next"
import { Press_Start_2P, VT323 } from "next/font/google"
import "./globals.css"

const press = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press",
  display: "swap",
})

const vt = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Flavor Hunter",
  description:
    "A search engine for tastes you remember but can't describe. Three-stage pipeline: parse, hunt, evidence.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Flavor Hunter",
    description: "Three-stage pipeline for undescribable taste memory.",
    images: ["/og-image.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#071018",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${press.variable} ${vt.variable}`}>
      <body>{children}</body>
    </html>
  )
}
