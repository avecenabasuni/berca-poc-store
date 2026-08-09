import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import { Text } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"
import RouteFocusHandler from "@modules/common/components/route-focus-handler"

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const t = getDictionary(countryCode).checkout

  return (
    <div className="relative min-h-screen w-full bg-surface-subtle" lang="id">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface-default focus:px-4 focus:py-2 focus:text-ui-fg-base focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>
      <RouteFocusHandler targetId="main-content" />
      <div className="sticky inset-x-0 top-0 z-50">
        <div className="border-b border-surface-inverse-raised bg-surface-inverse py-1.5 text-center text-xs font-medium tracking-wide text-content-inverse">
          <span>
            Belanja lebih mudah dengan pengiriman ke seluruh Indonesia
          </span>
        </div>
        <div className="h-16 border-b border-line-subtle/50 bg-surface-default">
          <nav
            aria-label="Navigasi checkout"
            className="flex h-full items-center content-container justify-between"
          >
            <LocalizedClientLink
              href="/cart"
              className="flex min-h-11 flex-1 basis-0 items-center gap-x-2 text-sm font-semibold text-content-primary motion-safe:transition-colors hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              data-testid="back-to-cart-link"
            >
              <ChevronDown className="rotate-90" size={16} aria-hidden="true" />
              <span className="mt-px hidden small:block">{t.backToCart}</span>
              <span className="mt-px block small:hidden">Kembali</span>
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/"
              className="text-xl font-bold uppercase tracking-tight text-content-primary motion-safe:transition-colors hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              data-testid="store-link"
            >
              <span translate="no">Berca Store</span>
            </LocalizedClientLink>
            <div className="flex flex-1 basis-0 items-center justify-end gap-1.5 text-xs font-medium text-content-muted">
              <svg
                className="h-4 w-4 text-content-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span className="hidden small:inline">{t.secureTitle}</span>
            </div>
          </nav>
        </div>
      </div>
      <main
        id="main-content"
        className="relative"
        data-testid="checkout-container"
        tabIndex={-1}
      >
        {children}
      </main>
      <div className="mt-12 flex w-full items-center justify-center border-t border-surface-inverse-raised bg-surface-inverse py-6">
        <Text className="text-xs font-medium text-content-inverse-muted">
          © {new Date().getFullYear()} Berca Store. Hak cipta dilindungi
          undang-undang.
        </Text>
      </div>
    </div>
  )
}
