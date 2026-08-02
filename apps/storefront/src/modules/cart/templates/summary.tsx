"use client"

import { Heading } from "@modules/common/components/ui"
import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"
import DiscountCode from "@modules/checkout/components/discount-code"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

type SummaryProps = {
  cart: HttpTypes.StoreCart
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart }: SummaryProps) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).cart
  const step = getCheckoutStep(cart)

  return (
    <div className="flex flex-col gap-y-4">
      <Heading level="h2" className="text-[2rem] leading-[2.75rem]">
        {t.summary}
      </Heading>
      <DiscountCode cart={cart} />
      <Divider />
      <CartTotals totals={cart} />
      <LocalizedClientLink
        href={"/checkout?step=" + step}
        data-testid="checkout-button"
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#E53946] px-4 font-medium text-white hover:bg-[#9F2335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {t.goToCheckout}
      </LocalizedClientLink>
    </div>
  )
}

export default Summary
