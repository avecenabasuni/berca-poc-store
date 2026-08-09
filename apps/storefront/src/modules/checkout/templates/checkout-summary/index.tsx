"use client"

import { Heading } from "@modules/common/components/ui"
import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import DiscountCode from "@modules/checkout/components/discount-code"
import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"
import { HttpTypes } from "@medusajs/types"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

const CheckoutSummary = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).checkout

  return (
    <div className="sticky top-28 flex flex-col-reverse gap-y-8 py-8 small:flex-col small:py-0">
      <div className="surface-elevated flex w-full flex-col rounded-2xl border border-line-subtle/60 bg-surface-default p-6 sm:p-8">
        <Divider className="my-4 small:hidden" />
        <Heading
          level="h2"
          className="flex flex-row items-baseline justify-between text-2xl font-bold text-content-primary"
        >
          <span>{t.summaryTitle}</span>
        </Heading>
        <Divider className="my-4 border-line-subtle/50" />
        <CartTotals totals={cart} />
        <div className="my-4">
          <ItemsPreviewTemplate cart={cart} />
        </div>
        <div className="mt-4 border-t border-line-subtle/50 pt-4">
          <DiscountCode cart={cart} />
        </div>
      </div>
    </div>
  )
}

export default CheckoutSummary
