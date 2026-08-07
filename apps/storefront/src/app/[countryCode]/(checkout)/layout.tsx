import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import { Text } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"
import { getLocale } from "@lib/data/locale-actions"
import RouteFocusHandler from "@modules/common/components/route-focus-handler"

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const locale = await getLocale()
  const t = getDictionary(countryCode).checkout

  return (
    <div
      className="relative min-h-screen w-full bg-surface-subtle"
      lang={locale || (countryCode === "id" ? "id" : "en")}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface-default focus:px-4 focus:py-2 focus:text-ui-fg-base focus:shadow-lg"
      >
        Skip to content
      </a>
      <RouteFocusHandler targetId="main-content" />
      <div className="h-16 border-b border-surface-inverse-raised bg-surface-inverse">
        <nav
          aria-label="Checkout"
          className="flex h-full items-center content-container justify-between"
        >
          <LocalizedClientLink
            href="/cart"
            className="text-sm font-semibold text-content-inverse hover:underline flex min-h-11 items-center gap-x-2 motion-safe:transition-colors flex-1 basis-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90 text-content-inverse" size={16} />
            <span className="mt-px hidden small:block">
              {t.backToCart}
            </span>
            <span className="mt-px block small:hidden">
              {countryCode === "id" ? "Kembali" : "Back"}
            </span>
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/"
            className="text-xl font-bold tracking-tight text-content-inverse hover:underline motion-safe:transition-colors uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
            data-testid="store-link"
          >
            <span translate="no">Berca Store</span>
          </LocalizedClientLink>
          <div className="flex-1 basis-0 flex justify-end items-center text-xs text-content-inverse-muted font-medium gap-1.5">
            <svg
              className="h-4 w-4 text-content-inverse-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              focusable="false"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="hidden small:inline">{t.secureTitle}</span>
          </div>
        </nav>
      </div>
      <main
        id="main-content"
        className="relative"
        data-testid="checkout-container"
        tabIndex={-1}
      >
        {children}
      </main>
      <div className="mt-12 flex w-full items-center justify-center border-t border-line-subtle/40 bg-surface-default py-6">
        <Text className="text-xs font-medium text-content-muted">
          © {new Date().getFullYear()} Berca Store. {countryCode === "id" ? "Hak Cipta Dilindungi Undang-Undang." : "All Rights Reserved."}
        </Text>
      </div>
    </div>
  )
}
