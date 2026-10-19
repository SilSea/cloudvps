import type { Metadata } from "next"
import { DM_Sans, JetBrains_Mono } from "next/font/google"
import { Providers } from "@/components/shared/providers"
import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
})

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
})

export const metadata: Metadata = {
  title: "CloudVPS — VPS Cloud Rental",
  description: "เช่า VPS คุณภาพสูง ราคาเริ่มต้นที่เอื้อมถึง",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${dmSans.variable} ${jetBrainsMono.variable} h-full`}>
      <body className="min-h-full bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
