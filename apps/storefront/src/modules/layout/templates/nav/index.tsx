import { Suspense } from "react"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

import { User, MagnifyingGlass, ShoppingBag } from "@medusajs/icons"

export default async function Nav() {
  const [regions, locales, currentLocale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
  ])

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      {/* Brand Announcement Top Bar */}
      <div className="bg-[#1E1F74] text-[#F5F5F7] text-xs py-1.5 text-center font-medium tracking-wide border-b border-[#3A1E65]">
        <span>Diskon hingga 30% untuk koleksi terbaru — Gratis Pengiriman ke seluruh Indonesia</span>
      </div>
      <header className="relative h-16 mx-auto border-b duration-200 bg-white border-[#CFCFD4]/50">
        <nav className="content-container txt-xsmall-plus text-[#1E1F74] flex items-center justify-between w-full h-full text-small-regular">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full flex items-center">
              <SideMenu
                regions={regions}
                locales={locales}
                currentLocale={currentLocale}
              />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="text-xl font-bold tracking-tight text-[#1E1F74] hover:text-[#E53946] transition-colors uppercase"
              data-testid="nav-store-link"
            >
              Berca Store
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-2 small:gap-x-3 h-full flex-1 basis-0 justify-end">
            <LocalizedClientLink
              className="hover:text-[#E53946] text-[#1E1F74] flex items-center justify-center p-2 rounded-full hover:bg-[#F5F5F7] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E1F74]"
              href="/store"
              title="Cari Produk"
            >
              <MagnifyingGlass className="w-5 h-5" aria-hidden="true" />
              <span className="sr-only">Search</span>
            </LocalizedClientLink>

            <LocalizedClientLink
              className="hover:text-[#E53946] text-[#1E1F74] flex items-center justify-center p-2 rounded-full hover:bg-[#F5F5F7] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E1F74]"
              href="/account"
              data-testid="nav-account-link"
              title="Akun Saya"
            >
              <User className="w-5 h-5" aria-hidden="true" />
              <span className="sr-only">Account</span>
            </LocalizedClientLink>

            <Suspense
              fallback={
                <LocalizedClientLink
                  className="hover:text-[#E53946] text-[#1E1F74] flex items-center justify-center relative p-2 rounded-full hover:bg-[#F5F5F7] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E1F74]"
                  href="/cart"
                  data-testid="nav-cart-link"
                  title="Shopping Bag"
                >
                  <ShoppingBag className="w-5 h-5" aria-hidden="true" />
                  <span className="absolute -top-0.5 -right-0.5 bg-[#1E1F74] text-white text-[9px] font-medium w-4 h-4 rounded-full flex items-center justify-center border border-white">
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
