import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { cookies } from "next/headers"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const locale = cookieStore.get("_medusa_locale")?.value.trim()
  const language = locale || "id"

  return (
    <html lang={language} data-mode="light">
      <body>{props.children}</body>
    </html>
  )
}
