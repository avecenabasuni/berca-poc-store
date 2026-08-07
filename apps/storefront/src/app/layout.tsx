import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { Manrope } from "next/font/google"
import "styles/globals.css"

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
})

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="id" data-mode="light" className={manrope.variable}>
      <body className="font-sans antialiased">{props.children}</body>
    </html>
  )
}
