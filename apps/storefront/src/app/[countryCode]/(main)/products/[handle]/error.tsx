"use client"

import { useEffect } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      className="content-container flex min-h-[calc(100vh-12rem)] flex-col items-start justify-center gap-4 py-16"
      role="alert"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-content-interactive">
        Produk
      </p>
      <h1 className="max-w-xl text-3xl font-bold tracking-tight text-content-primary">
        Produk belum dapat dimuat
      </h1>
      <p className="max-w-xl text-pretty text-content-secondary">
        Periksa koneksi Anda, lalu coba lagi. Anda juga dapat kembali melihat
        seluruh produk yang tersedia.
      </p>
      <div className="mt-2 flex flex-col gap-3 xsmall:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-action-primary px-4 font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
        >
          Coba lagi
        </button>
        <LocalizedClientLink
          href="/store"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-line-control bg-surface-default px-4 font-medium text-content-primary motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
        >
          Lihat semua produk
        </LocalizedClientLink>
      </div>
    </div>
  )
}
