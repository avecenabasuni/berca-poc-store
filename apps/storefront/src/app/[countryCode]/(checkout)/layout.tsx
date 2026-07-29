import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import { Text } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"

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
    <div className="w-full bg-[#F5F5F7] relative min-h-screen">
      <div className="h-16 bg-[#1E1F74] border-b border-[#3A1E65]">
        <nav className="flex h-full items-center content-container justify-between">
          <LocalizedClientLink
            href="/cart"
            className="text-sm font-semibold text-white/90 hover:text-[#E53946] flex items-center gap-x-2 transition-colors flex-1 basis-0"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90 text-white" size={16} />
            <span className="mt-px hidden small:block">
              {t.backToCart}
            </span>
            <span className="mt-px block small:hidden">
              {countryCode === "id" ? "Kembali" : "Back"}
            </span>
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/"
            className="text-xl font-bold tracking-tight text-white hover:text-[#E53946] transition-colors uppercase"
            data-testid="store-link"
          >
            Berca Store
          </LocalizedClientLink>
          <div className="flex-1 basis-0 flex justify-end items-center text-xs text-white/80 font-medium gap-1.5">
            <svg className="w-4 h-4 text-[#E53946]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="hidden small:inline">{t.secureTitle}</span>
          </div>
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">
        {children}
      </div>
      <div className="py-6 w-full flex items-center justify-center border-t border-[#CFCFD4]/40 bg-white mt-12">
        <Text className="text-xs text-[#1E1F74]/70 font-medium">
          © {new Date().getFullYear()} Berca Store. {countryCode === "id" ? "Hak Cipta Dilindungi Undang-Undang." : "All Rights Reserved."}
        </Text>
      </div>
    </div>
  )
}
