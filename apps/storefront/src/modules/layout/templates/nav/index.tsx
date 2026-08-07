import { Suspense } from "react"

import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

import { User, ShoppingBag } from "@medusajs/icons"

export default async function Nav() {
  const regions = await listRegions().then((items: StoreRegion[]) => items)

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      {/* Brand Announcement Top Bar */}
      <div className="border-b border-surface-inverse-raised bg-surface-inverse py-1.5 text-center text-xs font-medium tracking-wide text-content-inverse">
        <span>Belanja lebih mudah dengan pengiriman ke seluruh Indonesia</span>
      </div>
      <header className="relative h-16 mx-auto border-b duration-200 bg-surface-default border-line-subtle/50">
        <nav
          aria-label="Navigasi utama"
          className="content-container txt-xsmall-plus flex h-full w-full items-center justify-between text-small-regular text-content-primary"
        >
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full flex items-center">
              <SideMenu regions={regions} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="text-xl font-bold uppercase tracking-tight text-content-primary motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              data-testid="nav-store-link"
            >
              <span translate="no">Berca Store</span>
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-2 small:gap-x-3 h-full flex-1 basis-0 justify-end">
            <LocalizedClientLink
              className="hidden xsmall:flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full p-2 text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
              href="/account"
              data-testid="nav-account-link"
              title="Akun Saya"
            >
              <User className="w-5 h-5" aria-hidden="true" />
              <span className="sr-only">Akun</span>
            </LocalizedClientLink>

            <Suspense
              fallback={
                <LocalizedClientLink
                  className="relative flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full p-2 text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
                  href="/cart"
                  data-testid="nav-cart-link"
                  title="Keranjang belanja"
                >
                  <ShoppingBag className="w-5 h-5" aria-hidden="true" />
                  <span className="sr-only">Keranjang belanja, 0 produk</span>
                  <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-content-inverse bg-surface-inverse px-1 text-xs font-medium tabular-nums text-content-inverse">
                    0
                  </span>
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
